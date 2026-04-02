// Ignore Spelling: Groupsfor

using AutoMapper;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Specialized;
using ClosedXML.Excel;
using Humanizer;
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
using System.Collections.Immutable;
using System.ComponentModel;
using System.Data;
using System.Security.Claims;
using System.Text.Json;

namespace Invest.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class GroupController : ControllerBase
    {
        private readonly RepositoryContext _context;
        protected readonly IRepositoryManager _repository;
        private readonly IMapper _mapper;
        private readonly IMailService _mailService;
        private readonly BlobContainerClient _blobContainerClient;
        private readonly IHttpContextAccessor _httpContextAccessors;
        private readonly EmailQueue _emailQueue;
        private readonly AppSecrets _appSecrets;

        public GroupController(RepositoryContext context,
            IRepositoryManager repository,
            IMapper mapper,
            IMailService mailService,
            BlobContainerClient blobContainerClient,
            IHttpContextAccessor httpContextAccessors,
            EmailQueue emailQueue,
            AppSecrets appSecrets)
        {
            _context = context;
            _repository = repository;
            _mapper = mapper;
            _mailService = mailService;
            _blobContainerClient = blobContainerClient;
            _httpContextAccessors = httpContextAccessors;
            _emailQueue = emailQueue;
            _appSecrets = appSecrets;
        }

        [HttpGet]
        public async Task<ActionResult<List<GroupDto>>> GetAllGroups()
        {
            var groups = await _context.Groups.ToListAsync();
            if (groups == null || groups.Count < 1)
            {
                return Ok(new List<GroupDto>());
            }

            var data = _mapper.Map<List<Group>, List<GroupDto>>(groups);

            for (int i = 0; i < data.Count; i++)
            {
                var campaigns = groups[i].Campaigns ?? new List<CampaignDto>();
                var privateCampaigns = groups[i].PrivateCampaigns ?? new List<CampaignDto>();

                data[i].Campaigns = _mapper.Map<List<CampaignDto>, List<Campaign>>(campaigns);
                data[i].PrivateCampaigns = _mapper.Map<List<CampaignCardDto>>(privateCampaigns);
            }

            return Ok(data);
        }

        [HttpGet("cards")]
        public async Task<IActionResult> GetGroupCards([FromQuery] GroupRequestDto dto)
        {
            int page = dto.CurrentPage ?? 1;
            int perPage = dto.PerPage ?? 10;

            var query = _context.Groups
                                .Include(g => g.Campaigns)
                                .Include(g => g.PrivateCampaigns)
                                .Where(x => !x.IsPrivateGroup && !x.IsDeactivated);

            var groups = await query.ToListAsync();

            if (!string.IsNullOrWhiteSpace(dto.SearchValue))
                groups = groups.Where(g => g.Name!.ToLower().Contains(dto.SearchValue.ToLower())).ToList();

            if (!string.IsNullOrWhiteSpace(dto.Themes))
            {
                var requestedThemeIds = ParseCommaSeparatedIds(dto.Themes);

                if (requestedThemeIds.Any())
                {
                    groups = groups.Where(c =>
                        !string.IsNullOrEmpty(c.GroupThemes) &&
                        ParseCommaSeparatedIds(c.GroupThemes)
                            .Any(t => requestedThemeIds.Contains(t))
                    ).ToList();
                }
            }

            var totalCount = groups.Count();

            var result = new List<GroupCardDto>();

            foreach (var group in groups)
            {
                var campaigns = group.Campaigns ?? new List<CampaignDto>();

                var activeCampaigns = campaigns.ToList();
                var completedCampaigns = campaigns.ToList();

                if (group.PrivateCampaigns != null)
                {
                    activeCampaigns.AddRange(group.PrivateCampaigns);
                    completedCampaigns.AddRange(group.PrivateCampaigns);

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

                var campaignIds = allCampaigns.Select(c => c.Id).ToList();

                var totalRaised = await _context.Recommendations
                                                .Where(r =>
                                                    r.Campaign != null &&
                                                    campaignIds.Contains(r.Campaign.Id) &&
                                                    (r.Status!.ToLower() == "approved" || r.Status.ToLower() == "pending") &&
                                                    r.Amount > 0 &&
                                                    !string.IsNullOrWhiteSpace(r.UserEmail))
                                                .SumAsync(r => (decimal?)r.Amount) ?? 0;

                var members = await _context.Requests
                                            .Where(r => r.GroupToFollow!.Id == group.Id && r.Status == "accepted")
                                            .CountAsync();

                result.Add(new GroupCardDto
                {
                    Id = group.Id,
                    Identifier = group.Identifier,
                    Name = group.Name,
                    Description = group.Description,
                    PictureFileName = group.PictureFileName,
                    BackgroundPictureFileName = group.BackgroundPictureFileName,
                    FeaturedGroup = group.FeaturedGroup,
                    Members = members,
                    Themes = group.GroupThemes,
                    Investments = investmentCount,
                    Raised = totalRaised,
                    MetaTitle = group.MetaTitle,
                    MetaDescription = group.MetaDescription
                });
            }

            result = result
                    .OrderByDescending(x => x.Raised)
                    .ThenByDescending(x => x.Members)
                    .Skip((page - 1) * perPage)
                    .Take(perPage)
                    .ToList();


            return Ok(new { totalCount, items = result });
        }

        [HttpGet("group-investments")]
        public async Task<IActionResult> GetInvestments([FromQuery] int groupId)
        {
            var group = await _context.Groups
                                        .Include(g => g.Campaigns)
                                        .FirstOrDefaultAsync(g => g.Id == groupId);

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
                groupCampaigns = groupCampaigns.Select(c => new {
                    c.Id,
                    c.Name,
                    c.ImageFileName,
                    Stage = (c.Stage?.GetType()
                            .GetField(c.Stage?.ToString()!)
                            ?.GetCustomAttributes(typeof(DescriptionAttribute), false)
                            ?.FirstOrDefault() as DescriptionAttribute)?.Description
                            ?? c.Stage.ToString()
                }).ToList(),
                publicCampaigns = publicCampaigns.Except(groupCampaigns).Select(c => new {
                    c.Id,
                    c.Name,
                    c.ImageFileName,
                    Stage = (c.Stage?.GetType()
                            .GetField(c.Stage?.ToString()!)
                            ?.GetCustomAttributes(typeof(DescriptionAttribute), false)
                            ?.FirstOrDefault() as DescriptionAttribute)?.Description
                            ?? c.Stage.ToString()
                }).ToList(),
                completedCampaigns = isAdmin ? completedCampaigns.Except(groupCampaigns).Select(c => new {
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

        [HttpPut("update-group-investments")]
        public async Task<IActionResult> UpdateGroupInvestments([FromBody] List<int?> campaignIds, [FromQuery] int groupId)
        {
            var group = await _context.Groups
                                        .Include(g => g.Campaigns)
                                        .SingleOrDefaultAsync(g => g.Id == groupId);

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
                    await SendGroupNotificationsAsync(group, addedIds, deletedIds);

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

                    // _ = SendGroupEmailsAsync(group, campaign, usersToEmail);
                }
            }
                
            return Ok();
        }

        [HttpPost("get")]
        public async Task<ActionResult<IEnumerable<GroupDto>>> GetAllGroupsforUser([FromBody] TokenDto tokenData)
        {
            var user = await _repository.UserAuthentication.GetUser(tokenData.Token);
            var groups = await _context.Groups.Include(i => i.Owner).Include(i => i.Campaigns).Include(i => i.PrivateCampaigns).Where(g => g.Owner != null && g.Owner.Id == user.Id).ToListAsync();
            var data = _mapper.Map<List<Group>, List<GroupDto>>(groups);

            for (int i = 0; i < data.Count; i++)
            {
                var campaigns = groups[i].Campaigns ?? new List<CampaignDto>();
                var privateCampaigns = groups[i].PrivateCampaigns ?? new List<CampaignDto>();

                data[i].Campaigns = _mapper.Map<List<CampaignDto>, List<Campaign>>(campaigns);
                data[i].PrivateCampaigns = _mapper.Map<List<CampaignCardDto>>(privateCampaigns);

                data[i].GroupThemes = groups[i].GroupThemes;
            }

            foreach (var group in data)
            {
                group.Token = tokenData.Token;
            }

            return data != null ? Ok(data) : BadRequest();
        }

        //[HttpDelete("{id}")]
        //public async Task<IActionResult> DeleteGroup(int id)
        //{
        //    string userId = string.Empty;
        //    var identity = HttpContext.User.Identity as ClaimsIdentity;
        //    if (identity != null)
        //    {
        //        userId = identity.Claims.FirstOrDefault(i => i.Type == "id")?.Value!;
        //    }
        //    var user = await _context.Users.FirstOrDefaultAsync(i => i.Id == userId);

        //    var group = await _context.Groups
        //                              .Where(g => g.Owner != null && g.Owner.Id == user!.Id && g.Id == id)
        //                              .FirstOrDefaultAsync();

        //    if (group == null)
        //    {
        //        return NotFound();
        //    }

        //    var requests = await _context.Requests
        //                                .Where(item => item.GroupToFollow != null && item.GroupToFollow.Id == group.Id)
        //                                .ToListAsync();

        //    _context.Groups.Remove(group);
        //    _context.Requests.RemoveRange(requests);
        //    await _context.SaveChangesAsync();

        //    return Ok();
        //}

        [HttpGet("v2/get/{identifier}")]
        public async Task<IActionResult> GetGroup(string identifier)
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
            bool isAdmin = identity?.Claims.Any(c => c.Type == ClaimTypes.Role && c.Value == "Admin") == true;

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

            var activeAvatarLookup = await GetCampaignAvatarsAsync(activeCampaignIds);
            var completedAvatarLookup = await GetCampaignAvatarsAsync(completedCampaignIds);

            data.ActiveCampaigns = ProcessCampaignsAsync(activeCampaigns, activeAvatarLookup);
            data.CompletedCampaigns = ProcessCampaignsAsync(completedCampaigns, completedAvatarLookup);

            data.PrivateCampaigns = _mapper.Map<List<CampaignCardDto>>(group.PrivateCampaigns ?? new List<CampaignDto>());

            (data.Themes, data.SDGs) = ExtractThemesAndSdgs(activeCampaigns);

            data.GroupThemes = group.GroupThemes;

            data.IsFollowing = request != null;
            data.IsFollowPending = request != null ? request?.Status?.ToLower().Trim() == "pending" : false;
            data.IsOwner = isOwner;
            data.IsLeader = user != null ? group.LeadersGroup!.Any(l => l.UserId == user!.Id) : false;

            data.MetaTitle = group.MetaTitle;
            data.MetaDescription = group.MetaDescription;

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

            var totalUsersAccountBalance = await (
                                                    from u in _context.Users
                                                    where _context.UserRoles
                                                        .Join(_context.Roles,
                                                            ur => ur.RoleId,
                                                            r => r.Id,
                                                            (ur, r) => new { ur, r })
                                                        .Any(x => x.ur.UserId == u.Id && x.r.Name == UserRoles.User)
                                                    select u.AccountBalance
                                                ).SumAsync();

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

        [HttpGet("featured")]
        public async Task<IActionResult> GetFeaturedGroups()
        {
            var groups = await _context.Groups
                                       .Where(x => x.FeaturedGroup == true && x.IsDeactivated == false)
                                       .Include(x => x.Requests)
                                       .OrderByDescending(x => x.CreatedAt)
                                       .Select(x => new FeaturedGroupDto
                                       {
                                           Id = x.Id,
                                           Identifier = x.Identifier,
                                           Name = x.Name,
                                           Website = x.Website,
                                           Themes = x.GroupThemes,
                                           Description = x.Description,
                                           OurWhyDescription = x.OurWhyDescription,
                                           PictureFileName = x.PictureFileName,
                                           BackgroundPictureFileName = x.BackgroundPictureFileName,
                                           OriginalBalance = x.OriginalBalance ?? 0m,
                                           Members = x.Requests!.Count(r => r.Status == "accepted"),
                                           MetaTitle = x.MetaTitle,
                                           MetaDescription = x.MetaDescription
                                       })
                                       .ToListAsync();

            return Ok(groups);
        }

        private async Task<List<object>?> ProcessGroupMembers<T>(string? jsonData, string? ownerId = null) where T : IGroupMemberDto
        {
            if (string.IsNullOrWhiteSpace(jsonData))
                return null;

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

        private async Task<Dictionary<int, List<string>>> GetCampaignAvatarsAsync(List<int?> campaignIds)
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

        private List<CampaignCardDtov2> ProcessCampaignsAsync(List<CampaignDto> campaigns, Dictionary<int, List<string>> avatarLookup)
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
                .Where(t => int.TryParse(t, out _))
                .Select(int.Parse)
                .Distinct()
                .ToList();
        }

        [HttpPost("{identifier}")]
        public async Task<ActionResult<GroupDto>> GetGroup(string identifier, TokenDto tokenData)
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
            {
                return NotFound();
            }

            var data = _mapper.Map<Group, GroupDto>(group);

            if (string.IsNullOrEmpty(tokenData.Token))
            {
                if (data.IsApprouveRequired)
                {
                    data.Campaigns = null;
                    data.PrivateCampaigns = null;
                }
                return Ok(data);
            }

            var user = await _repository.UserAuthentication.GetUser(tokenData.Token);
            if (user == null)
            {
                return BadRequest();
            }

            var request = await _context.Requests.FirstOrDefaultAsync(r => r.RequestOwner != null
                                                                            && r.GroupToFollow != null
                                                                            && r.RequestOwner.Id == user.Id
                                                                            && r.GroupToFollow.Id == group.Id
                                                                            && r.Status == "accepted");

            if (request != null || (group.Owner != null && group.Owner.Id == user.Id))
            {
                var campaigns = group.Campaigns ?? new List<CampaignDto>();
                var privateCampaigns = group.PrivateCampaigns ?? new List<CampaignDto>();

                var groupCampaigns = _mapper.Map<List<CampaignDto>, List<Campaign>>(campaigns);
                var groupPrivateCampaigns = _mapper.Map<List<CampaignCardDto>>(privateCampaigns);

                data.Campaigns = groupCampaigns;
                data.PrivateCampaigns = groupPrivateCampaigns;
            }
            else
            {
                data.PrivateCampaigns = new List<CampaignCardDto>();
                data.Campaigns = new List<Campaign>();
                data.IsFollowing = false;
            }

            var followingRequest = await _context.Requests.FirstOrDefaultAsync(r => r.RequestOwner != null
                                                                                    && r.GroupToFollow != null
                                                                                    && r.RequestOwner.Id == user.Id
                                                                                    && r.GroupToFollow.Id == group.Id);

            if (followingRequest != null)
            {
                data.IsFollowing = true;
                if (followingRequest.Status == "pending")
                {
                    data.IsFollowPending = true;
                }
                else
                {
                    data.IsFollowPending = false;
                }
            }
            else
            {
                data.IsFollowing = false;
            }

            if (group.Owner != null)
            {
                data.IsOwner = group.Owner.Id == user.Id;
            }

            data.IsLeader = false;

            if (group.LeadersGroup!.Count > 0)
            {
                foreach (var leadersGroup in group.LeadersGroup)
                {
                    if (leadersGroup.UserId == user.Id)
                    {
                        data.IsLeader = true;
                        break;
                    }
                }
            }

            if (data.OriginalBalance != null)
            {
                var allocatedGroupBalanceTotal = await _context.GroupAccountBalance.Where(x => x.Group.Id == group.Id).SumAsync(x => x.Balance);

                var investedGroupBalanceTotal = await _context.AccountBalanceChangeLogs
                                                .Where(i => i.GroupId == group.Id && i.InvestmentName != null && i.TransactionStatus != "Rejected")
                                                .SumAsync(i => (decimal?)i.OldValue - (decimal?)i.NewValue);

                data.CurrentBalance = data.OriginalBalance - (allocatedGroupBalanceTotal + investedGroupBalanceTotal);
            }

            GroupAccountBalance gab = await _context.GroupAccountBalance.FirstOrDefaultAsync(i => i.Group.Id == group.Id && i.User.Id == user.Id) ?? new GroupAccountBalance();

            data.groupAccountBalance = _mapper.Map<GroupAccountBalance, GroupAccountBalanceDto>(gab);

            data.GroupThemes = group.GroupThemes;
            data.MetaTitle = group.MetaTitle;
            data.MetaDescription = group.MetaDescription;

            return Ok(data);
        }

        [HttpPost]
        public async Task<IActionResult> CreateGroup([FromBody] CreateGroupDto groupData)
        {
            var user = await _repository.UserAuthentication.GetUser(groupData.Token);

            if (user == null)
                return BadRequest();

            if (groupData.Identifier != null && await IsIdentifierExistsAsync(groupData.Identifier, null))
                return BadRequest("Identifier already exists.");

            var group = _mapper.Map<CreateGroupDto, Group>(groupData);
            
            group.Owner = user;
            group.PictureFileName = await SetPictureFileNameAsync(groupData.PictureFileName, null);

            _context.Groups.Add(group);
            await _context.SaveChangesAsync();

            return Ok();
        }

        [HttpPost("v2/create")]
        public async Task<IActionResult> CreateGroupV2([FromBody] CreateGroupDto groupData)
        {
            if (groupData == null)
                return BadRequest(new { Success = false, Message = "Invalid request data." });

            var user = await _repository.UserAuthentication.GetUser(groupData.Token);
            if (user == null)
                return BadRequest(new { Success = false, Message = "Invalid or expired user token." });

            if (groupData.Identifier != null && await IsIdentifierExistsAsync(groupData.Identifier, null))
                return BadRequest(new { Success = false, Message = "Identifier already exists" });

            var group = _mapper.Map<CreateGroupDto, Group>(groupData);
            group.Owner = user;
            group.PictureFileName = await SetPictureFileNameAsync(groupData.PictureFileName, null);
            group.BackgroundPictureFileName = await SetPictureFileNameAsync(groupData.BackgroundPictureFileName, null);
            group.CreatedAt = DateTime.Now;

            _context.Groups.Add(group);
            await _context.SaveChangesAsync();

            var dto = new GroupLeadersAndChampionsDto
            {
                UserId = user.Id,
                RoleAndTitle = null,
                Description = null,
                LinkedInUrl = null
            };
            await SaveLeaders(dto, group, group.Id);

            return Ok(new { Success = true, data = groupData });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateGroup(int id, [FromBody] GroupDto groupData)
        {
            var allEmailTasks = new List<Task>();

            var data = await _context.Groups
                                    .Include(item => item.Owner)
                                    .Include(item => item.Campaigns)
                                    .SingleOrDefaultAsync(item => item.Id == id);

            if (groupData.Identifier != null && await IsIdentifierExistsAsync(groupData.Identifier, id))
            {
                return BadRequest("Identifier already exists.");
            }

            if (data?.PictureFileName != groupData.PictureFileName)
            {
                data!.PictureFileName = await SetPictureFileNameAsync(groupData.PictureFileName, data.PictureFileName);
            }

            data.Name = groupData.Name;
            data.Website = groupData.Website;
            data.Description = groupData.Description;
            data.IsApprouveRequired = groupData.IsApprouveRequired;
            data.IsDeactivated = groupData.IsDeactivated;
            data.Identifier = groupData.Identifier;
            data.IsCorporateGroup = groupData.IsCorporateGroup;
            data.IsPrivateGroup = groupData.IsPrivateGroup;
            data.GroupThemes = groupData.GroupThemes;
            data.MetaTitle = groupData.MetaTitle;
            data.MetaDescription = groupData.MetaDescription;

            var newInvestment = new Campaign();

            bool newInvestmentAdded = groupData.Campaigns?.Count > data.Campaigns?.Count ? true : false;

            if (newInvestmentAdded)
            {
                var oldCampaignsIdList = (data.Campaigns ?? Enumerable.Empty<CampaignDto>()).Select(i => i.Id).ToList();
                newInvestment = (groupData.Campaigns ?? Enumerable.Empty<Campaign>()).Where(i => !oldCampaignsIdList.Contains(i.Id)).FirstOrDefault();
            }

            //create notifications
            var user = await _repository.UserAuthentication.GetUser(groupData.Token);
            if (user != null && user.Id == data?.Owner?.Id)
            {
                List<int?> deletedInvestmentsId;
                List<int?> addedInvestmentsId;
                List<int?> oldInvestmentsId;

                if (data.Campaigns != null && data.Campaigns.Count >= 1)
                    oldInvestmentsId = data.Campaigns.Select(item => item.Id).ToList();
                else
                    oldInvestmentsId = new List<int?>();

                if (groupData.Campaigns != null && groupData.Campaigns.Count >= 1)
                {
                    var newInvetsments = _mapper.Map<List<Campaign>, List<CampaignDto>>(groupData.Campaigns);
                    var newInvestmentsId = newInvetsments.Select(item => item.Id).ToList();

                    deletedInvestmentsId = oldInvestmentsId == null || oldInvestmentsId.Count < 1 ? new List<int?>() : oldInvestmentsId.Except(newInvestmentsId).ToList();
                    addedInvestmentsId = oldInvestmentsId == null || oldInvestmentsId.Count < 1 ? newInvestmentsId : newInvestmentsId.Except(oldInvestmentsId).ToList();
                }
                else
                {
                    deletedInvestmentsId = oldInvestmentsId;
                    addedInvestmentsId = new List<int?>();
                }

                var groupRequests = await _context.Requests.Where(i => i.GroupToFollow != null && i.GroupToFollow.Id == data.Id && i.Status == "accepted").Include(item => item.RequestOwner).ToListAsync();
                foreach (var request in groupRequests)
                {
                    var targetUser = request.RequestOwner;
                    var notifications = new List<UsersNotification>();

                    if (deletedInvestmentsId?.Count > 0)
                    {
                        var deletedInvestments = data?.Campaigns?.Where(item => deletedInvestmentsId.Contains(item.Id));

                        notifications.AddRange(deletedInvestments!.Select(item => new UsersNotification
                        {
                            Title = "Investment Deleted from Group",
                            Description = $"Investment {item.Name} Deleted from Group {groupData?.Name}",
                            isRead = false,
                            PictureFileName = groupData?.PictureFileName,
                            TargetUser = targetUser!,
                            UrlToRedirect = $"/group/{data?.Id}"
                        }));
                    }

                    if (addedInvestmentsId?.Count > 0)
                    {
                        var addedInvestments = groupData?.Campaigns?.Where(item => addedInvestmentsId.Contains(item.Id));

                        notifications.AddRange(addedInvestments!.Select(item => new UsersNotification
                        {
                            Title = "Investment Added to Group",
                            Description = $"Investment {item.Name} Added to Group {groupData?.Name}",
                            isRead = false,
                            PictureFileName = groupData?.PictureFileName,
                            TargetUser = targetUser!,
                            UrlToRedirect = $"/group/{data?.Id}"
                        }));
                    }

                    if (notifications.Count > 0)
                    {
                        await _context.UsersNotifications.AddRangeAsync(notifications);
                    }
                }

                if (groupData?.Campaigns?.Any() == true)
                {
                    var campaignsId = groupData.Campaigns.Select(item => item.Id).ToList();

                    data!.Campaigns = await _context.Campaigns
                                        .Where(c => campaignsId.Contains(c.Id))
                                        .Include(c => c.Groups)
                                        .Include(c => c.Recommendations)
                                        .Include(c => c.GroupForPrivateAccess)
                                        .ToListAsync();
                }
                else
                {
                    data?.Campaigns?.Clear();
                }
                await _context.SaveChangesAsync();

                if (newInvestmentAdded && groupRequests.Count > 0 && newInvestment != null)
                {
                    var userEmails = groupRequests.Select(i => i.RequestOwner?.Email);
                    var usersToSendEmail = await _context.Users
                                                .Where(u => userEmails.Contains(u.Email) 
                                                        && (u.OptOutEmailNotifications == null 
                                                            || !(bool)u.OptOutEmailNotifications))
                                                .ToListAsync();

                    var requestOrigin = HttpContext?.Request.Headers["Origin"].ToString();

                    var formattedAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal(newInvestment?.Target));

                    var commonVariables = new Dictionary<string, string>
                    {
                        { "groupName", groupData?.Name ?? "" },
                        { "investmentName", newInvestment?.Name ?? "" },
                        { "targetAmount", formattedAmount },
                        { "investmentDescription", newInvestment?.Description ?? "" },
                        { "groupPageUrl", $"{_appSecrets.RequestOrigin}/group/{groupData?.Identifier}" },
                        { "unsubscribeUrl", $"{_appSecrets.RequestOrigin}/settings" }
                    };

                    foreach (var userToSendEmail in usersToSendEmail)
                    {
                        var variables = new Dictionary<string, string>(commonVariables)
                        {
                            { "firstName", userToSendEmail.FirstName! }
                        };

                        _emailQueue.QueueEmail(async (sp) =>
                        {
                            var emailService = sp.GetRequiredService<IEmailTemplateService>();

                            await emailService.SendTemplateEmailAsync(
                                EmailTemplateCategory.GroupInvestmentNotification,
                                userToSendEmail.Email,
                                variables
                            );
                        });
                    }

                    //_ = Task.Run(async () => {

                    //    var emailTask = usersToSendEmail.Select(user =>
                    //    {
                    //        string formattedAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal(newInvestment?.Target));
                    //        var subject = $"New Investment Opportunity from {groupData?.Name}: {newInvestment?.Name}";
                    //        string logoUrl = $"{request}/logo-for-email.png";
                    //        string logoHtml = $@"
                    //                            <div style='text-align: center;'>
                    //                                <a href='https://catacap.org' target='_blank'>
                    //                                    <img src='{logoUrl}' alt='CataCap Logo' width='300' height='150' />
                    //                                </a>
                    //                            </div>";

                    //        var body = $@"
                    //                <p><b>Hi {user.FirstName},</b></p>
                    //                <p style='margin-bottom: 0px;'><b>{groupData?.Name}</b> on CataCap just added a new opportunity to its community of impact catalysts:</p>
                    //                <p style='margin-top: 0px;'><b>{newInvestment?.Name}</b> is now live on CataCap and seeking <b>{formattedAmount}</b> to scale its impactful work.</p>
                    //                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>
                    //                <p><div style='font-size: 20px;'><b>🌱 About {newInvestment?.Name}</b></div></p>
                    //                <p>{newInvestment?.Description}</p>
                    //                <p>📈 This is a rare opportunity to invest in a platform that has reached 355M+ readers across 75 countries — and still growing.</p>
                    //                <div style='margin-bottom: 20px; margin-top: 20px;'><hr></div>
                    //                <p style='margin-bottom: 0px;'><b>🔗 Learn more and explore the investment <a href='{request}/group/{groupData?.Identifier}'>Go to group page</a></b></p>
                    //                <p style='margin-top: 0px;'>💬 Know someone who might align with this mission? Feel free to share!</p>
                    //                <p>Thanks for being part of this movement to put capital behind creativity, culture, and impact.</p>
                    //                <p style='margin-bottom: 0px;'><b>Toward solutions,</b></p>
                    //                <p style='margin-bottom: 0px; margin-top: 0px;'>Ken & The CataCap Team</p>
                    //                <p style='margin-top: 0px;'>🌍 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
                    //                <p><a href='{request}/settings' target='_blank'>Unsubscribe</a> from CataCap notifications.</p>
                    //                ";

                    //        return _mailService.SendMailAsync(user.Email, subject, "", body);

                    //    }).ToList();

                    //    allEmailTasks.AddRange(emailTask);
                    //    await Task.WhenAll(allEmailTasks);
                    //});
                }

                return Ok();
            }
            return BadRequest();
        }

        [HttpPut("v2/update/{id}")]
        public async Task<IActionResult> UpdateGroupV2(int id, [FromBody] GroupDto groupData)
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

        private async Task<int> SaveGroupDataAsync(int id, GroupDto dto)
        {
            var group = await _context.Groups
                                      .Include(g => g.Owner)
                                      .Include(g => g.Campaigns)
                                      .SingleOrDefaultAsync(g => g.Id == id);

            if (group == null)
                return 0;

            if (group.PictureFileName != dto.PictureFileName)
                group.PictureFileName = await SetPictureFileNameAsync(dto.PictureFileName, group.PictureFileName);

            if (group.BackgroundPictureFileName != dto.BackgroundPictureFileName)
                group.BackgroundPictureFileName = await SetPictureFileNameAsync(dto.BackgroundPictureFileName, group.BackgroundPictureFileName);

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
            group.MetaDescription = dto.MetaDescription;
            group.MetaTitle = dto.MetaTitle;
            group.ModifiedAt = DateTime.Now;

            return await _context.SaveChangesAsync();
        }

        private async Task SendGroupNotificationsAsync(Group group, List<int?> addedIds, List<int?> deletedIds)
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

        private async Task SendGroupEmailsAsync(Group? group, Campaign? newInvestment, List<User> usersToEmail)
        {
            var requestOrigin = HttpContext?.Request.Headers["Origin"].ToString();
            var formattedAmount = string.Format(System.Globalization.CultureInfo.GetCultureInfo("en-US"), "${0:N2}", Convert.ToDecimal((string?)newInvestment.Target));

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

        private async Task<string> SetPictureFileNameAsync(string pictureFileName, string? pictureOldFileName)
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

        [HttpGet("leaders-and-champions")]
        public async Task<IActionResult> GetLeadersAndChampionsList(string userName, int groupId, string type)
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

            var enrichedTasks = members.Select(async m =>
            {
                var userId = (string)m!.GetType().GetProperty("UserId")!.GetValue(m)!;
                var user = users.FirstOrDefault(u => u.Id == userId);

                var result = m.GetType().GetProperties().ToDictionary(p => JsonNamingPolicy.CamelCase.ConvertName(p.Name), p => p.GetValue(m));
                result["fullName"] = user?.FullName;
                result["pictureFileName"] = user?.PictureFileName;

                if (group != null)
                    result["isOwner"] = group.Owner!.Id == user!.Id ? 1 : 0;

                return result;
            });

            var enriched = await Task.WhenAll(enrichedTasks);

            return Ok(enriched);
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

        [HttpGet("access")]
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

        [HttpGet("get-groups")]
        public async Task<IActionResult> GetAllGroups([FromQuery] PaginationDto dto)
        {
            bool isAsc = dto?.SortDirection?.ToLower() == "asc";
            int page = dto?.CurrentPage ?? 1;
            int pageSize = dto?.PerPage ?? 25;

            var groups = await _context.Groups
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

                int activeInvestmentCount = (g.Campaigns ?? Enumerable.Empty<CampaignDto>())
                                            .Where(c => c.IsActive == true)
                                            .Select(c => c.Id)
                                            .Union((g.PrivateCampaigns ?? Enumerable.Empty<CampaignDto>())
                                                    .Where(c => c.IsActive == true)
                                                    .Select(c => c.Id))
                                            .Count();

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
                    g.GroupThemes,
                    Investment = activeInvestmentCount,
                    g.MetaTitle,
                    g.MetaDescription    
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

        [HttpGet("export-groups")]
        public async Task<IActionResult> ExportGroups()
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

                int activeInvestmentCount = (g.Campaigns ?? Enumerable.Empty<CampaignDto>())
                                            .Where(c => c.IsActive == true)
                                            .Select(c => c.Id)
                                            .Union((g.PrivateCampaigns ?? Enumerable.Empty<CampaignDto>())
                                                    .Where(c => c.IsActive == true)
                                                    .Select(c => c.Id))
                                            .Count();

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
                    Investment = activeInvestmentCount,
                    Themes = string.Join(", ", themeNames),
                    g.MetaTitle,
                    g.MetaDescription
                };
            }).ToList();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "Groups.xlsx";

            var requestOrigin = _httpContextAccessors.HttpContext?.Request.Headers["Origin"].ToString();

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("InvestmentNotes");

                var headers = new[] { "Group Name", "Group URL", "Group Leader(s)", "Member Count", "Investment Count", "Status", "Active", "Corporate Group", "Themes", "Meta Title", "Meta Description" };

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
                    worksheet.Cell(dataRow, col++).Value = dto.IsCorporateGroup ? "True" : "False";
                    worksheet.Cell(dataRow, col++).Value = dto.Themes;
                    worksheet.Cell(dataRow, col++).Value = dto.MetaTitle;
                    worksheet.Cell(dataRow, col++).Value = dto.MetaDescription;
                }

                worksheet.Columns().AdjustToContents();

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    return File(stream.ToArray(), contentType, fileName);
                }
            }
        }
    }
}