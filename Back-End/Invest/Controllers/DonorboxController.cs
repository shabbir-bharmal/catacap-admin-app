using AutoMapper;
using Invest.Extensions;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Data;
using System.Security.Claims;
using System.Text;
using System.Text.Json;

namespace Invest.Controllers
{
    [Authorize]
    public class DonorboxController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private const string donorbox_api = "https://donorbox.org/";
        private readonly RepositoryContext _context;

        public DonorboxController(IHttpClientFactory httpClientFactory, RepositoryContext context)
        {
            _httpClientFactory = httpClientFactory;
            _context = context;
        }

        [HttpGet("campaigns")]
        public async Task<string> Campaigns()
        {
            var httpClient = _httpClientFactory.CreateClient();
            httpClient.AddDonorboxAuthHeader();
            return await httpClient.GetStringAsync($"{donorbox_api}api/v1/campaigns");
        }

        [HttpGet("campaign/{id}")]
        public async Task<string> Campaign(int id)
        {
            if (id == 0)
            {
                return string.Empty;
            }

            var httpClient = _httpClientFactory.CreateClient();
            httpClient.AddDonorboxAuthHeader();
            return await httpClient.GetStringAsync($"{donorbox_api}api/v1/campaigns?id={id}");
        }

        [HttpGet("donations")]
        public async Task<string> Donations()
        {
            var httpClient = _httpClientFactory.CreateClient();
            httpClient.AddDonorboxAuthHeader();
            return await httpClient.GetStringAsync($"{donorbox_api}api/v1/donations");
        }

        [HttpGet("donationsByEmail")]
        public async Task<IEnumerable<DonorboxDonation>> DonationsByEmail()
        {
            var email = string.Empty;
            var identity = HttpContext.User.Identity as ClaimsIdentity;
            if (identity != null)
            {
                email = identity.Claims.FirstOrDefault(i => i.Type == ClaimTypes.Email)?.Value;
            }

            if (email == null)
            {
                return null;
            }

            var httpClient = _httpClientFactory.CreateClient();
            httpClient.AddDonorboxAuthHeader();
           
            var json = await httpClient.GetStringAsync($"{donorbox_api}api/v1/donations?email={email}");
            var donations = JsonSerializer.Deserialize<List<DonorboxDonation>>(json);
            var campaignNames = donations.Select(i => i.campaign.name).ToList();
            var campaigs = await _context.Campaigns.Where(i => campaignNames.Contains(i.Name)).ToListAsync();

            if (campaigs == null) 
            {
                return null;
            }

            foreach (var d in donations)
            {
                var c = campaigs.FirstOrDefault(i => i.Name == d.campaign.name);
                d.campaign.description = c.Description;
               // d.campaign.image = Encoding.UTF8.GetString(c.Image);
               // d.campaign.GoalMeter = c.GoalMeter;
                d.campaign.sdgs = c.SDGs;
                d.campaign.themes = c.Themes;
            }

            return donations;
        }

        [HttpGet("donors")]
        public async Task<string> Donors()
        {
            var httpClient = _httpClientFactory.CreateClient();
            httpClient.AddDonorboxAuthHeader();
            return await httpClient.GetStringAsync($"{donorbox_api}api/v1/donors");
        }
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
        public string name { get; set; }
        public string description { get; set; }
        public string image { get; set; }
        public string GoalMeter { get; set; }
        public string sdgs { get; set; }
        public string themes { get; set; }
    }

    public class DonorboxDonation {
        public string amount { get; set; }
        public string donation_date { get; set; }
        public string status { get; set; }
        public string formatted_amount { get; set; }
        public string formatted_converted_amount { get; set; }
        public DonorboxDonationCampaign campaign { get; set; }
        public DonorboxDonationDonor donor { get; set; }
    }
}
