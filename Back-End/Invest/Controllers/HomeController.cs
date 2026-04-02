using Invest.Core.Constants;
using Invest.Core.Models;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Invest.Controllers
{
    [Route("api/home")]
    [ApiController]
    public class HomeController : ControllerBase
    {
        private readonly RepositoryContext _context;

        public HomeController (RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet("statistics")]
        public async Task<IActionResult> GetHomePageStatistics()
        {
            var data = await _context.SiteConfiguration
                                     .Where(x => x.Type == SiteConfigurationType.Statistics 
                                                || x.Type == $"{SiteConfigurationType.Statistics}-raise-money")
                                     .Select(x => new { x.Key, x.Value, Type = x.Type.Replace("Statistics-", "") })
                                     .ToListAsync();

            var response = data.Cast<object>().ToList();

            var usersQuery = _context.Users
                                     .Join(_context.UserRoles,
                                         u => u.Id,
                                         ur => ur.UserId,
                                         (u, ur) => new { u, ur })
                                     .Join(_context.Roles,
                                         x => x.ur.RoleId,
                                         r => r.Id,
                                         (x, r) => new { x.u, r })
                                     .Where(x => x.r.Name == UserRoles.User)
                                     .Select(x => x.u);

            var userIds = usersQuery.Select(u => u.Id);
            var userEmails = usersQuery.Select(u => u.Email);

            var userStats = await usersQuery
                            .GroupBy(u => 1)
                            .Select(g => new
                            {
                                Active = g.Count(u => u.IsActive == true),
                                AccountBalances = g.Sum(u => (decimal?)u.AccountBalance) ?? 0m
                            })
                            .FirstOrDefaultAsync();

            var recommendationStats = await _context.Recommendations
                                        .Where(r => userEmails.Contains(r.UserEmail!))
                                        .GroupBy(r => 1)
                                        .Select(g => new
                                        {
                                            Pending = g.Where(r => r.Status!.ToLower().Trim() == "pending")
                                                        .Sum(r => (decimal?)r.Amount) ?? 0m,
                                            Approved = g.Where(r => r.Status!.ToLower().Trim() == "approved")
                                                        .Sum(r => (decimal?)r.Amount) ?? 0m
                                        })
                                        .FirstOrDefaultAsync();

            var completedCount = await _context.CompletedInvestmentsDetails.CountAsync();

            response.Add(new { Key = "Capital Raised", Value = (userStats?.AccountBalances ?? 0m) + (recommendationStats?.Pending + recommendationStats?.Approved ?? 0m), Type = "raise-money" });
            response.Add(new { Key = "Donor Investors", Value = userStats?.Active ?? 0, Type = "raise-money" });
            response.Add(new { Key = "Investments Funded", Value = completedCount, Type = "raise-money" });

            return Ok(response);
        }

        [HttpGet("overview")]
        public async Task<IActionResult> GetDashboardStats()
        {
            var usersQuery = _context.Users
                                     .Join(_context.UserRoles,
                                         u => u.Id,
                                         ur => ur.UserId,
                                         (u, ur) => new { u, ur })
                                     .Join(_context.Roles,
                                         x => x.ur.RoleId,
                                         r => r.Id,
                                         (x, r) => new { x.u, r })
                                     .Where(x => x.r.Name == UserRoles.User)
                                     .Select(x => x.u);

            var nonExcludeUserEmails = usersQuery.Where(x => x.IsExcludeUserBalance == false).Select(u => u.Email);

            var userStats = await usersQuery
                            .GroupBy(u => 1)
                            .Select(g => new
                            {
                                Active = g.Count(u => u.IsActive == true),
                            })
                            .FirstOrDefaultAsync();

            var nonExcludeUserrecommendationStats = await _context.Recommendations
                                                    .Where(r => nonExcludeUserEmails.Contains(r.UserEmail!))
                                                    .GroupBy(r => 1)
                                                    .Select(g => new
                                                    {
                                                        Pending = g.Where(r => r.Status!.ToLower().Trim() == "pending")
                                                                    .Sum(r => (decimal?)r.Amount) ?? 0m,
                                                        Approved = g.Where(r => r.Status!.ToLower().Trim() == "approved")
                                                                    .Sum(r => (decimal?)r.Amount) ?? 0m
                                                    })
                                                    .FirstOrDefaultAsync();

            var campaignStats = await _context.Campaigns
                                              .GroupBy(c => 1)
                                              .Select(g => new
                                              {
                                                  Active = g.Count(c => c.IsActive == true)
                                              })
                                              .FirstOrDefaultAsync();

            var result = new
            {
                Invested = (nonExcludeUserrecommendationStats?.Pending ?? 0m) + (nonExcludeUserrecommendationStats?.Approved ?? 0m),
                ActiveInvestments = campaignStats?.Active ?? 0,
                ActiveInvestors = userStats?.Active ?? 0,
                TaxDeductible = 100
            };

            return Ok(result);
        }
    }
}
