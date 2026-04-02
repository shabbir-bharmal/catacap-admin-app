using ClosedXML.Excel;
using Invest.Core.Dtos;
using Invest.Core.Models;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Invest.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class FinancesController : Controller
    {
        private readonly RepositoryContext _repositoryContext;
        private const string pending = "pending";
        private const string approved = "approved";
        private const string rejected = "rejected";
        private const string inTransit = "in transit";
        private const string accepted = "accepted";

        public FinancesController(RepositoryContext repositoryContext)
        {
            _repositoryContext = repositoryContext;
        }

        [HttpGet("get-finances-data")]
        public async Task<IActionResult> GetFinancesData()
        {
            var usersQuery = _repositoryContext.Users
                                               .Join(_repositoryContext.UserRoles,
                                                   u => u.Id,
                                                   ur => ur.UserId,
                                                   (u, ur) => new { u, ur })
                                               .Join(_repositoryContext.Roles,
                                                   x => x.ur.RoleId,
                                                   r => r.Id,
                                                   (x, r) => new { x.u, r })
                                               .Where(x => x.r.Name == UserRoles.User)
                                               .Select(x => x.u);

            var userIds = usersQuery.Select(u => u.Id);
            var userEmails = usersQuery.Select(u => u.Email);
            var nonExcludeUserEmails = usersQuery.Where(x => x.IsExcludeUserBalance == false).Select(u => u.Email);

            var userStats = await usersQuery
                                    .GroupBy(u => 1)
                                    .Select(g => new
                                    {
                                        Active = g.Count(u => u.IsActive == true),
                                        Inactive = g.Count(u => !u.IsActive == true),
                                        AccountBalances = g.Sum(u => (decimal?)u.AccountBalance) ?? 0m
                                    })
                                    .FirstOrDefaultAsync();

            var userAccountBalances = await usersQuery
                                            .Where(x => x.IsExcludeUserBalance == false)
                                            .GroupBy(u => 1)
                                            .Select(g => new
                                            {
                                                AccountBalances = g.Sum(u => (decimal?)u.AccountBalance) ?? 0m
                                            })
                                            .FirstOrDefaultAsync();

            var groupStats = await _repositoryContext.Groups
                                        .Where(g => userIds.Contains(g.Owner!.Id))
                                        .GroupBy(g => 1)
                                        .Select(g => new
                                        {
                                            Leaders = g.Count(),
                                            Corporate = g.Count(x => x.IsCorporateGroup),
                                            GroupIds = g.Select(x => x.Id).ToList()
                                        })
                                        .FirstOrDefaultAsync();

            var membersCount = groupStats != null
                                    ? await _repositoryContext.Requests
                                            .CountAsync(r => groupStats.GroupIds.Contains(r.GroupToFollow!.Id) && r.Status == accepted)
                                    : 0;

            var recommendationStats = await _repositoryContext.Recommendations
                                            .Where(r => userEmails.Contains(r.UserEmail!))
                                            .GroupBy(r => 1)
                                            .Select(g => new
                                            {
                                                Pending = g.Where(r => r.Status!.ToLower().Trim() == pending)
                                                            .Sum(r => (decimal?)r.Amount) ?? 0m,
                                                Approved = g.Where(r => r.Status!.ToLower().Trim() == approved)
                                                            .Sum(r => (decimal?)r.Amount) ?? 0m,
                                                Rejected = g.Where(r => r.Status!.ToLower().Trim() == rejected)
                                                            .Sum(r => (decimal?)r.Amount) ?? 0m,
                                                ApprovedCount = g.Count(r => r.Status!.ToLower().Trim() == approved),
                                                ApprovedAndPendingCount = g.Count(r => r.Status!.ToLower().Trim() == pending
                                                                                    || r.Status.ToLower().Trim() == approved)
                                            })
                                            .FirstOrDefaultAsync();

            var nonExcludeUserrecommendationStats = await _repositoryContext.Recommendations
                                                    .Where(r => nonExcludeUserEmails.Contains(r.UserEmail!))
                                                    .GroupBy(r => 1)
                                                    .Select(g => new
                                                    {
                                                        Pending = g.Where(r => r.Status!.ToLower().Trim() == pending)
                                                                    .Sum(r => (decimal?)r.Amount) ?? 0m,
                                                        Approved = g.Where(r => r.Status!.ToLower().Trim() == approved)
                                                                    .Sum(r => (decimal?)r.Amount) ?? 0m
                                                    })
                                                    .FirstOrDefaultAsync();

            var campaignStats = await _repositoryContext.Campaigns
                                                .GroupBy(c => 1)
                                                .Select(g => new
                                                {
                                                    Active = g.Count(c => c.IsActive == true)
                                                })
                                                .FirstOrDefaultAsync();

            var totalAccountChangeLogs = await _repositoryContext.AccountBalanceChangeLogs
                                                                    .Where(a => !string.IsNullOrWhiteSpace(a.InvestmentName)
                                                                            && string.IsNullOrWhiteSpace(a.TransactionStatus)
                                                                            && userIds.Contains(a.UserId))
                                                                    .SumAsync(a => a.OldValue - a.NewValue);

            var pendingGrantsEntities = await _repositoryContext.PendingGrants
                                                                .Where(p => p.status!.ToLower().Trim() == pending
                                                                            || p.status.ToLower().Trim() == inTransit
                                                                            && userIds.Contains(p.UserId))
                                                                .ToListAsync();

            var grantsTotal = pendingGrantsEntities.Sum(p => decimal.TryParse(p.Amount, out var val) ? val : 0m);

            var totalAssets = await _repositoryContext.AssetBasedPaymentRequest
                                                        .Where(a => a.Status!.ToLower().Trim() == pending
                                                                    || a.Status.ToLower().Trim() == inTransit
                                                                    && userIds.Contains(a.UserId))
                                                        .SumAsync(a => a.ApproximateAmount);

            var campaignTotals = await (
                                            from r in _repositoryContext.Recommendations
                                            join c in _repositoryContext.Campaigns on r.CampaignId equals c.Id
                                            where userEmails.Contains(r.UserEmail!)
                                                    && (r.Status!.ToLower() == approved || r.Status.ToLower() == pending)
                                                    && r.Amount > 0
                                                    && !string.IsNullOrEmpty(r.UserEmail)
                                            group r by new { r.CampaignId, c.IsActive } into g
                                            select new
                                            {
                                                g.Key.CampaignId,
                                                g.Key.IsActive,
                                                TotalAmount = g.Sum(x => x.Amount)
                                            }
                                        ).ToListAsync();

            var over25k = campaignTotals.Count(x => x.IsActive == true && x.TotalAmount > 25000);
            var over50k = campaignTotals.Count(x => x.IsActive == true && x.TotalAmount > 50000);
            var totalActive = campaignTotals.Where(x => x.IsActive == true).Sum(x => x.TotalAmount) ?? 0m;
            var totalClosed = campaignTotals.Sum(x => x.TotalAmount) ?? 0m;

            var completed = await _repositoryContext.CompletedInvestmentsDetails.CountAsync();
                
            var totalCompleted = await _repositoryContext.CompletedInvestmentsDetails.SumAsync(c => c.Amount) ?? 0m;

            var allThemes = await _repositoryContext.Themes
                                                    .Select(t => new { t.Id, t.Name })
                                                    .ToListAsync();

            var rawCampaignThemes = await _repositoryContext.Campaigns
                                                            .Select(c => new
                                                            {
                                                                c.Id,
                                                                ThemesString = c.Themes
                                                            })
                                                            .ToListAsync();

            var campaignThemes = rawCampaignThemes
                                .Select(c => new
                                {
                                    c.Id,
                                    ThemeIds = !string.IsNullOrWhiteSpace(c.ThemesString)
                                                ? c.ThemesString.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                                                .Select(x => int.Parse(x.Trim()))
                                                                .ToList()
                                                : new List<int>()
                                })
                                .ToList();

            var relevantRec = await _repositoryContext.Recommendations
                                                        .Where(r => userEmails.Contains(r.UserEmail!)
                                                                && (r.Status!.ToLower().Trim() == pending 
                                                                    || r.Status!.ToLower().Trim() == approved))
                                                        .Select(r => new { r.CampaignId, r.Amount, r.Status })
                                                        .ToListAsync();

            var recWithThemes = (
                                    from r in relevantRec
                                    join c in campaignThemes on r.CampaignId equals c.Id
                                    select new
                                    {
                                        r.Amount,
                                        r.Status,
                                        c.ThemeIds
                                    }
                                ).ToList();

            var themeStats = allThemes.Select(theme => new InvestmentThemes
            {
                Name = theme.Name!,
                Pending = recWithThemes
                            .Where(r => r.ThemeIds.Contains(theme.Id) &&
                                        r.Status.ToLower().Trim() == pending)
                            .Sum(r => r.ThemeIds.Count > 0 ? (r.Amount ?? 0m) / r.ThemeIds.Count : 0m),
                Approved = recWithThemes
                            .Where(r => r.ThemeIds.Contains(theme.Id) &&
                                        r.Status.ToLower().Trim() == approved)
                            .Sum(r => r.ThemeIds.Count > 0 ? (r.Amount ?? 0m) / r.ThemeIds.Count : 0m),
            })
            .OrderBy(x => x.Name)
            .ToList();

            var financesDto = new FinancesDto
            {
                Users = new Users
                {
                    Active = userStats?.Active ?? 0,
                    Inactive = userStats?.Inactive ?? 0,
                    AccountBalances = userAccountBalances?.AccountBalances ?? 0m,
                    Investments = (nonExcludeUserrecommendationStats?.Pending ?? 0m) + (nonExcludeUserrecommendationStats?.Approved ?? 0m)
                },
                Groups = new Groups
                {
                    Leaders = groupStats?.Leaders ?? 0,
                    Members = membersCount,
                    Corporate = groupStats?.Corporate ?? 0
                },
                Recommendations = new Recommendations
                {
                    Pending = recommendationStats?.Pending ?? 0m,
                    Approved = recommendationStats?.Approved ?? 0m,
                    Rejected = recommendationStats?.Rejected ?? 0m,
                    ApprovedAndPending = recommendationStats?.ApprovedAndPendingCount ?? 0
                },
                Investments = new Investments
                {
                    Average = recommendationStats?.ApprovedCount > 0
                                        ? (recommendationStats?.Approved ?? 0m) / recommendationStats!.ApprovedCount
                                        : 0m,
                    Active = campaignStats?.Active ?? 0,
                    Over25K = over25k,
                    Over50K = over50k,
                    Completed = completed,
                    TotalActive = totalActive,
                    TotalCompleted = totalCompleted,
                    TotalActiveAndClosed = totalClosed,
                    Assets = (userStats?.AccountBalances ?? 0m) + (recommendationStats?.Pending + recommendationStats?.Approved ?? 0m)
                },
                InvestmentThemes = themeStats,
                Grants = new Grants
                {
                    PendingAndInTransit = grantsTotal,
                    PendingAndInTransitOtherAssets = totalAssets
                },
                ToBalance = new ToBalance
                {
                    Recommendations = (recommendationStats?.Pending + recommendationStats?.Approved) ?? 0m,
                    ActiveAndClosed = totalAccountChangeLogs ?? 0m
                }
            };

            return Ok(financesDto);
        }

        [HttpGet("export-finances-data")]
        public async Task<IActionResult> ExportFinancesData()
        {
            var result = await GetFinancesData() as OkObjectResult;

            if (result == null || result.Value == null)
            {
                return BadRequest(new { Success = false, Message = "No data available for export." });
            }

            var financesDto = (FinancesDto)result.Value;

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "Consolidated Finances.xlsx";

            using (var workbook = new XLWorkbook())
            {
                var ws = workbook.Worksheets.Add("Consolidated Finances");
                int row = 1;

                var titleRange = ws.Range(row, 1, row, 2).Merge();
                titleRange.Value = "Consolidated Finances";
                titleRange.Style.Font.Bold = true;
                titleRange.Style.Font.FontSize = 16;
                row += 1;

                Action<string> AddSectionHeader = (title) =>
                {
                    var range = ws.Range(row, 1, row, 2).Merge();
                    range.Value = title;
                    range.Style.Font.Bold = true;
                    range.Style.Font.FontSize = 13;
                    ws.Row(row).Height = 30;
                    row++;
                };

                Action<string, object> AddRow = (string label, object value) =>
                {
                    ws.Cell(row, 1).Value = label;
                    ws.Cell(row, 2).Value = value?.ToString() ?? string.Empty;
                    ws.Cell(row, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                    ws.Row(row).Height = 20;
                    row++;
                };

                Action<string, decimal> AddCurrencyRow = (string label, decimal value) =>
                {
                    ws.Cell(row, 1).Value = label;
                    ws.Cell(row, 2).Value = value;
                    ws.Cell(row, 2).Style.NumberFormat.Format = "$#,##0.00";
                    ws.Cell(row, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                    ws.Row(row).Height = 20;
                    row++;
                };

                Action<string, decimal> AddTotalRow = (string label, decimal value) =>
                {
                    ws.Cell(row, 1).Value = label;
                    ws.Cell(row, 2).Value = value;
                    ws.Cell(row, 2).Style.NumberFormat.Format = "$#,##0.00";

                    ws.Cell(row, 1).Style.Fill.BackgroundColor = XLColor.LightGray;
                    ws.Cell(row, 2).Style.Fill.BackgroundColor = XLColor.LightGray;
                    ws.Cell(row, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                    ws.Row(row).Height = 20;
                    row++;
                };

                Action<string, decimal> AddBalanceRow = (string label, decimal value) =>
                {
                    ws.Cell(row, 1).Value = label;
                    ws.Cell(row, 2).Value = value;
                    ws.Cell(row, 2).Style.NumberFormat.Format = "$#,##0.00";

                    ws.Cell(row, 1).Style.Fill.BackgroundColor = XLColor.FromHtml("#2b547f");
                    ws.Cell(row, 1).Style.Font.FontColor = XLColor.White;
                    ws.Cell(row, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                    ws.Row(row).Height = 20;
                    row++;
                };

                AddSectionHeader("USERS");
                AddRow("Total active users", financesDto.Users.Active);
                AddRow("Total inactive users", financesDto.Users.Inactive);
                AddCurrencyRow("Total user account balances", financesDto.Users.AccountBalances);
                AddCurrencyRow("Total user investments", financesDto.Users.Investments);
                AddTotalRow("TOTAL USER INVESTMENTS PLUS ACCOUNT BALANCES", financesDto.Users.InvestmentsPlusAccountBalances);

                AddSectionHeader("GROUPS");
                AddRow("Total owned investment groups", financesDto.Groups.Leaders);
                AddRow("Total group members", financesDto.Groups.Members);
                AddRow("Total corporate groups", financesDto.Groups.Corporate);

                AddSectionHeader("RECOMMENDATIONS");
                AddCurrencyRow("Total pending", financesDto.Recommendations.Pending);
                AddCurrencyRow("Total approved", financesDto.Recommendations.Approved);
                AddRow("Count of approved and pending recommendations", financesDto.Recommendations.ApprovedAndPending);
                AddCurrencyRow("Total rejected", financesDto.Recommendations.Rejected);
                AddTotalRow("TOTAL RECOMMENDATIONS", financesDto.Recommendations.Total);

                AddSectionHeader("INVESTMENTS");
                AddCurrencyRow("Average investment amount", financesDto.Investments.Average);
                AddRow("Total active investments", financesDto.Investments.Active);
                AddRow("Total active investments over $25K", financesDto.Investments.Over25K);
                AddRow("Total active investments over $50K", financesDto.Investments.Over50K);
                AddRow("Total completed investments", financesDto.Investments.Completed);
                AddTotalRow("TOTAL CATACAP INVESTMENTS, ACTIVE", financesDto.Investments.TotalActive);
                AddTotalRow("TOTAL CATACAP INVESTMENTS, COMPLETED", financesDto.Investments.TotalCompleted);
                AddTotalRow("TOTAL CATACAP INVESTMENTS, ACTIVE AND CLOSED", financesDto.Investments.TotalActiveAndClosed);
                AddTotalRow("TOTAL CATACAP ASSETS (User account balances + total recommendations)", financesDto.Investments.Assets);

                AddSectionHeader("INVESTMENTS BY THEME");
                foreach (var theme in financesDto.InvestmentThemes)
                    AddCurrencyRow(theme.Name, theme.Total);

                AddSectionHeader("GRANTS");
                AddCurrencyRow("Total pending and in transit grants", financesDto.Grants.PendingAndInTransit);
                AddCurrencyRow("Total pending and in transit other assets", financesDto.Grants.PendingAndInTransitOtherAssets);

                AddSectionHeader("TO BALANCE");
                AddBalanceRow("TOTAL RECOMMENDATIONS", financesDto.ToBalance.Recommendations);
                AddBalanceRow("TOTAL ACTIVE AND CLOSED CATACAP INVESTMENTS", financesDto.ToBalance.ActiveAndClosed);
                AddBalanceRow("DIFFERENCE", financesDto.ToBalance.Difference);

                ws.Columns().AdjustToContents();

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    var content = stream.ToArray();
                    return File(content, contentType, fileName);
                }
            }
        }
    }
}
