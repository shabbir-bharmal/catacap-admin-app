using AutoMapper;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Specialized;
using ClosedXML.Excel;
using DocumentFormat.OpenXml.Presentation;
using Invest.Authorization.Helper;
using Invest.Core.Constants;
using Invest.Core.Dtos;
using Invest.Core.Models;
using Invest.Core.Settings;
using Invest.Repo.Data;
using Invest.Service.Interfaces;
using Invest.Service.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Data;
using System.Security.Claims;


namespace Invest.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly RepositoryContext _context;
        private readonly BlobContainerClient _blobContainerClient;
        protected readonly IRepositoryManager _repository;
        private readonly IMailService _mailService;
        private readonly IMapper _mapper;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly EmailQueue _emailQueue;
        private readonly ImageService _imageService;
        private readonly AppSecrets _appSecrets;

        public UsersController(
            RepositoryContext context,
            BlobContainerClient blobContainerClient,
            IRepositoryManager repository,
            IMailService mailService,
            IMapper mapper,
            IHttpContextAccessor httpContextAccessors,
            EmailQueue emailQueue,
            ImageService imageService,
            AppSecrets appSecrets)
        {
            _context = context;
            _repository = repository;
            _mailService = mailService;
            _mapper = mapper;
            _blobContainerClient = blobContainerClient;
            _httpContextAccessor = httpContextAccessors;
            _emailQueue = emailQueue;
            _imageService = imageService;
            _appSecrets = appSecrets;
        }

        [HttpPost("get-users")]
        public async Task<IActionResult> GetUsers([FromBody] PaginationDto pagination)
        {
            bool isAsc = pagination?.SortDirection?.ToLower() == "asc";
            int page = pagination?.CurrentPage ?? 1;
            int pageSize = pagination?.PerPage ?? 50;

            var groupAdminRoleId = await _context.Roles
                                                    .Where(r => r.Name == UserRoles.GroupAdmin)
                                                    .Select(r => r.Id)
                                                    .FirstOrDefaultAsync();
            var groupAdminUsers = await _context.UserRoles
                                                .Where(ur => ur.RoleId == groupAdminRoleId)
                                                .Select(ur => ur.UserId)
                                                .ToArrayAsync();

            var query = _context.Users
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

            if (!string.IsNullOrWhiteSpace(pagination?.SearchValue))
            {
                var searchValue = pagination.SearchValue.Trim().ToLower();

                query = query.Where(u =>
                                    (u.FirstName ?? "").Trim().ToLower().Contains(searchValue) ||
                                    (u.LastName ?? "").Trim().ToLower().Contains(searchValue) ||
                                    ((u.FirstName ?? "") + " " + (u.LastName ?? "")).Trim().ToLower().Contains(searchValue) ||
                                    (u.Email ?? "").Trim().ToLower().Contains(searchValue));
            }

            query = pagination?.SortField?.ToLower() switch
            {
                "fullname" => isAsc
                                    ? query.OrderBy(u => u.FirstName).ThenBy(u => u.LastName)
                                    : query.OrderByDescending(u => u.FirstName).ThenByDescending(u => u.LastName),
                "datecreated" => isAsc
                                    ? query.OrderBy(u => u.DateCreated)
                                    : query.OrderByDescending(u => u.DateCreated),
                _ => query.OrderBy(u => u.FirstName).ThenBy(u => u.LastName)
            };

            if (pagination?.FilterByGroup == true)
                query = query.Where(u => u.Requests != null && u.Requests.Any(r => r.GroupToFollow != null && r.Status!.ToLower().Trim() == "accepted"));

            var totalCount = await query.CountAsync();

            List<User> users;

            bool isRecSorting = pagination?.SortField?.ToLower() == "recommendations";

            if (isRecSorting)
            {
                users = await query.Include(u => u.Requests!)
                                        .ThenInclude(r => r.GroupToFollow!)
                                    .Include(u => u.GroupBalances!)
                                        .ThenInclude(gb => gb.Group)
                                    .ToListAsync();
            }
            else
            {
                users = await query
                        .Skip((page - 1) * pageSize)
                        .Take(pageSize)
                        .Include(u => u.Requests!)
                            .ThenInclude(r => r.GroupToFollow!)
                        .Include(u => u.GroupBalances!)
                            .ThenInclude(gb => gb.Group)
                        .ToListAsync();
            }

            var emails = users.Select(u => u.Email.ToLower().Trim()).Distinct().ToList();

            var recommendationCounts = await _context.Recommendations
                                                        .Where(r => r.Amount > 0 &&
                                                                (r.Status == "pending" || r.Status == "approved") &&
                                                                emails.Contains(r.UserEmail!.ToLower().Trim()))
                                                        .GroupBy(r => r.UserEmail!.ToLower().Trim())
                                                        .Select(g => new
                                                        {
                                                            Email = g.Key,
                                                            Count = g.Count()
                                                        })
                                                        .ToDictionaryAsync(x => x.Email, x => x.Count);

            var result = users.Select(u =>
            {
                string emailKey = u.Email.ToLower().Trim();

                var acceptedGroups = u.Requests!
                                    .Where(r => r.GroupToFollow != null &&
                                                r.Status!.ToLower() == "accepted")
                                    .Select(r => r.GroupToFollow!)
                                    .Distinct()
                                    .ToList();
                return new
                {
                    u.Id,
                    u.FirstName,
                    u.LastName,
                    FullName = u.FirstName + " " + u.LastName,
                    u.UserName,
                    u.AccountBalance,
                    u.Email,
                    u.IsActive,
                    u.DateCreated,
                    IsGroupAdmin = groupAdminUsers.Contains(u.Id),
                    u.IsExcludeUserBalance,

                    RecommendationsCount = recommendationCounts.ContainsKey(emailKey)
                                                ? recommendationCounts[emailKey]
                                                : 0,

                    GroupNames = string.Join(",", acceptedGroups.Select(g => g.Name)),

                    GroupBalances = string.Join(",", acceptedGroups.Select(g =>
                    {
                        var bal = u.GroupBalances!.FirstOrDefault(gb => gb.Group.Id == g.Id);
                        return bal?.Balance.ToString("F2") ?? "0.00";
                    }))
                };
            }).ToList();

            if (isRecSorting)
            {
                result = isAsc
                        ? result.OrderBy(r => r.RecommendationsCount).ToList()
                        : result.OrderByDescending(r => r.RecommendationsCount).ToList();

                result = result.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            }

            if (result.Any())
                return Ok(new { items = result, totalCount = totalCount });

            return Ok(new { Success = false, Message = "Data not found." });
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<User>>> GetUsers(int? groupId = null, string? searchValue = null, string? sortField = null, string? sortDirection = null)
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

            if (!string.IsNullOrWhiteSpace(searchValue))
            {
                usersQuery = usersQuery.Where(u =>
                                        (u.FirstName + " " + u.LastName).ToLower().Contains(searchValue) ||
                                        u.Email.ToLower().Contains(searchValue));
            }

            bool isAsc = sortDirection?.ToLower() == "asc";

            usersQuery = sortField?.ToLower() switch
            {
                "fullname" => isAsc
                                    ? usersQuery.OrderBy(u => u.FirstName).ThenBy(u => u.LastName)
                                    : usersQuery.OrderByDescending(u => u.FirstName).ThenByDescending(u => u.LastName),
                "datecreated" => isAsc
                                    ? usersQuery.OrderBy(u => u.DateCreated)
                                    : usersQuery.OrderByDescending(u => u.DateCreated),
                _ => usersQuery.OrderBy(u => u.FirstName).ThenBy(u => u.LastName)
            };

            if (groupId != null)
            {
                usersQuery = usersQuery
                                    .Where(i => i.Requests != null && 
                                        i.Requests.Any(r =>
                                        r.Status == "accepted" &&
                                        r.GroupToFollow != null &&
                                        r.GroupToFollow.Id == groupId &&
                                        r.RequestOwner != null &&
                                        r.RequestOwner.Id == i.Id
                                    ));
            }

            var users = await usersQuery.ToListAsync();

            var userIds = users.Select(u => u.Id).ToList();
            var groupAccountBalances = await _context.GroupAccountBalance
                                                .Include(g => g.Group)
                                                .Where(gab => userIds.Contains(gab.User.Id))
                                                .ToListAsync();

            var groupAccountBalancesDto = _mapper.Map<List<GroupAccountBalanceDto>>(groupAccountBalances);
            
            var userIdToGroupBalanceMap = groupId == null ?
                                                        groupAccountBalancesDto
                                                            .GroupBy(gab => gab.UserId)
                                                            .ToDictionary(g => g.Key, g => g.LastOrDefault()) :
                                                        groupAccountBalancesDto
                                                            .GroupBy(gab => gab.UserId)
                                                            .ToDictionary(g => g.Key, g => g.Where(g => g.GroupId == groupId).FirstOrDefault());

            users.ForEach(user =>
            {
                user.Groups = null;
                user.GroupBalances = null;

                if (userIdToGroupBalanceMap.TryGetValue(user.Id, out var groupBalance))
                {
                    user.GroupAccountBalance = groupBalance;
                }
            });

            if (_context.Campaigns == null)
            {
                return NotFound();
            }
            return users;
        }

        [HttpGet("Export")]
        public async Task<IActionResult> GetExportUsers()
        {
            var groupAdminRoleId = await _context.Roles
                                                 .Where(r => r.Name == UserRoles.GroupAdmin)
                                                 .Select(r => r.Id)
                                                 .FirstOrDefaultAsync();

            var groupAdminUsers = await _context.UserRoles
                                                .Where(ur => ur.RoleId == groupAdminRoleId)
                                                .Select(ur => ur.UserId)
                                                .ToListAsync();

            var users = await (
                                from u in _context.Users
                                join ur in _context.UserRoles on u.Id equals ur.UserId
                                join r in _context.Roles on ur.RoleId equals r.Id
                                where r.Name == UserRoles.User
                                select new
                                {
                                    u.Id,
                                    u.UserName,
                                    u.FirstName,
                                    u.LastName,
                                    u.Email,
                                    NormalizedEmail = u.Email.ToLower().Trim(),
                                    u.IsActive,
                                    u.AccountBalance,
                                    u.ZipCode,
                                    u.DateCreated
                                }
                            )
                            .Distinct()
                            .ToListAsync();

            var userIds = users.Select(u => u.Id).ToList();
            var userEmails = users.Select(u => u.Email).ToList();

            var groups = await _context.Groups
                                       .Where(g => g.Owner != null)
                                       .Select(g => new { g.Id, g.Name, OwnerId = g.Owner!.Id })
                                       .ToListAsync();

            var userInvestmentsDict = await _context.Recommendations
                                                    .Where(r =>
                                                        userEmails.Contains(r.UserEmail!) &&
                                                        (r.Status == "approved" || r.Status == "pending"))
                                                    .GroupBy(r => r.UserEmail)
                                                    .Select(g => new
                                                    {
                                                        Email = g.Key!.ToLower().Trim(),
                                                        Amount = g.Sum(x => x.Amount)
                                                    })
                                                    .ToDictionaryAsync(x => x.Email, x => x.Amount);

            var userGroupsDict = await _context.Requests
                                               .Where(r => r.RequestOwner != null &&
                                                           r.GroupToFollow != null &&
                                                           userIds.Contains(r.RequestOwner.Id) &&
                                                           r.Status == "accepted")
                                               .GroupBy(r => r.RequestOwner!.Id)
                                               .Select(g => new
                                               {
                                                   UserId = g.Key,
                                                   GroupIds = g.Select(x => x.GroupToFollow!.Id).Distinct()
                                               })
                                               .ToDictionaryAsync(
                                                   x => x.UserId,
                                                   x => x.GroupIds.ToList()
                                               );

            var allThemes = await _context.Themes
                                          .Select(t => new { t.Id, t.Name })
                                          .ToListAsync();

            var feedbackDict = await _context.InvestmentFeedback
                                             .GroupBy(f => f.UserId)
                                             .Select(g => g.OrderByDescending(f => f.Id).FirstOrDefault())
                                             .ToDictionaryAsync(f => f!.UserId, f => f);

            var recommendationCounts = await _context.Recommendations
                                                     .Where(r => r.Amount > 0 &&
                                                                 (r.Status == "pending" || r.Status == "approved") &&
                                                                 userEmails.Contains(r.UserEmail!))
                                                     .GroupBy(r => r.UserEmail)
                                                     .Select(g => new
                                                     {
                                                         Email = g.Key!.ToLower().Trim(),
                                                         Count = g.Count()
                                                     })
                                                     .ToDictionaryAsync(x => x.Email, x => x.Count);

            var userDtos = users.Select(user =>
            {
                feedbackDict.TryGetValue(user.Id, out var feedback);
                recommendationCounts.TryGetValue(user.NormalizedEmail, out var recCount);

                userInvestmentsDict.TryGetValue(user.NormalizedEmail, out var investedAmount);

                var groupAdmin = groupAdminUsers.Contains(user.Id) ? "Yes" : null;

                userGroupsDict.TryGetValue(user.Id, out var followingGroupIds);
                var followingNames = string.Join(", ", groups
                                           .Where(g => followingGroupIds != null && followingGroupIds.Contains(g.Id))
                                           .Select(g => g.Name));

                var ownedNames = string.Join(", ", groups.Where(g => g.OwnerId == user.Id).Select(g => g.Name));

                var themeIds = feedback?.Themes?
                                        .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                        .Select(int.Parse)
                                        .Distinct()
                                        .ToList() ?? new List<int>();

                var themeNames = string.Join(", ", allThemes
                                       .Where(t => themeIds.Contains(t.Id))
                                       .Select(t => t.Name));

                var typeIds = feedback?.InterestedInvestmentType?
                                       .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                       .Select(int.Parse)
                                       .Distinct()
                                       .ToList() ?? new List<int>();

                var typeNames = string.Join(", ", typeIds
                                      .Select(id => Enum.GetName(typeof(InterestedInvestmentType), id)));

                return new UsersExportDto
                {
                    UserName = user.UserName,
                    FirstName = user.FirstName!,
                    LastName = user.LastName!,
                    Email = user.Email,
                    IsActive = user.IsActive == true ? "Active" : "Inactive",
                    Recommendations = recCount,
                    AmountInvested = (investedAmount ?? 0m).ToString("0.00"),
                    AmountInAccount = (user.AccountBalance ?? 0m).ToString("0.00"),
                    FollowingGroups = followingNames,
                    GroupOwner = ownedNames,
                    IsGroupAdmin = groupAdmin,
                    SurveyThemes = themeNames,
                    SurveyAdditionalThemes = feedback?.AdditionalThemes,
                    SurveyInvestmentInterest = typeNames,
                    SurveyRiskTolerance = feedback?.RiskTolerance.ToString() ?? "",
                    ZipCode = user.ZipCode,
                    DateCreated = user.DateCreated
                };
            }).ToList();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "users.xlsx";

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("Users");

                var headers = new[]
                {
                    "UserName", "FirstName", "LastName", "Email", "IsActive", "Recommendations",
                    "AmountInvested", "AmountInAccount", "FollowingGroups",
                    "OwnedGroupName", "GroupAdmin","SurveyThemes", "SurveyAdditionalThemes", 
                    "SurveyInvestmentInterest", "SurveyRiskTolerance", "ZipCode", "DateCreated"
                };

                for (int i = 0; i < headers.Length; i++)
                {
                    worksheet.Cell(1, i + 1).Value = headers[i];
                    worksheet.Cell(1, i + 1).Style.Font.Bold = true;
                }

                for (int i = 0; i < userDtos.Count; i++)
                {
                    var dto = userDtos[i];
                    int row = i + 2;
                    int col = 1;

                    worksheet.Cell(row, col++).Value = dto.UserName;
                    worksheet.Cell(row, col++).Value = dto.FirstName;
                    worksheet.Cell(row, col++).Value = dto.LastName;
                    worksheet.Cell(row, col++).Value = dto.Email;
                    worksheet.Cell(row, col++).Value = dto.IsActive;
                    worksheet.Cell(row, col++).Value = dto.Recommendations;

                    var amountInvestedCell = worksheet.Cell(row, col++);
                    amountInvestedCell.Value = decimal.Parse(dto.AmountInvested);
                    amountInvestedCell.Style.NumberFormat.Format = "$#,##0.00";

                    var amountInAccountCell = worksheet.Cell(row, col++);
                    amountInAccountCell.Value = decimal.Parse(dto.AmountInAccount);
                    amountInAccountCell.Style.NumberFormat.Format = "$#,##0.00";

                    worksheet.Cell(row, col++).Value = dto.FollowingGroups;
                    worksheet.Cell(row, col++).Value = dto.GroupOwner;
                    worksheet.Cell(row, col++).Value = dto.IsGroupAdmin;
                    worksheet.Cell(row, col++).Value = dto.SurveyThemes;
                    worksheet.Cell(row, col++).Value = dto.SurveyAdditionalThemes;
                    worksheet.Cell(row, col++).Value = dto.SurveyInvestmentInterest;
                    worksheet.Cell(row, col++).Value = dto.SurveyRiskTolerance;
                    worksheet.Cell(row, col++).Value = dto.ZipCode;

                    var dateCreatedCell = worksheet.Cell(row, col++);
                    dateCreatedCell.Value = dto.DateCreated;
                    dateCreatedCell.Style.DateFormat.Format = "MM/dd/yyyy";
                    dateCreatedCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;
                }

                worksheet.Columns().AdjustToContents();

                foreach (var column in worksheet.Columns())
                    column.Width += 10;

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    var content = stream.ToArray();
                    return File(content, contentType, fileName);
                }
            }
        }

        private async Task SendEmail(string origin, string email, string firstName, string lastName, decimal originalAmount, decimal originalAmountAfter, string? investmentName, decimal investmentAmount, decimal amountAfterInvestment)
        {
            string logoUrl = $"{origin}/logo-for-email.png";
            string logoHtml = $@"
                                <div style='text-align: center;'>
                                    <a href='https://catacap.org' target='_blank'>
                                        <img src='{logoUrl}' alt='CataCap Logo' width='300' height='150' />
                                    </a>
                                </div>";

            string formattedOriginalAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal(originalAmount));
            string formattedOriginalAmountAfter = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal(originalAmountAfter));
            string formattedInvestmentAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal(investmentAmount));
            string formattedAmountAfterInvestment = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal(amountAfterInvestment));

            string investmentScenarios = !string.IsNullOrEmpty(investmentName) 
                                            ? $"Based on your investment of <b>{formattedInvestmentAmount}</b> in <b>{investmentName}</b>, your remaining balance is <b>{formattedAmountAfterInvestment}</b>"
                                            : "";

            var subject = "Your Grant Was Received — Let’s Put It to Work";

            var body = logoHtml + $@"
                                    <p><b>Hi {firstName},</b></p>
                                    <p>We’re excited to confirm that your <b>{formattedOriginalAmount} grant</b> has been received. After the up front 5% CataCap fee, you’ll now see {formattedOriginalAmountAfter} in your account!</p>
                                    <p>{investmentScenarios}</p>
                                    <p>Your generosity is now ready to move — fueling bold founders, catalytic funds, and the innovations our future depends on.</p>
                                    <p>Thank you for choosing to <b>activate your donor capital with purpose</b>.</p>
                                    <p style='margin-bottom: 0px;'><b>🔗 Ready to invest in impact?</b></p>
                                    <p style='margin-top: 0px;'><a href='{origin}/find'>Start browsing live opportunities</a></p>
                                    <p>Together, we’re bridging the gap between intention and action — and unlocking a new future for how capital drives change.</p>
                                    <p style='margin-bottom: 0px;'>Let’s get to work.</p>
                                    <p style='margin-top: 0px;'>— The CataCap Team</p>
                                    <p style='margin-bottom: 0px;'>🌍 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
                                    <p style='margin-top: 0px;'>Need help? Email us at <a href='mailto:support@catacap.org'>support@catacap.org</a></p>
                                    <p><a href='{origin}/settings' target='_blank'>Unsubscribe</a> from CataCap notifications.</p>
                                    ";

            await _mailService.SendMailAsync(email, subject, plainText: "", body);
        }

        [HttpPut("accountBalance/{groupId}")]
        public async Task<IActionResult> UpdateAccountGroupBalance(int groupId, [FromQuery] string email, [FromQuery] decimal accountBalance, [FromQuery] string comment)
        {
            if (email == null || email == string.Empty)
                return Ok(new { Success = false, Message = "User email required." });

            var group = await _context.Groups.FirstOrDefaultAsync(i => i.Id == groupId);

            var allocatedGroupBalanceTotal = await _context.GroupAccountBalance
                                                        .Where(x => group != null && x.Group.Id == group.Id)
                                                        .SumAsync(x => x.Balance);
                
            var investedGroupBalanceTotal = await _context.AccountBalanceChangeLogs
                                                                .Where(x => group != null 
                                                                        && x.GroupId == group.Id
                                                                        && x.InvestmentName != null
                                                                        && x.TransactionStatus != "Rejected")
                                                                .SumAsync(x => (decimal?)x.OldValue - (decimal?)x.NewValue);
                
            decimal? CurrentBalance = group?.OriginalBalance != null ? group.OriginalBalance : 0;
            CurrentBalance = CurrentBalance == 0 ? CurrentBalance : CurrentBalance - (allocatedGroupBalanceTotal + investedGroupBalanceTotal);

            if (CurrentBalance - accountBalance < 0)
                return Ok(new { Success = false, Message = "Group current balance value can't be less than 0." });

            var groupBalance = await _context.GroupAccountBalance
                                            .Include(i => i.Group)
                                            .Include(i => i.User)
                                            .FirstOrDefaultAsync(i => i.User.Email == email 
                                                                        && i.Group.Id == groupId 
                                                                        && i.User.Email == email);

            var user = await _context.Users.FirstOrDefaultAsync(i => i.Email == email);

            if (groupBalance == null && user != null && group != null)
            {
                groupBalance = new GroupAccountBalance()
                {
                    User = user,
                    Group = group,
                    Balance = 0
                };
                await _context.GroupAccountBalance.AddAsync(groupBalance);
                await _context.SaveChangesAsync();
            }

            if (groupBalance!.Balance + accountBalance < 0)
                return Ok(new { Success = false, Message = "Insufficient allocated fund." });

            var identity = HttpContext?.User.Identity as ClaimsIdentity == null ? _httpContextAccessor.HttpContext?.User.Identity as ClaimsIdentity : HttpContext.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;
            var loginUser = await _repository.UserAuthentication.GetUserById(loginUserId!);

            bool isAdmin = identity?.Claims.Any(c => c.Type == ClaimTypes.Role && (c.Value == UserRoles.Admin || c.Value == UserRoles.SuperAdmin)) == true;

            string adminName = isAdmin ? $"admin user: {loginUser.UserName!.Trim().ToLower()}" : $"group leader: {loginUser.UserName!.Trim().ToLower()}";

            var userInvestment = new UserInvestments
            {
                UserId = groupBalance.User.Id,
                PaymentType = $"Balance updated by {adminName}",
                LogTriggered = false
            };
            await _context.UserInvestments.AddAsync(userInvestment);
            await _context.SaveChangesAsync();

            var accountBalanceChangeLog = new AccountBalanceChangeLog
            {
                UserId = groupBalance.User.Id,
                PaymentType = $"Balance updated by {adminName}",
                OldValue = groupBalance.Balance,
                UserName = groupBalance.User.UserName,
                NewValue = groupBalance.Balance + accountBalance,
                GroupId = groupId,
                Comment = !string.IsNullOrWhiteSpace(comment) ? comment.Trim() : null
            };
            await _context.AccountBalanceChangeLogs.AddAsync(accountBalanceChangeLog);
            await _context.SaveChangesAsync();

            groupBalance.Balance += accountBalance;
            groupBalance.LastUpdated = DateTime.Now;

            user!.IsActive = true;
            user!.IsFreeUser = false;
            await _context.SaveChangesAsync();

            var groupCurrentBalance = CurrentBalance - accountBalance;

            return Ok(new { Success = true, Message = $"Group current balance is {groupCurrentBalance}" });
        }

        [HttpPut("accountBalance")]
        public async Task<IActionResult> UpdateAccountBalance(string email, decimal accountBalance, decimal? originalAmount = null, string? grantType = null, string? comment = null, string? reference = null, int? groupId = null, int? pendingGrantsId = null, string? investmentName = null, decimal? totalInvestmentAmount = null, string? zipCode = null)
        {
            if (string.IsNullOrEmpty(email))
                return Ok(new { Success = false, Message = "User email required." });

            var user = await _context.Users.FirstOrDefaultAsync(i => i.Email == email);
            var groupBalance = await _context.GroupAccountBalance.FirstOrDefaultAsync(i => i.User.Email == email && i.Group.Id == groupId);

            if (groupBalance == null && user != null)
            {
                var group = await _context.Groups.FirstOrDefaultAsync(i => i.Id == groupId);

                if (group != null)
                {
                    groupBalance = new GroupAccountBalance()
                    {
                        User = user,
                        Group = group,
                        Balance = 0
                    };
                }
            }

            if (user?.AccountBalance + accountBalance < 0)
                return Ok(new { Success = false, Message = "Insufficient balance in user account." });

            var identity = HttpContext?.User.Identity as ClaimsIdentity == null ? _httpContextAccessor.HttpContext?.User.Identity as ClaimsIdentity : HttpContext.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;
            var loginUser = await _repository.UserAuthentication.GetUserById(loginUserId!);

            var accountBalanceChangeLog = new AccountBalanceChangeLog
            {
                UserId = user!.Id,
                PaymentType = string.IsNullOrWhiteSpace(grantType)
                                ? $"Balance updated by admin user, {loginUser.UserName.Trim().ToLower()}"
                                : $"{grantType}, {loginUser.UserName.Trim().ToLower()}",
                OldValue = user.AccountBalance,
                UserName = user.UserName,
                NewValue = user.AccountBalance + accountBalance,
                PendingGrantsId = pendingGrantsId != null ? pendingGrantsId : null,
                Reference = !string.IsNullOrWhiteSpace(reference) ? reference.Trim() : null,
                Comment = !string.IsNullOrWhiteSpace(comment) ? comment.Trim() : null,
                ZipCode = !string.IsNullOrWhiteSpace(zipCode) ? zipCode.Trim() : null,
            };
            await _context.AccountBalanceChangeLogs.AddAsync(accountBalanceChangeLog);

            if (user.IsFreeUser == true)
                user.IsFreeUser = false;

            user.AccountBalance = user.AccountBalance == null ? accountBalance : user.AccountBalance + accountBalance;

            await _context.SaveChangesAsync();

            if (user.OptOutEmailNotifications == null || !user.OptOutEmailNotifications.Value)
            {
                var request = _httpContextAccessor.HttpContext?.Request.Headers["Origin"].ToString();

                decimal newValue = accountBalanceChangeLog.NewValue ?? 0m;
                decimal userBalance = user.AccountBalance ?? 0m;
                decimal totalInvestment = totalInvestmentAmount ?? 0m;
                decimal amountAfterInvestment = newValue - Math.Min(userBalance, totalInvestment);
                decimal investmentAmount;

                if (newValue > userBalance!) 
                    investmentAmount = newValue; 
                else if (newValue < totalInvestment)
                    investmentAmount = newValue; 
                else 
                    investmentAmount = originalAmount ?? 0m;

                if (accountBalance > 0 && originalAmount > 0)
                {
                    string formattedOriginalAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal(originalAmount));
                    string formattedOriginalAmountAfter = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal(accountBalance));
                    string formattedInvestmentAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal(investmentAmount));
                    string formattedAmountAfterInvestment = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal(amountAfterInvestment));

                    string investmentScenario = !string.IsNullOrEmpty(investmentName)
                                                ? $"Based on your investment of <b>{formattedInvestmentAmount}</b> in <b>{investmentName}</b>, your remaining balance is <b>{formattedAmountAfterInvestment}</b>"
                                                : "";

                    var variables = new Dictionary<string, string>
                    {
                        { "logoUrl", await _imageService.GetImageUrl() },
                        { "firstName", user.FirstName! },
                        { "originalAmount", formattedOriginalAmount },
                        { "originalAmountAfter", formattedOriginalAmountAfter },
                        { "investmentScenario", investmentScenario },
                        { "browseOpportunitiesUrl", $"{_appSecrets.RequestOrigin}/investments" },
                        { "unsubscribeUrl", $"{_appSecrets.RequestOrigin}/settings" }
                    };

                    _emailQueue.QueueEmail(async (sp) =>
                    {
                        var emailService = sp.GetRequiredService<IEmailTemplateService>();

                        await emailService.SendTemplateEmailAsync(
                            EmailTemplateCategory.GrantReceived,
                            user.Email,
                            variables
                        );
                    });

                    // _ = SendEmail(request!, email, user.FirstName!, user.LastName!, originalAmount ?? 0m, accountBalance, investmentName, investmentAmount, amountAfterInvestment);
                }
            }

            return Ok(new { Success = true, Message = "Account balance has been updated successfully!" });
        }

        [HttpPost]
        public async Task<ActionResult<EditUserDto>> GetUser(TokenDto tokenData)
        {
            if (tokenData.Token == null)
                return BadRequest();

            var user = await _repository.UserAuthentication.GetUser(tokenData.Token);

            if (user == null)
                return BadRequest();

            var campaignId = await _context.Campaigns
                                            .Where(x => x.ContactInfoEmailAddress!.ToLower().Trim() == user.Email.ToLower().Trim() && x.IsActive == true)
                                            .OrderByDescending(x => x.Id)
                                            .Select(x => x.Id)
                                            .FirstOrDefaultAsync();

            var isFeedback = await _context.InvestmentFeedback.AnyAsync(i => i.UserId == user.Id);
            List<string> groupLinks = await _context.Groups.Where(x => x.Owner != null && x.Owner.Id == user.Id && x.Identifier != null).Select(x => x.Identifier!).ToListAsync();

            var dto = new EditUserDto
            {
                Address = user.Address!,
                Email = user.Email,
                FirstName = user.FirstName!,
                LastName = user.LastName!,
                PictureFileName = user.PictureFileName!,
                AccountBalance = user.AccountBalance ?? 0,
                UserName = user.UserName,
                Token = tokenData.Token,
                EmailFromGroupsOn = user.EmailFromGroupsOn.GetValueOrDefault(),
                EmailFromUsersOn = user.EmailFromUsersOn.GetValueOrDefault(),
                OptOutEmailNotifications = user.OptOutEmailNotifications.GetValueOrDefault(),
                IsApprouveRequired = user.IsApprouveRequired.GetValueOrDefault(),
                IsUserHidden = user.IsUserHidden ?? false,
                Feedback = isFeedback,
                IsFreeUser = user.IsFreeUser,
                IsAnonymousInvestment = user.IsAnonymousInvestment ?? false,
                ConsentToShowAvatar = user.ConsentToShowAvatar,
                GroupLinks = groupLinks.Count > 0 ? groupLinks : new List<string>(),
                HasInvestments = campaignId != null ? true : false,
                ZipCode = user.ZipCode
            };
            return dto;
        }

        [HttpPost("{userName}")]
        public async Task<ActionResult<UserDetailDto>> GetUserByUserName(string userName, [FromBody] TokenDto tokenData)
        {
            if (string.IsNullOrEmpty(userName))
            {
                return BadRequest();
            }

            var user = await _repository.UserAuthentication.GetUserByUserName(userName);

            if (user == null)
                return NotFound();

            var dto = new UserDetailDto
            {
                Id = user.Id,
                Address = user.Address!,
                Email = user.Email,
                FirstName = user.FirstName!,
                LastName = user.LastName!,
                UserName = user.UserName,
                PictureFileName = user.ConsentToShowAvatar ? user.PictureFileName : null,
                IsFollowing = false,
                IsFollowPending = false,
                IsOwner = false
            };

            if (!string.IsNullOrEmpty(tokenData.Token))
            {
                var userOwner = await _repository.UserAuthentication.GetUser(tokenData.Token);
                var isOwnerUserDetail = user.Id == userOwner.Id;
                dto.IsOwner = isOwnerUserDetail;

                if (userOwner != null && !isOwnerUserDetail)
                {
                    var followingRequest = await _context.Requests.FirstOrDefaultAsync(r => r.RequestOwner != null && r.UserToFollow != null && r.RequestOwner.Id == userOwner.Id && r.UserToFollow.Id == user.Id);
                    if (followingRequest != null)
                    {
                        dto.IsFollowing = true;
                        if (followingRequest.Status == "pending")
                        {
                            dto.IsFollowPending = true;
                        }
                        else
                        {
                            dto.IsFollowPending = false;
                        }
                    }
                    else
                    {
                        if (user.IsUserHidden.GetValueOrDefault())
                        {
                            return NotFound();
                        }
                        dto.IsFollowing = false;
                    }
                }
            }

            return dto;
        }

        [HttpPut("edit")]
        public async Task<IActionResult> UpdateUser([FromBody] EditUserDto user)
        {
            var existingUser = await _repository.UserAuthentication.GetUser(user.Token);
            if (existingUser == null)
                return NotFound("User not found.");

            string existingUserEmailForRecommendations = existingUser.Email;
            var checkEmail = await CheckDuplicatesAsync(user.Email, null, existingUser.Id);
            if (!checkEmail.Success)
                return BadRequest(new { Success = false, checkEmail.Message });

            var checkUserName = await CheckDuplicatesAsync(null, user.UserName, existingUser.Id);
            if (!checkUserName.Success)
                return BadRequest(new { Success = false, checkUserName.Message });

            if (!string.IsNullOrWhiteSpace(user.PictureFile))
            {
                string imageFileName = Guid.NewGuid().ToString() + ".jpg";
                var imageBlob = _blobContainerClient.GetBlockBlobClient(imageFileName);
                var imagestr = user.PictureFile.Substring(user.PictureFile.IndexOf(',') + 1);
                var imageBytes = Convert.FromBase64String(imagestr);

                using (var stream = new MemoryStream(imageBytes))
                {
                    await imageBlob.UploadAsync(stream);
                }
                //var imageOldBlob = _blobContainerClient.GetBlockBlobClient(userDto.PictureFileName);
                //await imageOldBlob.DeleteIfExistsAsync();

                user.PictureFileName = imageFileName;
            }

            if (!string.Equals(existingUser!.Email, user.Email, StringComparison.OrdinalIgnoreCase))
            {
                var recommendations = await _context.Recommendations
                                                    .Where(r => r.UserEmail!.ToLower().Trim() == existingUser.Email.ToLower().Trim())
                                                    .ToListAsync();

                foreach (var rec in recommendations)
                    rec.UserEmail = user.Email;

                existingUser.Email = user.Email;
            }

            var oldFullName = $"{existingUser.FirstName!.Trim()} {existingUser.LastName!.Trim()}";
            var recommendation = await _context.Recommendations
                                               .Where(r => r.UserEmail!.ToLower().Trim() == existingUserEmailForRecommendations.ToLower().Trim())
                                               .ToListAsync();

            foreach (var rec in recommendation)
                rec.UserFullName = $"{user.FirstName} {user.LastName}";

            existingUser.FirstName = user.FirstName;
            existingUser.LastName = user.LastName;

            if (!string.Equals(existingUser.UserName, user.UserName, StringComparison.Ordinal))
            {
                var logs = await _context.AccountBalanceChangeLogs
                                         .Where(l => l.UserName!.ToLower().Trim() == existingUser.UserName.ToLower().Trim())
                                         .ToListAsync();

                foreach (var log in logs)
                    log.UserName = user.UserName;

                existingUser.UserName = user.UserName;
            }

            await _context.SaveChangesAsync();

            var result = await _repository.UserAuthentication.EditUserData(user);
            if (!result.Succeeded)
                return BadRequest("Failed to update user data.");

            var updatedUser = await _repository.UserAuthentication.GetUserById(existingUser.Id);
            if (updatedUser == null)
                return NotFound("User not found.");

            var isFeedback = await _context.InvestmentFeedback.AnyAsync(i => i.UserId == updatedUser.Id);
            
            List<string> groupLinks = await _context.Groups
                                                    .Where(x => x.Owner != null 
                                                            && x.Owner.Id == updatedUser.Id 
                                                            && x.Identifier != null)
                                                    .Select(x => x.Identifier!)
                                                    .ToListAsync();

            var campaignId = await _context.Campaigns
                                           .Where(x => x.ContactInfoEmailAddress!.ToLower().Trim() == user.Email.ToLower().Trim() 
                                                    && x.IsActive == true)
                                           .OrderByDescending(x => x.Id)
                                           .Select(x => x.Id)
                                           .FirstOrDefaultAsync();

            var dto = new EditUserDto
            {
                Address = updatedUser.Address!,
                Email = updatedUser.Email,
                FirstName = updatedUser.FirstName!,
                LastName = updatedUser.LastName!,
                PictureFileName = updatedUser.PictureFileName!,
                AccountBalance = updatedUser.AccountBalance ?? 0,
                UserName = updatedUser.UserName,
                Token = await _repository.UserAuthentication.CreateTokenAsync(),
                EmailFromGroupsOn = updatedUser.EmailFromGroupsOn.GetValueOrDefault(),
                EmailFromUsersOn = updatedUser.EmailFromUsersOn.GetValueOrDefault(),
                OptOutEmailNotifications = updatedUser.OptOutEmailNotifications.GetValueOrDefault(),
                IsApprouveRequired = updatedUser.IsApprouveRequired.GetValueOrDefault(),
                IsUserHidden = updatedUser.IsUserHidden ?? false,
                Feedback = isFeedback,
                IsFreeUser = updatedUser.IsFreeUser,
                IsAnonymousInvestment = updatedUser.IsAnonymousInvestment ?? false,
                ConsentToShowAvatar = updatedUser.ConsentToShowAvatar,
                GroupLinks = groupLinks.Count > 0 ? groupLinks : new List<string>(),
                HasInvestments = campaignId != null ? true : false,
                ZipCode = updatedUser.ZipCode
            };

            return Ok(dto);
        }

        [HttpGet("validate-duplicate-details")]
        public async Task<IActionResult> ValidateDuplicateDetails(string? email, string? userName)
        {
            if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(userName))
                return BadRequest(new { Success = false, Message = "Email or username must be provided." });

            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value ?? string.Empty;

            var result = await CheckDuplicatesAsync(email, userName, loginUserId);

            return Ok(new { result.Success, result.Message });
        }

        private async Task<(bool Success, string Message)> CheckDuplicatesAsync(string? email, string? userName, string userId)
        {
            if (!string.IsNullOrWhiteSpace(email))
            {
                bool duplicate = await _context.Users
                    .AnyAsync(u => u.Email.ToLower().Trim() == email.ToLower().Trim() && u.Id != userId);

                return (!duplicate, duplicate ? "Duplicate email exists." : "Email is available.");
            }

            if (!string.IsNullOrWhiteSpace(userName))
            {
                bool duplicate = await _context.Users
                    .AnyAsync(u => u.UserName.ToLower().Trim() == userName.ToLower().Trim() && u.Id != userId);

                return (!duplicate, duplicate ? "Duplicate username exists." : "Username is available.");
            }

            return (false, "Email or username required.");
        }

        [HttpGet("get-all-admin-users")]
        public async Task<IActionResult> GetAllAdminUsers()
        {
            var currentUserId = User.Claims.FirstOrDefault(c => c.Type == "id")?.Value;

            var adminUsers = await (
                                        from u in _context.Users
                                        join ur in _context.UserRoles on u.Id equals ur.UserId
                                        join r in _context.Roles on ur.RoleId equals r.Id
                                        where r.Name == UserRoles.Admin
                                                && u.Id != currentUserId
                                                && u.UserName != "admin2"
                                        select new
                                        {
                                            u.Id,
                                            u.Email,
                                            u.AlternateEmail,
                                            FullName = u.FirstName
                                        }
                                    ).ToListAsync();

            return Ok(adminUsers);
        }

        [HttpPatch("settings")]
        public async Task<IActionResult> UpdateUserSettings(string id, bool? isActive, bool? isExcludeUserBalance)
        {
            if (string.IsNullOrWhiteSpace(id))
                return BadRequest("User id is required.");

            var user = await _context.Users.FirstOrDefaultAsync(i => i.Id == id);

            if (user == null)
                return NotFound("User not found.");

            if(isActive.HasValue)
                user.IsActive = isActive.Value;

            if (isExcludeUserBalance.HasValue)
                user.IsExcludeUserBalance = isExcludeUserBalance.Value;

            int result = await _context.SaveChangesAsync();

            if(result > 0)
                return Ok();

            return BadRequest();
        }
    }
}
