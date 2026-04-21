using AutoMapper;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Specialized;
using ClosedXML.Excel;
using Humanizer;
using Invest.Core.Constants;
using Invest.Core.Dtos;
using Invest.Core.Extensions;
using Invest.Core.Models;
using Invest.Core.Settings;
using Invest.Repo.Data;
using Invest.Service.Interfaces;
using Invest.Service.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel;
using System.Security.Claims;
using System.Text.Json;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/group")]
    [ApiController]
    public class GroupsController : ControllerBase
    {
        private readonly RepositoryContext _context;
        protected readonly IRepositoryManager _repository;
        private readonly IHttpContextAccessor _httpContextAccessors;
        private readonly IMapper _mapper;
        private readonly BlobContainerClient _blobContainerClient;
        private readonly IMailService _mailService;
        private readonly RoleManager<ApplicationRole> _roleManager;
        private readonly UserManager<User> _userManager;
        private readonly EmailQueue _emailQueue;
        private readonly ImageService _imageService;
        private readonly AppSecrets _appSecrets;

        public GroupsController(RepositoryContext context, IRepositoryManager repository, IHttpContextAccessor httpContextAccessors, IMapper mapper, BlobContainerClient blobContainerClient, IMailService mailService, RoleManager<ApplicationRole> roleManager, UserManager<User> userManager, EmailQueue emailQueue, ImageService imageService, AppSecrets appSecrets)
        {
            _context = context;
            _repository = repository;
            _httpContextAccessors = httpContextAccessors;
            _mapper = mapper;
            _blobContainerClient = blobContainerClient;
            _mailService = mailService;
            _roleManager = roleManager;
            _userManager = userManager;
            _emailQueue = emailQueue;
            _imageService = imageService;
            _appSecrets = appSecrets;
        }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] PaginationDto dto)
        {
            bool isAsc = dto?.SortDirection?.ToLower() == "asc";
            int page = dto?.CurrentPage ?? 1;
            int pageSize = dto?.PerPage ?? 25;
            bool? isDeleted = dto?.IsDeleted;

            var groups = await _context.Groups
                                        .ApplySoftDeleteFilter(isDeleted)
                                        .Include(g => g.Campaigns)
                                        .Include(g => g.PrivateCampaigns)
                                        .ToListAsync();

            if (!groups.Any())
                return Ok(new { items = new List<object>(), totalCount = 0 });

            int totalCount = groups.Count;

            var allLeaderIds = groups
                                .Where(g => !string.IsNullOrEmpty(g.Leaders))
                                .SelectMany(g => JsonSerializer.Deserialize<List<GroupLeadersDto>>(g.Leaders!)!.Select(l => l.UserId))
                                .Where(id => id != null)
                                .Distinct()
                                .ToList();

            var leaderNameLookup = await _context.Users
                                                 .Where(u => allLeaderIds.Contains(u.Id))
                                                 .ToDictionaryAsync(u => u.Id, u => $"{u.FirstName} {u.LastName}");

            var groupIds = groups.Select(g => g.Id).ToList();

            var memberCounts = await _context.Requests
                                             .Where(r => groupIds.Contains(r.GroupToFollow!.Id) &&
                                                         r.Status == "accepted")
                                             .GroupBy(r => r.GroupToFollow!.Id)
                                             .Select(g => new { GroupId = g.Key, Count = g.Count() })
                                             .ToDictionaryAsync(x => x.GroupId, x => x.Count);

            var result = groups.Select(g =>
            {
                var leaders = string.IsNullOrWhiteSpace(g.Leaders)
                                ? new List<GroupLeadersDto>()
                                : JsonSerializer.Deserialize<List<GroupLeadersDto>>(g.Leaders!) ?? new();

                var leaderNames = leaders
                                    .Where(l => !string.IsNullOrEmpty(l.UserId) && leaderNameLookup.ContainsKey(l.UserId))
                                    .Select(l => leaderNameLookup[l.UserId!])
                                    .ToList();

                int memberCount = memberCounts.TryGetValue(g.Id, out var cnt) ? cnt : 0;

                var campaigns = g.Campaigns ?? new List<CampaignDto>();

                var activeCampaigns = campaigns.ToList();
                var completedCampaigns = campaigns.ToList();

                if (g.PrivateCampaigns != null)
                {
                    activeCampaigns.AddRange(g.PrivateCampaigns);
                    completedCampaigns.AddRange(g.PrivateCampaigns);

                    activeCampaigns = activeCampaigns.DistinctBy(c => c.Id).ToList();
                    completedCampaigns = completedCampaigns.DistinctBy(c => c.Id).ToList();
                }

                activeCampaigns = activeCampaigns
                                  .Where(c => c.IsActive == true)
                                  .ToList();

                completedCampaigns = completedCampaigns
                                    .Where(c =>
                                        c.Stage == InvestmentStage.ClosedInvested ||
                                        c.Stage == InvestmentStage.CompletedOngoing ||
                                        c.Stage == InvestmentStage.CompletedOngoingPrivate)
                                    .ToList();

                var allCampaigns = activeCampaigns
                                    .Concat(completedCampaigns)
                                    .DistinctBy(c => c.Id)
                                    .ToList();

                var investmentCount = allCampaigns.Count;

                return new
                {
                    g.Id,
                    g.Name,
                    g.Identifier,
                    g.IsDeactivated,
                    g.IsCorporateGroup,
                    g.IsPrivateGroup,
                    g.FeaturedGroup,
                    Leader = string.Join(", ", leaderNames),
                    Member = memberCount,
                    g.GroupThemes,
                    Investment = investmentCount,
                    g.MetaTitle,
                    g.MetaDescription,
                    g.DeletedAt,
                    DeletedBy = g.DeletedByUser != null
                                ? $"{g.DeletedByUser.FirstName} {g.DeletedByUser.LastName}"
                                : null
                };
            }).ToList();

            if (!string.IsNullOrWhiteSpace(dto?.SearchValue))
            {
                var searchValue = dto.SearchValue.Trim().ToLower();

                result = result.Where(u => (u.Name ?? "").Trim().ToLower().Contains(searchValue)
                                        || (u.Leader ?? "").Trim().ToLower().Contains(searchValue))
                                .ToList();
            }

            result = dto?.SortField?.ToLower() switch
            {
                "groupname" => isAsc
                                ? result.OrderBy(x => x.Name).ToList()
                                : result.OrderByDescending(x => x.Name).ToList(),

                "membercount" => isAsc
                                    ? result.OrderBy(i => i.Member).ToList()
                                    : result.OrderByDescending(i => i.Member).ToList(),

                "investmentcount" => isAsc
                                        ? result.OrderBy(i => i.Investment).ToList()
                                        : result.OrderByDescending(i => i.Investment).ToList(),

                "status" => isAsc
                                ? result.OrderBy(i => i.IsPrivateGroup).ToList()
                                : result.OrderByDescending(i => i.IsPrivateGroup).ToList(),

                "active" => isAsc
                                ? result.OrderBy(i => i.IsDeactivated).ToList()
                                : result.OrderByDescending(i => i.IsDeactivated).ToList(),

                "featuredgroup" => isAsc
                                    ? result.OrderBy(i => i.FeaturedGroup).ToList()
                                    : result.OrderByDescending(i => i.FeaturedGroup).ToList(),

                "corporategroup" => isAsc
                                        ? result.OrderByDescending(i => i.IsCorporateGroup).ToList()
                                        : result.OrderBy(i => i.IsCorporateGroup).ToList(),

                _ => result.OrderBy(x => x.Name).ToList()
            };

            var items = result
                        .Skip((page - 1) * pageSize)
                        .Take(pageSize)
                        .ToList();

            if (groups.Any())
                return Ok(new { items, totalCount });

            return NotFound();
        }

        [HttpGet("{id}/members")]
        public async Task<ActionResult<IEnumerable<FollowingRequestDto>>> GetMembersByGroup(int id, string? status)
        {
            var requests = await _context.Requests
                                         .Include(i => i.RequestOwner)
                                         .Include(i => i.GroupToFollow)
                                         .Where(item => item.GroupToFollow != null
                                                 && item.GroupToFollow.Id == id
                                                 && (string.IsNullOrEmpty(status) || item.Status == status))
                                         .ToListAsync();

            var data = _mapper.Map<List<FollowingRequest>, List<FollowingRequestDto>>(requests);

            return data != null ? Ok(data) : BadRequest();
        }

        [HttpGet("{identifier}")]
        public async Task<IActionResult> GetByIdentifier(string identifier)
        {
            bool isGroupId = int.TryParse(identifier, out int groupId);

            var query = _context.Groups
                                .Include(g => g.Owner)
                                .Include(g => g.Campaigns)
                                .Include(g => g.PrivateCampaigns)
                                .Include(g => g.LeadersGroup)
                                .AsQueryable();

            var group = await query.FirstOrDefaultAsync(g => g.Identifier == identifier || (isGroupId && g.Id == groupId));

            if (group == null)
            {
                var slug = await _context.Slug
                                         .Where(x => x.Type == SlugType.Group 
                                                && x.Value == identifier)
                                         .Select(x => x.ReferenceId)
                                         .FirstOrDefaultAsync();

                if (slug != 0)
                    group = await query.FirstOrDefaultAsync(g => g.Id == slug);
            }

            if (group == null)
                return NotFound();

            var identity = _httpContextAccessors.HttpContext?.User.Identity as ClaimsIdentity;
            bool isAdmin = identity?.Claims.Any(c => c.Type == ClaimTypes.Role && (c.Value == UserRoles.Admin || c.Value == UserRoles.SuperAdmin)) == true;

            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            User? user;
            if (isAdmin)
                user = group.Owner;
            else
                user = !string.IsNullOrWhiteSpace(loginUserId)
                        ? await _repository.UserAuthentication.GetUserById(loginUserId)
                        : null;

            bool isOwner = user != null ? group.Owner != null && group.Owner.Id == user!.Id : false;

            if (group.IsDeactivated && !isOwner)
                return NotFound();

            var data = _mapper.Map<Group, GroupDto>(group);

            var request = user == null
                                ? null
                                : await _context.Requests.FirstOrDefaultAsync(r => r.RequestOwner != null
                                                                && r.GroupToFollow != null
                                                                && r.RequestOwner.Id == user.Id
                                                                && r.GroupToFollow.Id == group.Id);

            var leadersList = await ProcessGroupMembers<GroupLeadersDto>(group.Leaders, group.Owner?.Id);
            var championsList = await ProcessGroupMembers<GroupChampionsDto>(group.ChampionsAndCatalysts);

            var campaigns = group.Campaigns ?? new List<CampaignDto>();

            data.Campaigns = _mapper.Map<List<CampaignDto>, List<Campaign>>(campaigns);

            var activeCampaigns = campaigns.ToList();
            var completedCampaigns = campaigns.ToList();

            if (!string.IsNullOrWhiteSpace(loginUserId) && group.PrivateCampaigns != null)
            {
                activeCampaigns.AddRange(group.PrivateCampaigns);
                completedCampaigns.AddRange(group.PrivateCampaigns);

                activeCampaigns = activeCampaigns.DistinctBy(c => c.Id).ToList();
                completedCampaigns = completedCampaigns.DistinctBy(c => c.Id).ToList();
            }

            activeCampaigns = activeCampaigns.Where(c => c.IsActive == true).ToList();
            completedCampaigns = completedCampaigns.Where(c => c.Stage == InvestmentStage.ClosedInvested
                                                            || c.Stage == InvestmentStage.CompletedOngoing
                                                            || c.Stage == InvestmentStage.CompletedOngoingPrivate)
                                                    .ToList();

            var activeCampaignIds = activeCampaigns.Select(c => c.Id).ToList();
            var completedCampaignIds = completedCampaigns.Select(c => c.Id).ToList();

            var activeAvatarLookup = await GetCampaignAvatars(activeCampaignIds);
            var completedAvatarLookup = await GetCampaignAvatars(completedCampaignIds);

            data.ActiveCampaigns = ProcessCampaigns(activeCampaigns, activeAvatarLookup);
            data.CompletedCampaigns = ProcessCampaigns(completedCampaigns, completedAvatarLookup);

            data.PrivateCampaigns = _mapper.Map<List<CampaignCardDto>>(group.PrivateCampaigns ?? new List<CampaignDto>());

            (data.Themes, data.SDGs) = ExtractThemesAndSdgs(activeCampaigns);

            data.GroupThemes = group.GroupThemes;
            data.MetaTitle = group.MetaTitle;
            data.MetaDescription = group.MetaDescription;

            data.IsFollowing = request != null;
            data.IsFollowPending = request != null ? request?.Status?.ToLower().Trim() == "pending" : false;
            data.IsOwner = isOwner;
            data.IsLeader = user != null ? group.LeadersGroup!.Any(l => l.UserId == user!.Id) : false;

            if (data.OriginalBalance != null)
            {
                var allocatedGroupBalanceTotal = await _context.GroupAccountBalance
                                                                .Where(x => x.Group.Id == group.Id)
                                                                .SumAsync(x => x.Balance);

                var investedGroupBalanceTotal = await _context.AccountBalanceChangeLogs
                                                                .Where(x => x.GroupId == group.Id
                                                                        && x.InvestmentName != null
                                                                        && x.TransactionStatus != "Rejected")
                                                                .SumAsync(x => (decimal?)x.OldValue - (decimal?)x.NewValue);

                data.CurrentBalance = data.OriginalBalance - (allocatedGroupBalanceTotal + investedGroupBalanceTotal) ?? 0m;
            }

            var userGroupBalance = user != null
                                        ? await _context.GroupAccountBalance
                                                        .FirstOrDefaultAsync(i => i.Group.Id == group.Id && i.User.Id == user.Id)
                                        : null;

            data.groupAccountBalance = _mapper.Map<GroupAccountBalance, GroupAccountBalanceDto>(userGroupBalance ?? new GroupAccountBalance());

            var userRole = await _context.Roles.FirstOrDefaultAsync(i => i.Name == UserRoles.User);
            var users = await _context.UserRoles
                                      .Where(i => userRole != null && i.RoleId == userRole.Id)
                                      .Select(i => i.UserId)
                                      .ToListAsync();

            var totalUsersAccountBalance = await _context.Users
                                                    .Where(i => users.Contains(i.Id))
                                                    .SumAsync(x => x.AccountBalance);

            var recommendations = await _context.Recommendations
                                                .Where(r =>
                                                        r != null &&
                                                        r.Campaign != null &&
                                                        (r.Status!.ToLower() == "approved" || r.Status.ToLower() == "pending") &&
                                                        r.Amount > 0 &&
                                                        !string.IsNullOrWhiteSpace(r.UserEmail))
                                                .ToListAsync();

            var totalInvestors = recommendations?.Select(r => r.UserEmail?.ToLower().Trim()).Distinct().Count() ?? 0;
            var totalInvestmentAmount = recommendations?.Sum(r => r.Amount ?? 0) ?? 0;

            int completedInvestments = await _context.CompletedInvestmentsDetails.CountAsync();

            var response = new GroupDetailsResponseDto
            {
                Group = data,
                Leaders = leadersList,
                Champions = championsList,
                TotalMembers = totalInvestors,
                TotalInvestedByMembers = Math.Round(totalInvestmentAmount + (totalUsersAccountBalance ?? 0), 0),
                CompletedInvestments = completedInvestments
            };

            return Ok(response);
        }

        [HttpPatch("settings")]
        public async Task<IActionResult> UpdateSettings(int id, bool? featuredGroup, bool? isCorporateGroup)
        {
            if (id <= 0)
                return Ok(new { Success = false, Message = "Group id is required." });

            var group = await _context.Groups.FirstOrDefaultAsync(i => i.Id == id);

            if (group == null)
                return Ok(new { Success = false, Message = "Group not found." });

            if (featuredGroup.HasValue)
                group.FeaturedGroup = featuredGroup.Value;

            if (isCorporateGroup.HasValue)
                group.IsCorporateGroup = isCorporateGroup.Value;

            int result = await _context.SaveChangesAsync();

            if (result > 0)
                return Ok();

            return BadRequest();
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] GroupDto groupData)
        {
            var user = await _repository.UserAuthentication.GetUser(groupData.Token);
            if (user == null)
                return BadRequest("Invalid or expired user token.");

            if (groupData.Identifier != null && await IsIdentifierExistsAsync(groupData.Identifier, id))
                return BadRequest("Identifier already exists.");

            var existingGroup = await _context.Groups.FindAsync(id);

            if (!string.IsNullOrWhiteSpace(existingGroup!.Identifier))
            {
                await _context.Slug.AddAsync(new Slug
                {
                    ReferenceId = id,
                    Type = SlugType.Group,
                    Value = existingGroup!.Identifier,
                    CreatedAt = DateTime.Now
                });

                await _context.SaveChangesAsync();
            }

            var result = await SaveGroupDataAsync(id, groupData);

            if (result == 0)
                return BadRequest("Group not found.");

            return Ok();
        }

        [HttpPost("import")]
        public async Task<IActionResult> ImportUsers([FromBody] UsersImportDto usersImport)
        {
            bool userAdded = false;
            var results = new List<object>();
            var random = new Random();

            var groupToFollow = await _context.Groups.FirstOrDefaultAsync(i => i.Id == usersImport.groupId);
            if (groupToFollow == null)
            {
                return BadRequest("Invalid group id");
            }

            foreach (var user in usersImport.users)
            {
                var existingUserName = await _context.Users.Where(x => x.Email == user.Email).Select(x => x.UserName).FirstOrDefaultAsync();
                var existingUser = await _context.Users.FirstOrDefaultAsync(x => x.Email == user.Email && x.UserName == existingUserName);

                if (existingUser != null)
                {
                    bool alreadyFollowing = await _context.Requests.AnyAsync(r => r.RequestOwner != null
                                                                                    && r.GroupToFollow != null
                                                                                    && r.RequestOwner.Id == existingUser.Id
                                                                                    && r.GroupToFollow.Id == groupToFollow.Id);

                    if (alreadyFollowing)
                    {
                        results.Add(new { success = true });
                        continue;
                    }

                    await AddUserToGroup(existingUser, groupToFollow);

                    existingUser.IsActive = true;

                    if (groupToFollow.IsCorporateGroup)
                    {
                        existingUser.IsFreeUser = false;
                    }
                    await _repository.UserAuthentication.UpdateUser(existingUser);

                    userAdded = true;
                    results.Add(new { success = true });
                    continue;
                }

                string userName = user.UserName!;
                bool existsUserName = await _context.Users.AnyAsync(x => x.UserName == userName);
                while (existsUserName)
                {
                    int randomTwoDigit = random.Next(0, 100);
                    string newUserName = $"{userName}{randomTwoDigit}";

                    existsUserName = await _context.Users.AnyAsync(x => x.UserName == newUserName);
                    if (!existsUserName)
                    {
                        userName = newUserName;
                    }
                }

                var registrationDto = new UserRegistrationDto
                {
                    UserName = userName,
                    Password = user.Password,
                    Email = user.Email,
                    FirstName = user.FirstName,
                    LastName = user.LastName,
                    IsAnonymous = user.IsAnonymous
                };
                var registrationResult = await _repository.UserAuthentication.RegisterUserAsync(registrationDto, UserRoles.User);

                if (!registrationResult.Succeeded)
                {
                    results.Add(new { success = false, errors = registrationResult.Errors });
                    continue;
                }

                var createdUser = await _repository.UserAuthentication.GetUserByUserName(userName);
                await AddUserToGroup(createdUser, groupToFollow);

                createdUser.IsActive = true;

                if (groupToFollow.IsCorporateGroup)
                    createdUser.IsFreeUser = false;
                else
                    createdUser.IsFreeUser = true;

                await _repository.UserAuthentication.UpdateUser(createdUser);
                userAdded = true;
                results.Add(new { success = true });
            }

            if (userAdded)
            {
                var requests = await _context.Requests.Include(i => i.RequestOwner).Include(i => i.GroupToFollow).Where(item => item.GroupToFollow != null && item.GroupToFollow.Id == usersImport.groupId).Where(item => item.Status == "accepted").ToListAsync();
                var members = _mapper.Map<List<FollowingRequest>, List<FollowingRequestDto>>(requests);

                return Ok(new { results, members });
            }

            return Ok(new { results });
        }

        [HttpGet("export")]
        public async Task<IActionResult> Export()
        {
            var groups = await _context.Groups
                                        .Include(g => g.Campaigns)
                                        .OrderByDescending(g => g.Id)
                                        .ToListAsync();

            var allLeaderIds = groups
                                .Where(g => !string.IsNullOrEmpty(g.Leaders))
                                .SelectMany(g => JsonSerializer.Deserialize<List<GroupLeadersDto>>(g.Leaders!)!.Select(l => l.UserId))
                                .Where(id => id != null)
                                .Distinct()
                                .ToList();

            var leaderNameLookup = await _context.Users
                                                    .Where(u => allLeaderIds.Contains(u.Id))
                                                    .ToDictionaryAsync(u => u.Id, u => $"{u.FirstName} {u.LastName}");

            var groupIds = groups.Select(g => g.Id).ToList();

            var memberCounts = await _context.Requests
                                                .Where(r => groupIds.Contains(r.GroupToFollow!.Id) &&
                                                            r.Status == "accepted")
                                                .GroupBy(r => r.GroupToFollow!.Id)
                                                .Select(g => new { GroupId = g.Key, Count = g.Count() })
                                                .ToDictionaryAsync(x => x.GroupId, x => x.Count);

            var result = groups.Select(g =>
            {
                var leaders = string.IsNullOrWhiteSpace(g.Leaders)
                                ? new List<GroupLeadersDto>()
                                : JsonSerializer.Deserialize<List<GroupLeadersDto>>(g.Leaders!) ?? new();

                var leaderNames = leaders
                                    .Where(l => !string.IsNullOrEmpty(l.UserId) && leaderNameLookup.ContainsKey(l.UserId))
                                    .Select(l => leaderNameLookup[l.UserId!])
                                    .ToList();

                int memberCount = memberCounts.TryGetValue(g.Id, out var cnt) ? cnt : 0;

                var campaigns = g.Campaigns ?? new List<CampaignDto>();

                var activeCampaigns = campaigns.ToList();
                var completedCampaigns = campaigns.ToList();

                if (g.PrivateCampaigns != null)
                {
                    activeCampaigns.AddRange(g.PrivateCampaigns);
                    completedCampaigns.AddRange(g.PrivateCampaigns);

                    activeCampaigns = activeCampaigns.DistinctBy(c => c.Id).ToList();
                    completedCampaigns = completedCampaigns.DistinctBy(c => c.Id).ToList();
                }

                activeCampaigns = activeCampaigns
                                  .Where(c => c.IsActive == true)
                                  .ToList();

                completedCampaigns = completedCampaigns
                                    .Where(c =>
                                        c.Stage == InvestmentStage.ClosedInvested ||
                                        c.Stage == InvestmentStage.CompletedOngoing ||
                                        c.Stage == InvestmentStage.CompletedOngoingPrivate)
                                    .ToList();

                var allCampaigns = activeCampaigns
                                    .Concat(completedCampaigns)
                                    .DistinctBy(c => c.Id)
                                    .ToList();

                var investmentCount = allCampaigns.Count;

                var themeIds = ParseCommaSeparatedIds(g.GroupThemes);

                var themeNames = _context.Themes.Where(c => themeIds!.Contains(c.Id)).Select(c => c.Name).ToList();

                return new
                {
                    g.Id,
                    g.Name,
                    g.Identifier,
                    g.IsDeactivated,
                    g.IsCorporateGroup,
                    g.IsPrivateGroup,
                    Leader = string.Join(", ", leaderNames),
                    Member = memberCount,
                    Investment = investmentCount,
                    Themes = string.Join(", ", themeNames),
                    g.FeaturedGroup
                };
            }).ToList();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "Groups.xlsx";

            var requestOrigin = _httpContextAccessors.HttpContext?.Request.Headers["Origin"].ToString();

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("InvestmentNotes");

                var headers = new[] { "Group Name", "Group URL", "Group Leader(s)", "Member Count", "Investment Count", "Status", "Active", "Corporate Group" , "Featured Group", "Themes" };

                for (int i = 0; i < headers.Length; i++)
                {
                    worksheet.Cell(1, i + 1).Value = headers[i];
                    worksheet.Cell(1, i + 1).Style.Font.Bold = true;
                }

                for (int index = 0; index < result.Count; index++)
                {
                    var dto = result[index];
                    int dataRow = index + 2;
                    int col = 1;

                    worksheet.Cell(dataRow, col++).Value = dto.Name;

                    var url = !string.IsNullOrWhiteSpace(dto.Identifier)
                                    ? requestOrigin + "/group/" + dto.Identifier
                                    : requestOrigin + "/group/" + dto.Id;

                    worksheet.Cell(dataRow, col++).Value = url;
                    worksheet.Cell(dataRow, col++).Value = dto.Leader ?? "";
                    worksheet.Cell(dataRow, col++).Value = dto.Member;
                    worksheet.Cell(dataRow, col++).Value = dto.Investment;
                    worksheet.Cell(dataRow, col++).Value = dto.IsPrivateGroup ? "Private" : "Public";
                    worksheet.Cell(dataRow, col++).Value = dto.IsDeactivated ? "False" : "True";
                    worksheet.Cell(dataRow, col++).Value = dto.IsCorporateGroup ? "True" : "";
                    worksheet.Cell(dataRow, col++).Value = dto.FeaturedGroup ? "True" : "";
                    worksheet.Cell(dataRow, col++).Value = dto.Themes;
                }

                worksheet.Columns().AdjustToContents();

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    return File(stream.ToArray(), contentType, fileName);
                }
            }
        }

        [HttpGet("{id}/members/export")]
        public async Task<IActionResult> ExportMembers(int id)
        {
            var userData = await _context.Requests.Where(x => x.GroupToFollow != null
                                                                && x.GroupToFollow.Id == id
                                                                && x.Status == "accepted")
                                                    .Select(x => x.RequestOwner)
                                                    .OrderByDescending(x => x!.DateCreated)
                                                    .ToListAsync();

            if (userData == null || userData.Count == 0)
                return Ok(new { Success = false, Message = "This group doesn't have any member yet." });

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "Group_members.xlsx";

            bool isCorporateGroup = await _context.Groups.AnyAsync(x => x.Id == id && x.IsCorporateGroup);

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("Group_members");

                int col = 1;
                worksheet.Cell(1, col++).Value = "First Name";
                worksheet.Cell(1, col++).Value = "Last Name";
                worksheet.Cell(1, col++).Value = "Email";

                if (isCorporateGroup)
                {
                    worksheet.Cell(1, col++).Value = "Group Balance";
                }

                var headerRow = worksheet.Row(1);
                headerRow.Style.Font.Bold = true;
                worksheet.Columns().Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;

                for (int index = 0; index < userData.Count; index++)
                {
                    var dto = userData[index];
                    int row = index + 2;
                    int dataCol = 1;

                    worksheet.Cell(row, dataCol++).Value = dto?.FirstName;
                    worksheet.Cell(row, dataCol++).Value = dto?.LastName;
                    worksheet.Cell(row, dataCol++).Value = dto?.Email;

                    if (isCorporateGroup)
                    {
                        var groupAccountBalance = await _context.GroupAccountBalance
                                                                .Where(gab => gab.Group.Id == id
                                                                        && gab.User.Id == dto!.Id)
                                                                .Select(gab => gab.Balance)
                                                                .FirstOrDefaultAsync();

                        var groupBalanceCell = worksheet.Cell(row, dataCol++);
                        groupBalanceCell.Value = groupAccountBalance;
                        groupBalanceCell.Style.NumberFormat.Format = "$#,##0.00";
                    }
                }

                worksheet.Columns().AdjustToContents();

                foreach (var column in worksheet.Columns())
                {
                    column.Width += 5;
                }

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    var content = stream.ToArray();
                    return File(content, contentType, fileName);
                }
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.Groups.FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null)
                return Ok(new { Success = false, Message = "Group not found." });

            var requests = await _context.Requests
                                         .Where(x => x.GroupToFollow != null 
                                                   && x.GroupToFollow.Id == id)
                                         .ToListAsync();

            var campaigns = await _context.Campaigns
                                          .Where(x => x.GroupForPrivateAccessId == id)
                                          .ToListAsync();

            foreach (var campaign in campaigns)
                campaign.GroupForPrivateAccessId = null;

            var leaderGroups = await _context.LeaderGroup
                                             .Where(x => x.GroupId == id)
                                             .ToListAsync();

            var balances = await _context.GroupAccountBalance
                                         .Where(x => x.Group != null 
                                                && x.Group.Id == id)
                                         .ToListAsync();

            _context.Requests.RemoveRange(requests);
            _context.LeaderGroup.RemoveRange(leaderGroups);
            _context.GroupAccountBalance.RemoveRange(balances);
            _context.Groups.Remove(entity);

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Group deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var groups = await _context.Groups
                                       .IgnoreQueryFilters()
                                       .Where(x => ids.Contains(x.Id))
                                       .ToListAsync();

            if (!groups.Any())
                return Ok(new { Success = false, Message = "Group not found." });

            var deletedGroups = groups.Where(x => x.IsDeleted).ToList();

            if (!deletedGroups.Any())
                return Ok(new { Success = false, Message = "No deleted groups found." });

            var groupIds = deletedGroups.Select(x => x.Id).ToList();

            var requests = await _context.Requests
                                         .IgnoreQueryFilters()
                                         .Where(x => x.GroupToFollow != null &&
                                                     groupIds.Contains(x.GroupToFollow.Id) &&
                                                     x.IsDeleted)
                                         .ToListAsync();

            var leaderGroups = await _context.LeaderGroup
                                             .IgnoreQueryFilters()
                                             .Where(x => groupIds.Contains(x.GroupId) &&
                                                         x.IsDeleted)
                                             .ToListAsync();

            var balances = await _context.GroupAccountBalance
                                         .IgnoreQueryFilters()
                                         .Where(x => x.Group != null &&
                                                     groupIds.Contains(x.Group.Id) &&
                                                     x.IsDeleted)
                                         .ToListAsync();

            deletedGroups.RestoreRange();
            requests.RestoreRange();
            leaderGroups.RestoreRange();
            balances.RestoreRange();

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = $"{deletedGroups.Count} group(s) restored successfully." });
        }

        [HttpDelete("member/{id}")]
        public async Task<IActionResult> RemoveMember(int id)
        {
            await using var transaction = await _context.Database.BeginTransactionAsync();

            var request = await _context.Requests.Include(item => item.RequestOwner)
                                                 .Include(item => item.UserToFollow)
                                                 .Include(item => item.GroupToFollow)
                                                 .SingleOrDefaultAsync(item => item.Id == id);

            var user = request?.RequestOwner;
            var group = request?.GroupToFollow;

            if (request != null)
            {
                _context.Requests.Remove(request);
                await _context.SaveChangesAsync();
            }

            var groupAccountBalance = await _context.GroupAccountBalance
                                                    .FirstOrDefaultAsync(gab => gab.Group.Id == group!.Id
                                                                            && gab.User.Id == user!.Id);

            if (groupAccountBalance != null)
            {
                _context.GroupAccountBalance.Remove(groupAccountBalance);
                await _context.SaveChangesAsync();
            }

            await transaction.CommitAsync();

            return Ok();
        }

        [HttpGet("{identifier}/access")]
        public async Task<IActionResult> VerifyGroupAccess(string identifier)
        {
            bool isGroupId = int.TryParse(identifier, out int groupId);

            var query = _context.Groups
                                .Include(g => g.Owner)
                                .AsQueryable();

            var group = await query.FirstOrDefaultAsync(g => g.Identifier == identifier || (isGroupId && g.Id == groupId));

            if (group == null)
            {
                var slug = await _context.Slug
                                         .Where(x => x.Type == SlugType.Group
                                                && x.Value == identifier)
                                         .Select(x => x.ReferenceId)
                                         .FirstOrDefaultAsync();

                if (slug != 0)
                    group = await query.FirstOrDefaultAsync(g => g.Id == slug);
            }

            if (group == null)
                return Unauthorized();

            var identity = _httpContextAccessors.HttpContext?.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            var user = !string.IsNullOrWhiteSpace(loginUserId)
                                ? await _repository.UserAuthentication.GetUserById(loginUserId)
                                : null;

            bool isAdmin = identity?.Claims.Any(c => c.Type == ClaimTypes.Role && (c.Value == UserRoles.Admin || c.Value == UserRoles.SuperAdmin)) == true;

            var isOwner = user != null ? group.Owner != null && group.Owner.Id == user!.Id : false;

            if (isOwner || isAdmin)
                return Ok();

            return Unauthorized();
        }

        [HttpPut("{id}/assign-group-admin")]
        public async Task<IActionResult> UpdateGroupAdmin(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
                return BadRequest(new { Success = false, Message = "User Id is required" });

            var user = await _context.Users.FirstOrDefaultAsync(i => i.Id == id);

            if (user == null)
                return BadRequest(new { Success = false, Message = "User not found" });

            if (!await _roleManager.RoleExistsAsync(UserRoles.GroupAdmin))
            {
                await _roleManager.CreateAsync(new ApplicationRole
                {
                    Name = UserRoles.GroupAdmin,
                    IsSuperAdmin = false
                });
            }

            string message;
            if (await _userManager.IsInRoleAsync(user, UserRoles.GroupAdmin))
            {
                await _userManager.RemoveFromRoleAsync(user, UserRoles.GroupAdmin);
                message = "Group admin role removed successfully.";
            }
            else
            {
                await _userManager.AddToRoleAsync(user, UserRoles.GroupAdmin);
                message = "Group admin role assigned successfully.";
            }

            return Ok(new { Success = true, Message = message });
        }

        [HttpGet("{id}/investments")]
        public async Task<IActionResult> GetInvestments(int id)
        {
            var group = await _context.Groups
                                        .Include(g => g.Campaigns)
                                        .FirstOrDefaultAsync(g => g.Id == id);

            if (group == null)
                return NotFound();

            var campaigns = await _context.Campaigns
                                            .Where(c => c.IsActive == true && c.GroupForPrivateAccessId == null)
                                            .ToListAsync();

            var publicCampaigns = campaigns.Where(c => c.Stage == InvestmentStage.Public
                                                    || c.Stage == InvestmentStage.CompletedOngoing)
                                            .ToList() ?? new List<CampaignDto>();
            
            var identity = _httpContextAccessors.HttpContext?.User.Identity as ClaimsIdentity;
            bool isAdmin = identity?.Claims.Any(c => c.Type == ClaimTypes.Role && (c.Value == UserRoles.Admin || c.Value == UserRoles.SuperAdmin)) == true;

            var completedCampaigns = isAdmin
                                    ? campaigns.Where(c => c.Stage == InvestmentStage.ClosedInvested).ToList()
                                    : new List<CampaignDto>();

            var groupCampaigns = group.Campaigns ?? new List<CampaignDto>();

            var response = new
            {
                groupCampaigns = groupCampaigns.Select(c => new
                {
                    c.Id,
                    c.Name,
                    c.ImageFileName,
                    Stage = (c.Stage?.GetType()
                            .GetField(c.Stage?.ToString()!)
                            ?.GetCustomAttributes(typeof(DescriptionAttribute), false)
                            ?.FirstOrDefault() as DescriptionAttribute)?.Description
                            ?? c.Stage.ToString()
                }).ToList(),
                publicCampaigns = publicCampaigns.Except(groupCampaigns).Select(c => new
                {
                    c.Id,
                    c.Name,
                    c.ImageFileName,
                    Stage = (c.Stage?.GetType()
                            .GetField(c.Stage?.ToString()!)
                            ?.GetCustomAttributes(typeof(DescriptionAttribute), false)
                            ?.FirstOrDefault() as DescriptionAttribute)?.Description
                            ?? c.Stage.ToString()
                }).ToList(),
                completedCampaigns = isAdmin ? completedCampaigns.Except(groupCampaigns).Select(c => new
                {
                    c.Id,
                    c.Name,
                    c.ImageFileName,
                    Stage = (c.Stage?.GetType()
                            .GetField(c.Stage?.ToString()!)
                            ?.GetCustomAttributes(typeof(DescriptionAttribute), false)
                            ?.FirstOrDefault() as DescriptionAttribute)?.Description
                            ?? c.Stage.ToString()
                }).ToList() : null,
            };

            return Ok(response);
        }

        [HttpPut("{id}/investments")]
        public async Task<IActionResult> SaveInvestments(int id, [FromBody] List<int?> campaignIds)
        {
            var group = await _context.Groups
                                        .Include(g => g.Campaigns)
                                        .SingleOrDefaultAsync(g => g.Id == id);

            if (group == null)
                return NotFound();

            campaignIds ??= new List<int?>();

            var campaigns = await _context.Campaigns
                                            .Where(c => campaignIds.Contains(c.Id))
                                            .Include(c => c.Groups)
                                            .Include(c => c.Recommendations)
                                            .Include(c => c.GroupForPrivateAccess)
                                            .ToListAsync();

            var oldCampaignIds = group.Campaigns?.Select(c => c.Id).ToList() ?? new List<int?>();
            var newCampaignIds = campaigns?.Select(c => c.Id).ToList() ?? new List<int?>();

            var addedIds = newCampaignIds.Except(oldCampaignIds).ToList();
            var deletedIds = oldCampaignIds.Except(newCampaignIds).ToList();

            group.Campaigns!.Clear();

            foreach (var campaign in campaigns!)
                group.Campaigns.Add(campaign);

            await _context.SaveChangesAsync();

            var newlyAddedCampaigns = campaigns.Where(c => addedIds.Contains(c.Id)).ToList() ?? new List<CampaignDto>();
            var newlyAddedCampaignsDto = _mapper.Map<List<Campaign>>(newlyAddedCampaigns);

            foreach (var campaign in newlyAddedCampaignsDto)
            {
                bool isCampaignCompleted = campaign!.Stage == InvestmentStage.ClosedInvested
                                            || campaign.Stage == InvestmentStage.CompletedOngoing == true;

                if (!isCampaignCompleted)
                {
                    await SendGroupNotifications(group, addedIds, deletedIds);

                    var groupRequests = await _context.Requests
                                            .Where(r => r.GroupToFollow!.Id == group.Id && r.Status == "accepted")
                                            .Include(r => r.RequestOwner)
                                            .ToListAsync();

                    var userEmails = groupRequests.Select(r => r.RequestOwner?.Email);
                    var usersToEmail = await _context.Users
                                                        .Where(u => userEmails.Contains(u.Email)
                                                                && (u.OptOutEmailNotifications == null
                                                                || !(bool)u.OptOutEmailNotifications))
                                                        .ToListAsync();

                    var requestOrigin = HttpContext?.Request.Headers["Origin"].ToString();

                    var formattedAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal((campaign?.Target) ?? "0"));

                    var commonVariables = new Dictionary<string, string>
                    {
                        { "logoUrl", await _imageService.GetImageUrl() },
                        { "groupName", group?.Name ?? "" },
                        { "investmentName", campaign?.Name ?? "" },
                        { "targetAmount", formattedAmount },
                        { "investmentDescription", campaign?.Description ?? "" },
                        { "groupPageUrl", $"{_appSecrets.RequestOrigin}/group/{group?.Identifier}" },
                        { "unsubscribeUrl", $"{_appSecrets.RequestOrigin}/settings" }
                    };

                    foreach (var user in usersToEmail)
                    {
                        var variables = new Dictionary<string, string>(commonVariables)
                        {
                            { "firstName", user.FirstName! }
                        };

                        _emailQueue.QueueEmail(async (sp) =>
                        {
                            var emailService = sp.GetRequiredService<IEmailTemplateService>();

                            await emailService.SendTemplateEmailAsync(
                                EmailTemplateCategory.GroupInvestmentNotification,
                                user.Email,
                                variables
                            );
                        });
                    }

                    // _ = SendGroupEmails(group, campaign, usersToEmail);
                }
            }

            return Ok();
        }

        [HttpGet("{id}/users")]
        public async Task<IActionResult> GetUsers(int id, string? searchValue = null, string? sortField = null, string? sortDirection = null)
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

            usersQuery = usersQuery.Where(i => i.Requests != null &&
                                            i.Requests.Any(r =>
                                            r.Status == "accepted" &&
                                            r.GroupToFollow != null &&
                                            r.GroupToFollow.Id == id &&
                                            r.RequestOwner != null &&
                                            r.RequestOwner.Id == i.Id
                                        ));

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

            var users = await usersQuery
                            .Select(u => new
                            {
                                u.Id,
                                FullName = u.FirstName + " " + u.LastName,
                                u.UserName,
                                u.Email,
                                u.DateCreated,

                                GroupAccountBalance = _context.GroupAccountBalance
                                                              .Where(g => g.User.Id == u.Id && g.Group.Id == id)
                                                              .Select(g => new
                                                              {
                                                                  g.Group.Id,
                                                                  g.Balance
                                                              })
                                                              .FirstOrDefault()
                            })
                            .ToListAsync();

            return Ok(users);
        }

        [HttpGet("{id}/transaction-history")]
        public async Task<IActionResult> GetTransactionHistory(int id, string? sortField = null, string? sortDirection = null)
        {
            sortField = sortField?.ToLower();

            var query = _context.AccountBalanceChangeLogs
                                .Where(i => i.GroupId == id)
                                .Select(i => new
                                {
                                    i.Id,
                                    i.UserName,
                                    i.ChangeDate,
                                    i.OldValue,
                                    i.NewValue,
                                    i.InvestmentName
                                })
                                .AsQueryable();

            bool isAsc = sortDirection?.ToLower() == "asc";

            switch (sortField)
            {
                case "changedate":
                    query = isAsc ? query.OrderBy(i => i.ChangeDate) : query.OrderByDescending(i => i.ChangeDate);
                    break;
                case "investmentname":
                    query = isAsc ? query.OrderBy(i => i.InvestmentName) : query.OrderByDescending(i => i.InvestmentName);
                    break;
                default:
                    query = query.OrderByDescending(i => i.ChangeDate);
                    break;
            }

            var result = await query.ToListAsync();

            return Ok(result);
        }

        [HttpPut("{id}/transaction-history")]
        public async Task<IActionResult> UpdateAccountBalance(int id, string email, decimal accountBalance, string comment)
        {
            if (email == null || email == string.Empty)
                return Ok(new { Success = false, Message = "User email required." });

            var group = await _context.Groups.FirstOrDefaultAsync(i => i.Id == id);

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
                                                                        && i.Group.Id == id
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

            var identity = _httpContextAccessors.HttpContext?.User.Identity as ClaimsIdentity;
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
                GroupId = id,
                Fees = 0m,
                GrossAmount = accountBalance,
                NetAmount = accountBalance,
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

        [HttpGet("{id}/transaction-history/export")]
        public async Task<IActionResult> Export(int groupId)
        {
            var items = await _context.AccountBalanceChangeLogs
                                      .Where(i => i.GroupId == groupId)
                                      .OrderByDescending(i => i.Id)
                                      .ToListAsync();

            var data = items.OrderByDescending(d => d.Id).ToList();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "AccountBalanceHistory.xlsx";

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("AccountBalanceHistory");

                var headers = new[]
                {
                    "UserName", "ChangeDate", "InvestmentName", "PaymentType", "OldValue", "NewValue", "ZipCode", "Comment"
                };

                for (int col = 0; col < headers.Length; col++)
                {
                    worksheet.Cell(1, col + 1).Value = headers[col];
                }

                var headerRow = worksheet.Row(1);
                headerRow.Style.Font.Bold = true;
                worksheet.Columns().Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;

                for (int index = 0; index < data.Count; index++)
                {
                    var dto = data[index];
                    int row = index + 2;
                    int col = 1;

                    worksheet.Cell(row, col++).Value = dto.UserName;
                    worksheet.Cell(row, col++).Value = dto.ChangeDate.ToString("MM/dd/yyyy");
                    worksheet.Cell(row, col++).Value = dto.InvestmentName;
                    worksheet.Cell(row, col++).Value = dto.PaymentType;

                    var oldValueCell = worksheet.Cell(row, col++);
                    oldValueCell.Value = dto.OldValue;
                    oldValueCell.Style.NumberFormat.Format = "$#,##0.00";

                    var newValueCell = worksheet.Cell(row, col++);
                    newValueCell.Value = dto.NewValue;
                    newValueCell.Style.NumberFormat.Format = "$#,##0.00";

                    worksheet.Cell(row, col++).Value = dto.ZipCode;
                    worksheet.Cell(row, col++).Value = dto.Comment;
                }

                worksheet.Columns().AdjustToContents();

                foreach (var column in worksheet.Columns())
                {
                    column.Width += 10;
                }

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    var content = stream.ToArray();
                    return File(content, contentType, fileName);
                }
            }
        }

        [HttpGet("leaders-and-champions")]
        public async Task<IActionResult> GetLeadersAndChampions(string userName, int groupId, string type)
        {
            if (string.IsNullOrWhiteSpace(userName))
                return Ok(new { Success = false, Message = "Username required." });

            userName = userName.Trim().ToLower();
            type = type.ToLower().Trim();

            List<dynamic> responseList = new();

            var groupOwnerId = await _context.Groups
                                                .Include(g => g.Owner)
                                                .Where(g => g.Id == groupId)
                                                .Select(g => g.Owner!.Id)
                                                .FirstOrDefaultAsync();

            switch (type)
            {
                case "leaders":

                    var groupAdminRoleId = await _context.Roles
                                                            .Where(r => r.Name == UserRoles.GroupAdmin)
                                                            .Select(r => r.Id)
                                                            .FirstOrDefaultAsync();

                    responseList = await _context.Users
                                                    .Where(u => u.IsActive == true
                                                            && _context.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId == groupAdminRoleId)
                                                            && u.Id != groupOwnerId)
                                                    .Select(u => new
                                                    {
                                                        u.Id,
                                                        FullName = u.FirstName + " " + u.LastName,
                                                        u.PictureFileName
                                                    })
                                                    .Where(u => u.FullName.ToLower().Contains(userName))
                                                    .ToListAsync<dynamic>();
                    break;

                case "champions":

                    responseList = await _context.Groups
                                                    .Where(g => g.Id == groupId)
                                                    .SelectMany(g => g.Requests!)
                                                    .Where(r => r.RequestOwner!.IsActive == true
                                                                && r.RequestOwner.Id != groupOwnerId)
                                                    .Select(r => new
                                                    {
                                                        r.RequestOwner!.Id,
                                                        FullName = r.RequestOwner.FirstName + " " + r.RequestOwner.LastName,
                                                        r.RequestOwner.PictureFileName,
                                                        r.RequestOwner.DateCreated
                                                    })
                                                    .Distinct()
                                                    .Where(c => c.FullName.ToLower().Contains(userName))
                                                    .ToListAsync<dynamic>();
                    break;

                default:
                    return Ok(new { Success = false, Message = "Invalid type specified. Please use 'leaders' or 'champions'." });
            }

            return Ok(responseList);
        }

        [HttpPost("leaders-and-champions")]
        public async Task<IActionResult> SaveLeadersAndChampions([FromBody] GroupLeadersAndChampionsDto dto, int groupId, string type)
        {
            if (dto == null)
                return Ok(new { Success = false, Message = "Invalid request payload." });

            if (string.IsNullOrWhiteSpace(type))
                return Ok(new { Success = false, Message = "Type is required." });

            var group = await _context.Groups
                                        .Include(g => g.Owner)
                                        .FirstOrDefaultAsync(g => g.Id == groupId);
            if (group == null)
                return Ok(new { Success = false, Message = $"Group not found." });

            type = type.Trim().ToLowerInvariant();

            return type switch
            {
                "leaders" => await SaveLeaders(dto, group, groupId),
                "champions" => await SaveChampions(dto, group),
                _ => BadRequest(new { Success = false, Message = "Invalid type." })
            };
        }

        [HttpDelete("leaders-and-champions")]
        public async Task<IActionResult> DeleteLeadersAndChampions(string userId, int groupId, string type)
        {
            if (string.IsNullOrWhiteSpace(userId))
                return Ok(new { Success = false, Message = "User Id is required." });

            if (string.IsNullOrWhiteSpace(type))
                return Ok(new { Success = false, Message = "Type is required." });

            var group = await _context.Groups.FirstOrDefaultAsync(g => g.Id == groupId);
            if (group == null)
                return Ok(new { Success = false, Message = "Group not found." });

            type = type.Trim().ToLowerInvariant();

            return type switch
            {
                "leaders" => await DeleteLeader(userId, group, groupId),
                "champions" => await DeleteChampion(userId, group),
                _ => BadRequest(new { Success = false, Message = "Invalid type." })
            };
        }

        [HttpGet("{groupId}/leaders")]
        public async Task<IActionResult> GetLeaders(int groupId)
        {
            var group = await _context.Groups
                                      .Include(g => g.Owner)
                                      .FirstOrDefaultAsync(g => g.Id == groupId);

            if (group == null)
                return Ok(new { Success = false, Message = "Group not found." });

            var leaders = await ProcessGroupMembers<GroupLeadersDto>(group.Leaders, group.Owner?.Id);

            return Ok(new { Leaders = leaders });
        }

        [HttpGet("{groupId}/champions")]
        public async Task<IActionResult> GetChampions(int groupId)
        {
            var group = await _context.Groups.FirstOrDefaultAsync(g => g.Id == groupId);

            if (group == null)
                return Ok(new { Success = false, Message = "Group not found." });

            var champions = await ProcessGroupMembers<GroupChampionsDto>(group.ChampionsAndCatalysts);

            return Ok(new { Champions = champions });
        }

        private async Task AddUserToGroup(User user, Group group)
        {
            var request = new FollowingRequest
            {
                RequestOwner = user,
                GroupToFollow = group,
                Status = "accepted"
            };
            await _context.Requests.AddAsync(request);

            var groupBalance = new GroupAccountBalance
            {
                User = user,
                Group = group,
                Balance = 0
            };
            await _context.GroupAccountBalance.AddAsync(groupBalance);
            await _context.SaveChangesAsync();
        }

        private async Task SendGroupNotifications(Group group, List<int?> addedIds, List<int?> deletedIds)
        {
            var groupRequests = await _context.Requests
                                              .Where(r => r.GroupToFollow != null
                                                        && r.GroupToFollow.Id == group.Id
                                                        && r.Status == "accepted")
                                              .Include(r => r.RequestOwner)
                                              .ToListAsync();

            foreach (var request in groupRequests)
            {
                var targetUser = request.RequestOwner;
                var notifications = new List<UsersNotification>();

                if (deletedIds.Any())
                {
                    var deleted = group.Campaigns!.Where(c => deletedIds.Contains(c.Id));
                    notifications.AddRange(deleted.Select(item => new UsersNotification
                    {
                        Title = "Investment Deleted from Group",
                        Description = $"Investment {item.Name} was deleted from {group.Name}.",
                        isRead = false,
                        PictureFileName = group.PictureFileName,
                        TargetUser = targetUser!,
                        UrlToRedirect = $"/group/{group.Id}"
                    }));
                }

                if (addedIds.Any())
                {
                    var added = group.Campaigns!.Where(c => addedIds.Contains(c.Id));
                    notifications.AddRange(added.Select(item => new UsersNotification
                    {
                        Title = "Investment Added to Group",
                        Description = $"Investment {item.Name} was added to {group.Name}.",
                        isRead = false,
                        PictureFileName = group.PictureFileName,
                        TargetUser = targetUser!,
                        UrlToRedirect = $"/group/{group.Id}"
                    }));
                }

                if (notifications.Any())
                    await _context.UsersNotifications.AddRangeAsync(notifications);
            }
            await _context.SaveChangesAsync();
        }

        private async Task SendGroupEmails(Group? group, Campaign? newInvestment, List<User> usersToEmail)
        {
            var requestOrigin = HttpContext?.Request.Headers["Origin"].ToString();
            var formattedAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal((newInvestment?.Target) ?? "0"));

            var emailTasks = usersToEmail.Select(user =>
            {
                var subject = $"New Investment Opportunity from {group?.Name}: {newInvestment?.Name}";
                var logoUrl = $"{requestOrigin}/logo-for-email.png";

                var body = $@"
                                <p><b>Hi {user.FirstName},</b></p>
                                <p style='margin-bottom: 0px;'><b>{group?.Name}</b> on CataCap just added a new opportunity to its community of impact catalysts:</p>
                                <p style='margin-top: 0px;'><b>{newInvestment?.Name}</b> is now live on CataCap and seeking <b>{formattedAmount}</b> to scale its impactful work.</p>
                                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>
                                <p><div style='font-size: 20px;'><b>🌱 About {newInvestment?.Name}</b></div></p>
                                <p>{newInvestment?.Description}</p>
                                <p>📈 This is a rare opportunity to invest in a platform that has reached 355M+ readers across 75 countries — and still growing.</p>
                                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>
                                <p style='margin-bottom: 0px;'><b>🔗 Learn more and explore the investment <a href='{requestOrigin}/group/{group?.Identifier}'>Go to group page</a></b></p>
                                <p style='margin-top: 0px;'>💬 Know someone who might align with this mission? Feel free to share!</p>
                                <p>Thanks for being part of this movement to put capital behind creativity, culture, and impact.</p>
                                <p style='margin-bottom: 0px;'><b>Toward solutions,</b></p>
                                <p style='margin-bottom: 0px; margin-top: 0px;'>Ken & The CataCap Team</p>
                                <p style='margin-top: 0px;'>🌍 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
                                <p><a href='{requestOrigin}/settings' target='_blank'>Unsubscribe</a> from CataCap notifications.</p>
                                ";

                return _mailService.SendMailAsync(user.Email, subject, "", body);
            });

            await Task.WhenAll(emailTasks);
        }

        private async Task<int> SaveGroupDataAsync(int id, GroupDto dto)
        {
            var group = await _context.Groups
                                      .Include(g => g.Owner)
                                      .Include(g => g.Campaigns)
                                      .SingleOrDefaultAsync(g => g.Id == id);

            if (group == null)
                return 0;

            if (group.PictureFileName != dto.PictureFileName)
                group.PictureFileName = await SetPictureFileName(dto.PictureFileName, group.PictureFileName);

            if (group.BackgroundPictureFileName != dto.BackgroundPictureFileName)
                group.BackgroundPictureFileName = await SetPictureFileName(dto.BackgroundPictureFileName, group.BackgroundPictureFileName);

            group.Name = dto.Name;
            group.Website = dto.Website;
            group.Description = dto.Description;
            group.OurWhyDescription = dto.OurWhyDescription;
            group.DidYouKnow = dto.DidYouKnow;
            group.VideoLink = dto.VideoLink;
            group.IsApprouveRequired = dto.IsApprouveRequired;
            group.IsDeactivated = dto.IsDeactivated;
            group.Identifier = dto.Identifier;
            group.IsCorporateGroup = dto.IsCorporateGroup;
            group.IsPrivateGroup = dto.IsPrivateGroup;
            group.GroupThemes = dto.GroupThemes;
            group.MetaTitle = dto.MetaTitle;
            group.MetaDescription = dto.MetaDescription;
            group.ModifiedAt = DateTime.Now;

            return await _context.SaveChangesAsync();
        }

        private async Task<string> SetPictureFileName(string pictureFileName, string? pictureOldFileName)
        {
            if (string.IsNullOrEmpty(pictureFileName))
                return string.Empty;

            string imageFileName = Guid.NewGuid().ToString() + ".jpg";
            var imageBlob = _blobContainerClient.GetBlockBlobClient(imageFileName);
            var imagestr = pictureFileName.Substring(pictureFileName.IndexOf(',') + 1);
            var imageBytes = Convert.FromBase64String(imagestr);

            using (var stream = new MemoryStream(imageBytes))
            {
                await imageBlob.UploadAsync(stream);
            }

            //if (!string.IsNullOrEmpty(pictureOldFileName))
            //{
            //    var imageOldBlob = _blobContainerClient.GetBlockBlobClient(pictureOldFileName);
            //    await imageOldBlob.DeleteIfExistsAsync();
            //}

            return imageFileName;
        }

        private async Task<bool> IsIdentifierExistsAsync(string identifier, int? id)
        {
            if (string.IsNullOrWhiteSpace(identifier))
                return false;

            var normalized = identifier.Trim().ToLower();

            var existsInGroup = id.HasValue
                                ? await _context.Groups
                                                .AnyAsync(x =>
                                                    x.Identifier != null &&
                                                    x.Id != id.Value &&
                                                    x.Identifier.ToLower().Trim() == normalized)
                                : await _context.Groups
                                                .AnyAsync(x =>
                                                    x.Identifier != null &&
                                                    x.Identifier.ToLower().Trim() == normalized);

            var existsInSlug = id.HasValue
                                ? await _context.Slug
                                                .AnyAsync(x =>
                                                    x.Type == SlugType.Group &&
                                                    x.ReferenceId != id.Value &&
                                                    x.Value == normalized)
                                : await _context.Slug
                                                .AnyAsync(x =>
                                                    x.Type == SlugType.Group &&
                                                    x.Value == normalized);

            return existsInGroup || existsInSlug;
        }

        private async Task<IActionResult> SaveLeaders(GroupLeadersAndChampionsDto dto, Group group, int groupId)
        {
            var leaders = string.IsNullOrWhiteSpace(group.Leaders)
                                    ? new List<GroupLeadersDto>()
                                    : JsonSerializer.Deserialize<List<GroupLeadersDto>>(group.Leaders)!;

            var leader = leaders.FirstOrDefault(x => x.UserId == dto.UserId);
            if (leader != null)
            {
                leader.RoleAndTitle = dto.RoleAndTitle;
                leader.Description = dto.Description;
                leader.LinkedInUrl = dto.LinkedInUrl;
            }
            else
            {
                leader = new GroupLeadersDto
                {
                    UserId = dto.UserId,
                    RoleAndTitle = dto.RoleAndTitle,
                    Description = dto.Description,
                    LinkedInUrl = dto.LinkedInUrl
                };
                leaders.Add(leader);

                bool exists = await _context.LeaderGroup.AnyAsync(x => x.GroupId == groupId && x.UserId == dto.UserId);
                if (!exists)
                {
                    _context.LeaderGroup.Add(new LeaderGroup { GroupId = groupId, UserId = dto.UserId! });
                }
            }

            group.Leaders = JsonSerializer.Serialize(leaders);
            await _context.SaveChangesAsync();

            return await GetUserInfoForMember(leaders, group);
        }

        private async Task<IActionResult> SaveChampions(GroupLeadersAndChampionsDto dto, Group group)
        {
            var champions = string.IsNullOrWhiteSpace(group.ChampionsAndCatalysts)
                                    ? new List<GroupChampionsDto>()
                                    : JsonSerializer.Deserialize<List<GroupChampionsDto>>(group.ChampionsAndCatalysts)!;

            var champion = champions.FirstOrDefault(x => x.UserId == dto.UserId);
            if (champion != null)
            {
                champion.RoleAndTitle = dto.RoleAndTitle;
                champion.Description = dto.Description;
                champion.MemberSince = dto.MemberSince;
            }
            else
            {
                champion = new GroupChampionsDto
                {
                    UserId = dto.UserId,
                    RoleAndTitle = dto.RoleAndTitle,
                    Description = dto.Description,
                    MemberSince = dto.MemberSince
                };
                champions.Add(champion);
            }

            group.ChampionsAndCatalysts = JsonSerializer.Serialize(champions);
            await _context.SaveChangesAsync();

            return await GetUserInfoForMember(champions);
        }

        private async Task<IActionResult> GetUserInfoForMember<T>(List<T> members, Group? group = null)
        {
            var userIds = members.Select(m => (string)m!.GetType().GetProperty("UserId")!.GetValue(m)!).ToList();

            var users = await _context.Users
                                      .Where(u => userIds.Contains(u.Id))
                                      .Select(u => new { u.Id, FullName = u.FirstName + " " + u.LastName, u.PictureFileName })
                                      .ToListAsync();

            var enrichedTasks = members.Select(m =>
            {
                var userId = (string)m!.GetType().GetProperty("UserId")!.GetValue(m)!;
                var user = users.FirstOrDefault(u => u.Id == userId);

                var result = m.GetType().GetProperties().ToDictionary(p => JsonNamingPolicy.CamelCase.ConvertName(p.Name), p => p.GetValue(m));
                result["fullName"] = user?.FullName;
                result["pictureFileName"] = user?.PictureFileName;

                if (group != null)
                    result["isOwner"] = group.Owner!.Id == user!.Id ? 1 : 0;

                return Task.FromResult(result);
            });

            var enriched = await Task.WhenAll(enrichedTasks);

            return Ok(enriched);
        }

        private async Task<IActionResult> DeleteLeader(string userId, Group group, int groupId)
        {
            var leaders = string.IsNullOrWhiteSpace(group.Leaders)
                                    ? new List<GroupLeadersDto>()
                                    : JsonSerializer.Deserialize<List<GroupLeadersDto>>(group.Leaders)!;

            var leader = leaders.FirstOrDefault(x => x.UserId == userId);
            if (leader != null)
            {
                leaders.Remove(leader);

                var leaderGroup = await _context.LeaderGroup.FirstOrDefaultAsync(x => x.GroupId == groupId
                                                                                    && x.Group.Owner!.Id != userId
                                                                                    && x.UserId == userId);
                if (leaderGroup != null)
                {
                    _context.LeaderGroup.Remove(leaderGroup);
                }

                group.Leaders = JsonSerializer.Serialize(leaders);
                await _context.SaveChangesAsync();
            }

            return await GetUserInfoForMember(leaders);
        }

        private async Task<IActionResult> DeleteChampion(string userId, Group group)
        {
            var champions = string.IsNullOrWhiteSpace(group.ChampionsAndCatalysts)
                                    ? new List<GroupChampionsDto>()
                                    : JsonSerializer.Deserialize<List<GroupChampionsDto>>(group.ChampionsAndCatalysts)!;

            var champion = champions.FirstOrDefault(x => x.UserId == userId);
            if (champion != null)
            {
                champions.Remove(champion);

                group.ChampionsAndCatalysts = JsonSerializer.Serialize(champions);
                await _context.SaveChangesAsync();
            }

            return await GetUserInfoForMember(champions);
        }

        private async Task<List<object>?> ProcessGroupMembers<T>(string? jsonData, string? ownerId = null) where T : IGroupMemberDto
        {
            if (string.IsNullOrWhiteSpace(jsonData))
                return new List<object>();

            var members = JsonSerializer.Deserialize<List<T>>(jsonData)!;
            var userIds = members.Select(m => m.UserId).ToList();

            var users = await _context.Users
                                      .Where(u => userIds.Contains(u.Id))
                                      .Select(u => new
                                      {
                                          u.Id,
                                          FullName = u.FirstName + " " + u.LastName,
                                          u.PictureFileName
                                      })
                                      .ToListAsync();

            return members.Select(m =>
            {
                var user = users.FirstOrDefault(u => u.Id == m.UserId);
                var result = new Dictionary<string, object?>
                {
                    ["userId"] = m.UserId,
                    ["roleAndTitle"] = m.RoleAndTitle,
                    ["description"] = m.Description,
                    ["fullName"] = user?.FullName,
                    ["pictureFileName"] = user?.PictureFileName
                };

                if (m is GroupLeadersDto leader)
                {
                    result["linkedInUrl"] = leader.LinkedInUrl;
                    result["isOwner"] = ownerId != null && m.UserId == ownerId;
                }
                else if (m is GroupChampionsDto champion)
                {
                    result["memberSince"] = champion.MemberSince;
                }

                return (object)result;
            }).ToList();
        }

        private async Task<Dictionary<int, List<string>>> GetCampaignAvatars(List<int?> campaignIds)
        {
            var avatars = await _context.Recommendations
                                    .Where(r =>
                                        campaignIds.Contains(r.CampaignId) &&
                                        (r.Status == "approved" || r.Status == "pending"))
                                    .Join(_context.Users,
                                            r => r.UserEmail,
                                            u => u.Email,
                                            (r, u) => new
                                            {
                                                r.CampaignId,
                                                u.PictureFileName,
                                                u.ConsentToShowAvatar,
                                                r.Id
                                            })
                                    .Where(x => x.PictureFileName != null && x.ConsentToShowAvatar)
                                    .ToListAsync();

            return avatars
                   .GroupBy(x => x.CampaignId!.Value)
                   .ToDictionary(
                       g => g.Key,
                       g => g.OrderByDescending(x => x.Id)
                               .Select(x => x.PictureFileName!)
                               .Distinct()
                               .Take(3)
                               .ToList()
                   );
        }

        private List<CampaignCardDtov2> ProcessCampaigns(List<CampaignDto> campaigns, Dictionary<int, List<string>> avatarLookup)
        {
            var campaignSummary = campaigns.Select(c => new
            {
                Campaign = c,
                Recommendations = _context.Recommendations
                                          .Where(r =>
                                              r.Campaign != null &&
                                              r.Campaign.Id == c.Id &&
                                              (r.Status == "approved" || r.Status == "pending") &&
                                              r.Amount > 0 &&
                                              r.UserEmail != null)
                                          .GroupBy(r => r.Campaign!.Id)
                                          .Select(g => new
                                          {
                                              CurrentBalance = g.Sum(r => r.Amount ?? 0),
                                              NumberOfInvestors = g.Select(r => r.UserEmail!.Trim().ToLower()).Distinct().Count()
                                          })
                                          .FirstOrDefault()
            }).ToList();

            return campaignSummary.Select(item =>
            {
                var dto = _mapper.Map<CampaignCardDtov2>(item.Campaign);
                if (item.Recommendations != null)
                {
                    dto.CurrentBalance = (item.Recommendations.CurrentBalance + item.Campaign.AddedTotalAdminRaised) ?? 0m;
                    dto.NumberOfInvestors = item.Recommendations.NumberOfInvestors;
                }

                dto.LatestInvestorAvatars = avatarLookup.ContainsKey(item.Campaign.Id!.Value)
                                            ? avatarLookup[item.Campaign.Id.Value]!
                                            : new List<string>();

                return dto;
            }).ToList();
        }

        private (string Themes, string SDGs) ExtractThemesAndSdgs(List<CampaignDto> campaigns)
        {
            var themeIds = campaigns.SelectMany(c => ParseCommaSeparatedIds(c.Themes))
                                   .Distinct()
                                   .OrderBy(id => id)
                                   .ToList();

            var sdgIds = campaigns.SelectMany(c => ParseCommaSeparatedIds(c.SDGs))
                                 .Distinct()
                                 .OrderBy(id => id)
                                 .ToList();

            return (string.Join(",", themeIds), string.Join(",", sdgIds));
        }

        private static List<int> ParseCommaSeparatedIds(string? csv)
        {
            if (string.IsNullOrWhiteSpace(csv))
                return new List<int>();

            return csv
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(t => t.Trim())
                .Select(t => int.TryParse(t, out var id) ? id : (int?)null)
                .Where(id => id.HasValue)
                .Select(id => id!.Value)
                .Distinct()
                .ToList();
        }
    }
}
