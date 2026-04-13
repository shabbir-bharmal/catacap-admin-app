using ClosedXML.Excel;
using Invest.Core.Dtos;
using Invest.Core.Extensions;
using Invest.Core.Models;
using Invest.Repo.Data;
using Invest.Service.Interfaces;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/user")]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly RepositoryContext _context;
        protected readonly IRepositoryManager _repository;
        private readonly IHttpContextAccessor _httpContextAccessor;

        public UsersController(RepositoryContext context, IRepositoryManager repository, IHttpContextAccessor httpContextAccessor)
        {
            _context = context;
            _repository = repository;
            _httpContextAccessor = httpContextAccessor;
        }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] PaginationDto pagination)
        {
            bool isAsc = pagination?.SortDirection?.ToLower() == "asc";
            int page = pagination?.CurrentPage ?? 1;
            int pageSize = pagination?.PerPage ?? 50;
            bool? isDeleted = pagination?.IsDeleted;

            var groupAdminRoleId = await _context.Roles
                                                    .Where(r => r.Name == UserRoles.GroupAdmin)
                                                    .Select(r => r.Id)
                                                    .FirstOrDefaultAsync();

            var groupAdminUsers = await _context.UserRoles
                                                .Where(ur => ur.RoleId == groupAdminRoleId)
                                                .Select(ur => ur.UserId)
                                                .ToArrayAsync();

            var query = _context.Users
                                .ApplySoftDeleteFilter(isDeleted)
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
                "accountbalance" => isAsc
                                    ? query.OrderBy(u => u.AccountBalance)
                                    : query.OrderByDescending(u => u.AccountBalance),
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
                                                        .ApplySoftDeleteFilter(isDeleted)
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
                    })),
                    u.DeletedAt,
                    DeletedBy = u.DeletedByUser != null
                            ? $"{u.DeletedByUser.FirstName} {u.DeletedByUser.LastName}"
                            : null
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
                return Ok(new { items = result, totalCount });

            return Ok(new { Success = false, Message = "Data not found." });
        }

        [HttpGet("admin-users")]
        public async Task<IActionResult> GetAdminUsers([FromQuery] PaginationDto pagination)
        {
            bool isAsc = pagination?.SortDirection?.ToLower() == "asc";
            int page = pagination?.CurrentPage ?? 1;
            int pageSize = pagination?.PerPage ?? 50;
            
            var query = from u in _context.Users
                        join ur in _context.UserRoles on u.Id equals ur.UserId
                        join r in _context.Roles on ur.RoleId equals r.Id
                        where r.Name != UserRoles.User && r.Name != UserRoles.GroupAdmin
                        select new
                        {
                            u.Id,
                            u.FirstName,
                            u.LastName,
                            FullName = (u.FirstName ?? "") + " " + (u.LastName ?? ""),
                            u.UserName,
                            u.Email,
                            u.IsActive,
                            u.DateCreated,
                            ur.RoleId,
                            RoleName = r.Name
                        };

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
                "rolename" => isAsc
                                ? query.OrderBy(u => u.RoleName)
                                : query.OrderByDescending(u => u.RoleName),
                "email" => isAsc
                            ? query.OrderBy(u => u.Email)
                            : query.OrderByDescending(u => u.Email),

                _ => query.OrderBy(u => u.FirstName).ThenBy(u => u.LastName)
            };

            var totalCount = await query.CountAsync();

            var result = await query
                        .Skip((page - 1) * pageSize)
                        .Take(pageSize)
                        .ToListAsync();

            if (result.Any())
                return Ok(new { items = result, totalCount });

            return Ok(new { Success = false, Message = "Data not found." });
        }

        [HttpPost("admin-users")]
        public async Task<IActionResult> SaveAdminUser([FromBody] EditAdminUserDto model)
        {
            if (string.IsNullOrWhiteSpace(model.Email))
                return Ok(new { Success = false, Message = "Email is required." });

            if (string.IsNullOrWhiteSpace(model.FirstName))
                return Ok(new { Success = false, Message = "First name is required." });

            if (string.IsNullOrWhiteSpace(model.LastName))
                return Ok(new { Success = false, Message = "Last name is required." });

            if (string.IsNullOrEmpty(model.Id) && string.IsNullOrWhiteSpace(model.Password))
                return Ok(new { Success = false, Message = "Password is required for new user." });

            if (string.IsNullOrWhiteSpace(model.RoleId))
                return Ok(new { Success = false, Message = "Role is required." });

            User? user;

            if (!string.IsNullOrEmpty(model.Id))
            {
                user = await _context.Users.FirstOrDefaultAsync(x => x.Id == model.Id);

                if (user == null)
                    return Ok(new { Success = false, Message = "User not found." });

                var checkEmail = await CheckDuplicatesAsync(user.Email, null, user.Id);
                if (!checkEmail.Success)
                    return Ok(new { Success = false, Message = "Email already exists." });

                var checkUserName = await CheckDuplicatesAsync(null, user.UserName, user.Id);
                if (!checkUserName.Success)
                    return Ok(new { Success = false, Message = "Username already exists." });

                user.FirstName = model.FirstName;
                user.LastName = model.LastName;
                user.Email = model.Email;
                user.UserName = model.UserName;
                user.IsActive = model.IsActive ?? false;

                if (!string.IsNullOrWhiteSpace(model.Password))
                {
                    var passwordHasher = new PasswordHasher<User>();
                    user.PasswordHash = passwordHasher.HashPassword(user, model.Password);
                }

                var existingUserRole = await _context.UserRoles.FirstOrDefaultAsync(x => x.UserId == user.Id);

                if (existingUserRole != null && existingUserRole.RoleId != model.RoleId)
                {
                    _context.UserRoles.Remove(existingUserRole);
                    await _context.SaveChangesAsync();

                    var newUserRole = new IdentityUserRole<string>
                    {
                        UserId = user.Id,
                        RoleId = model.RoleId
                    };
                    await _context.UserRoles.AddAsync(newUserRole);
                }
                await _context.SaveChangesAsync();

                return Ok(new { Success = true, Message = "Admin user updated successfully." });
            }

            bool existsUserName = _context.Users.Any(x => x.UserName == model.UserName);
            if (existsUserName)
                return Ok(new { Success = false, Message = "Username already exists." });

            bool duplicateEmail = await _context.Users.AnyAsync(u => u.Email.ToLower().Trim() == model.Email.ToLower().Trim());
            if (duplicateEmail)
                return Ok(new { Success = false, Message = "Email is already registered." });

            UserRegistrationDto registrationDto = new UserRegistrationDto()
            {
                FirstName = model.FirstName,
                LastName = model.LastName,
                UserName = model.UserName,
                Password = model.Password,
                Email = model.Email.ToLower().Trim()
            };

            var role = await _context.Roles.FirstOrDefaultAsync(x => x.Id == model.RoleId);

            if (role == null)
                return Ok(new { Success = false, Message = "Invalid role selected." });

            var roleName = role?.Name ?? UserRoles.User;

            var userResult = await _repository.UserAuthentication.RegisterUserAsync(registrationDto, roleName);

            if (!userResult.Succeeded)
                return Ok(new { success = false, errors = userResult.Errors });

            if (model.IsActive == true)
            {
                var registeredUser = await _context.Users.Where(x => x.Email == model.Email).FirstOrDefaultAsync();
                registeredUser!.IsActive = true;
                await _repository.UserAuthentication.UpdateUser(registeredUser);
            }

            return Ok(new { Success = true, Message = "Admin user created successfully." });
        }

        [HttpGet("export")]
        public async Task<IActionResult> Export()
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
                                    u.IsExcludeUserBalance,
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
                    IsExcludeUserBalance = user.IsExcludeUserBalance == true ? "Yes" : null,
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
                    "UserName", "First Name", "Last Name", "Email", "Is Active", "Recommendations",
                    "Amount Invested", "Account Balance", "Following Groups",
                    "Owned Group Name", "Group Admin", "Exclude User Balance", "Survey Themes", "Survey Additional Themes",
                    "Survey Investment Interest", "Survey Risk Tolerance", "Zip Code", "Date Created"
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
                    worksheet.Cell(row, col++).Value = dto.IsExcludeUserBalance;
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

        [HttpPut("account-balance")]
        public async Task<IActionResult> UpdateAccountBalance(string email, decimal accountBalance, string? comment = null)
        {
            if (string.IsNullOrEmpty(email))
                return Ok(new { Success = false, Message = "User email required." });

            var user = await _context.Users.FirstOrDefaultAsync(i => i.Email == email);

            if (user == null)
                return NotFound(new { Success = false, Message = "User not found." });

            if (user?.AccountBalance + accountBalance < 0)
                return Ok(new { Success = false, Message = "Insufficient balance in user account." });

            var identity = HttpContext?.User.Identity as ClaimsIdentity == null ? _httpContextAccessor.HttpContext?.User.Identity as ClaimsIdentity : HttpContext.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;
            var loginUser = await _repository.UserAuthentication.GetUserById(loginUserId!);

            var accountBalanceChangeLog = new AccountBalanceChangeLog
            {
                UserId = user!.Id,
                PaymentType = $"Balance updated by admin user, {loginUser.UserName.Trim().ToLower()}",
                OldValue = user.AccountBalance,
                UserName = user.UserName,
                NewValue = user.AccountBalance + accountBalance,
                Comment = !string.IsNullOrWhiteSpace(comment) ? comment.Trim() : null,
            };
            await _context.AccountBalanceChangeLogs.AddAsync(accountBalanceChangeLog);

            if (user.IsFreeUser == true)
                user.IsFreeUser = false;

            user.AccountBalance = user.AccountBalance == null ? accountBalance : user.AccountBalance + accountBalance;

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Account balance has been updated successfully!" });
        }

        [HttpPatch("{id}/settings")]
        public async Task<IActionResult> UpdateSettings(string id, bool? isActive, bool? isExcludeUserBalance)
        {
            if (string.IsNullOrWhiteSpace(id))
                return BadRequest("User id is required.");

            var user = await _context.Users.FirstOrDefaultAsync(i => i.Id == id);

            if (user == null)
                return NotFound("User not found.");

            if (isActive.HasValue)
                user.IsActive = isActive.Value;

            if (isExcludeUserBalance.HasValue)
                user.IsExcludeUserBalance = isExcludeUserBalance.Value;

            int result = await _context.SaveChangesAsync();

            if (result > 0)
                return Ok();

            return BadRequest();
        }

        [HttpGet("admin-users-dropdown")]
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

        [HttpGet("dropdown")]
        public async Task<IActionResult> GetAllNonAdminUsers()
        {
            var nonAdminUsers = await (
                                    from u in _context.Users
                                    join ur in _context.UserRoles on u.Id equals ur.UserId
                                    join r in _context.Roles on ur.RoleId equals r.Id
                                    where r.Name == UserRoles.User
                                    select new
                                    {
                                        u.Id,
                                        u.Email,
                                        FullName = $"{u.FirstName} {u.LastName}"
                                    }
                                ).ToListAsync();

            return Ok(nonAdminUsers);
        }

        [HttpGet("by-token")]
        public async Task<ActionResult<AdminUserResponseDto>> GetUser(string token)
        {
            if (token == null)
                return BadRequest();

            var user = await _repository.UserAuthentication.GetUser(token);

            if (user == null)
                return BadRequest();

            var userRole = await (from ur in _context.UserRoles
                                  join r in _context.Roles on ur.RoleId equals r.Id
                                  where ur.UserId == user.Id
                                  select new
                                  {
                                      r.Id,
                                      r.Name,
                                      r.IsSuperAdmin
                                  }).FirstOrDefaultAsync();

            List<RolePermissionItemDto> permissions = new();

            if (userRole != null && !userRole.IsSuperAdmin)
            {
                permissions = await _context.ModuleAccessPermission
                    .Where(x => x.RoleId == userRole.Id)
                    .Include(x => x.Module)
                    .Select(x => new RolePermissionItemDto
                    {
                        ModuleId = x.Module!.Id,
                        ModuleName = x.Module!.Name,
                        IsManage = x.Manage,
                        IsDelete = x.Delete
                    })
                    .ToListAsync();
            }

            var dto = new AdminUserResponseDto
            {
                Email = user.Email,
                FirstName = user.FirstName!,
                LastName = user.LastName!,
                PictureFileName = user.PictureFileName!,
                UserName = user.UserName,
                RoleName = userRole?.Name ?? string.Empty,
                IsSuperAdmin = userRole != null ? userRole.IsSuperAdmin == true : false,
                Permissions = userRole?.IsSuperAdmin == true
                        ? new List<RolePermissionItemDto>()
                        : permissions
            };
            return dto;
        }

        [HttpPut]
        public async Task<IActionResult> UpdateUser([FromBody] EditAdminUserDto user)
        {
            var existingUser = await _repository.UserAuthentication.GetUser(user.Token!);

            if (existingUser == null)
                return Ok(new { Success = false, Message = "User not found" });

            string existingUserEmailForRecommendations = existingUser.Email;

            var checkEmail = await CheckDuplicatesAsync(user.Email, null, existingUser.Id);
            if (!checkEmail.Success)
                return Ok(new { Success = false, checkEmail.Message });

            var checkUserName = await CheckDuplicatesAsync(null, user.UserName, existingUser.Id);
            if (!checkUserName.Success)
                return Ok(new { Success = false, checkUserName.Message });

            if (!string.Equals(existingUser!.Email, user.Email, StringComparison.OrdinalIgnoreCase))
            {
                var recommendations = await _context.Recommendations
                                                    .Where(r => r.UserEmail!.ToLower().Trim() == existingUser.Email.ToLower().Trim())
                                                    .ToListAsync();

                foreach (var rec in recommendations)
                    rec.UserEmail = user.Email;

                existingUser.Email = user.Email;
            }

            var recommendation = await _context.Recommendations
                                               .Where(r => r.UserEmail!.ToLower().Trim() == existingUserEmailForRecommendations.ToLower().Trim())
                                               .ToListAsync();

            foreach (var rec in recommendation)
                rec.UserFullName = $"{user.FirstName} {user.LastName}";

            if (!string.Equals(existingUser.UserName, user.UserName, StringComparison.Ordinal))
            {
                var logs = await _context.AccountBalanceChangeLogs
                                         .Where(l => l.UserName!.ToLower().Trim() == existingUser.UserName.ToLower().Trim())
                                         .ToListAsync();

                foreach (var log in logs)
                    log.UserName = user.UserName!;

                existingUser.UserName = user.UserName;
            }

            existingUser.FirstName = user.FirstName;
            existingUser.LastName = user.LastName;

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Profile details updated successfully." });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(string id)
        {
            var user = await _context.Users.FirstOrDefaultAsync(x => x.Id == id);

            if (user == null)
                return NotFound(new { Success = false, Message = "User not found." });

            var email = user.Email?.Trim().ToLower();

            var campaigns = await _context.Campaigns.Where(x => x.UserId == id).ToListAsync();
            var campaignIds = campaigns.Select(x => x.Id).ToList();

            var pendingGrants = await _context.PendingGrants.Where(x => campaignIds.Contains(x.CampaignId)).ToListAsync();
            var pendingGrantIds = pendingGrants.Select(x => x.Id).ToList();

            var assets = await _context.AssetBasedPaymentRequest.Where(x => campaignIds.Contains(x.CampaignId)).ToListAsync();
            var assetIds = assets.Select(x => x.Id).ToList();

            var disbursals = await _context.DisbursalRequest.Where(x => campaignIds.Contains(x.CampaignId)).ToListAsync();
            var disbursalIds = disbursals.Select(x => x.Id).ToList();

            var completed = await _context.CompletedInvestmentsDetails.Where(x => campaignIds.Contains(x.CampaignId)).ToListAsync();
            var completedIds = completed.Select(x => x.Id).ToList();

            var returnMasters = await _context.ReturnMasters.Where(x => campaignIds.Contains(x.CampaignId)).ToListAsync();
            var returnMasterIds = returnMasters.Select(x => x.Id).ToList();

            _context.AccountBalanceChangeLogs.RemoveRange(
                _context.AccountBalanceChangeLogs.Where(x =>
                    x.UserId == id ||
                    campaignIds.Contains(x.CampaignId!) ||
                    assetIds.Contains(x.AssetBasedPaymentRequestId!.Value) ||
                    pendingGrantIds.Contains(x.PendingGrantsId!.Value)));

            _context.ScheduledEmailLogs.RemoveRange(_context.ScheduledEmailLogs.Where(x => pendingGrantIds.Contains(x.PendingGrantId)));

            _context.Recommendations.RemoveRange(
                _context.Recommendations.Where(x =>
                    x.UserId == id ||
                    (x.PendingGrantsId != null && pendingGrantIds.Contains(x.PendingGrantsId.Value)) ||
                    (x.CampaignId != null && campaignIds.Contains(x.CampaignId))
                )
            );

            _context.ReturnDetails.RemoveRange(_context.ReturnDetails.Where(x => returnMasterIds.Contains(x.ReturnMasterId)));

            _context.PendingGrants.RemoveRange(pendingGrants);
            _context.AssetBasedPaymentRequest.RemoveRange(assets);
            _context.DisbursalRequest.RemoveRange(disbursals);
            _context.CompletedInvestmentsDetails.RemoveRange(completed);
            _context.ReturnMasters.RemoveRange(returnMasters);

            _context.ACHPaymentRequests.RemoveRange(_context.ACHPaymentRequests.Where(x => campaignIds.Contains(x.CampaignId)));
            _context.InvestmentTagMapping.RemoveRange(_context.InvestmentTagMapping.Where(x => campaignIds.Contains(x.CampaignId)));
            _context.UserInvestments.RemoveRange(_context.UserInvestments.Where(x => campaignIds.Contains(x.CampaignId)));

            var groups = await _context.Groups.Where(x => x.Owner!.Id == id).ToListAsync();
            var groupIds = groups.Select(x => x.Id).ToList();

            _context.Requests.RemoveRange(_context.Requests.Where(x => groupIds.Contains(x.GroupToFollow!.Id)));
            _context.GroupAccountBalance.RemoveRange(_context.GroupAccountBalance.Where(x => groupIds.Contains(x.Group!.Id)));
            _context.LeaderGroup.RemoveRange(_context.LeaderGroup.Where(x => groupIds.Contains(x.GroupId)));

            _context.Groups.RemoveRange(groups);

            _context.UserInvestments.RemoveRange(_context.UserInvestments.Where(x => x.UserId == id));
            _context.UsersNotifications.RemoveRange(_context.UsersNotifications.Where(x => x.TargetUser!.Id == id));
            _context.InvestmentRequest.RemoveRange(_context.InvestmentRequest.Where(x => x.UserId == id));
            _context.InvestmentFeedback.RemoveRange(_context.InvestmentFeedback.Where(x => x.UserId == id));
            _context.FormSubmission.RemoveRange(_context.FormSubmission.Where(x => x.Email!.ToLower().Trim() == email));
            _context.Event.RemoveRange(_context.Event.Where(x => x.CreatedBy == id || x.ModifiedBy == id));
            _context.ScheduledEmailLogs.RemoveRange(_context.ScheduledEmailLogs.Where(x => x.UserId == id));

            _context.PendingGrants.RemoveRange(_context.PendingGrants.Where(x => x.UserId == id));
            _context.DisbursalRequest.RemoveRange(_context.DisbursalRequest.Where(x => x.UserId == id));
            _context.AssetBasedPaymentRequest.RemoveRange(_context.AssetBasedPaymentRequest.Where(x => x.UserId == id));

            _context.ReturnMasters.RemoveRange(_context.ReturnMasters.Where(x => x.CreatedBy == id));
            _context.ReturnDetails.RemoveRange(_context.ReturnDetails.Where(x => x.UserId == id));

            _context.ModuleAccessPermission.RemoveRange(_context.ModuleAccessPermission.Where(x => x.UpdatedBy == id));

            var roleIds = _context.UserRoles.Where(x => x.UserId == id).Select(x => x.RoleId);
            _context.ModuleAccessPermission.RemoveRange(_context.ModuleAccessPermission.Where(x => roleIds.Contains(x.RoleId)));
            _context.CataCapTeam.RemoveRange(_context.CataCapTeam.Where(x => x.CreatedBy == id || x.ModifiedBy == id));
            _context.Testimonial.RemoveRange(_context.Testimonial.Where(x => x.UserId == id));

            //_context.UserRoles.RemoveRange(_context.UserRoles.Where(x => x.UserId == id));

            _context.Users.Remove(user);

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "User deleted successfully." });
            }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<string> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var users = await _context.Users
                                      .IgnoreQueryFilters()
                                      .Where(x => ids.Contains(x.Id))
                                      .ToListAsync();

            if (!users.Any())
                return NotFound(new { Success = false, Message = "User not found." });

            var deletedUsers = users.Where(x => x.IsDeleted).ToList();

            if (!deletedUsers.Any())
                return Ok(new { Success = false, Message = "No deleted users found." });

            var userIds = deletedUsers.Select(x => x.Id).ToList();
            var emails = deletedUsers.Select(x => x.Email!.Trim().ToLower()).ToList();

            var campaigns = await _context.Campaigns
                .IgnoreQueryFilters()
                .Where(x => x.UserId != null && userIds.Contains(x.UserId) && x.IsDeleted)
                .ToListAsync();

            var campaignIds = campaigns.Select(x => x.Id).ToList();

            var pendingGrants = await _context.PendingGrants
                .IgnoreQueryFilters()
                .Where(x => (
                                campaignIds.Contains(x.CampaignId) ||
                                userIds.Contains(x.UserId)
                            ) && x.IsDeleted)
                .ToListAsync();

            var pendingGrantIds = pendingGrants.Select(x => x.Id).ToList();

            var assets = await _context.AssetBasedPaymentRequest
                .IgnoreQueryFilters()
                .Where(x => (
                                campaignIds.Contains(x.CampaignId) ||
                                userIds.Contains(x.UserId)
                            ) && x.IsDeleted)
                .ToListAsync();

            var assetIds = assets.Select(x => x.Id).ToList();

            var disbursals = await _context.DisbursalRequest
                .IgnoreQueryFilters()
                .Where(x => (
                                campaignIds.Contains(x.CampaignId) ||
                                userIds.Contains(x.UserId)
                            ) && x.IsDeleted)
                .ToListAsync();

            var completed = await _context.CompletedInvestmentsDetails
                .IgnoreQueryFilters()
                .Where(x => campaignIds.Contains(x.CampaignId) && x.IsDeleted)
                .ToListAsync();

            var returnMasters = await _context.ReturnMasters
                .IgnoreQueryFilters()
                .Where(x => campaignIds.Contains(x.CampaignId))
                .ToListAsync();

            var returnMasterIds = returnMasters.Select(x => x.Id).ToList();

            var returnDetails = await _context.ReturnDetails
                .IgnoreQueryFilters()
                .Where(x => returnMasterIds.Contains(x.ReturnMasterId) && x.IsDeleted)
                .ToListAsync();

            var accountLogs = await _context.AccountBalanceChangeLogs
                .IgnoreQueryFilters()
                .Where(x =>
                    userIds.Contains(x.UserId) ||
                    (x.CampaignId != null && campaignIds.Contains(x.CampaignId.Value)) ||
                    (x.AssetBasedPaymentRequestId != null && assetIds.Contains(x.AssetBasedPaymentRequestId.Value)) ||
                    (x.PendingGrantsId != null && pendingGrantIds.Contains(x.PendingGrantsId.Value)))
                .Where(x => x.IsDeleted)
                .ToListAsync();

            var groups = await _context.Groups
                .IgnoreQueryFilters()
                .Where(x => x.Owner != null && userIds.Contains(x.Owner.Id) && x.IsDeleted)
                .ToListAsync();

            var groupIds = groups.Select(x => x.Id).ToList();

            var requests = await _context.Requests
                .IgnoreQueryFilters()
                .Where(x => x.GroupToFollow != null && groupIds.Contains(x.GroupToFollow.Id) && x.IsDeleted)
                .ToListAsync();

            var balances = await _context.GroupAccountBalance
                .IgnoreQueryFilters()
                .Where(x => x.Group != null && groupIds.Contains(x.Group.Id) && x.IsDeleted)
                .ToListAsync();

            var leaderGroups = await _context.LeaderGroup
                .IgnoreQueryFilters()
                .Where(x => groupIds.Contains(x.GroupId) && x.IsDeleted)
                .ToListAsync();

            var recommendations = await _context.Recommendations.IgnoreQueryFilters().Where(x => x.UserId != null && userIds.Contains(x.UserId) && x.IsDeleted).ToListAsync();
            var userInvestments = await _context.UserInvestments.IgnoreQueryFilters().Where(x => x.UserId != null && userIds.Contains(x.UserId) && x.IsDeleted).ToListAsync();
            var notifications = await _context.UsersNotifications.IgnoreQueryFilters().Where(x => x.TargetUser != null && userIds.Contains(x.TargetUser.Id) && x.IsDeleted).ToListAsync();
            var forms = await _context.FormSubmission.IgnoreQueryFilters().Where(x => x.Email != null && emails.Contains(x.Email.ToLower().Trim()) && x.IsDeleted).ToListAsync();
            var testimonials = await _context.Testimonial.IgnoreQueryFilters().Where(x => x.UserId != null && userIds.Contains(x.UserId) && x.IsDeleted).ToListAsync();

            deletedUsers.RestoreRange();
            campaigns.RestoreRange();
            pendingGrants.RestoreRange();
            assets.RestoreRange();
            disbursals.RestoreRange();
            completed.RestoreRange();
            returnDetails.RestoreRange();
            accountLogs.RestoreRange();
            groups.RestoreRange();
            requests.RestoreRange();
            balances.RestoreRange();
            leaderGroups.RestoreRange();
            recommendations.RestoreRange();
            userInvestments.RestoreRange();
            notifications.RestoreRange();
            forms.RestoreRange();
            testimonials.RestoreRange();

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = $"{deletedUsers.Count} user(s) restored successfully." });
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
    }
}
