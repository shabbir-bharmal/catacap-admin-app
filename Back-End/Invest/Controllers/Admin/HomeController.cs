using DocumentFormat.OpenXml.Drawing;
using DocumentFormat.OpenXml.Office2010.Excel;
using Invest.Core.Dtos;
using Invest.Core.Models;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel;
using System.Globalization;
using System.Text.Json;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/home")]
    [ApiController]
    public class HomeController : ControllerBase
    {
        private readonly RepositoryContext _context;
        private const string approved = "approved";
        private const string pending = "pending";

        public HomeController(RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetDashboard()
        {
            var now = DateTime.Now;
            var startOfThisMonth = new DateTime(now.Year, now.Month, 1);
            var startOfLastMonth = startOfThisMonth.AddMonths(-1);

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

            var nonAdminUserEmails = usersQuery.Select(u => u.Email);

            var recommendationStats = await _context.Recommendations
                                            .Where(r => nonAdminUserEmails.Contains(r.UserEmail!))
                                            .GroupBy(r => 1)
                                            .Select(g => new
                                            {
                                                Approved = g.Where(r => r.Status!.ToLower().Trim() == approved)
                                                            .Sum(r => (decimal?)r.Amount) ?? 0m,

                                                ApprovedCount = g.Count(r => r.Status!.ToLower().Trim() == approved),

                                                ThisMonthCount = g.Count(x => x.DateCreated >= startOfThisMonth),

                                                ThisMonthAmount = g.Where(x => x.DateCreated >= startOfThisMonth)
                                                                   .Sum(x => (decimal?)x.Amount) ?? 0m,

                                                LastMonthCount = g.Count(x => x.DateCreated >= startOfLastMonth &&
                                                                              x.DateCreated < startOfThisMonth),

                                                LastMonthAmount = g.Where(x => x.DateCreated >= startOfLastMonth &&
                                                                               x.DateCreated < startOfThisMonth)
                                                                   .Sum(x => (decimal?)x.Amount) ?? 0m
                                            })
                                            .FirstOrDefaultAsync();

            decimal totalDonations = recommendationStats?.Approved ?? 0m;
            int totalDonationCount = recommendationStats?.ApprovedCount ?? 0;

            decimal averageDonation = totalDonationCount == 0 ? 0 : totalDonations / totalDonationCount;

            decimal thisMonthDonations = recommendationStats?.ThisMonthAmount ?? 0m;
            decimal lastMonthDonations = recommendationStats?.LastMonthAmount ?? 0m;

            var totalGroups = await _context.Groups.CountAsync();

            var lastMonthGroups = await _context.Groups
                                                .Where(x => x.CreatedAt >= startOfLastMonth &&
                                                            x.CreatedAt < startOfThisMonth)
                                                .CountAsync();

            var totalUsers = await _context.Users.Where(r => nonAdminUserEmails.Contains(r.Email!)).CountAsync();

            var lastMonthUsers = await _context.Users
                                               .Where(x => x.DateCreated >= startOfLastMonth
                                                        && x.DateCreated < startOfThisMonth)
                                               .CountAsync();

            decimal thisMonthAvg = 0;
            decimal lastMonthAvg = 0;

            if (recommendationStats != null)
            {
                thisMonthAvg = recommendationStats.ThisMonthCount == 0
                                ? 0
                                : recommendationStats.ThisMonthAmount / recommendationStats.ThisMonthCount;

                lastMonthAvg = recommendationStats.LastMonthCount == 0
                                ? 0
                                : recommendationStats.LastMonthAmount / recommendationStats.LastMonthCount;
            }

            decimal CalculateGrowth(decimal current, decimal previous)
            {
                if (previous == 0) return current == 0 ? 0 : 100;
                return Math.Round(((current - previous) / previous) * 100, 2);
            }

            var response = new AdminDashboardDto
            {
                TotalDonations = Math.Round(totalDonations, 0, MidpointRounding.AwayFromZero),
                TotalGroups = totalGroups,
                TotalUsers = totalUsers,
                AverageDonation = Math.Round(averageDonation, 0, MidpointRounding.AwayFromZero),
                DonationGrowthPercentage = CalculateGrowth(totalDonations, lastMonthDonations),
                GroupGrowthPercentage = CalculateGrowth(totalGroups, lastMonthGroups),
                UserGrowthPercentage = CalculateGrowth(totalUsers, lastMonthUsers),
                AvgDonationGrowthPercentage = CalculateGrowth(thisMonthAvg, lastMonthAvg)
            };

            return Ok(response);
        }

        [HttpGet("investment-chart")]
        public async Task<IActionResult> GetInvestmentChart(int? months)
        {
            var now = DateTime.Now;

            DateTime startDate;
            DateTime endDate = now;

            if (months.HasValue && months > 0)
            {
                startDate = new DateTime(now.Year, now.Month, 1).AddMonths(-(months.Value - 1));
            }
            else
            {
                startDate = await _context.Recommendations
                                          .Where(r => r.DateCreated.HasValue)
                                          .MinAsync(r => r.DateCreated!.Value);

                startDate = new DateTime(startDate.Year, startDate.Month, 1);
            }

            var query = from r in _context.Recommendations
                            join u in _context.Users on r.UserEmail equals u.Email
                            join ur in _context.UserRoles on u.Id equals ur.UserId
                            join role in _context.Roles on ur.RoleId equals role.Id
                            where role.Name == UserRoles.User
                                  && r.Status == approved
                                  && r.DateCreated.HasValue
                                  && r.DateCreated >= startDate
                                  && r.DateCreated <= endDate
                            select r;

            var data = await query.ToListAsync();

            var chart = data
                        .GroupBy(x => new { x.DateCreated!.Value.Year, x.DateCreated!.Value.Month })
                        .Select(g => new
                        {
                            g.Key.Year,
                            g.Key.Month,
                            Amount = g.Sum(x => x.Amount ?? 0)
                        })
                        .ToList();

            var chartData = new List<MonthlyInvestmentDto>();

            var loopDate = startDate;

            while (loopDate <= endDate)
            {
                var monthData = chart.FirstOrDefault(x => x.Year == loopDate.Year && x.Month == loopDate.Month);

                chartData.Add(new MonthlyInvestmentDto
                {
                    Month = loopDate.ToString("MMM"),
                    Amount = Math.Round(monthData?.Amount ?? 0, 0)
                });

                loopDate = loopDate.AddMonths(1);
            }

            var totalInvestment = data.Sum(x => x.Amount ?? 0);

            var investors = data
                            .Select(x => x.UserEmail)
                            .Distinct()
                            .Count();

            decimal growthRate = 0;

            if (months.HasValue)
            {
                var previousStart = startDate.AddMonths(-months.Value);
                var previousEnd = startDate.AddDays(-1);

                var previousTotal = await (
                                              from r in _context.Recommendations
                                              join u in _context.Users on r.UserEmail equals u.Email
                                              join ur in _context.UserRoles on u.Id equals ur.UserId
                                              join role in _context.Roles on ur.RoleId equals role.Id
                                              where role.Name == UserRoles.User
                                                    && r.Status == approved
                                                    && r.DateCreated >= previousStart
                                                    && r.DateCreated <= previousEnd
                                              select r.Amount
                                          ).SumAsync() ?? 0;

                if (previousTotal == 0)
                    growthRate = totalInvestment == 0 ? 0 : 100;
                else
                    growthRate = Math.Round(((totalInvestment - previousTotal) / previousTotal) * 100, 2);
            }

            var response = new InvestmentChartResponseDto
            {
                TotalDonations = Math.Round(totalInvestment, 0, MidpointRounding.AwayFromZero),
                TotalInvestments = Math.Round(totalInvestment, 0, MidpointRounding.AwayFromZero),
                GrowthRate = growthRate,
                Investors = investors,
                ChartData = chartData
            };

            return Ok(response);
        }

        [HttpGet("investment-by-theme")]
        public async Task<IActionResult> GetInvestmentByTheme()
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

            var nonAdminUserEmails = usersQuery.Select(u => u.Email);

            var allThemes = await _context.Themes
                                          .Select(t => new { t.Id, t.Name })
                                          .ToListAsync();

            var rawCampaignThemes = await _context.Campaigns
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

            var relevantRec = await _context.Recommendations
                                            .Where(r => nonAdminUserEmails.Contains(r.UserEmail!) &&
                                                       (r.Status == pending || r.Status == approved))
                                            .Select(r => new
                                            {
                                                r.CampaignId,
                                                r.Amount,
                                                r.Status
                                            })
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


            var themeStats = allThemes
                            .Select(theme => new
                            {
                                Name = theme.Name!,
                                Total = recWithThemes
                                            .Where(r => r.ThemeIds.Contains(theme.Id))
                                            .Sum(r => r.ThemeIds.Count > 0
                                                        ? (r.Amount ?? 0m) / r.ThemeIds.Count
                                                        : 0m)
                            })
                            .Where(x => x.Total > 0)
                            .ToList();

            var grandTotal = themeStats.Sum(x => x.Total);

            var response = themeStats
                            .Select(x => new InvestmentThemeResponseDto
                            {
                                Name = x.Name,
                                TotalAmount = Math.Round(x.Total, 2),
                                Percentage = grandTotal == 0 ? 0 : Math.Round((x.Total / grandTotal) * 100, 0)
                            })
                            .OrderByDescending(x => x.TotalAmount)
                            .ToList();

            return Ok(response);
        }

        [HttpGet("recent-investments")]
        public async Task<IActionResult> GetRecentInvestments([FromQuery] PaginationDto dto)
        {
            bool isAsc = dto.SortDirection?.ToLower() == "asc";
            int page = dto.CurrentPage ?? 1;
            int pageSize = dto.PerPage ?? 10;

            var query = from r in _context.Recommendations
                        join u in _context.Users on r.UserEmail equals u.Email
                        join c in _context.Campaigns on r.CampaignId equals c.Id
                        join ur in _context.UserRoles on u.Id equals ur.UserId
                        join role in _context.Roles on ur.RoleId equals role.Id
                        where role.Name == UserRoles.User
                        select new
                        {
                            Investor = u.FirstName + " " + u.LastName,
                            UserName = "@" + u.UserName,
                            Investment = c.Name,
                            Amount = r.Amount ?? 0m,
                            Status = r.Status!,
                            r.DateCreated
                        };

            if (!string.IsNullOrWhiteSpace(dto.SearchValue))
            {
                string search = dto.SearchValue.ToLower();

                query = query.Where(x =>
                    x.Investor.ToLower().Contains(search) ||
                    x.UserName.ToLower().Contains(search) ||
                    x.Investment.ToLower().Contains(search));
            }

            if (!string.IsNullOrWhiteSpace(dto.Status))
                query = query.Where(x => x.Status == dto.Status);

            query = dto.SortField?.ToLower() switch
            {
                "investor" => isAsc ? query.OrderBy(x => x.Investor)
                                    : query.OrderByDescending(x => x.Investor),

                "investment" => isAsc ? query.OrderBy(x => x.Investment)
                                      : query.OrderByDescending(x => x.Investment),

                "amount" => isAsc ? query.OrderBy(x => x.Amount)
                                  : query.OrderByDescending(x => x.Amount),

                "status" => isAsc ? query.OrderBy(x => x.Status)
                                  : query.OrderByDescending(x => x.Status),

                "date" => isAsc ? query.OrderBy(x => x.DateCreated)
                                : query.OrderByDescending(x => x.DateCreated),

                _ => query.OrderByDescending(x => x.DateCreated)
            };

            int totalCount = await query.CountAsync();

            var data = await query.Skip((page - 1) * pageSize)
                                  .Take(pageSize)
                                  .ToListAsync();

            var response = data.Select(x => new RecentInvestmentDto
            {
                Investor = x.Investor,
                UserName = x.UserName,
                Investment = x.Investment,
                Amount = Math.Round(x.Amount, 0, MidpointRounding.AwayFromZero),
                Status = x.Status,
                Date = x.DateCreated?.ToString("MMM dd") ?? ""
            }).ToList();

            return Ok(new { totalCount, items = response });
        }

        [HttpGet("top-donors")]
        public async Task<IActionResult> GetTopDonors([FromQuery] PaginationDto dto)
        {
            bool isAsc = dto.SortDirection?.ToLower() == "asc";

            var query =
                        from r in _context.Recommendations
                        join u in _context.Users on r.UserEmail equals u.Email
                        join ur in _context.UserRoles on u.Id equals ur.UserId
                        join role in _context.Roles on ur.RoleId equals role.Id
                        where role.Name == UserRoles.User
                              && r.Status == approved
                        group new { r, u } by new
                        {
                            u.Id,
                            u.FirstName,
                            u.LastName
                        } into g
                        select new
                        {
                            Donor = g.Key.FirstName + " " + g.Key.LastName,
                            Amount = g.Sum(x => (decimal?)x.r.Amount) ?? 0m,
                            Donations = g.Count()
                        };

            if (!string.IsNullOrWhiteSpace(dto.SearchValue))
            {
                string search = dto.SearchValue.ToLower();
                query = query.Where(x => x.Donor.ToLower().Contains(search));
            }

            query = dto.SortField?.ToLower() switch
            {
                "donor" => isAsc ? query.OrderBy(x => x.Donor)
                                 : query.OrderByDescending(x => x.Donor),

                "amount" => isAsc ? query.OrderBy(x => x.Amount)
                                  : query.OrderByDescending(x => x.Amount),

                "donations" => isAsc ? query.OrderBy(x => x.Donations)
                                     : query.OrderByDescending(x => x.Donations),

                _ => query.OrderByDescending(x => x.Donations)
            };

            int page = dto.CurrentPage ?? 1;
            int pageSize = dto.PerPage ?? 10;

            int totalCount = await query.CountAsync();

            var data = await query.Skip((page - 1) * pageSize)
                                  .Take(pageSize)
                                  .ToListAsync();

            var response = data.Select(x => new TopDonorDto
            {
                Donor = x.Donor,
                Amount = Math.Round(x.Amount, 0, MidpointRounding.AwayFromZero),
                Donations = x.Donations
            }).ToList();

            return Ok(new { totalCount, items = response });
        }

        [HttpGet("top-groups")]
        public async Task<IActionResult> GetTopGroups([FromQuery] PaginationDto dto)
        {
            bool isAsc = dto.SortDirection?.ToLower() == "asc";

            var query = from g in _context.Groups
                        join log in _context.AccountBalanceChangeLogs on g.Id equals log.GroupId
                        join u in _context.Users on log.UserId equals u.Id
                        join ur in _context.UserRoles on u.Id equals ur.UserId
                        join role in _context.Roles on ur.RoleId equals role.Id
                        where role.Name == UserRoles.User
                              && log.GroupId != null
                              && (log.NewValue - log.OldValue) > 0
                        group new { log } by new
                        {
                            g.Id,
                            g.Name
                        } into grp
                        select new
                        {
                            GroupId = grp.Key.Id,
                            GroupName = grp.Key.Name,

                            TotalInvestment = grp.Sum(x =>
                                (decimal?)((x.log.NewValue ?? 0) - (x.log.OldValue ?? 0))) ?? 0m,

                            Members = _context.Requests
                                              .Count(req =>
                                                  req.GroupToFollow!.Id == grp.Key.Id &&
                                                  req.Status == "accepted")
                        };

            if (!string.IsNullOrWhiteSpace(dto.SearchValue))
            {
                string search = dto.SearchValue.ToLower();
                query = query.Where(x => x.GroupName!.ToLower().Contains(search));
            }

            query = dto.SortField?.ToLower() switch
            {
                "group" => isAsc ? query.OrderBy(x => x.GroupName)
                                 : query.OrderByDescending(x => x.GroupName),

                "investment" => isAsc ? query.OrderBy(x => x.TotalInvestment)
                                      : query.OrderByDescending(x => x.TotalInvestment),

                "members" => isAsc ? query.OrderBy(x => x.Members)
                                   : query.OrderByDescending(x => x.Members),

                _ => query.OrderByDescending(x => x.TotalInvestment)
            };

            int page = dto.CurrentPage ?? 1;
            int pageSize = dto.PerPage ?? 10;

            int totalCount = await query.CountAsync();

            var data = await query.Skip((page - 1) * pageSize)
                                  .Take(pageSize)
                                  .ToListAsync();

            var response = data.Select(x => new TopGroupDto
            {
                Group = x.GroupName,
                Investment = Math.Round(x.TotalInvestment, 0, MidpointRounding.AwayFromZero),
                Members = x.Members
            }).ToList();

            return Ok(new
            {
                totalCount,
                items = response
            });
        }

        [HttpGet("audit-logs")]
        public async Task<IActionResult> GetAuditLogs([FromQuery] PaginationDto dto, [FromQuery] string? id, [FromQuery] string? type)
        {
            int page = dto?.CurrentPage ?? 1;
            int pageSize = dto?.PerPage ?? 20;
            bool isAsc = dto?.SortDirection?.ToLower() == "asc";

            var query = from audit in _context.AuditLogs
                        join updatedUser in _context.Users
                        on audit.UpdatedBy equals updatedUser.Id into updatedUsers
                        from updatedUser in updatedUsers.DefaultIfEmpty()

                        join userRecord in _context.Users
                        on audit.RecordId equals userRecord.Id into userRecords
                        from userRecord in userRecords.DefaultIfEmpty()

                        join campaign in _context.Campaigns
                        on audit.RecordId equals campaign.Id.ToString() into campaigns
                        from campaign in campaigns.DefaultIfEmpty()

                        join Group in _context.Groups
                        on audit.RecordId equals Group.Id.ToString() into groups
                        from Group in groups.DefaultIfEmpty()

                        select new AuditLogDto
                        {
                            Id = audit.RecordId,
                            TableName = audit.TableName,
                            Identifier = audit.TableName == "AspNetUsers"
                                            ? (userRecord != null ? userRecord.FirstName + " " + userRecord.LastName : audit.RecordId)
                                            : audit.TableName == "Campaigns"
                                                ? campaign.Name
                                                : audit.TableName == "Groups"
                                                    ? Group.Name
                                                    : audit.RecordId,

                            ActionType = audit.ActionType,
                            OldValues = audit.OldValues,
                            NewValues = audit.NewValues,
                            ChangedColumns = audit.ChangedColumns,
                            UpdatedBy = updatedUser != null ? updatedUser.UserName : null,
                            UpdatedDate = audit.UpdatedAt,
                            UpdatedAt = audit.UpdatedAt.ToString("dd MMM yyyy hh:mm tt")
                        };

            if (!string.IsNullOrWhiteSpace(type))
                query = query.Where(x => x.TableName!.ToLower().Trim() == type.ToLower().Trim());

            if (!string.IsNullOrWhiteSpace(id))
                query = query.Where(x => x.Id == id);

            if (!string.IsNullOrWhiteSpace(dto?.SearchValue))
            {
                string search = dto.SearchValue.ToLower();
                query = query.Where(x =>
                                        x.TableName!.ToLower().Contains(search) ||
                                        (x.Identifier != null && x.Identifier.ToLower().Contains(search)) ||
                                        x.ActionType!.ToLower().Contains(search)
                                   );
            }

            query = dto?.SortField?.ToLower() switch
            {
                "actiontype" => isAsc ? query.OrderBy(x => x.ActionType)
                                      : query.OrderByDescending(x => x.ActionType),

                "updatedat" => isAsc ? query.OrderBy(x => x.UpdatedDate)
                                     : query.OrderByDescending(x => x.UpdatedDate),

                _ => query.OrderByDescending(x => x.UpdatedDate)
            };

            var totalCount = await query.CountAsync();

            var data = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            foreach (var item in data)
            {
                item.OldValues = FormatJsonDates(item.OldValues);
                item.NewValues = FormatJsonDates(item.NewValues);
            }

            return Ok(new { totalCount, items = data });
        }

        [HttpGet("user-full-data")]
        public async Task<IActionResult> GetUserFullData([FromQuery] string email)
        {
            if (string.IsNullOrEmpty(email))
                return Ok(new { Success = false, Message = "Email or username is required." });

            var users = await _context.Users
                .Where(u => u.Email.ToLower().Contains(email.ToLower()) ||
                            u.UserName.ToLower().Contains(email.ToLower()))
                .Select(u => new
                {
                    u.Id,
                    u.FirstName,
                    u.LastName,
                    FullName = u.FirstName + " " + u.LastName,
                    u.UserName,
                    u.AccountBalance,
                    u.Email,
                    u.IsActive,
                    u.DateCreated
                })
                .ToListAsync();

            if (!users.Any())
                return Ok(new { Success = false, Message = "No users found." });

            var result = new List<object>();

            var themes = await _context.Themes.ToListAsync();
            var investmentTypes = await _context.InvestmentTypes.ToListAsync();

            foreach (var user in users)
            {
                var userId = user.Id;
                var userEmail = user.Email;

                // Campaigns
                var campaigns = await _context.Campaigns
                                              .Where(c => c.UserId == userId)
                                              .Select(c => new
                                              {
                                                  c.Id,
                                                  c.Name,
                                                  c.Stage,
                                                  c.FundraisingCloseDate,
                                                  c.CreatedDate
                                              })
                                              .OrderBy(c => c.Name!.Trim())
                                              .ToListAsync();

                var campaignIds = campaigns.Select(c => c.Id).ToList();

                var campaignDict = await _context.Campaigns
                                                 .Where(c => c.Id != null)
                                                 .ToDictionaryAsync(c => c.Id!.Value, c => c.Name);

                var userDict = await _context.Users
                                             .ToDictionaryAsync(
                                                 u => u.Id.ToLower(),
                                                 u => new
                                                 {
                                                     u.Email,
                                                     u.FirstName,
                                                     u.LastName,
                                                     u.UserName
                                                 });

                // Recommendations
                var recommendations = await _context.Recommendations
                    .Where(r => r.UserId == userId)
                    .ToListAsync();

                // Account Logs
                var accountHistory = await _context.AccountBalanceChangeLogs
                    .Where(a => a.UserId == userId)
                    .ToListAsync();

                // Investment Notes
                var investmentNotes = await _context.InvestmentNotes
                    .Where(i => campaignIds.Contains(i.CampaignId!.Value))
                    .ToListAsync();

                // Disbursal
                var disbursalRequests = await _context.DisbursalRequest
                    .Where(d => d.UserId == userId)
                    .ToListAsync();

                var disbursalIds = disbursalRequests.Select(d => d.Id).ToList();

                var disbursalNotes = await _context.DisbursalRequestNotes
                    .Where(d => disbursalIds.Contains(d.DisbursalRequestId!.Value))
                    .ToListAsync();

                // Pending Grants
                var pendingGrants = await _context.PendingGrants
                    .Where(p => p.UserId == userId)
                    .ToListAsync();

                var pendingIds = pendingGrants.Select(p => p.Id).ToList();

                var pendingNotes = await _context.PendingGrantNotes
                    .Where(n => pendingIds.Contains(n.PendingGrantId!.Value))
                    .ToListAsync();

                // Asset Requests
                var assetRequests = await _context.AssetBasedPaymentRequest
                    .Include(a => a.AssetType)
                    .Where(a => a.UserId == userId)
                    .ToListAsync();

                var assetIds = assetRequests.Select(a => a.Id).ToList();

                var assetNotes = await _context.AssetBasedPaymentRequestNotes
                    .Where(a => assetIds.Contains(a.RequestId))
                    .ToListAsync();

                // Returns
                var returnMasters = await _context.ReturnMasters
                    .Where(r => campaignIds.Contains(r.CampaignId))
                    .ToListAsync();

                var returnMasterIds = returnMasters.Select(r => r.Id).ToList();

                var returnDetails = await _context.ReturnDetails
                    .Where(r => returnMasterIds.Contains(r.ReturnMasterId))
                    .ToListAsync();

                // Completed Investments
                var completedInvestments = await _context.CompletedInvestmentsDetails
                    .Where(c => campaignIds.Contains(c.CampaignId))
                    .ToListAsync();

                var completedIds = completedInvestments.Select(c => c.Id).ToList();

                var completedNotes = await _context.CompletedInvestmentNotes
                    .Where(n => completedIds.Contains(n.CompletedInvestmentId!.Value))
                    .ToListAsync();

                // ACH Payments
                var achPayments = await _context.UserStripeTransactionMapping
                    .Where(a => a.UserId.ToString() == userId)
                    .ToListAsync();

                // Form Submission
                var formSubmission = await _context.FormSubmission
                    .Where(f => f.Email == userEmail)
                    .ToListAsync();

                var formIds = formSubmission.Select(f => f.Id).ToList();

                var formNotes = await _context.FormSubmissionNotes
                    .Where(n => formIds.Contains(n.FormSubmissionId!.Value))
                    .ToListAsync();

                // Final Mapping
                result.Add(new
                {
                    User = user,

                    Campaigns = campaigns,

                    Recommendations = recommendations.Select(r => new
                    {
                        r.Id,
                        r.UserFullName,
                        r.UserEmail,
                        r.Status,
                        r.Amount,
                        r.DateCreated,
                        CampaignName = r.CampaignId.HasValue ? campaignDict.GetValueOrDefault(r.CampaignId.Value) : null
                    })
                    .OrderByDescending(r => r.Id),

                    AccountLogs = accountHistory.Select(a => new
                    {
                        a.Id,
                        a.UserName,
                        a.User?.Email,
                        a.PaymentType,
                        a.OldValue,
                        a.NewValue,
                        a.ChangeDate,
                        a.Fees,
                        a.GrossAmount,
                        a.NetAmount,
                        CampaignName = a.CampaignId.HasValue ? campaignDict.GetValueOrDefault(a.CampaignId.Value) : null
                    })
                    .OrderByDescending(a => a.Id),

                    InvestmentNotes = investmentNotes.Select(i => new
                    {
                        i.Id,
                        i.User?.UserName,
                        CampaignName = i.CampaignId.HasValue ? campaignDict.GetValueOrDefault(i.CampaignId.Value) : null,
                        i.OldStatus,
                        i.NewStatus,
                        i.Note,
                        i.CreatedAt
                    })
                    .OrderByDescending(i => i.Id),

                    Disbursals = disbursalRequests.Select(d => new
                    {
                        d.Id,
                        d.User.Email,
                        d.Campaign?.InvestmentTypes,
                        d.Role,
                        d.DistributedAmount,
                        d.CreatedAt,
                        CampaignName = d.CampaignId.HasValue ? campaignDict.GetValueOrDefault(d.CampaignId.Value) : null
                    })
                    .OrderByDescending(d => d.Id),

                    DisbursalNotes = disbursalNotes.Select(d => new
                    {
                        d.Id,
                        d.Note,
                        d.User?.UserName,
                        d.CreatedAt
                    })
                    .OrderByDescending(d => d.Id),

                    PendingGrants = pendingGrants.Select(p => new
                    {
                        p.Id,
                        p.User?.FirstName,
                        p.User?.LastName,
                        p.User?.Email,
                        p.Amount,
                        p.AmountAfterFees,
                        p.DAFName,
                        p.DAFProvider,
                        Status = string.IsNullOrEmpty(p.status) ? "Pending" : p.status,
                        p.CreatedDate,
                        CampaignName = p.CampaignId.HasValue ? campaignDict.GetValueOrDefault(p.CampaignId.Value) : null
                    })
                    .OrderByDescending(p => p.Id),

                    PendingGrantNotes = pendingNotes.Select(n => new
                    {
                        n.Id,
                        n.User?.UserName,
                        n.Note,
                        n.OldStatus,
                        n.NewStatus,
                        n.CreatedAt
                    })
                    .OrderByDescending(n => n.Id),

                    AssetRequests = assetRequests.Select(a => new
                    {
                        a.Id,
                        a.User?.FirstName,
                        a.User?.LastName,
                        a.User?.Email,
                        AssetType = !string.IsNullOrWhiteSpace(a.AssetDescription) ? a.AssetDescription : a.AssetType.Type,
                        a.ApproximateAmount,
                        a.ReceivedAmount,
                        a.ContactMethod,
                        a.ContactValue,
                        a.Status,
                        a.CreatedAt,
                        CampaignName = a.CampaignId.HasValue ? campaignDict.GetValueOrDefault(a.CampaignId.Value) : null
                    })
                    .OrderByDescending(a => a.Id),

                    AssetRequestNotes = assetNotes.Select(a => new
                    {
                        a.Id,
                        a.User?.UserName,
                        a.OldStatus,
                        a.NewStatus,
                        a.Note,
                        a.CreatedAt
                    })
                    .OrderByDescending(a => a.Id),

                    Returns = returnMasters
                    .SelectMany(r => r.ReturnDetails ?? new List<ReturnDetails>(), (rm, rd) => new
                    {
                        rm.Id,
                        rm.Status,
                        rm.PostDate,
                        rm.MemoNote,
                        CampaignName = campaignDict.GetValueOrDefault(rm.CampaignId),
                        rd.User?.FirstName,
                        rd.User?.LastName,
                        rd.User?.Email,
                        rd.InvestmentAmount,
                        Percentage = rd.PercentageOfTotalInvestment,
                        ReturnedAmount = rd.ReturnAmount,
                        DateRange = rm.PrivateDebtStartDate.HasValue && rm.PrivateDebtEndDate.HasValue
                                        ? string.Format(
                                            CultureInfo.GetCultureInfo("en-US"),
                                            "{0:MM/dd/yy}-{1:MM/dd/yy}",
                                            rm.PrivateDebtStartDate.Value,
                                            rm.PrivateDebtEndDate.Value)
                                        : null,
                        PostDateFormatted = rm.PostDate.ToString("MM/dd/yy", CultureInfo.GetCultureInfo("en-US"))
                    })
                    .OrderByDescending(a => a.Id),

                    CompletedInvestments = completedInvestments.Select(c =>
                    {
                        var campaign = c.Campaign;

                        var themeIds = ParseCommaSeparatedIds(campaign?.Themes);
                        var invTypeIds = ParseCommaSeparatedIds(c.TypeOfInvestment);

                        var themeNames = themes
                            .Where(t => themeIds.Contains(t.Id))
                            .OrderBy(t => t.Name)
                            .Select(t => t.Name)
                            .ToList();

                        var investmentTypesNames = investmentTypes
                            .Where(i => invTypeIds.Contains(i.Id))
                            .OrderBy(i => i.Name)
                            .Select(i => i.Name)
                            .ToList();

                        return new
                        {
                            c.Id,
                            c.DateOfLastInvestment,
                            CampaignName = campaignDict.GetValueOrDefault(c.CampaignId),
                            Stage = (campaign!.Stage?.GetType()
                                        .GetField(campaign.Stage.ToString()!)?
                                        .GetCustomAttributes(typeof(DescriptionAttribute), false)?
                                        .FirstOrDefault() as DescriptionAttribute)?.Description
                                    ?? campaign.Stage.ToString(),
                            CataCapFund = campaign.AssociatedFundId.HasValue
                                            ? campaignDict.GetValueOrDefault(campaign.AssociatedFundId.Value)
                                            : null,
                            c.InvestmentDetail,
                            Amount = Math.Round(c.Amount ?? 0, 0),
                            TypeOfInvestment = string.Join(", ", investmentTypesNames),
                            c.Donors,
                            Themes = string.Join(", ", themeNames)
                        };
                    })
                    .OrderByDescending(c => c.Id),

                    CompletedInvestmentNotes = completedNotes.Select(n => new
                    {
                        n.Id,
                        n.User?.UserName,
                        n.TransactionType,
                        n.Note,
                        n.NewAmount,
                        n.OldAmount,
                        n.CreatedAt
                    })
                    .OrderByDescending(n => n.Id),

                    ACHPayments = achPayments.Select(a =>
                    {
                        var key = a.UserId?.ToString().ToLower();

                        var user = key != null && userDict.TryGetValue(key, out var u) ? u : null;

                        return new
                        {
                            a.Id,
                            user?.Email,
                            user?.UserName,
                            user?.FirstName,
                            user?.LastName,
                            a.Amount,
                            a.TransactionId,
                            a.CreatedDate,
                            a.Status,
                            a.Country
                        };
                    })
                    .OrderByDescending(a => a.CreatedDate),

                    FormSubmission = formSubmission.Select(f => new
                    {
                        f.Id,
                        f.FormType,
                        f.FirstName,
                        f.LastName,
                        f.Email,
                        f.CreatedAt,
                        f.Status
                    })
                    .OrderByDescending(f => f.Id),

                    FormSubmissionNotes = formNotes.Select(n => new
                    {
                        n.Id,
                        n.Note,
                        n.User?.UserName,
                        n.OldStatus,
                        n.NewStatus,
                        n.CreatedAt
                    })
                    .OrderByDescending(n => n.Id)
                });
            }

            return Ok(new
            {
                Success = true,
                result.Count,
                Data = result
            });
        }

        private string? FormatJsonDates(string? json)
        {
            if (string.IsNullOrEmpty(json))
                return json;

            var dict = JsonSerializer.Deserialize<Dictionary<string, object>>(json);

            if (dict == null)
                return json;

            foreach (var key in dict.Keys.ToList())
            {
                if (DateTime.TryParse(dict[key]?.ToString(), out DateTime dt))
                {
                    dict[key] = dt.ToString("dd MMM yyyy hh:mm tt");
                }
            }

            return JsonSerializer.Serialize(dict);
        }

        private static List<int> ParseCommaSeparatedIds(string? input)
        {
            if (string.IsNullOrWhiteSpace(input)) return new List<int>();

            return input.Split(',', StringSplitOptions.RemoveEmptyEntries)
                        .Select(id => int.TryParse(id.Trim(), out var val) ? val : (int?)null)
                        .Where(id => id.HasValue)
                        .Select(id => id!.Value)
                        .ToList();
        }
    }
}
