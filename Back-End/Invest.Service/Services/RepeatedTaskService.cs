using Microsoft.Extensions.Hosting;
using Invest.Service.Extensions;
using JsonSerializer = System.Text.Json.JsonSerializer;
using Invest.Repo.Data;
using Microsoft.Extensions.DependencyInjection;
using Invest.Service.Interfaces;
using Microsoft.Extensions.Configuration;
using Invest.Core.Models;


public class RepeatedTaskService : IHostedService, IDisposable
{
    private Timer _timer;
    private readonly IHttpClientFactory _httpClientFactory;
    private const string donorbox_api = "https://donorbox.org/";
    private readonly IServiceProvider _serviceProvider;
    private readonly IMailService _mailService;
    private readonly IConfiguration _configuration;

    public RepeatedTaskService(IHttpClientFactory httpClientFactory, IServiceProvider serviceProvider, IMailService mailService, IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _serviceProvider = serviceProvider;
        _mailService = mailService;
        _configuration = configuration;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        //_timer = new Timer(DoWork, null, TimeSpan.Zero, TimeSpan.FromSeconds(30));

        return Task.CompletedTask;
    }

    private async void DoWork(object state)
    {
        using (var scope = _serviceProvider.CreateScope())
        {
            var _context = scope.ServiceProvider.GetRequiredService<RepositoryContext>();

            var httpClient = _httpClientFactory.CreateClient();
            httpClient.AddDonorboxAuthHeader();
            var result = await httpClient.GetStringAsync($"{donorbox_api}api/v1/donations");
            var donations = JsonSerializer.Deserialize<List<DonorboxDonation>>(result);
            var donationIdsObj = _context.SystemValues.FirstOrDefault(x => x.Name == "DonationsIds");
            var ids = _context.SystemValues.FirstOrDefault(x => x.Name == "DonationsIds").Value.Split(",").ToList();
            foreach (var item in donations)
            {
                if (item.status == "paid" && !ids.Contains(item.id.ToString()))
                {
                    var user = _context.Users.FirstOrDefault(i => i.Email == item.donor.email);
                    if (user == null) { continue; }

                    var userInvestment = new UserInvestments
                    {
                        UserId = user.Id,
                        PaymentType = item.donation_type,
                        LogTriggered = false
                    };
                    await _context.UserInvestments.AddAsync(userInvestment);
                    await _context.SaveChangesAsync();

                    var parseFee = 0;
                    int.TryParse(item.amount, out parseFee);
                    decimal achFee = parseFee < 980 ? (decimal)0.0755 : (decimal)0.05;
                    decimal fee = (item.donation_type == "ach") ? achFee : (decimal)0.09;

                    if (user.AccountBalance == null)
                    {
                        var amount = Convert.ToDecimal(item.amount);
                        user.AccountBalance = getNewAccountBalance(amount, fee, user.Email);
                        if (user.OptOutEmailNotifications == null || !(bool)user.OptOutEmailNotifications) await SendEmail((decimal)user.AccountBalance, user.Email);
                    }
                    else
                    {
                        decimal.TryParse(item.amount.Substring(0, item.amount.IndexOf('.')), out decimal result2);
                        var amount = (int)Convert.ToDecimal(result2);
                        user.AccountBalance += getNewAccountBalance(amount, fee, user.Email);
                        if (user.OptOutEmailNotifications == null || !(bool)user.OptOutEmailNotifications) await SendEmail((decimal)user.AccountBalance, user.Email);
                    }

                    await _context.SaveChangesAsync();
                    ids.Add(item.id.ToString());
                }
            }
            donationIdsObj.Value = string.Join(",", ids);
            await _context.SaveChangesAsync();

            Console.WriteLine("Task executed with EF Core at: {0}", DateTime.Now);
        }
    }

    private decimal getNewAccountBalance(decimal amount, decimal fee, string email)
    {
        var totalFee = fee == (decimal)0.05
            ? (amount * fee) + 25
            : amount * fee;
        var newAccountBalance = amount - totalFee;

        return newAccountBalance;
    }

    private async Task SendEmail(decimal newAccountBalance, string email)
    {
        var env = _configuration.GetSection("environment");
        var envName = env["name"];
        await _mailService.SendMailAsync(email, $"Your balance has been topped up by ${newAccountBalance}",
               $"Your balance has been topped up by ${newAccountBalance}",
               $"<html><body><h1>Your balance has been topped up by ${newAccountBalance}</h1><br/>" +
               $"<h4>This email message is sent because the money has been credited to your account balance!</h4><br/>" +
               $"<p>Follow <a href=\"https://catacap-front-{envName}.azurewebsites.net/find\">the link</a> to make an investment</p>" +
               $"<p><a href='https://app.catacap.org/settings' target='_blank'>Unsubscribe</a> to CataCap notifications.</p>" +
               $"</body>" +
               $"</html>");
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _timer?.Change(Timeout.Infinite, 0);

        return Task.CompletedTask;
    }

    public void Dispose()
    {
        _timer?.Dispose();
    }


    public class DonorboxDonationDonor
    {
        public string name { get; set; }
        public string email { get; set; }
        public string first_name { get; set; }
        public string last_name { get; set; }
    }

    public class DonorboxDonationCampaign
    {
    }

    public class DonorboxDonation
    {
        public string amount { get; set; }
        public string donation_date { get; set; }
        public string status { get; set; }
        public string converted_net_amount { get; set; }
        public string formatted_converted_amount { get; set; }
        public int id { get; set; }
        public string donation_type { get; set; }
        public DonorboxDonationCampaign campaign { get; set; }
        public DonorboxDonationDonor donor { get; set; }
    }
}