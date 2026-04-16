// Ignore Spelling: Daf

using Invest.Core.Constants;
using Invest.Core.Models;
using Invest.Core.Settings;
using Invest.Repo.Data;
using Invest.Service.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Globalization;

namespace Invest.Service.Services
{
    public class EmailJobService : IEmailJobService
    {
        private readonly IMailService _mailService;
        private readonly RepositoryContext _context;
        private readonly AppSecrets _appSecrets;
        private readonly EmailQueue _emailQueue;
        private readonly ImageService _imageService;
        private readonly string baseUrl;
        private const string Day3 = "Day3";
        private const string Week2 = "Week2";

        public EmailJobService(IMailService mailService, RepositoryContext context, AppSecrets appSecrets, EmailQueue emailQueue, ImageService imageService)
        {
            _mailService = mailService;
            _context = context;
            _appSecrets = appSecrets;
            _emailQueue = emailQueue;
            baseUrl = _appSecrets.IsProduction ? "https://app.catacap.org" : "https://qa.catacap.org";
            _imageService = imageService;
        }

        public async Task SendReminderEmailsAsync(string jobName)
        {
            int day3Count = 0;
            int week2Count = 0;

            var logEntry = new SchedulerLogs
            {
                StartTime = DateTime.Now,
                JobName = jobName
            };

            try
            {
                var pendingGrants = new List<PendingGrants>();

                if (_appSecrets.IsProduction)
                {
                    pendingGrants = await _context.PendingGrants
                                                  .Where(x => 
                                                      x.status == "pending" && 
                                                      x.CreatedDate.HasValue && 
                                                      EF.Functions.DateDiffDay(x.CreatedDate.Value, DateTime.Now) >= 3)
                                                  .Include(x => x.User)
                                                  .Include(x => x.Campaign)
                                                  .ToListAsync();
                }
                else
                {
                    var emails = _appSecrets.EmailListForScheduler
                                            .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                            .Select(e => e.Trim().ToLower())
                                            .ToList();

                    pendingGrants = await _context.PendingGrants
                                                  .Where(x => 
                                                      x.status == "pending" && 
                                                      x.CreatedDate.HasValue && 
                                                      EF.Functions.DateDiffDay(x.CreatedDate.Value, DateTime.Now) >= 3 &&
                                                      x.User.Email != null &&
                                                      emails.Contains(x.User.Email.ToLower())
                                                  )
                                                  .Include(x => x.User)
                                                  .Include(x => x.Campaign)
                                                  .ToListAsync();
                }

                var allEmailTasks = new List<Task>();
                var emailLogs = new List<ScheduledEmailLog>();

                foreach (var grant in pendingGrants)
                {
                    var daysDiff = (DateTime.Now.Date - grant.CreatedDate!.Value.Date).Days;
                    string reminderType = daysDiff == 3 ? Day3 : Week2;

                    if (reminderType == Day3) day3Count++;
                    if (reminderType == Week2) week2Count++;

                    var log = new ScheduledEmailLog
                    {
                        PendingGrantId = grant.Id,
                        UserId = grant.UserId,
                        ReminderType = reminderType,
                        SentDate = DateTime.Now
                    };
                    emailLogs.Add(log);

                    try
                    {
                        var dafProvider = grant.DAFProvider?.Trim().ToLower();

                        if (!string.IsNullOrWhiteSpace(dafProvider) && dafProvider != "foundation grant")
                        {
                            string? dafProviderLink = await GetDafLink(dafProvider!);

                            await SendDAFEmail(
                                reminderType,
                                grant.User.Email!,
                                grant.User.FirstName!,
                                Convert.ToDecimal(grant.Amount),
                                grant.DAFProvider?.Trim()!,
                                grant.DAFName,
                                dafProviderLink,
                                grant.Campaign?.Name ?? string.Empty,
                                grant.Campaign?.ContactInfoFullName ?? string.Empty,
                                grant.Campaign?.Property ?? string.Empty);

                            //allEmailTasks.Add(
                            //        SendDAFEmail(
                            //            reminderType,
                            //            grant.User.Email!,
                            //            grant.User.FirstName!,
                            //            Convert.ToDecimal(grant.Amount),
                            //            grant.DAFProvider?.Trim()!,
                            //            grant.DAFName,
                            //            dafProviderLink,
                            //            grant.Campaign?.Name ?? string.Empty,
                            //            grant.Campaign?.ContactInfoFullName ?? string.Empty,
                            //            grant.Campaign?.Property ?? string.Empty));
                        }
                        else if (dafProvider == "foundation grant")
                        {
                            allEmailTasks.Add(
                                    SendFoundationEmail(
                                        reminderType,
                                        grant.User.Email!,
                                        grant.User.FirstName!,
                                        Convert.ToDecimal(grant.Amount),
                                        grant.Campaign?.Name ?? string.Empty,
                                        grant.Campaign?.ContactInfoFullName ?? string.Empty,
                                        grant.Campaign?.Property ?? string.Empty));
                        }
                    }
                    catch (Exception ex)
                    {
                        log.ErrorMessage = ex.Message;
                    }
                }

                await _context.AddRangeAsync(emailLogs);
                await _context.SaveChangesAsync();

                _ = Task.Run(async () =>
                {
                    await Task.WhenAll(allEmailTasks);
                });
            }
            catch (Exception ex)
            {
                logEntry.ErrorMessage = ex.ToString();
            }
            finally
            {
                logEntry.EndTime = DateTime.Now;
                logEntry.Day3EmailCount = day3Count;
                logEntry.Week2EmailCount = week2Count;

                await _context.AddAsync(logEntry);
                await _context.SaveChangesAsync();
            }
        }

        public async Task SendDAFEmail(
            string reminderType,
            string email,
            string firstName,
            decimal amount,
            string dafProviderName,
            string? dafName,
            string? dafProviderLink,
            string investmentName,
            string investmentOwnerName,
            string investmentSlug)
        {
            EmailTemplateCategory category;

            if (dafProviderName == "ImpactAssets")
            {
                category = reminderType == Day3
                    ? EmailTemplateCategory.DAFReminderImpactAssetsDay3
                    : EmailTemplateCategory.DAFReminderImpactAssetsWeek2;
            }
            else
            {
                category = reminderType == Day3
                    ? EmailTemplateCategory.DAFReminderDay3
                    : EmailTemplateCategory.DAFReminderWeek2;
            }

            string formattedAmount = string.Format(CultureInfo.GetCultureInfo("en-US"), "${0:N2}", amount);

            var variables = new Dictionary<string, string>
            {
                { "logoUrl", await _imageService.GetImageUrl() },
                { "firstName", firstName },
                { "amount", formattedAmount },
                { "investmentScenario", investmentName },
                { "dafProviderName", dafProviderName },
                { "dafProviderLink", dafProviderLink ?? "" },
                { "dafName", dafName ?? dafProviderName },
                { "investmentOwnerName", investmentOwnerName },
                { "investmentUrl", $"{_appSecrets.RequestOrigin}/investments/{investmentSlug}" },
                { "unsubscribeUrl", $"{_appSecrets.RequestOrigin}/settings" }
            };

            _emailQueue.QueueEmail(async (sp) =>
            {
                var emailService = sp.GetRequiredService<IEmailTemplateService>();

                await emailService.SendTemplateEmailAsync(
                    category,
                    email,
                    variables
                );
            });
        }

        public async Task SendFoundationEmail(string reminderType, string email, string firstName, decimal amount, string investmentName, string investmentOwnerName, string investmentSlug)
        {
            string formattedAmount = string.Format(CultureInfo.GetCultureInfo("en-US"), "${0:N2}", amount);

            string investmentScenario = !string.IsNullOrEmpty(investmentName)
                                        ? $"to <b>{investmentName}</b>"
                                        : "to CataCap";

            var variables = new Dictionary<string, string>
            {
                { "logoUrl", await _imageService.GetImageUrl() },
                { "firstName", firstName },
                { "amount", formattedAmount },
                { "investmentScenario", investmentScenario },
                { "investmentOwnerName", investmentOwnerName },
                { "investmentUrl", $"{_appSecrets.RequestOrigin}/investments/{investmentSlug}" },
                { "unsubscribeUrl", $"{_appSecrets.RequestOrigin}/settings" }
            };

            EmailTemplateCategory category = reminderType == Day3
                                                ? EmailTemplateCategory.FoundationReminderDay3
                                                : EmailTemplateCategory.FoundationReminderWeek2;

            _emailQueue.QueueEmail(async (sp) =>
            {
                var emailService = sp.GetRequiredService<IEmailTemplateService>();

                await emailService.SendTemplateEmailAsync(
                    category,
                    email,
                    variables
                );
            });
        }

        //public async Task SendDAFEmail(string reminderType, string email, string firstName, decimal amount, string dafProviderName, string? dafName, string? dafProviderLink, string investmentName, string investmentOwnerName, string investmentSlug)
        //{
        //    string formattedAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", amount);

        //    string investmentScenarios = "";

        //    var dafLinkScenarios = dafProviderLink != null
        //                                    ? $@"<a href='{dafProviderLink}' target='_blank'>{dafProviderName}</a>"
        //                                    : dafProviderName;

        //    var subject = string.Empty;
        //    var body = string.Empty;

        //    var donationRecipientScenarios = string.Empty;

        //    if (dafProviderName == "ImpactAssets")
        //    {
        //        string impactAssetsInvestmentScenarios = !string.IsNullOrEmpty(investmentName)
        //                                                   ? $"{investmentName}"
        //                                                   : "CataCap";

        //        dafName = !string.IsNullOrWhiteSpace(dafName) ? dafName : dafProviderName;

        //        donationRecipientScenarios = $@"
        //                                     <ol>
        //                                        <li><b>Initiate a grant </b>using the details below:</li>
        //                                            <p style='margin-top: 0px;'>Email ImpactAssets at <a href='mailto:clientservice@impactassets.org'>clientservice@impactassets.org</a> and CC <a href='mailto:support@catacap.org'>support@catacap.org</a></p>
        //                                            <p style='margin-bottom: 0px;'>Transfer Email Details:</p>
        //                                            <p style='margin-top: 0px;'>“Please transfer from my DAF at ImpactAssets, {dafName}, to CataCap DAF #439888 the amount of {formattedAmount}.”</p>
        //                                            <p>We will, upon receipt of the CC email to <a href='mailto:support@catacap.org'>support@catacap.org</a>, immediately apply your account contribution and - if targeted to a specific investment - also to that investment on CataCap.</p>
        //                                            <p>Thank you.</p>
        //                                        <li><b>Forward the confirmation email</b> to <b><a href='mailto:support@catacap.org'>support@catacap.org</a></b></li>
        //                                     </ol>
        //                                    ";
        //    }
        //    else
        //    {
        //        donationRecipientScenarios = $@"
        //                                     <ol>
        //                                         <li><b>Log in </b>to your {dafLinkScenarios} account</li>
        //                                         <li><b>Initiate a donation </b>using the following details:</li>
        //                                         <ul style='list-style-type: disc; padding-left: 10px; margin-left: 0;'>
        //                                            <li><b>Donation Recipient:</b> {(dafProviderName == "DAFgiving360: Charles Schwab" ? "CataCap" : "Impactree Foundation")}</li>
        //                                            <li><b>Project Name/ Grant Purpose:</b> CataCap</li>
        //                                            <li><b>Amount:</b> {formattedAmount}</li>
        //                                            <li><b>EIN:</b> 86-2370923</li>
        //                                            <li><b>Email:</b> <a href='mailto:support@catacap.org'>support@catacap.org</a></li>
        //                                            <li><b>Address:</b> 3749 Buchanan St Unit 475207, San Francisco, CA 94147</li>
        //                                         </ul>
        //                                         <li><b>Forward the confirmation email</b> to <b><a href='mailto:support@catacap.org'>support@catacap.org</a></b> so we can apply your investment right away.</li>
        //                                     </ol>
        //                                    ";
        //    }

        //    if (reminderType == Day3)
        //    {
        //        investmentScenarios = !string.IsNullOrEmpty(investmentName)
        //                                    ? $"to <b>{investmentName}</b>"
        //                                    : "";

        //        subject = "⏳ A Quick Nudge – Your Grant Is Still Pending";

        //        body = @$"
        //                <p>Hi {firstName},</p>
        //                <p>Thanks again for your generous <b>{formattedAmount}</b> commitment {investmentScenarios} on CataCap — we’re excited to help move your capital to work!</p>  
        //                <p>We noticed your donation is still marked as <b>pending</b>, so here’s a quick reminder on how to complete it:</p>
        //                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>                             
        //                <p><div style='font-size: 20px;'><b>✅ How to Complete Your Grant</b></div></p>
        //                <p>{donationRecipientScenarios}</p>
        //                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>
        //                <p>We’re honored to work alongside you to fuel the future. Let’s unlock your impact — together. 💥</p>
        //                <p style='margin-bottom: 0px; margin-top: 0px;'>Warmly,</p>
        //                <p style='margin-bottom: 0px; margin-top: 0px;'><b>Ken Kurtzig + The CataCap Team</b></p>
        //                <p style='margin-bottom: 0px; margin-top: 0px;'>Powered by the Impactree Foundation</p>
        //                <p style='margin-bottom: 0px; margin-top: 0px;'>🌐 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
        //                <p style='margin-top: 0px;'><a href='{baseUrl}/settings' target='_blank'>Unsubscribe from notifications</a></p>
        //                ";
        //    }
        //    else if (reminderType == Week2)
        //    {
        //        string investmentURL = $"{baseUrl}/invest/{investmentSlug}";

        //        investmentScenarios = !string.IsNullOrEmpty(investmentName)
        //                                    ? $"in <b>{investmentName}</b>"
        //                                    : "";

        //        string investmentFooterScenarios = !string.IsNullOrEmpty(investmentName)
        //                     ? @$"<p style='margin-bottom: 0px; margin-top: 0px;'><b>{investmentOwnerName}</b></p>
        //                          <p style='margin-bottom: 0px; margin-top: 0px;'><a href='{investmentURL}' target='_blank'>{investmentURL}</a></p>"
        //                     : "";

        //        subject = "⏳ Still Pending – Help Us Activate Your CataCap Donation-to-Invest";

        //        body = @$"
        //                <p>Hi {firstName},</p>
        //                <p>We’re honored by your commitment to invest <b>{formattedAmount}</b> {investmentScenarios} through CataCap — thank you for being part of this movement.</p>  
        //                <p>Your <b>donation to invest</b> is still marked as <b>pending</b>, so here’s a quick reminder on how to complete it:</p>
        //                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>                             
        //                <p><div style='font-size: 20px;'><b>✅ How to Complete Your Donation</b></div></p>
        //                <p>{donationRecipientScenarios}</p>
        //                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>
        //                <p>Your support helps us move catalytic capital where it’s needed most — and we’re excited to get your investment to work.</p>
        //                <p style='margin-bottom: 0px; margin-top: 0px;'>With gratitude,</p>
        //                {investmentFooterScenarios}
        //                <p style='margin-bottom: 0px; margin-top: 0px;'>🌐 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
        //                <p style='margin-top: 0px;'><a href='{baseUrl}/settings' target='_blank'>Unsubscribe from notifications</a></p>
        //                ";
        //    }

        //    await _mailService.SendMailAsync(email, subject, "", body);
        //}

        //public async Task SendFoundationEmail(string reminderType, string email, string firstName, decimal amount, string investmentName, string investmentOwnerName, string investmentSlug)
        //{
        //    string formattedAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", amount);

        //    string investmentScenarios = "";

        //    var subject = string.Empty;
        //    var body = string.Empty;

        //    if (reminderType == Day3)
        //    {
        //        investmentScenarios = !string.IsNullOrEmpty(investmentName)
        //                                    ? $"to <b>{investmentName}</b>"
        //                                    : "";

        //        subject = "⏳ A Quick Nudge – Your Grant Is Still Pending";

        //        body = @$"
        //                <p>Hi {firstName},</p>
        //                <p>Thanks again for your generous <b>{formattedAmount}</b> commitment {investmentScenarios} on CataCap — we’re excited to help move your capital to work!</p>  
        //                <p>We noticed your donation is still marked as <b>pending</b>, so here’s a quick reminder on how to complete it:</p>
        //                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>                             
        //                <p><div style='font-size: 20px;'><b>✅ How to Complete Your Grant</b></div></p>
        //                <ol>
        //                    <li>Prepare your foundation check using the following details:</li>
        //                    <ul style='list-style-type:disc;'>
        //                        <li><b>Donation Recipient:</b> Impactree Foundation</li>
        //                        <li><b>Amount:</b> {formattedAmount}</li>
        //                        <li><b>EIN:</b> 86-2370923</li>
        //                        <li><b>Email:</b> <a href='mailto:support@catacap.org'>support@catacap.org</a></li>
        //                        <li><b>Address:</b> 3749 Buchanan Street Unit 475207, San Francisco, CA 94147</li>
        //                    </ul>
        //                    <li><b>Forward your grant confirmation</b> to <a href='mailto:support@catacap.org'>support@catacap.org</a> so we can apply your investment without delay.</li>
        //                </ol>
        //                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>
        //                <p>We’re honored to work alongside you to fuel the future. Let's unlock your impact — together. 💥</p>
        //                <p style='margin-bottom: 0px; margin-top: 0px;'>Warmly,</p>
        //                <p style='margin-bottom: 0px; margin-top: 0px;'><b>Ken Kurtzig + The CataCap Team</b></p>
        //                <p style='margin-bottom: 0px; margin-top: 0px;'>Powered by the Impactree Foundation</p>
        //                <p style='margin-bottom: 0px; margin-top: 0px;'>🌐 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
        //                <p style='margin-top: 0px;'><a href='{baseUrl}/settings' target='_blank'>Unsubscribe from notifications</a></p>
        //                ";
        //    }
        //    else if(reminderType == Week2)
        //    {
        //        string investmentURL = $"{baseUrl}/invest/{investmentSlug}";

        //        investmentScenarios = !string.IsNullOrEmpty(investmentName)
        //                                    ? $"in <b>{investmentName}</b>"
        //                                    : "";

        //        string investmentFooterScenarios = !string.IsNullOrEmpty(investmentName)
        //                     ? @$"<p style='margin-bottom: 0px; margin-top: 0px;'><b>{investmentOwnerName}</b></p>
        //                          <p style='margin-bottom: 0px; margin-top: 0px;'><a href='{investmentURL}' target='_blank'>{investmentURL}</a></p>"
        //                     : "";

        //        subject = "⏳ Still Pending – Help Us Activate Your CataCap Donation-to-Invest";

        //        body = @$"
        //                <p>Hi {firstName},</p>
        //                <p>We’re honored by your commitment to invest <b>{formattedAmount}</b> {investmentScenarios} through CataCap — thank you for being part of this movement.</p>  
        //                <p>Your <b>donation to invest</b> is still marked as <b>pending</b>, so here’s a quick reminder on how to complete it:</p>
        //                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>                             
        //                <p><div style='font-size: 20px;'><b>✅ How to Complete Your Donation</b></div></p>
        //                <ol>
        //                    <li>Prepare your foundation check using the following details:</li>
        //                    <ul style='list-style-type:disc;'>
        //                        <li><b>Donation Recipient:</b> Impactree Foundation</li>
        //                        <li><b>Amount:</b> {formattedAmount}</li>
        //                        <li><b>EIN:</b> 86-2370923</li>
        //                        <li><b>Email:</b> <a href='mailto:support@catacap.org'>support@catacap.org</a></li>
        //                        <li><b>Address:</b> 3749 Buchanan Street Unit 475207, San Francisco, CA 94147</li>
        //                    </ul>
        //                    <li><b>Forward the confirmation email</b> to <a href='mailto:support@catacap.org'>support@catacap.org</a> so we can apply your investment right away.</li>
        //                </ol>
        //                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>
        //                <p>Your support helps us move catalytic capital where it’s needed most — and we’re excited to get your investment to work.</p>
        //                <p style='margin-bottom: 0px; margin-top: 0px;'>With gratitude,</p>
        //                {investmentFooterScenarios}
        //                <p style='margin-bottom: 0px; margin-top: 0px;'>🌐 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow CataCap on LinkedIn</a></p>
        //                <p style='margin-top: 0px;'><a href='{baseUrl}/settings' target='_blank'>Unsubscribe from notifications</a></p>
        //                ";
        //    }

        //    await _mailService.SendMailAsync(email, subject, "", body);
        //}

        public async Task<string?> GetDafLink(string providerName)
        {
            if (string.IsNullOrWhiteSpace(providerName))
                return null;

            var key = providerName.Trim().ToLowerInvariant();

            return await _context.DAFProviders
                                 .Where(x => x.ProviderName != null 
                                            && x.IsActive
                                            && x.ProviderName.ToLower().Trim() == key)
                                 .Select(x => x.ProviderURL)
                                 .FirstOrDefaultAsync();
        }
    }
}
