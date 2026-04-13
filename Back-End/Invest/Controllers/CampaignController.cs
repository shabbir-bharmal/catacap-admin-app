// Ignore Spelling: Admin Pdf Dto Sdg Captcha Accessors

using AutoMapper;
using Azure.Communication.Email;
using Azure.Storage;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Blobs.Specialized;
using Azure.Storage.Sas;
using ClosedXML.Excel;
using Invest.Core.Constants;
using Invest.Core.Dtos;
using Invest.Core.Extensions;
using Invest.Core.Models;
using Invest.Core.Settings;
using Invest.Repo.Data;
using Invest.Service.Interfaces;
using Invest.Service.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namotion.Reflection;
using QRCoder;
using System.ComponentModel;
using System.Data;
using System.Dynamic;
using System.Globalization;
using System.IO.Compression;
using System.Security.Claims;
using System.Text;
using System.Text.Json;

namespace Invest.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class CampaignController : ControllerBase
    {
        private readonly RepositoryContext _context;
        private readonly BlobContainerClient _blobContainerClient;
        private readonly IMapper _mapper;
        private readonly IMailService _mailService;
        private readonly IRepositoryManager _repository;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly AppSecrets _appSecrets;
        private readonly HttpClient _httpClient;
        private readonly EmailQueue _emailQueue;
        private readonly ImageService _imageService;
        private readonly string requestOrigin = string.Empty;

        public CampaignController(RepositoryContext context, BlobContainerClient blobContainerClient, IMapper mapper, IMailService mailService, IRepositoryManager repository, IHttpContextAccessor httpContextAccessors, AppSecrets appSecrets, HttpClient httpClient, EmailQueue emailQueue, ImageService imageService)
        {
            _context = context;
            _mapper = mapper;
            _mailService = mailService;
            _blobContainerClient = blobContainerClient;
            _repository = repository;
            _httpContextAccessor = httpContextAccessors;
            _appSecrets = appSecrets;
            _httpClient = httpClient;
            _emailQueue = emailQueue;
            requestOrigin = httpContextAccessors.HttpContext!.Request.Headers["Origin"].ToString();
            _imageService = imageService;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<CampaignCardDto>>> GetCampaigns()
        {
            var campaigns = await GetCampaignsCardDto();
            if (campaigns != null)
                return Ok(campaigns);
            else
                return NotFound();
        }

        [HttpGet("campaigns")]
        public async Task<ActionResult<IEnumerable<CampaignCardDtov2>>> GetCampaignsV2()
        {
            CampaignCardRequestDto requestDto = new CampaignCardRequestDto();

            CampaignCardResponseDto response = await GetCampaignsCardDtov2(requestDto);

            var campaigns = response.Campaigns;
            if (campaigns != null)
                return Ok(campaigns);
            else
                return NotFound();
        }

        [HttpGet("get/trending/campaigns")]
        public async Task<ActionResult<IEnumerable<CampaignCardDtov2>>> GetTrendingCampaigns()
        {
            var campaigns = await GetTrendingCampaignsCardDto();
            if (campaigns != null)
                return Ok(campaigns);
            else
                return NotFound();
        }

        [HttpGet("withCategories")]
        public async Task<ActionResult<CampaignCardWithCategories>> GetCampaignsWithCategories(string sourcedBy)
        {
            IEnumerable<CampaignCardDto> campaigns = await GetCampaignsCardDto(sourcedBy);

            if (campaigns == null)
                return NotFound();

            campaigns = campaigns.OrderByDescending(x => x.CurrentBalance);

            var categories = await _repository.Category.GetAll(trackChanges: false);
            var categoriesDto = _mapper.Map<List<CategoryDto>>(categories);
            var investmentTypes = await _context.InvestmentTypes.ToListAsync();

            return new CampaignCardWithCategories
            {
                Campaigns = campaigns,
                Categories = categoriesDto,
                InvestmentTypes = investmentTypes
            };
        }

        [HttpPost("v2/explore-investment")]
        public async Task<ActionResult<CampaignCardWithCategoriesv2>> GetCampaignsCards([FromBody] CampaignCardRequestDto requestDto)
        {
            CampaignCardResponseDto response = await GetCampaignsCardDtov2(requestDto);

            if (response == null)
                return NotFound();

            response.Campaigns = response.Campaigns.ToList();

            return new CampaignCardWithCategoriesv2
            {
                Campaigns = response.Campaigns,
                TotalCount = response.TotalCount
            };
        }

        [HttpGet("admincampaigns")]
        public async Task<IActionResult> GetAdminCampaigns([FromQuery] PaginationDto pagination)
        {
            var recommendations = await _context.Recommendations
                                        .Include(x => x.Campaign)
                                        .Where(x => x.Amount > 0 &&
                                                    x.UserEmail != null &&
                                                    x.Campaign != null &&
                                                    x.Campaign.Id != null &&
                                                    (x.Status!.ToLower() == "approved" || x.Status.ToLower() == "pending"))
                                        .GroupBy(x => x.Campaign!.Id!.Value)
                                        .Select(g => new
                                        {
                                            CampaignId = g.Key,
                                            CurrentBalance = g.Sum(i => i.Amount ?? 0),
                                            NumberOfInvestors = g.Select(r => r.UserEmail).Distinct().Count()
                                        })
                                        .ToDictionaryAsync(x => x.CampaignId);

            var investmentNotes = await _context.InvestmentNotes
                                                .Where(x => x.CampaignId != null)
                                                .Select(x => x.CampaignId!.Value)
                                                .Distinct()
                                                .ToListAsync();

            var investmentNotesSet = investmentNotes.ToHashSet();

            List<int>? stages = null;

            if (!string.IsNullOrEmpty(pagination.Stages))
            {
                stages = pagination.Stages
                                    .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                    .Select(int.Parse)
                                    .ToList();
            }

            var query = _context.Campaigns
                                .Where(c =>
                                    (string.IsNullOrEmpty(pagination.SearchValue)
                                        || EF.Functions.Like(c.Name!, $"%{pagination.SearchValue}%"))
                                    && (stages == null
                                        || (c.Stage.HasValue && stages.Contains((int)c.Stage.Value)))
                                    && (!pagination.InvestmentStatus.HasValue
                                        || c.IsActive == pagination.InvestmentStatus.Value)
                                )
                                .Select(c => new
                                {
                                    c.Id,
                                    c.Name,
                                    c.CreatedDate,
                                    c.AddedTotalAdminRaised,
                                    c.Stage,
                                    c.FundraisingCloseDate,
                                    c.IsActive,
                                    c.Property,
                                    OriginalPdfFileName = c.OriginalPdfFileName != null ? c.OriginalPdfFileName : null,
                                    ImageFileName = c.ImageFileName != null ? c.ImageFileName : null,
                                    PdfFileName = c.PdfFileName != null ? c.PdfFileName : null,
                                    c.MetaTitle,
                                    c.MetaDescription
                                });

            var campaignList = await query.ToListAsync();

            var enrichedCampaigns = campaignList
                                    .Where(c => c.Id != null)
                                    .Select(c =>
                                    {
                                        var hasRec = recommendations.TryGetValue(c.Id!.Value, out var rec);
                                        var hasNote = investmentNotesSet.Contains(c.Id!.Value);

                                        return new
                                        {
                                            c.Id,
                                            c.Name,
                                            c.CreatedDate,
                                            c.Stage,
                                            c.FundraisingCloseDate,
                                            c.IsActive,
                                            c.Property,
                                            OriginalPdfFileName = c.OriginalPdfFileName != null ? c.OriginalPdfFileName : null,
                                            ImageFileName = c.ImageFileName != null ? c.ImageFileName : null,
                                            PdfFileName = c.PdfFileName != null ? c.PdfFileName : null,
                                            CurrentBalance = hasRec ? rec!.CurrentBalance : 0,
                                            NumberOfInvestors = hasRec ? rec!.NumberOfInvestors : 0,
                                            HasNotes = hasNote ? true : false,
                                            c.MetaTitle,
                                            c.MetaDescription
                                        };
                                    })
                                    .ToList();

            bool isAsc = pagination?.SortDirection?.ToLower() == "asc";
            enrichedCampaigns = pagination?.SortField?.ToLower() switch
            {
                "name" => isAsc ? enrichedCampaigns.OrderBy(x => x.Name).ToList() : enrichedCampaigns.OrderByDescending(x => x.Name).ToList(),
                "createddate" => isAsc ? enrichedCampaigns.OrderBy(x => x.CreatedDate).ToList() : enrichedCampaigns.OrderByDescending(x => x.CreatedDate).ToList(),
                "totalrecommendations" => isAsc ? enrichedCampaigns.OrderBy(x => x.CurrentBalance).ToList() : enrichedCampaigns.OrderByDescending(x => x.CurrentBalance).ToList(),
                "totalinvestors" => isAsc ? enrichedCampaigns.OrderBy(x => x.NumberOfInvestors).ToList() : enrichedCampaigns.OrderByDescending(x => x.NumberOfInvestors).ToList(),
                _ => enrichedCampaigns.OrderByDescending(x => x.CreatedDate).ToList()
            };

            int page = pagination?.CurrentPage ?? 1;
            int pageSize = pagination?.PerPage ?? 50;
            int totalCount = enrichedCampaigns.Count();

            var pagedResult = enrichedCampaigns.Skip((page - 1) * pageSize).Take(pageSize).ToList();

            if (pagedResult.Any())
            {
                return Ok(new
                {
                    items = pagedResult,
                    totalCount
                });
            }

            return Ok(new { Success = false, Message = "Data not found." });
        }

        [HttpGet("network")]
        public async Task<ActionResult<IEnumerable<Campaign>>> GetCampaignsNetwork()
        {
            string userId = string.Empty;
            var identity = HttpContext.User.Identity as ClaimsIdentity;
            if (identity != null)
            {
                userId = identity.Claims.FirstOrDefault(i => i.Type == "id")?.Value!;
            }
            var userData = await _context.Users.FirstOrDefaultAsync(i => i.Id == userId);
            var requestsByTheUser = await _context
                                            .Requests
                                            .Include(i => i.RequestOwner)
                                            .Where(i => i.RequestOwner != null && i.RequestOwner.Id == userData!.Id && i.Status == "accepted")
                                            .Include(i => i.UserToFollow)
                                            .Include(i => i.GroupToFollow)
                                            .ToListAsync();

            var folowedUserEmails = requestsByTheUser.Where(i => i.UserToFollow != null).Select(i => i.UserToFollow!.Email).ToList();
            var recommendations = await _context.Recommendations.Include(i => i.Campaign).Where(i => folowedUserEmails.Contains(i.UserEmail!)).ToListAsync();
            var items = recommendations.GroupBy(g => g.Campaign?.Id).Select(g => g.First()).ToList().Select(i => i.Campaign?.Id);

            var data = await _context.Campaigns
                                        .Where(i => i.IsActive!.Value && i.Stage == InvestmentStage.Public)
                                        .Include(i => i.GroupForPrivateAccess)
                                        .Where(i => items.Contains(i.Id))
                                        .ToListAsync();
            if (data.Count > 0)
            {
                var result = _mapper.Map<List<CampaignDto>, List<Campaign>>(data);
                var reccomendations = await _context.Recommendations
                        .Where(x => x.Amount > 0 &&
                                x.UserEmail != null &&
                                (x.Status!.ToLower() == "approved" || x.Status.ToLower() == "pending"))
                        .GroupBy(x => x.Campaign!.Id)
                        .Select(g => new
                        {
                            CampaignId = g.Key!.Value,
                            CurrentBalance = g.Sum(i => i.Amount ?? 0),
                            NumberOfInvestors = g.Select(r => r.UserEmail).Distinct().Count()
                        })
                        .ToListAsync();

                foreach (var c in result)
                {
                    var groupedRecommendation = reccomendations.FirstOrDefault(i => i.CampaignId == c.Id);
                    if (groupedRecommendation != null)
                    {
                        c.CurrentBalance = groupedRecommendation.CurrentBalance + (c.AddedTotalAdminRaised ?? 0);
                        c.NumberOfInvestors = groupedRecommendation.NumberOfInvestors;
                    }
                }

                for (int i = 0; i < data.Count; i++)
                {
                    result[i].GroupForPrivateAccessDto = _mapper.Map<Group, GroupDto>(data[i].GroupForPrivateAccess!);
                }

                return result;
            }

            var folowedUserGroups = requestsByTheUser.Where(i => i.GroupToFollow != null).Select(i => i.GroupToFollow!.Id).ToList();
            var filteredGroups = await _context.Groups.Include(i => i.Campaigns).Where(i => folowedUserGroups.Contains(i.Id)).ToListAsync();
            var campaignsList = new List<Campaign>();
            foreach (var c in filteredGroups)
            {
                var camp = _mapper.Map<List<CampaignDto>, List<Campaign>>(c.Campaigns!);
                campaignsList.AddRange(camp);
            }

            return campaignsList;
        }

        [HttpGet("data")]
        public async Task<ActionResult<Data>> GetData()
        {
            var sdgs = await _context.SDGs.ToListAsync();
            var themes = await _context.Themes.ToListAsync();
            var investmentTypes = await _context.InvestmentTypes.ToListAsync();
            var approvedBy = await _context.ApprovedBy.ToListAsync();
            var investmentTag = await _context.InvestmentTag.ToListAsync();

            return new Data
            {
                Sdg = sdgs,
                Theme = themes,
                InvestmentType = investmentTypes,
                ApprovedBy = approvedBy,
                InvestmentTag = investmentTag
            };
        }

        [HttpGet("pdf/{identifier}")]
        public async Task<ActionResult<string>> GetPdf(string identifier)
        {
            if (_context.Campaigns == null)
            {
                return NotFound();
            }
            var campaign = new CampaignDto();

            campaign = await _context.Campaigns
                                        .Where(c => !string.IsNullOrWhiteSpace(c.Property) && c.Property == identifier)
                                        .FirstOrDefaultAsync();

            if (campaign == null)
            {
                campaign = await _context.Campaigns.FirstOrDefaultAsync(x => x.Id == Convert.ToInt32(identifier));
            }

            if (campaign == null)
            {
                return NotFound();
            }
            var campaignResponse = _mapper.Map<Campaign>(campaign);

            BlockBlobClient pdfBlockBlob = _blobContainerClient.GetBlockBlobClient(campaignResponse.PdfFileName);
            using (var memoryStream = new MemoryStream())
            {
                await pdfBlockBlob.DownloadToAsync(memoryStream);
                var bytes = memoryStream.ToArray();
                var b64String = Convert.ToBase64String(bytes);
                return "data:application/pdf;base64," + b64String;
            }
        }

        [HttpGet("{identifier}")]
        public async Task<ActionResult<Campaign>> GetCampaign(string identifier)
        {
            if (_context.Campaigns == null)
                return NotFound();

            var campaign = new CampaignDto();

            int? campaignId = null;

            if (int.TryParse(identifier, out var parsedId))
                campaignId = parsedId;

            campaign = await _context.Campaigns
                                     .FirstOrDefaultAsync(c =>
                                         (!string.IsNullOrWhiteSpace(c.Property) && c.Property == identifier) ||
                                         (campaignId.HasValue && c.Id == campaignId.Value));

            if (campaign == null)
            {
                var slugs = await _context.Slug
                                      .FirstOrDefaultAsync(x =>
                                          x.Type == SlugType.Investment &&
                                          x.Value == identifier);

                if (slugs != null)
                    campaign = await _context.Campaigns.FirstOrDefaultAsync(x => x.Id == slugs.ReferenceId);
            }

            if (campaign == null)
                return NotFound();

            switch (campaign.Stage)
            {
                case InvestmentStage.ClosedInvested:
                case InvestmentStage.CompletedOngoing:
                case InvestmentStage.CompletedOngoingPrivate:
                    break;

                case InvestmentStage.Vetting:
                case InvestmentStage.New:
                    return NotFound();

                case InvestmentStage.ClosedNotInvested:
                    return Ok(new { Success = false, Message = "This investment has been closed." });

                default:
                    if (campaign.IsActive == false)
                    {
                        return NotFound();
                    }
                    break;
            }

            var campaignResponse = _mapper.Map<Campaign>(campaign);

            var siteConfigs = await _context.SiteConfiguration.Where(x => x.Type == SiteConfigurationType.StaticValue).ToDictionaryAsync(x => x.Key, x => x.Value);

            campaignResponse.Terms = ReplaceSiteConfigTokens(campaignResponse.Terms!, siteConfigs);

            var reccomendations = await _context.Recommendations
                                        .Where(x => x.Campaign != null &&
                                                x.Campaign.Id == campaignResponse.Id &&
                                                x.Amount > 0 &&
                                                x.UserEmail != null &&
                                                (x.Status!.ToLower() == "approved" || x.Status.ToLower() == "pending"))
                                        .GroupBy(x => x.Campaign!.Id)
                                        .Select(g => new
                                        {
                                            CurrentBalance = g.Sum(i => i.Amount ?? 0),
                                            NumberOfInvestors = g.Select(r => r.UserEmail).Distinct().Count()
                                        })
                                        .FirstOrDefaultAsync();

            campaignResponse.NumberOfInvestors = 0;

            if (reccomendations != null)
            {
                campaignResponse.CurrentBalance = reccomendations.CurrentBalance;
                campaignResponse.NumberOfInvestors = reccomendations.NumberOfInvestors;
            }

            campaignResponse.CurrentBalance = campaignResponse.CurrentBalance ?? 0;
            campaignResponse.AddedTotalAdminRaised = campaignResponse.AddedTotalAdminRaised ?? 0;

            if (campaign.Stage == InvestmentStage.ClosedInvested || campaign.Stage == InvestmentStage.CompletedOngoing || campaign.Stage == InvestmentStage.CompletedOngoingPrivate)
            {
                List<int> themeIds = campaign?.Themes?
                                                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                                .Select(id => int.TryParse(id.Trim(), out var val) ? val : (int?)null)
                                                .Where(id => id.HasValue)
                                                .Select(id => id!.Value)
                                                .ToList() ?? new List<int>();

                var allCampaigns = await _context.Campaigns.ToListAsync();

                var matchedCampaigns = allCampaigns
                                            .Where(c =>
                                                c.IsActive == true &&
                                                c.Stage == InvestmentStage.Public &&
                                                c.Id != campaign!.Id &&
                                                themeIds.Any(id =>
                                                    c.Themes == id.ToString() ||
                                                    c.Themes!.StartsWith(id + ",") ||
                                                    c.Themes.EndsWith("," + id) ||
                                                    c.Themes.Contains("," + id + ",")
                                                ))
                                            .ToList();

                if (matchedCampaigns.Any())
                {
                    var matchedCampaignsCardDto = matchedCampaigns
                                                    .Select(c => new MatchedCampaignsCardDto
                                                    {
                                                        Id = c.Id,
                                                        Name = c.Name!,
                                                        Description = c.Description!,
                                                        Target = c.Target!,
                                                        TileImageFileName = c.TileImageFileName!,
                                                        ImageFileName = c.ImageFileName!,
                                                        Property = c.Property!,
                                                        AddedTotalAdminRaised = c.AddedTotalAdminRaised ?? 0,

                                                        CurrentBalance = _context.Recommendations
                                                                                    .Where(r => r.Campaign!.Id == c.Id &&
                                                                                                r.Amount > 0 &&
                                                                                                r.UserEmail != null &&
                                                                                                (r.Status!.ToLower() == "approved" || r.Status.ToLower() == "pending"))
                                                                                    .Sum(r => (decimal?)r.Amount) ?? 0,

                                                        NumberOfInvestors = _context.Recommendations
                                                                                        .Where(r => r.Campaign!.Id == c.Id &&
                                                                                                    r.Amount > 0 &&
                                                                                                    r.UserEmail != null &&
                                                                                                    (r.Status!.ToLower() == "approved" || r.Status.ToLower() == "pending"))
                                                                                        .Select(r => r.UserEmail!)
                                                                                        .Distinct()
                                                                                        .Count()
                                                    })
                                                    .OrderByDescending(c => c.CurrentBalance)
                                                    .Take(3)
                                                    .ToList();

                    campaignResponse.MatchedCampaigns = matchedCampaignsCardDto;
                }
            }
            return campaignResponse;
        }

        private static string ReplaceSiteConfigTokens(string html, Dictionary<string, string> siteConfigs)
        {
            if (string.IsNullOrWhiteSpace(html))
                return html;

            return System.Text.RegularExpressions.Regex.Replace(html, @"\{(.*?)\}", match =>
            {
                var key = match.Groups[1].Value.Trim();

                if (!siteConfigs.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value))
                    return string.Empty;

                return RemoveOuterPTags(value);

            }, System.Text.RegularExpressions.RegexOptions.Singleline | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        }

        private static string RemoveOuterPTags(string html)
        {
            html = html.Trim();

            var match = System.Text.RegularExpressions.Regex.Match(html, @"^\s*<p[^>]*>(.*?)<\/p>\s*$",
                System.Text.RegularExpressions.RegexOptions.Singleline | System.Text.RegularExpressions.RegexOptions.IgnoreCase
            );

            return match.Success ? match.Groups[1].Value.Trim() : html;
        }

        [HttpGet("admin/{id}")]
        [DisableRequestSizeLimit]
        public async Task<ActionResult<Campaign>> GetAdminCampaign(int id)
        {
            if (_context.Campaigns == null)
            {
                return NotFound();
            }
            var campaignDto = await _context.Campaigns.Include(x => x.GroupForPrivateAccess).FirstOrDefaultAsync(x => x.Id == id);

            if (campaignDto == null)
            {
                return NotFound();
            }

            Campaign campaign = _mapper.Map<Campaign>(campaignDto);

            campaign.GroupForPrivateAccessDto = campaignDto.GroupForPrivateAccess != null
                                                            ? _mapper.Map<GroupDto>(campaignDto.GroupForPrivateAccess)
                                                            : null;

            campaign.CurrentBalance = await _context.Recommendations
                                                    .Where(i => i.Campaign != null && i.Campaign.Id == campaign.Id)
                                                    .GroupBy(x => x.Campaign!.Id)
                                                    .Select(g => g.Sum(i => i.Status == "approved" || i.Status == "pending" ? i.Amount : 0))
                                                    .FirstOrDefaultAsync();

            campaign.InvestmentNotes = await _context.InvestmentNotes
                                                     .Where(x => x.CampaignId == campaign.Id)
                                                     .OrderByDescending(x => x.Id)
                                                     .Select(x => new InvestmentNotesDto
                                                     {
                                                         Date = x.CreatedAt.ToString("MM/dd/yyyy"),
                                                         UserName = x.User!.UserName,
                                                         Note = x.Note,
                                                         OldStatus = x.OldStatus,
                                                         NewStatus = x.NewStatus
                                                     })
                                                     .ToListAsync();

            var investmentTags = await _context.InvestmentTagMapping.Where(x => x.CampaignId == campaign.Id).ToListAsync();

            if (investmentTags != null)
            {
                var tagIds = investmentTags.Select(x => x.TagId).ToList();
                var tags = await _context.InvestmentTag.Where(x => tagIds.Contains(x.Id)).ToListAsync();

                campaign.InvestmentTag = tags
                                        .Select(x => new InvestmentTagDto
                                        {
                                            Tag = x.Tag
                                        })
                                        .ToList();
            }

            return campaign;
        }

        [HttpPut("/status/{id}")]
        public async Task<ActionResult<CampaignDto>> UpdateCampaignStatus(int id, bool status)
        {
            var campaign = await _context.Campaigns.SingleOrDefaultAsync(item => item.Id == id);
            if (campaign == null)
            {
                return BadRequest();
            }

            campaign.IsActive = status;
            campaign.ModifiedDate = DateTime.Now;
            await _context.SaveChangesAsync();
            var data = _mapper.Map<CampaignDto>(campaign);

            if (_appSecrets.IsProduction && status)
            {
                var variables = new Dictionary<string, string>
                {
                    { "logoUrl", await _imageService.GetImageUrl() },
                    { "date", DateTime.Now.ToString("MM/dd/yyyy") },
                    { "investmentLink", $"{_appSecrets.RequestOrigin}/investments/{campaign.Property}" },
                    { "campaignName", campaign.Name! }
                };

                _emailQueue.QueueEmail(async (sp) =>
                {
                    var emailService = sp.GetRequiredService<IEmailTemplateService>();

                    await emailService.SendTemplateEmailAsync(
                        EmailTemplateCategory.InvestmentApproved,
                        "investments@catacap.org",
                        variables
                    );
                });
            }

            //if (_appSecrets.IsProduction && status)
            //{
            //    var date = DateTime.Now.ToString("MM/dd/yyyy");
            //    string investmentLink = $"https://app.catacap.org/invest/{campaign.Property}";
            //    var subject = "New Investment approved on Production";
            //    var body = $@"
            //                <html>
            //                    <body>
            //                        <p>Hello Team!</p>
            //                        <p>A new Investment was approved on Production on {date}: <a href='{investmentLink}'>{campaign.Name}</a></p>
            //                        <p>Thanks.</p>
            //                    </body>
            //                </html>
            //                ";

            //    _ = Task.Run(async () =>
            //    {
            //        await Task.WhenAll(_mailService.SendMailAsync("investments@catacap.org", subject, "", body));
            //    });
            //}

            return Ok(data);
        }

        [HttpGet("user-investments")]
        public async Task<IActionResult> GetUserInvestments()
        {
            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var email = identity!.Claims.FirstOrDefault(i => i.Type == ClaimTypes.Email)?.Value;

            var investments = await _context.Campaigns
                                            .Where(x => !string.IsNullOrWhiteSpace(x.ContactInfoEmailAddress)
                                                    && x.IsActive == true
                                                    && x.ContactInfoEmailAddress == email)
                                            .OrderBy(x => x.Name)
                                            .Select(x => new
                                            {
                                                x.Id,
                                                x.Name,
                                                x.Stage,
                                                x.Property,
                                                x.CreatedDate,
                                            })
                                            .ToListAsync();

            return Ok(investments);
        }

        [HttpGet("user-disbursal-investments")]
        public async Task<IActionResult> GetUserDisbursalInvestments()
        {
            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var email = identity?.Claims.FirstOrDefault(i => i.Type == ClaimTypes.Email)?.Value;

            if (string.IsNullOrWhiteSpace(email))
                return Unauthorized(new { Success = false, Message = "User email not found." });

            var campaigns = await _context.Campaigns
                                            .Where(x =>
                                                x.IsActive == true &&
                                                !string.IsNullOrWhiteSpace(x.ContactInfoEmailAddress) &&
                                                x.ContactInfoEmailAddress == email)
                                            .OrderBy(x => x.Name)
                                            .Select(x => new
                                            {
                                                x.Id,
                                                x.Name,
                                                x.Property,
                                                x.InvestmentRole,
                                                x.ImpactAssetsFundingStatus,
                                                x.ContactInfoPhoneNumber,
                                                x.InvestmentTypes
                                            })
                                            .ToListAsync();

            if (!campaigns.Any())
                return Ok(new List<object>());

            var investmentTypeIds = campaigns
                                    .Where(x => !string.IsNullOrWhiteSpace(x.InvestmentTypes))
                                    .SelectMany(x => x.InvestmentTypes!.Split(',', StringSplitOptions.RemoveEmptyEntries))
                                    .Select(int.Parse)
                                    .Distinct()
                                    .ToList();

            var investmentTypeMap = await _context.InvestmentTypes.Where(x => investmentTypeIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Name);

            var result = campaigns.Select(c => new
            {
                c.Id,
                c.Name,
                c.Property,
                c.InvestmentRole,
                c.ImpactAssetsFundingStatus,
                c.ContactInfoPhoneNumber,
                InvestmentType = string.Join(", ",
                                c.InvestmentTypes?
                                    .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                    .Select(id => investmentTypeMap.TryGetValue(int.Parse(id), out var name) ? name : null)
                                    .Where(name => name != null) ?? Enumerable.Empty<string>())
            });

            return Ok(result);
        }

        [DisableRequestSizeLimit]
        [HttpPost("save-disbursal")]
        public async Task<IActionResult> SaveDisbursalInvestment([FromBody]DisbursalRequestDto dto)
        {
            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            if (string.IsNullOrEmpty(loginUserId))
                return BadRequest(new { Success = false, Message = "User not found." });

            if (dto.Id.HasValue && dto.Id > 0)
            {
                var disbursalRequest = await _context.DisbursalRequest.FirstOrDefaultAsync(x => x.Id == dto.Id);

                if(disbursalRequest == null)
                    return Ok(new { Success = false, Message = "Data not found." });

                if (!string.IsNullOrWhiteSpace(dto.Note))
                {
                    _context.DisbursalRequestNotes.Add(new DisbursalRequestNotes
                    {
                        DisbursalRequestId = disbursalRequest.Id,
                        Note = dto.Note.Trim(),
                        CreatedBy = loginUserId,
                        CreatedAt = DateTime.Now
                    });
                    await _context.SaveChangesAsync();
                }

                return Ok(new { Success = true, Message = "Disbursal request updated successfully." });
            }

            string pitchDeckFile = string.Empty;
            string investmentDocFile = string.Empty;

            if (!string.IsNullOrWhiteSpace(dto.PitchDeck))
                pitchDeckFile = await UploadBase64File(dto.PitchDeck, ".pdf");

            if (!string.IsNullOrWhiteSpace(dto.InvestmentDocument))
                investmentDocFile = await UploadBase64File(dto.InvestmentDocument, ".pdf");

            var disbursal = new DisbursalRequest
            {
                UserId = loginUserId,
                CampaignId = dto.CampaignId,
                Role = dto.Role,
                Mobile = dto.Mobile,
                Quote = dto.Quote,
                DistributedAmount = dto.DistributedAmount,
                Status = DisbursalRequestStatus.Pending,
                ImpactAssetsFundingPreviously = dto.ImpactAssetsFundingPreviously,
                InvestmentRemainOpen = dto.InvestmentRemainOpen,
                ReceiveDate = dto.ReceiveDate,
                PitchDeck = !string.IsNullOrEmpty(pitchDeckFile) ? pitchDeckFile : null,
                PitchDeckName = !string.IsNullOrEmpty(dto.PitchDeckName) ? dto.PitchDeckName : null,
                InvestmentDocument = !string.IsNullOrEmpty(investmentDocFile) ? investmentDocFile : null,
                InvestmentDocumentName = !string.IsNullOrEmpty(dto.InvestmentDocumentName) ? dto.InvestmentDocumentName : null,
                CreatedAt = DateTime.Now
            };
            await _context.DisbursalRequest.AddAsync(disbursal);
            await _context.SaveChangesAsync();

            var investmentName = await _context.Campaigns.Where(x => x.Id == dto.CampaignId).Select(x => x.Name).FirstOrDefaultAsync();

            string formattedAmount = string.Format(CultureInfo.GetCultureInfo("en-US"), "${0:N2}", dto.DistributedAmount);

            string formattedDate = dto.ReceiveDate.ToString("MM/dd/yyyy");

            var variables = new Dictionary<string, string>
            {
                { "logoUrl", await _imageService.GetImageUrl() },
                { "investmentName", investmentName! },
                { "amount", formattedAmount },
                { "date", formattedDate },
                { "disbursementUrl", $"{_appSecrets.RequestOrigin}/disbursal-request-detail/{disbursal.Id}" }
            };

            _emailQueue.QueueEmail(async (sp) =>
            {
                var emailService = sp.GetRequiredService<IEmailTemplateService>();

                await emailService.SendTemplateEmailAsync(
                    EmailTemplateCategory.DisbursementRequest,
                    _appSecrets.CatacapAdminEmail,
                    variables
                );
            });

            //_ = SendDisbursalEmail(investmentName!, dto.DistributedAmount, dto.ReceiveDate, disbursal.Id);

            return Ok(new { Success = true, Message = "Disbursal request saved successfully." });
        }

        private async Task SendDisbursalEmail(string investmentName, decimal amount, DateTime date, int id)
        {
            string formattedAmount = string.Format(CultureInfo.GetCultureInfo("en-US"), "${0:N2}", amount);
            string formattedDate = date.ToString("MM/dd/yyyy");
            string url = $"{requestOrigin}/disbursal-request-detail/{id}";

            string subject = $"New disbursement request for {investmentName}";

            var body = $@"
                        <html>
                            <body>
                                <p>Hello Team,</p>
                                <p><b>{investmentName}</b> is requesting a disbursement of <b>{formattedAmount}</b> by {formattedDate}</p>
                                <p><a href='{url}'>Go to disbursement details</a></p>
                                <p>Thanks!</p>
                            </body>
                        </html>";

            await _mailService.SendMailAsync(_appSecrets.CatacapAdminEmail, subject, "", body);
        }

        [HttpGet("get-disbursal-request")]
        public async Task<IActionResult> DisbursalRequest(int id)
        {
            if (id <= 0)
                return Ok(new { Success = false, Message = "Id is required." });

            var query = await _context.DisbursalRequest
                                        .Include(x => x.Campaign)
                                        .Include(x => x.User)
                                        .Where(x => x.Id == id)
                                        .Select(x => new
                                        {
                                            x.Id,
                                            x.User.FirstName,
                                            x.User.LastName,
                                            x.User.Email,
                                            x.Role,
                                            x.Mobile,
                                            x.Status,
                                            x.Quote,
                                            x.Campaign!.Name,
                                            x.DistributedAmount,
                                            x.Campaign.Property,
                                            x.InvestmentRemainOpen,
                                            x.ReceiveDate,
                                            x.PitchDeck,
                                            x.PitchDeckName,
                                            x.InvestmentDocument,
                                            x.InvestmentDocumentName,
                                            x.ImpactAssetsFundingPreviously,
                                            x.Campaign.InvestmentTypes
                                        })
                                        .FirstOrDefaultAsync();

            if (query == null)
                return Ok(new { Success = false, Message = "Disbursal Request not found." });

            var investmentTypeIds = query.InvestmentTypes?
                                            .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                            .Select(int.Parse)
                                            .Distinct()
                                            .ToList()
                                    ?? new List<int>();

            var investmentTypeMap = await _context.InvestmentTypes
                                                    .Where(x => investmentTypeIds.Contains(x.Id))
                                                    .ToDictionaryAsync(x => x.Id, x => x.Name);

            var investmentTypeNames = string.Join(", ",
                                        query.InvestmentTypes?
                                                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                                .Select(id =>
                                                    investmentTypeMap.TryGetValue(
                                                        int.Parse(id),
                                                        out var name)
                                                        ? name
                                                        : null)
                                                .Where(name => name != null)
                                        ?? Enumerable.Empty<string>());

            var data = new
            {
                query.Id,
                query.FirstName,
                query.LastName,
                query.Email,
                query.Role,
                query.Mobile,
                query.Name,
                query.DistributedAmount,
                query.Property,
                query.InvestmentRemainOpen,
                ReceiveDate = query.ReceiveDate == DateTime.MinValue ? "" : query.ReceiveDate!.Value.ToString("MM-dd-yyyy"),
                query.PitchDeck,
                Status = query.Status,
                StatusName = query.Status.GetDisplayName(),
                query.Quote,
                query.PitchDeckName,
                query.InvestmentDocument,
                query.InvestmentDocumentName,
                query.ImpactAssetsFundingPreviously,
                investmentTypeNames
            };

            return Ok(data);
        }

        [HttpGet("get-disbursal-request-list")]
        public async Task<IActionResult> DisbursalRequestList([FromQuery] PaginationDto dto)
        {
            bool isAsc = dto?.SortDirection?.ToLower() == "asc";
            int page = dto?.CurrentPage ?? 1;
            int pageSize = dto?.PerPage ?? 50;

            var query = await (from d in _context.DisbursalRequest
                                join c in _context.Campaigns
                                    on d.CampaignId equals c.Id
                                select new
                                {
                                    d.Id,
                                    d.ReceiveDate,
                                    d.User.Email,
                                    d.Mobile,
                                    d.DistributedAmount,
                                    d.Status,
                                    d.Quote,
                                    c.Name,
                                    InvestmentId = c.Id,
                                    c.Property,
                                    d.PitchDeck,
                                    d.PitchDeckName,
                                    d.InvestmentDocument,
                                    d.InvestmentDocumentName,
                                    c.InvestmentTypes
                                })
                                .ToListAsync();

            int totalCount = query.Count();

            if (!string.IsNullOrWhiteSpace(dto?.SearchValue))
            {
                var searchValue = dto.SearchValue.Trim().ToLower();

                query = query.Where(u => (u.Name ?? "").Trim().ToLower().Contains(searchValue) || u.Email.ToLower().Contains(searchValue)).ToList();
            }

            query = dto?.SortField?.ToLower() switch
            {
                "name" => isAsc ? query.OrderBy(x => x.Name).ToList() : query.OrderByDescending(x => x.Name).ToList(),
                "email" => isAsc ? query.OrderBy(x => x.Email).ToList() : query.OrderByDescending(x => x.Email).ToList(),
                "amount" => isAsc ? query.OrderBy(x => x.DistributedAmount).ToList() : query.OrderByDescending(x => x.DistributedAmount).ToList(),
                "date" => isAsc ? query.OrderBy(x => x.ReceiveDate).ToList() : query.OrderByDescending(x => x.ReceiveDate).ToList(),
                _ => query.OrderByDescending(x => x.Id).ToList()
            };

            var investmentTypeIds = query
                                    .Where(x => !string.IsNullOrWhiteSpace(x.InvestmentTypes))
                                    .SelectMany(x => x.InvestmentTypes!
                                        .Split(',', StringSplitOptions.RemoveEmptyEntries))
                                    .Select(int.Parse)
                                    .Distinct()
                                    .ToList();

            var investmentTypeMap = await _context.InvestmentTypes
                                                    .Where(x => investmentTypeIds.Contains(x.Id))
                                                    .ToDictionaryAsync(x => x.Id, x => x.Name);

            var result = query.Select(x => new DisbursalRequestListDto
            {
                Id = x.Id,
                Name = x.Name,
                InvestmentId = x.InvestmentId,
                Property = x.Property,
                Email = x.Email,
                Mobile = x.Mobile,
                Quote = x.Quote,
                Status = x.Status,
                StatusName = x.Status.GetDisplayName(),
                ReceiveDate = x.ReceiveDate == DateTime.MinValue ? "" : x.ReceiveDate!.Value.ToString("MM-dd-yyyy"),
                DistributedAmount = x.DistributedAmount,
                InvestmentType = string.Join(", ",
                                            x.InvestmentTypes?
                                                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                                .Select(id =>
                                                    investmentTypeMap.TryGetValue(int.Parse(id), out var name)
                                                        ? name
                                                        : null)
                                                .Where(name => name != null)
                                            ?? Enumerable.Empty<string>()),
                PitchDeck = x.PitchDeck,
                PitchDeckName = x.PitchDeckName,
                InvestmentDocument = x.InvestmentDocument,
                InvestmentDocumentName = x.InvestmentDocumentName,
                HasNotes = _context.DisbursalRequestNotes.Any(d => d.DisbursalRequestId == x.Id)
            });

            var items = result
                        .Skip((page - 1) * pageSize)
                        .Take(pageSize)
                        .ToList();

            if (items.Any())
                return Ok(new { items, totalCount });

            return Ok(new { Success = false, Message = "Data not found." });
        }

        [HttpGet("export-disbursal-request-list")]
        public async Task<IActionResult> ExportDisbursalRequest()
        {
            var data = await _context.DisbursalRequest
                                     .Include(x => x.Campaign)
                                     .Include(x => x.User)
                                     .ToListAsync();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "DisbursalRequest.xlsx";

            var investmentTypeIds = data
                                    .Where(x => !string.IsNullOrWhiteSpace(x.Campaign!.InvestmentTypes))
                                    .SelectMany(x => x.Campaign!.InvestmentTypes!
                                        .Split(',', StringSplitOptions.RemoveEmptyEntries))
                                    .Select(int.Parse)
                                    .Distinct()
                                    .ToList();

            var investmentTypeMap = await _context.InvestmentTypes
                                                  .Where(x => investmentTypeIds.Contains(x.Id))
                                                  .ToDictionaryAsync(x => x.Id, x => x.Name);

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("DisbursalRequest");

                var headers = new[]
                {
                    "Investment", "Email", "Disbursement Date", "Amount", "Investment Type", "Status", "Quote"
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

                    worksheet.Cell(row, col++).Value = dto.Campaign?.Name;

                    worksheet.Cell(row, col++).Value = dto.User?.Email;

                    worksheet.Cell(row, col++).Value = dto.ReceiveDate == DateTime.MinValue ? "" : dto.ReceiveDate;

                    var distributedAmountCell = worksheet.Cell(row, col++);
                    distributedAmountCell.Value = $"${Convert.ToDecimal(dto.DistributedAmount):N2}";
                    distributedAmountCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;

                    var investmentTypes = string.Join(", ",
                                            dto.Campaign?.InvestmentTypes?
                                                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                                .Select(id =>
                                                    investmentTypeMap.TryGetValue(
                                                        int.Parse(id),
                                                        out var name)
                                                        ? name
                                                        : null)
                                                .Where(name => name != null)
                                            ?? Enumerable.Empty<string>());

                    worksheet.Cell(row, col++).Value = investmentTypes;

                    worksheet.Cell(row, col++).Value = dto.Status.GetDisplayName();
                    worksheet.Cell(row, col++).Value = dto.Quote;
                }

                worksheet.Columns().AdjustToContents();

                foreach (var column in worksheet.Columns())
                {
                    column.Width += 10;
                }

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    return File(stream.ToArray(), contentType, fileName);
                }
            }
        }

        [HttpGet("get-disbursal-request-notes")]
        public async Task<IActionResult> GetDisbursalRequestNotes(int disbursalRequestId)
        {
            if (disbursalRequestId <= 0)
                return Ok(new { Success = false, Message = "Invalid disbursal request id" });

            var notes = await _context.DisbursalRequestNotes
                                        .Where(x => x.DisbursalRequestId == disbursalRequestId)
                                        .Select(x => new
                                        {
                                            x.Id,
                                            x.Note,
                                            x.User!.UserName,
                                            x.CreatedAt
                                        })
                                        .OrderByDescending(x => x.Id)
                                        .ToListAsync();

            if (notes.Any())
                return Ok(notes);

            return Ok(new { Success = false, Message = "Notes not found" });
        }

        [HttpGet("country")]
        public async Task<IActionResult> GetCountries()
        {
            var countries = await _context.Country
                                            .Where(x => x.IsActive)
                                            .OrderBy(x => x.SortOrder)
                                            .ThenBy(x => x.Name)
                                            .Select(x => new
                                            {
                                                x.Id,
                                                x.Name,
                                                x.Code
                                            })
                                            .ToListAsync();

            return Ok(countries);
        }

        [DisableRequestSizeLimit]
        [HttpPut("{id}")]
        public async Task<ActionResult<Campaign>> PutCampaign([FromBody] Campaign campaign)
        {
            if (campaign!.Id == null)
                return BadRequest();

            if (campaign.Property != null)
            {
                bool existsInSlug = await _context.Slug
                                            .AnyAsync(x =>
                                                x.Type == SlugType.Investment &&
                                                x.ReferenceId != campaign.Id &&
                                                x.Value == campaign.Property);

                bool existsInCampaign = await _context.Campaigns
                                                    .AnyAsync(x =>
                                                        x.Property != null &&
                                                        x.Id != campaign.Id &&
                                                        x.Property.ToLower().Trim() == campaign.Property);

                if (existsInCampaign || existsInSlug)
                    return Ok(new { Success = false, Message = "Investment name for URL already exists." });
            }

            var uploadedFiles = await UploadCampaignFiles(campaign);
            campaign.PdfFileName = uploadedFiles.GetValueOrDefault("PDFPresentation", campaign.PdfFileName);
            campaign.ImageFileName = uploadedFiles.GetValueOrDefault("Image", campaign.ImageFileName);
            campaign.TileImageFileName = uploadedFiles.GetValueOrDefault("TileImage", campaign.TileImageFileName);
            campaign.LogoFileName = uploadedFiles.GetValueOrDefault("Logo", campaign.LogoFileName);

            await HandleTags(campaign);

            var existingCampaign = await _context.Campaigns.FirstOrDefaultAsync(x => x.Id == campaign.Id);

            if (!string.IsNullOrWhiteSpace(existingCampaign!.Property))
            {
                var currentSlug = await _context.Slug
                                                .FirstOrDefaultAsync(x =>
                                                    x.Value != null &&
                                                    x.Type == SlugType.Investment &&
                                                    x.Value == existingCampaign!.Property);

                if (currentSlug == null)
                {
                    await _context.Slug.AddAsync(new Slug
                    {
                        ReferenceId = campaign.Id.Value,
                        Type = SlugType.Investment,
                        Value = existingCampaign!.Property,
                        CreatedAt = DateTime.Now
                    });

                    await _context.SaveChangesAsync();
                }
            }

            campaign.CreatedDate = existingCampaign?.CreatedDate;
            campaign.ModifiedDate = DateTime.Now;

            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var role = identity?.Claims.FirstOrDefault(i => i.Type == ClaimTypes.Role)?.Value;

            if (role == UserRoles.User)
                PreserveAdminFields(existingCampaign!, campaign);

            var campaignDto = _mapper.Map(campaign, existingCampaign);

            if (role != UserRoles.User)
            {
                campaignDto!.GroupForPrivateAccess = campaign.GroupForPrivateAccessDto != null
                                                        ? _mapper.Map<Group>(campaign.GroupForPrivateAccessDto)
                                                        : null;
                campaignDto.GroupForPrivateAccessId = campaign.GroupForPrivateAccessDto != null
                                                        ? campaign.GroupForPrivateAccessDto.Id
                                                        : null;
            }

            _context.Entry(existingCampaign!).State = EntityState.Modified;

            if (!string.IsNullOrWhiteSpace(campaign.Note) 
                || (!string.IsNullOrWhiteSpace(campaign.OldStatus) && !string.IsNullOrWhiteSpace(campaign.NewStatus))) 
            {
                var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;
                _context.InvestmentNotes.Add(new InvestmentNotes
                {
                    CampaignId = campaign.Id.Value,
                    Note = !string.IsNullOrWhiteSpace(campaign.Note) ? campaign.Note.Trim() : null,
                    CreatedBy = loginUserId,
                    CreatedAt = DateTime.Now,
                    OldStatus = campaign.OldStatus,
                    NewStatus = campaign.NewStatus
                });
            }

            if (campaign.NoteEmail is not null)
            {
                var loggedInUserName = identity?.Claims.FirstOrDefault(i => i.Type == ClaimTypes.Name)?.Value;

                _ = SendInvestmentNoteMentionEmails(
                    loggedInUserName!,
                    campaign.Name!,
                    campaign.OldStatus,
                    campaign.NewStatus,
                    !string.IsNullOrWhiteSpace(campaign.Note) ? campaign.Note.Trim() : null,
                    campaign.NoteEmail.Distinct().ToList()!
                );
            }
            await _context.SaveChangesAsync();

            campaign.InvestmentNotes = await _context.InvestmentNotes
                                                        .Where(x => x.CampaignId == campaign.Id)
                                                        .OrderByDescending(x => x.Id)
                                                        .Select(x => new InvestmentNotesDto
                                                        {
                                                            Date = x.CreatedAt.ToString("MM/dd/yyyy"),
                                                            UserName = x.User!.UserName,
                                                            Note = x.Note,
                                                            OldStatus = x.OldStatus,
                                                            NewStatus = x.NewStatus
                                                        })
                                                        .ToListAsync();

            _ = SendUpdateCampaignEmails(existingCampaign!, campaign);

            return Ok(new { Success = true, Message = "Campaign details updated successfully", campaign });
        }

        private async Task SendInvestmentNoteMentionEmails(string loggedInUserName, string investmentName, string? fromStage, string? toStage, string? noteText, List<string> taggedUserEmails)
        {
            string stageChangeSection = string.IsNullOrWhiteSpace(fromStage) || string.IsNullOrWhiteSpace(toStage)
                                            ? ""
                                            : $@"
                                                <tr>
                                                    <td style='padding:6px 0; font-weight:bold;'>Stage Change:</td>
                                                    <td style='padding:6px 0;'>{fromStage} → {toStage}</td>
                                                </tr>";

            var variables = new Dictionary<string, string>
            {
                { "logoUrl", await _imageService.GetImageUrl() },
                { "loggedInUserName", loggedInUserName },
                { "investmentName", investmentName },
                { "noteText", noteText ?? "" },
                { "stageChangeSection", stageChangeSection }
            };

            foreach (var email in taggedUserEmails)
            {
                _emailQueue.QueueEmail(async (sp) =>
                {
                    var emailService = sp.GetRequiredService<IEmailTemplateService>();

                    await emailService.SendTemplateEmailAsync(
                        EmailTemplateCategory.InvestmentNoteMention,
                        email,
                        variables
                    );
                });
            }

            //var emailTasks = new List<Task>();

            //string subject = $"{loggedInUserName} mentioned you in an Investment Note for {investmentName}";

            //for (int i = 0; i < taggedUserEmails.Count; i++)
            //{
            //    string userEmail = taggedUserEmails[i];

            //    string stageChangeHtml = string.IsNullOrWhiteSpace(fromStage) || string.IsNullOrWhiteSpace(toStage)
            //                                ? ""
            //                                : $@"
            //                                    <tr>
            //                                        <td style='padding:6px 0; font-weight:bold;'>Stage Change:</td>
            //                                        <td style='padding:6px 0;'>{fromStage} → {toStage}</td>
            //                                    </tr>";

            //    var body = $@"
            //                <html>
            //                    <body>
            //                        <table width='100%' cellpadding='0' cellspacing='0' style='margin-bottom:20px;'>
            //                            <tr>
            //                                <td style='padding:6px 0; font-weight:bold; width: 120px;'>Investment:</td>
            //                                <td style='padding:6px 0;'>{investmentName}</td>
            //                            </tr>
            //                            {stageChangeHtml}
            //                            <tr>
            //                                <td style='padding:6px 0; font-weight:bold; vertical-align: top;'>Note:</td>
            //                                <td style='padding:6px 0;'>{noteText}</td>
            //                            </tr>
            //                        </table>
            //                    </body>
            //                </html>";

            //    emailTasks.Add(_mailService.SendMailAsync(userEmail, subject, string.Empty, body));
            //}

            //await Task.WhenAll(emailTasks);
        }

        private async Task SendUpdateCampaignEmails(CampaignDto existing, Campaign campaign)
        {
            //var tasks = new List<Task>();

            if (_appSecrets.IsProduction)
            {
                if (existing?.Stage == InvestmentStage.Public && campaign.Stage == InvestmentStage.Private)
                {
                    var variables = new Dictionary<string, string>
                    {
                        { "logoUrl", await _imageService.GetImageUrl() },
                        { "date", DateTime.Now.ToString("MM/dd/yyyy") },
                        { "investmentLink", $"{_appSecrets.RequestOrigin}/investments/{campaign.Property}" },
                        { "campaignName", campaign.Name! }
                    };

                    _emailQueue.QueueEmail(async (sp) =>
                    {
                        var emailService = sp.GetRequiredService<IEmailTemplateService>();

                        await emailService.SendTemplateEmailAsync(
                            EmailTemplateCategory.InvestmentApproved,
                            "investments@catacap.org",
                            variables
                        );
                    });

                    //var date = DateTime.Now.ToString("MM/dd/yyyy");
                    //string investmentLink = $"https://app.catacap.org/invest/{campaign.Property}";
                    //var subject = "New Investment approved on Production";
                    //var body = $@"
                    //            <html>
                    //                <body>
                    //                    <p>Hello Team!</p>
                    //                    <p>A new Investment was approved on Production on {date}: <a href='{investmentLink}'>{campaign.Name}</a></p>
                    //                    <p>Thanks.</p>
                    //                </body>
                    //            </html>
                    //            ";
                    //tasks.Add(_mailService.SendMailAsync("investments@catacap.org", subject, "", body));
                }
            }

            if (campaign.Stage == InvestmentStage.ComplianceReview)
            {
                var variables = new Dictionary<string, string>
                {
                    { "logoUrl", await _imageService.GetImageUrl() },
                    { "campaignName", campaign.Name! }
                };

                _emailQueue.QueueEmail(async (sp) =>
                {
                    var emailService = sp.GetRequiredService<IEmailTemplateService>();

                    var subjectPrefix = _appSecrets.IsProduction ? "" : "QA - ";

                    await emailService.SendTemplateEmailAsync(
                        EmailTemplateCategory.ComplianceReviewNotification,
                        "compliance-review@catacap.org",
                        variables,
                        subjectPrefix
                    );
                });

                //string subject = _appSecrets.IsProduction
                //                ? "An investment is ready for compliance review"
                //                : "QA - An investment is ready for compliance review";
                //var body = $@"
                //            <html>
                //                <body>
                //                    <p>Hello Tim!</p>
                //                    <p>A new Investment is ready for compliance review: <b>{campaign.Name}</b></p>
                //                    <p>Thanks.</p>
                //                </body>
                //            </html>
                //            ";
                //tasks.Add(_mailService.SendMailAsync("compliance-review@catacap.org", subject, "", body));
            }
            //await Task.WhenAll(tasks);
        }

        private void PreserveAdminFields(CampaignDto existing, Campaign update)
        {
            update.MinimumInvestment = existing.MinimumInvestment;
            update.ApprovedBy = existing.ApprovedBy;
            update.Stage = existing.Stage;
            update.GroupForPrivateAccessDto = _mapper.Map<GroupDto>(existing.GroupForPrivateAccess);
            update.Property = existing.Property;
            update.AddedTotalAdminRaised = existing.AddedTotalAdminRaised;
            update.IsActive = existing.IsActive;
        }

        [HttpPost("investment-request")]
        [DisableRequestSizeLimit]
        public async Task<IActionResult> SaveInvestmentRequest([FromBody] SaveInvestmentRequestDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Email))
                return Ok(new { Success = false, Message = "Email is required." });

            var userEmail = dto.Email.Trim().ToLower();

            var user = await _context.Users.SingleOrDefaultAsync(u => u.Email.ToLower() == dto.Email)
                        ?? await RegisterAnonymousUser(dto.FirstName!, dto.LastName!, userEmail);

            var status = dto.IsDraft
                            ? InvestmentRequestStatus.Draft
                            : InvestmentRequestStatus.Submitted;

            var uploadedFiles = await UploadInvestmentRequestFiles(dto);

            var entity = new InvestmentRequest
            {
                UserId = user.Id,
                CurrentStep = dto.CurrentStep,
                Status = status,
                Country = dto.Country,
                Website = dto.Website,
                OrganizationName = dto.OrganizationName,
                CurrentlyRaising = dto.CurrentlyRaising,

                InvestmentTypes = dto.InvestmentTypes != null
                                    ? string.Join(",", dto.InvestmentTypes)
                                    : null,

                InvestmentThemes = dto.InvestmentThemes != null
                                    ? string.Join(",", dto.InvestmentThemes)
                                    : null,

                ThemeDescription = dto.ThemeDescription,
                CapitalRaised = dto.CapitalRaised,
                ReferenceableInvestors = dto.ReferenceableInvestors,
                HasDonorCommitment = dto.HasDonorCommitment,
                SoftCircledAmount = dto.SoftCircledAmount ?? 0,
                Timeline = dto.Timeline,
                CampaignGoal = dto.CampaignGoal ?? 0,
                Role = dto.Role,
                ReferralSource = dto.ReferralSource,
                Logo = uploadedFiles.GetValueOrDefault("Logo"),
                LogoFileName = dto.LogoFileName,
                HeroImage = uploadedFiles.GetValueOrDefault("HeroImage"),
                HeroImageFileName = dto.HeroImageFileName,
                PitchDeck = uploadedFiles.GetValueOrDefault("PitchDeck"),
                PitchDeckFileName = dto.PitchDeckFileName,
                InvestmentTerms = dto.InvestmentTerms,
                WhyBackYourInvestment = dto.WhyBackYourInvestment,
                CreatedAt = DateTime.Now
            };

            _context.InvestmentRequest.Add(entity);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                Success = true,
                Message = dto.IsDraft
                    ? "Draft saved successfully."
                    : "Investment request submitted successfully.",
                entity.Id
            });
        }

        private async Task<Dictionary<string, string?>> UploadInvestmentRequestFiles(SaveInvestmentRequestDto dto)
        {
            var filesToUpload = new Dictionary<string, (string? Base64, string Extension)>
            {
                ["Logo"] = (dto.Logo, ".jpg"),
                ["HeroImage"] = (dto.HeroImage, ".jpg"),
                ["PitchDeck"] = (dto.PitchDeck, ".pdf")
            };

            var uploadTasks = filesToUpload
                                .Where(f => !string.IsNullOrWhiteSpace(f.Value.Base64))
                                .ToDictionary(
                                    f => f.Key,
                                    f => UploadBase64File(f.Value.Base64!, f.Value.Extension)
                                );

            await Task.WhenAll(uploadTasks.Values);

            return uploadTasks.ToDictionary(
                f => f.Key,
                f => (string?)f.Value.Result
            );
        }

        [HttpPost("raisemoney")]
        [DisableRequestSizeLimit]
        public async Task<IActionResult> PostRaiseMoneyCampaign([FromBody] Campaign campaign)
        {
            if (campaign == null)
                return Ok(new { Success = false, Message = "Campaign data is required." });

            if (campaign.ContactInfoEmailAddress == null)
                return Ok(new { Success = false, Message = "Email is required." });

            if (string.IsNullOrWhiteSpace(campaign.FirstName))
                return Ok(new { Success = false, Message = "First Name is required." });

            if (string.IsNullOrWhiteSpace(campaign.LastName))
                return Ok(new { Success = false, Message = "Last Name is required." });

            if (!string.IsNullOrEmpty(campaign.CaptchaToken) && !await VerifyCaptcha(campaign.CaptchaToken))
                return BadRequest("CAPTCHA verification failed.");

            var userEmail = campaign!.ContactInfoEmailAddress!.Trim().ToLower();

            var user = await _context.Users.SingleOrDefaultAsync(u => u.Email.ToLower() == userEmail)
                        ?? await RegisterAnonymousUser(campaign.FirstName!, campaign.LastName!, campaign.ContactInfoEmailAddress.Trim().ToLower()!);

            var uploadedFiles = await UploadCampaignFiles(campaign);
            campaign.PdfFileName = uploadedFiles.GetValueOrDefault("PDFPresentation", campaign.PdfFileName);
            campaign.ImageFileName = uploadedFiles.GetValueOrDefault("Image", campaign.ImageFileName);
            campaign.TileImageFileName = uploadedFiles.GetValueOrDefault("TileImage", campaign.TileImageFileName);
            campaign.LogoFileName = uploadedFiles.GetValueOrDefault("Logo", campaign.LogoFileName);

            if (campaign.InvestmentTag?.Count > 0)
                await HandleTags(campaign);

            var mappedCampaign = _mapper.Map<Campaign, CampaignDto>(campaign!);
            mappedCampaign.Status = "0";
            mappedCampaign.Stage = InvestmentStage.New;
            mappedCampaign.IsActive = false;
            mappedCampaign.PdfFileName = campaign.PdfFileName;
            mappedCampaign.ImageFileName = campaign.ImageFileName;
            mappedCampaign.TileImageFileName = campaign.TileImageFileName;
            mappedCampaign.LogoFileName = campaign.LogoFileName;
            mappedCampaign.CreatedDate = DateTime.Now;
            mappedCampaign.EmailSends = false;
            mappedCampaign.UserId = user != null ? user.Id : null;

            if (campaign.GroupForPrivateAccessDto != null)
                mappedCampaign.GroupForPrivateAccess = await _context.Groups.FirstOrDefaultAsync(i => i.Id == campaign.GroupForPrivateAccessDto.Id);

            _context.Campaigns.Add(mappedCampaign);
            await _context.SaveChangesAsync();

            _ = SendCreateCampaignEmails(campaign, mappedCampaign, userEmail);

            return Ok(new { Success = true, Message = "Investment has been created successfully." });
        }

        private async Task SendCreateCampaignEmails(Campaign campaign, CampaignDto mappedCampaign, string userEmail)
        {
            var tasks = new List<Task>();

            if (_appSecrets.IsProduction)
            {
                var parsIdSdgs = campaign?.SDGs?.Split(',').Select(id => int.Parse(id)).ToList();
                var parsIdInvestmentTypes = campaign?.InvestmentTypes?.Split(',').Select(id => int.Parse(id)).ToList();
                var parsIdThemes = campaign?.Themes?.Split(',').Select(id => int.Parse(id)).ToList();

                var sdgNames = _context.SDGs.Where(c => parsIdSdgs!.Contains(c.Id)).Select(c => c.Name).ToList();
                var themeNames = _context.Themes.Where(c => parsIdThemes!.Contains(c.Id)).Select(c => c.Name).ToList();
                var investmentTypeNames = _context.InvestmentTypes.Where(c => parsIdInvestmentTypes!.Contains(c.Id)).Select(c => c.Name).ToList();

                var sdgNamesString = string.Join(", ", sdgNames);
                var themeNamesString = string.Join(", ", themeNames);
                var investmentTypeNamesString = string.Join(", ", investmentTypeNames);

                var campaignVariables = new Dictionary<string, string>
                {
                    { "logoUrl", await _imageService.GetImageUrl() },
                    { "userFullName", $"{campaign!.FirstName} {campaign.LastName}" },
                    { "ownerEmail", campaign.ContactInfoEmailAddress ?? "" },
                    { "informationalEmail", campaign.InvestmentInformationalEmail ?? "" },
                    { "mobileNumber", campaign.ContactInfoPhoneNumber ?? "" },
                    { "addressLine1", campaign.ContactInfoAddress ?? "" },
                    { "investmentName", campaign.Name ?? "" },
                    { "investmentDescription", campaign.Description ?? "" },
                    { "website", campaign.Website ?? "" },
                    { "investmentTypes", investmentTypeNamesString },
                    { "terms", campaign.Terms ?? "" },
                    { "target", campaign.Target?.ToString() ?? "" },
                    { "fundraisingCloseDate", campaign.FundraisingCloseDate?.ToString() ?? "" },
                    { "themes", themeNamesString },
                    { "sdgs", sdgNamesString },
                    { "impactAssetsFundingStatus", campaign.ImpactAssetsFundingStatus ?? "" },
                    { "investmentRole", campaign.InvestmentRole ?? "" },

                    { "addressLine2Section", string.IsNullOrWhiteSpace(campaign.ContactInfoAddress2) ? "" : $"<p>Address Line 2: {campaign.ContactInfoAddress2}</p><br/>" },
                    { "citySection", string.IsNullOrWhiteSpace(campaign.City) ? "" : $"<p>City: {campaign.City}</p><br/>" },
                    { "stateSection", string.IsNullOrWhiteSpace(campaign.State) ? "" : $"<p>State: {campaign.State}</p><br/>" },
                    { "zipCodeSection", string.IsNullOrWhiteSpace(campaign.ZipCode) ? "" : $"<p>Zip Code: {campaign.ZipCode}</p><br/>" }
                };

                _emailQueue.QueueEmail(async (sp) =>
                {
                    var emailService = sp.GetRequiredService<IEmailTemplateService>();

                    await emailService.SendTemplateEmailAsync(
                        EmailTemplateCategory.InvestmentSubmissionNotification,
                        "ken@catacap.org",
                        campaignVariables
                    );
                });

                //tasks.Add(SendkenEmail(campaign));

                var catacapAdminVariables = new Dictionary<string, string>
                {
                    { "logoUrl", await _imageService.GetImageUrl() },
                    { "date", DateTime.Now.ToString("M/d/yyyy") },
                    { "campaignName", mappedCampaign.Name! }
                };

                _emailQueue.QueueEmail(async (sp) =>
                {
                    var emailService = sp.GetRequiredService<IEmailTemplateService>();

                    await emailService.SendTemplateEmailAsync(
                        EmailTemplateCategory.InvestmentPublished,
                        "catacap-admin@catacap.org",
                        catacapAdminVariables
                    );
                });

                //tasks.Add(SendCatacapAdminEmail(mappedCampaign));
            }
            //tasks.Add(SendInvestmentOwnerEmail(requestOrigin, userEmail, campaign!.FirstName!, campaign.LastName!, campaign.Name!));

            var variables = new Dictionary<string, string>
            {
                { "logoUrl", await _imageService.GetImageUrl() },
                { "fullName", $"{campaign!.FirstName!} {campaign.LastName!}" },
                { "investmentName", campaign.Name! },
                { "preLaunchToolkitUrl", "https://www.notion.so/Pre-Launch-23fc1b9e8945806796f4fa7cf38fa388?source=copy_link" },
                { "partnerBenefitsUrl", "https://docs.google.com/document/d/13LHN3uYCsG-dsaI3GPwbo-kK2NZ4rxY2UYp2B0ZEGjo/edit?tab=t.0" },
                { "faqPageUrl", "https://www.catacap.org/faqs/#investment" },
                { "unsubscribeUrl", $"{_appSecrets.RequestOrigin}/settings" }
            };

            _emailQueue.QueueEmail(async (sp) =>
            {
                var emailService = sp.GetRequiredService<IEmailTemplateService>();

                await emailService.SendTemplateEmailAsync(
                    EmailTemplateCategory.InvestmentUnderReview,
                    userEmail,
                    variables
                );
            });

            //await Task.WhenAll(tasks);
        }

        private async Task HandleTags(Campaign campaign)
        {
            if (campaign.InvestmentTag == null || !campaign.InvestmentTag.Any())
            {
                var existingMapping = await _context.InvestmentTagMapping
                                                     .Where(m => m.CampaignId == campaign.Id)
                                                     .ToListAsync();

                if (existingMapping.Any())
                    _context.InvestmentTagMapping.RemoveRange(existingMapping);

                await _context.SaveChangesAsync();
                return;
            }

            var tagNames = campaign.InvestmentTag!.Select(t => t.Tag.Trim()).ToList();

            var existingTags = await _context.InvestmentTag
                                                .Where(t => tagNames.Contains(t.Tag.Trim()))
                                                .ToListAsync();

            var newTags = campaign.InvestmentTag!
                                    .Where(t => !existingTags.Any(et => et.Tag.Trim() == t.Tag.Trim()))
                                    .Select(t => new InvestmentTag { Tag = t.Tag })
                                    .ToList();

            if (newTags.Any())
                _context.InvestmentTag.AddRange(newTags);

            await _context.SaveChangesAsync();

            var allTags = existingTags.Concat(newTags).ToList();

            var existingMappings = await _context.InvestmentTagMapping
                                                    .Where(m => m.CampaignId == campaign.Id)
                                                    .ToListAsync();

            var mappingsToRemove = existingMappings
                                   .Where(m =>
                                   {
                                       var tag = allTags.FirstOrDefault(t => t.Id == m.TagId);
                                       return tag == null || !tagNames.Contains(tag.Tag.Trim());
                                   })
                                   .ToList();

            if (mappingsToRemove.Any())
                _context.InvestmentTagMapping.RemoveRange(mappingsToRemove);

            var mappingTagIds = existingMappings.Select(m => m.TagId).ToList();

            var mappingsToAdd = allTags.Where(t => !mappingTagIds.Contains(t.Id))
                                        .Select(t => new InvestmentTagMapping { CampaignId = campaign.Id!.Value, TagId = t.Id })
                                        .ToList();

            if (mappingsToAdd.Any())
                _context.InvestmentTagMapping.AddRange(mappingsToAdd);

            await _context.SaveChangesAsync();
        }

        private async Task<Dictionary<string, string?>> UploadCampaignFiles(Campaign campaign)
        {
            var filesToUpload = new Dictionary<string, (string? Base64, string Extension)>
            {
                ["PDFPresentation"] = (campaign.PDFPresentation, ".pdf"),
                ["Image"] = (campaign.Image, ".jpg"),
                ["TileImage"] = (campaign.TileImage, ".jpg"),
                ["Logo"] = (campaign.Logo, ".jpg")
            };

            var uploadTasks = filesToUpload.Where(f => !string.IsNullOrWhiteSpace(f.Value.Base64))
                                           .ToDictionary(
                                               f => f.Key,
                                               f => UploadBase64File(f.Value.Base64!, f.Value.Extension)
                                           );

            await Task.WhenAll(uploadTasks.Values);

            var result = uploadTasks.ToDictionary(
                                        f => f.Key,
                                        f => (string?)f.Value.Result
                                    );

            return result;
        }

        private async Task<string> UploadBase64File(string base64Data, string extension)
        {
            if (string.IsNullOrWhiteSpace(base64Data))
                return string.Empty;

            string fileName = $"{Guid.NewGuid()}{extension}";
            var blob = _blobContainerClient.GetBlockBlobClient(fileName);

            var dataIndex = base64Data.Substring(base64Data.IndexOf(',') + 1);
            var bytes = Convert.FromBase64String(dataIndex);

            using var stream = new MemoryStream(bytes);
            await blob.UploadAsync(stream);

            return fileName;
        }

        private async Task<bool> VerifyCaptcha(string token)
        {
            var requestContent = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("secret", _appSecrets.CaptchaSecretKey),
                new KeyValuePair<string, string>("response", token)
            });

            var response = await _httpClient.PostAsync("https://hcaptcha.com/siteverify", requestContent);

            var content = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(content);
            bool isSuccess = doc.RootElement.GetProperty("success").GetBoolean();

            return isSuccess;
        }

        private async Task<User> RegisterAnonymousUser(string firstName, string lastName, string email)
        {
            var userName = $"{firstName}{lastName}".Replace(" ", "").Trim().ToLower();
            Random random = new Random();
            while (_context.Users.Any(x => x.UserName == userName))
            {
                userName = $"{userName}{random.Next(0, 100)}".ToLower();
            }

            UserRegistrationDto registrationDto = new UserRegistrationDto()
            {
                FirstName = firstName,
                LastName = lastName,
                UserName = userName,
                Password = _appSecrets.DefaultPassword,
                Email = email
            };

            await _repository.UserAuthentication.RegisterUserAsync(registrationDto, UserRoles.User);

            var user = await _repository.UserAuthentication.GetUserByUserName(userName);
            user.IsFreeUser = true;
            await _repository.UserAuthentication.UpdateUser(user);
            await _repository.SaveAsync();

            var variables = new Dictionary<string, string>
            {
                { "firstName", firstName! },
                { "userName", userName },
                { "resetPasswordUrl", $"{_appSecrets.RequestOrigin}/forgotpassword" },
                { "logoUrl", await _imageService.GetImageUrl() },
                { "siteUrl", _appSecrets.RequestOrigin }
            };

            _emailQueue.QueueEmail(async (sp) =>
            {
                var emailService = sp.GetRequiredService<IEmailTemplateService>();

                await emailService.SendTemplateEmailAsync(
                    EmailTemplateCategory.WelcomeAnonymousUser,
                    email,
                    variables
                );
            });

            // _ = SendWelcomeToCataCapEmail(requestOrigin, email, userName, firstName!);

            return user;
        }

        private async Task SendWelcomeToCataCapEmail(string request, string emailTo, string userName, string firstName)
        {
            string logoUrl = $"{request}/logo-for-email.png";
            string logoHtml = $@"
                                <div style='text-align: center;'>
                                    <a href='https://catacap.org' target='_blank'>
                                        <img src='{logoUrl}' alt='CataCap Logo' width='300' height='150' />
                                    </a>
                                </div>";

            string resetPasswordUrl = $"{request}/forgotpassword";
            string userSettingsUrl = $"{request}/settings";
            string subject = "Welcome to CataCap - Let’s Move Capital That Matters 💥";

            var body = logoHtml + $@"
                                    <html>
                                        <body>
                                            <p><b>Hi {firstName},</b></p>
                                            <p>Welcome to <b>CataCap</b> - the movement turning philanthropic dollars into <b>powerful, catalytic investments</b> that fuel real change.</p>
                                            <p>You’ve just joined what we believe will become the <b>largest community of catalytic capital champions</b> on the planet. Whether you're a donor, funder, or impact-curious investor - you're in the right place.</p>
                                            <p>Your CataCap username: <b>{userName}</b></p>
                                            <p>To set your password: <a href='{resetPasswordUrl}' target='_blank'>Click here</a></p>
                                            <p>Here’s what you can do right now on CataCap:</p>
                                            <p>🔎 <b>1. Discover Investments Aligned with Your Values</b></p>
                                            <p style='margin-bottom: 0px;'>Use your <b>DAF, foundation, or donation capital</b> to fund vetted companies, VC funds, and loan structures — not just nonprofits.</p>
                                            <p style='margin-top: 0px;'>➡️ <a href='{request}/find'>Browse live investment opportunities</a></p>
                                            <p>🤝 <b>2. Connect with Like-Minded Peers</b></p>
                                            <p style='margin-bottom: 0px;'>Follow friends and colleagues, share opportunities, or keep your giving private — you’re in control.</p>
                                            <p style='margin-top: 0px;'>➡️ <a href='{request}/community'>Explore the CataCap community</a></p>
                                            <p>🗣️ <b>3. Join or Start a Group</b></p>
                                            <p style='margin-bottom: 0px;'>Find (or create!) groups around shared causes and funding themes — amplify what matters to you.</p>
                                            <p style='margin-top: 0px;'>➡️ <a href='{request}/community'>See active groups and start your own</a></p>
                                            <p>🚀 <b>4. Recommend Deals You Believe In</b></p>
                                            <p style='margin-bottom: 0px;'>Champion investments that should be seen — and funded — by others in the community.</p>
                                            <p style='margin-top: 0px;'>➡️ <a href='https://catacap.org/lead-investor/'>Propose an opportunity</a></p>
                                            <p>We’re here to help you put your capital to work — boldly, effectively, and in community.</p>
                                            <p>Thanks for joining us. Let’s fund what we wish existed — together.</p>
                                            <p style='margin-bottom: 0px;'><b>The CataCap Team</b></p>
                                            <p style='margin-top: 0px;'>🌍 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
                                            <p>Have questions? Email Ken at <a href='mailto:ken@impactree.org'>ken@impactree.org</a></p>
                                            <p><a href='{request}/settings' target='_blank'>Unsubscribe</a> from CataCap notifications.</p>
                                        </body>
                                    </html>";

            await _mailService.SendMailAsync(emailTo, subject, "", body);
        }

        private async Task SendInvestmentOwnerEmail(string request, string emailTo, string firstName, string lastName, string investmentName)
        {
            string logoUrl = $"{request}/logo-for-email.png";
            string logoHtml = $@"
                                <div style='text-align: center;'>
                                    <a href='https://catacap.org' target='_blank'>
                                        <img src='{logoUrl}' alt='CataCap Logo' width='300' height='150' />
                                    </a>
                                </div>";

            string preLaunchToolkitUrl = $"https://www.notion.so/Pre-Launch-23fc1b9e8945806796f4fa7cf38fa388?source=copy_link";
            string seePartnerBenefits = $"https://docs.google.com/document/d/13LHN3uYCsG-dsaI3GPwbo-kK2NZ4rxY2UYp2B0ZEGjo/edit?tab=t.0";
            string faqPage = $"https://www.catacap.org/faqs/#investment";
            string subject = "Your CataCap investment is under review";

            var body = logoHtml + $@"
                                    <html>
                                        <body>
                                            <p><b>Hi {firstName + " " + lastName},</b></p>
                                            <p>Thank you for submitting {investmentName} to raise funds on CataCap! Your investment details, terms, and materials are now under review with our team. We’ll follow up soon—review and approval typically takes 10-15 business days.</p>
                                            <p>In the meantime, our <a href='{preLaunchToolkitUrl}' target='_blank'>Pre-Launch Toolkit</a> is a great place to start. It’s full of tips and resources to help you prepare for your expanded fundraising outreach capabilities with CataCap (pending approval). <b>If you have a donor committed and ready to donate over $10K to invest in your venture please let us know and we can help expedite the review process</b>.</p>
                                            <p><b>Quick reminders:</b></p>
                                            <ul style='list-style-type:disc;'>
							                    <li><b>Partnership model:</b> CataCap serves as a conduit for your network to donate philanthropic capital into your venture. While we provide exposure opportunities at key milestones [<a href='{seePartnerBenefits}' target='_blank'>see Partner Benefits</a>], the strongest traction comes from your own champions and relationships.</li>
							                    <li><b>$50K minimum:</b> Investments must raise at least $50K via CataCap to qualify for disbursement.</li>
						                    </ul>
                                            <p>You can also explore our <a href='{faqPage}' target='_blank'>FAQ page</a> for additional guidance. If you have any questions as you review, please let us know.</p>
                                            <p>We’re grateful to be part of your journey and excited for what’s ahead.</p>
                                            <p style='margin-bottom: 0px;'>With gratitude,</p>
                                            <p style='margin-top: 0px; margin-bottom: 0px;'>Team CataCap</p>
                                            <p style='margin-top: 0px; margin-bottom: 0px;'>🌍 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
                                            <p style='margin-top: 0px; margin-bottom: 0px;'><a href='{request}/settings' target='_blank'>Unsubscribe</a> from CataCap notifications.</p>
                                        </body>
                                    </html>";

            await _mailService.SendMailAsync(emailTo, subject, "", body);
        }

        private async Task SendkenEmail(Campaign campaign)
        {
            var parsIdSdgs = campaign?.SDGs?.Split(',').Select(id => int.Parse(id)).ToList();
            var parsIdInvestmentTypes = campaign?.InvestmentTypes?.Split(',').Select(id => int.Parse(id)).ToList();
            var parsIdThemes = campaign?.Themes?.Split(',').Select(id => int.Parse(id)).ToList();

            var sdgNames = _context.SDGs.Where(c => parsIdSdgs!.Contains(c.Id)).Select(c => c.Name).ToList();
            var themeNames = _context.Themes.Where(c => parsIdThemes!.Contains(c.Id)).Select(c => c.Name).ToList();
            var investmentTypeNames = _context.InvestmentTypes.Where(c => parsIdInvestmentTypes!.Contains(c.Id)).Select(c => c.Name).ToList();

            var sdgNamesString = string.Join(", ", sdgNames);
            var themeNamesString = string.Join(", ", themeNames);
            var investmentTypeNamesString = string.Join(", ", investmentTypeNames);

            var emailParts = new List<string>
            {
                $"<p>User Name: {campaign!.FirstName} {campaign.LastName}</p><br/>",
                $"<p>Investment Owner Email: {campaign.ContactInfoEmailAddress}</p><br/>",
                $"<p>Investment Informational Email: {campaign.InvestmentInformationalEmail}</p><br/>",
                $"<p>Mobile Number: {campaign.ContactInfoPhoneNumber}</p><br/>",
                $"<p>Address Line 1: {campaign.ContactInfoAddress}</p><br/>"
            };

            if (!string.IsNullOrWhiteSpace(campaign.ContactInfoAddress2))
                emailParts.Add($"<p>Address Line 2: {campaign.ContactInfoAddress2}</p><br/>");

            if (!string.IsNullOrWhiteSpace(campaign.City))
                emailParts.Add($"<p>City: {campaign.City}</p><br/>");

            if (!string.IsNullOrWhiteSpace(campaign.State))
                emailParts.Add($"<p>State: {campaign.State}</p><br/>");

            if (!string.IsNullOrWhiteSpace(campaign.ZipCode))
                emailParts.Add($"<p>Zip Code: {campaign.ZipCode}</p><br/>");

            emailParts.AddRange(new[]
            {
                $"<p>Investment Name: {campaign?.Name}</p><br/>",
                $"<p>About the Investment: {campaign?.Description}</p><br/>",
                $"<p>Investment website URL: {campaign?.Website}</p><br/>",
                $"<p>Type of Investment: {investmentTypeNamesString}</p><br/>",
                $"<p>Investment Terms: {campaign?.Terms}</p><br/>",
                $"<p>Fundraising Goal: {campaign?.Target}</p><br/>",
                $"<p>Expected Fundraising Close Date or Evergreen: {campaign?.FundraisingCloseDate}</p><br/>",
                $"<p>Investment Themes Covered: {themeNamesString}</p><br/>",
                $"<p>SDGs impacted by investment: {sdgNamesString}</p><br/>",
                $"<p>Have you received funding from Impact Assets before?: {campaign?.ImpactAssetsFundingStatus}</p><br/>",
                $"<p>Your role with the investment: {campaign?.InvestmentRole}</p><br/>"
            });

            var emailBody = $"<html><body>{string.Join("", emailParts)}</body></html>";

            await _mailService.SendMailAsync("ken@catacap.org", "New request to raise money on CataCap", "", emailBody);
        }

        private async Task SendCatacapAdminEmail(CampaignDto campaignDto)
        {
            var date = DateTime.Now.Date.ToString("M/d/yyyy");
            var subject = "New Investment live on Production";
            var body = $@"
                        <html>
                            <body>
                                <p>Hello Team!</p>
                                <br/>
                                <p>A new Investment was posted to Production on {date}: <strong>{campaignDto.Name}</strong>.</p>
                                <br/>
                                <p>Thanks.</p>
                            </body>
                        </html>";

            await _mailService.SendMailAsync("catacap-admin@catacap.org", subject, "", body);
        }

        [HttpGet("send-investment-qr-code-email")]
        public async Task<IActionResult> SendInvestmentQRCodeEmail(int id, string investmentTag)
        {
            // string subject = "🚀 Share Your Investment with the World – Your QR Code is Ready!";

            var investment = await _context.Campaigns.FirstOrDefaultAsync(x => x.Id == id);

            if (string.IsNullOrWhiteSpace(investment?.ContactInfoEmailAddress))
                return Ok(new { Success = false, Message = "You can’t send QR by email because your organizational email isn’t set up yet" });

            string? investmentUrl = !string.IsNullOrEmpty(investmentTag)
                                    ? investmentTag
                                    : !string.IsNullOrEmpty(investment.Property)
                                        ? $"{requestOrigin}/investments/{Uri.EscapeDataString(investment.Property)}"
                                        : null;

            if (string.IsNullOrWhiteSpace(investmentUrl))
                return Ok(new { Success = false, Message = "Failed to send email because investment URL is missing." });

            string fullName = investment.ContactInfoFullName ?? string.Empty;
            string[] parts = fullName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            string firstName = parts.Length > 0 ? parts[0] : string.Empty;

            using var qrGenerator = new QRCodeGenerator();
            using var qrCodeData = qrGenerator.CreateQrCode(investmentUrl, QRCodeGenerator.ECCLevel.Q);
            var qrCode = new PngByteQRCode(qrCodeData);
            byte[] qrBytes = qrCode.GetGraphic(20);

            //var body = $@"
            //            <html>
            //                <body>
            //                    <p>Hi {firstName},</p>
            //                    <p>Exciting news – your investment <b>{investment.Name}</b> is now live on CataCap! 🎉</p>
            //                    <p>To help you spread the word, we've generated a <b>QR code just for you </b>– it’s attached to this email and ready to go.</p>
            //                    <p>📲 Share it on socials, in emails, or at events – wherever you want to grow your support!</p>
            //                    <p>We’re cheering you on and can’t wait to see your fundraising take flight.</p>
            //                    <p>As always, the CataCap team is here if you need anything.</p>
            //                    <p>Onwards and upwards,</p>
            //                    <p style='margin-bottom: 0px;'><b>The CataCap Team</b></p>
            //                    <p style='margin-top: 0px; margin-bottom: 0px;'>🔗 <a href='https://www.linkedin.com/company/catacap-us/'>LinkedIn</a></p>
            //                    <p style='margin-top: 0px; margin-bottom: 0px;'>🌐 <a href='https://catacap.org/'>catacap.org</a></p>
            //                    <p style='margin-top: 0px;'>✉️ <a href='mailto:support@catacap.org'>support@catacap.org</a></p>
            //                    <p>—</p>
            //                    <p>Questions, feedback, or just want to say hi? Reach out to us anytime.</p>
            //                    <p>Don’t want to get these emails? <a href='{requestOrigin}/settings' target='_blank'>Unsubscribe</a>.</p>
            //                </body>
            //            </html>";

            var qrAttachment = new EmailAttachment(
                name: $"{investment.Name}.png",
                contentType: "image/png",
                content: BinaryData.FromBytes(qrBytes)
            );

            var variables = new Dictionary<string, string>
            {
                { "logoUrl", await _imageService.GetImageUrl() },
                { "firstName", firstName },
                { "investmentName", investment.Name! },
                { "unsubscribeUrl", $"{_appSecrets.RequestOrigin}/settings" }
            };

            _emailQueue.QueueEmail(async (sp) =>
            {
                var emailService = sp.GetRequiredService<IEmailTemplateService>();

                await emailService.SendTemplateEmailAsync(
                    EmailTemplateCategory.InvestmentQRCode,
                    investment.ContactInfoEmailAddress!.Trim().ToLower(),
                    variables,
                    attachments: new List<EmailAttachment> { qrAttachment }
                );
            });

            //_ = _mailService.SendMailAsync(investment!.ContactInfoEmailAddress!.Trim().ToLower(), subject, "", body, new List<EmailAttachment> { qrAttachment });

            return Ok(new { Success = true, Message = "Email sent successfully." });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteCampaign(int id)
        {
            var campaign = await _context.Campaigns.FirstOrDefaultAsync(x => x.Id == id);
            if (campaign == null)
                return NotFound();

            var recommendations = _context.Recommendations.Where(r => r.CampaignId == id);
            _context.Recommendations.RemoveRange(recommendations);

            var accountBalanceChangeLogs = _context.AccountBalanceChangeLogs.Where(r => r.CampaignId == id);
            _context.AccountBalanceChangeLogs.RemoveRange(accountBalanceChangeLogs);

            var userInvestments = _context.UserInvestments.Where(n => n.CampaignId == id);
            _context.UserInvestments.RemoveRange(userInvestments);

            var investmentNotes = _context.InvestmentNotes.Where(n => n.CampaignId == id);
            _context.InvestmentNotes.RemoveRange(investmentNotes);

            var disbursalRequests = _context.DisbursalRequest.Where(d => d.CampaignId == id);

            var disbursalRequestIds = disbursalRequests.Select(d => d.Id).ToList();

            var disbursalRequestNotes = _context.DisbursalRequestNotes.Where(d => disbursalRequestIds.Contains(d.DisbursalRequestId!.Value));
            _context.DisbursalRequestNotes.RemoveRange(disbursalRequestNotes);

            _context.DisbursalRequest.RemoveRange(disbursalRequests);

            _context.Campaigns.Remove(campaign);
            await _context.SaveChangesAsync();

            //BlockBlobClient tileImageBlockBlob = _blobContainerClient.GetBlockBlobClient(campaign.TileImageFileName);
            //BlockBlobClient imageBlockBlob = _blobContainerClient.GetBlockBlobClient(campaign.ImageFileName);
            //BlockBlobClient logoBlockBlob = _blobContainerClient.GetBlockBlobClient(campaign.LogoFileName);
            //BlockBlobClient pdfBlockBlob = _blobContainerClient.GetBlockBlobClient(campaign.PdfFileName);

            //await tileImageBlockBlob.DeleteIfExistsAsync();
            //await imageBlockBlob.DeleteIfExistsAsync();
            //await logoBlockBlob.DeleteIfExistsAsync();
            //await pdfBlockBlob.DeleteIfExistsAsync();

            return NoContent();
        }

        [HttpGet("portfolio")]
        public async Task<ActionResult<Portfolio>> GetPortfolio()
        {
            var identity = HttpContext.User.Identity as ClaimsIdentity;

            if (_context.Users == null || identity == null)
                return NotFound();

            var email = identity.Claims.FirstOrDefault(i => i.Type == ClaimTypes.Email)?.Value;

            if (email == null || email == string.Empty)
                return NotFound();

            var portfolio = new Portfolio();

            var user = await _context.Users.FirstOrDefaultAsync(i => i.Email == email);

            if (user == null)
                return NotFound();

            portfolio.AccountBalance = user?.AccountBalance;

            var groupAccountBalance = await _context.GroupAccountBalance
                                                    .Where(g => g.User != null
                                                            && g.User.Id == user!.Id)
                                                    .Select(g => (decimal?)g.Balance)
                                                    .SumAsync();
            
            if (groupAccountBalance != null)
                portfolio.GroupBalance = groupAccountBalance;

            var userRecommendations = await _context.Recommendations
                                                    .Where(i => i.UserEmail == email 
                                                            && (i.Status == "approved" || i.Status == "pending"))
                                                    .Include(item => item.Campaign)
                                                    .ToListAsync();

            List<RecommendationsDto> dataRecommendation = new List<RecommendationsDto>();

            if (userRecommendations.Count > 0)
            {
                for (int i = 0; i < userRecommendations.Count; i++)
                {
                    RecommendationsDto recommendationsDto = new RecommendationsDto();
                    recommendationsDto.Id = userRecommendations[i].Id;
                    recommendationsDto.UserEmail = userRecommendations[i].UserEmail;
                    recommendationsDto.CampaignId = userRecommendations[i].Campaign?.Id;
                    recommendationsDto.Amount = userRecommendations[i].Amount;
                    recommendationsDto.Status = userRecommendations[i].Status;
                    recommendationsDto.DateCreated = userRecommendations[i].DateCreated;
                    dataRecommendation.Add(recommendationsDto);
                }
            }

            if (dataRecommendation != null)
            {
                var campaignIds = dataRecommendation
                                    .Where(i => i.CampaignId != null)
                                    .Select(i => i.CampaignId)
                                    .ToList(); ;
                
                var data = await _context.Campaigns
                                         .Where(i => campaignIds.Contains(i.Id))
                                         .ToListAsync();
                
                var userCampaigns = _mapper.Map<List<CampaignDto>, List<Campaign>>(data);

                var userRecommendationBalances = await _context.Recommendations
                                                        .Where(x => x.Campaign != null && 
                                                                campaignIds.Contains(x.Campaign.Id) &&
                                                                x.Amount > 0 &&
                                                                x.UserEmail != null &&
                                                                (x.Status!.ToLower() == "approved" || x.Status.ToLower() == "pending"))
                                                        .GroupBy(x => x.Campaign!.Id)
                                                        .Select(g => new
                                                        {
                                                            CampaignId = g.Key!.Value,
                                                            CurrentBalance = g.Sum(i => i.Amount ?? 0),
                                                            NumberOfInvestors = g.Select(r => r.UserEmail).Distinct().Count()
                                                        })
                                                        .ToListAsync();

                foreach (var c in userCampaigns)
                {
                    var item = userRecommendationBalances.FirstOrDefault(i => i.CampaignId == c.Id);
                    if (item != null)
                    {
                        c.CurrentBalance = item.CurrentBalance + (c.AddedTotalAdminRaised ?? 0);
                        c.NumberOfInvestors = item.NumberOfInvestors;
                    }
                }

                portfolio.Recommendations = dataRecommendation;
                portfolio.Campaigns = userCampaigns.Where(c => c.Stage != InvestmentStage.ClosedNotInvested).ToList();
            }

            return portfolio;
        }

        private async Task<IEnumerable<CampaignCardDto>> GetCampaignsCardDto(string? sourcedBy = null)
        {
            if (_context.Campaigns == null)
            {
                return null!;
            }

            var sourcedByNamesList = sourcedBy?.ToLower().Split(',').Select(n => n.Trim()).ToList();

            var approvedBy = sourcedByNamesList == null || !sourcedByNamesList.Any()
                            ? new List<int>()
                            : await _context.ApprovedBy
                                            .Where(x => sourcedByNamesList.Contains(x.Name!.ToLower()))
                                            .Select(x => x.Id)
                                            .ToListAsync();

            var campaigns = await _context.Campaigns
                                            .Where(i => i.IsActive!.Value &&
                                                    (i.Stage == InvestmentStage.Public
                                                        || i.Stage == InvestmentStage.CompletedOngoing)
                                                    )
                                            .Include(i => i.GroupForPrivateAccess)
                                            .ToListAsync();

            if (approvedBy.Any())
            {
                campaigns = campaigns
                                .Where(c => !string.IsNullOrWhiteSpace(c.ApprovedBy) &&
                                            approvedBy.Any(id => c.ApprovedBy
                                                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                                .Select(s => s.Trim())
                                                .Where(s => int.TryParse(s, out _))
                                                .Select(int.Parse)
                                                .Contains(id)))
                                .ToList();
            }

            var data = campaigns
                              .Select(c => new
                              {
                                  Campaign = c,
                                  Recommendations = _context.Recommendations
                                                            .Where(r => r.Campaign != null &&
                                                                    r.Campaign.Id == c.Id &&
                                                                    (r.Status!.ToLower() == "approved" || r.Status.ToLower() == "pending") &&
                                                                    r.Amount > 0 &&
                                                                    r.UserEmail != null)
                                                            .GroupBy(r => r.Campaign!.Id)
                                                            .Select(g => new
                                                            {
                                                                CurrentBalance = g.Sum(r => r.Amount ?? 0),
                                                                NumberOfInvestors = g.Select(r => r.UserEmail!.ToLower().Trim()).Distinct().Count()
                                                            })
                                                            .FirstOrDefault()
                              })
                              .ToList();

            var result = data.Select(item =>
            {
                var campaignDto = _mapper.Map<CampaignCardDto>(item.Campaign);
                if (item.Recommendations != null)
                {
                    campaignDto.CurrentBalance = item.Recommendations.CurrentBalance + (item.Campaign.AddedTotalAdminRaised ?? 0);
                    campaignDto.NumberOfInvestors = item.Recommendations.NumberOfInvestors;
                }
                campaignDto.GroupForPrivateAccessDto = _mapper.Map<GroupDto>(item.Campaign.GroupForPrivateAccess);
                return campaignDto;
            }).ToList();

            return result;
        }

        private async Task<CampaignCardResponseDto> GetCampaignsCardDtov2(CampaignCardRequestDto requestDto)
        {
            int page = requestDto?.CurrentPage ?? 1;
            int pageSize = requestDto?.PerPage ?? 9;

            List<int> ParseCommaSeparatedIds(string? csv) =>
                    csv?.Split(',', StringSplitOptions.RemoveEmptyEntries)
                        .Select(s => int.TryParse(s.Trim(), out var id) ? id : 0)
                        .Where(id => id > 0)
                        .ToList() ?? new List<int>();

            var sourcedByNames = requestDto?.SourcedBy?
                                            .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                            .Select(x => x.Trim().ToLower())
                                            .ToList() ?? new List<string>();

            var sourcedByIds = sourcedByNames.Any()
                                ? await _context.ApprovedBy
                                    .Where(x => sourcedByNames.Contains(x.Name!.ToLower()))
                                    .Select(x => x.Id)
                                    .ToListAsync()
                                : new List<int>();

            var investmentTypeIds = ParseCommaSeparatedIds(requestDto?.InvestmentType);
            var specialFilterIds = ParseCommaSeparatedIds(requestDto?.SpecialFilter);

            bool isInvestmentTypeFilter = !investmentTypeIds.Contains(-1) || !investmentTypeIds.Contains(0);
            bool isSpecialFilter = !specialFilterIds.Contains(-1) || !specialFilterIds.Contains(0);

            bool isInvestmentTypeAll = requestDto?.InvestmentType?.Trim().Equals("All", StringComparison.OrdinalIgnoreCase) == true;

            var themeList = requestDto?.Theme?
                                       .ToLower().Split(',', StringSplitOptions.RemoveEmptyEntries)
                                       .Select(x => x.Trim())
                                       .ToList() ?? new List<string>();

            var themeIds = !themeList.Any() ? new List<int>() :
                            await _context.Themes
                                            .Where(x => themeList.Contains(x.Name!.ToLower()))
                                            .Select(x => x.Id)
                                            .ToListAsync();

            if (isInvestmentTypeFilter)
            {
                investmentTypeIds = await _context.InvestmentTypes
                                                  .Where(x => investmentTypeIds.Contains(x.Id))
                                                  .Select(x => x.Id)
                                                  .ToListAsync();
            }

            if (isSpecialFilter)
            {
                specialFilterIds = await _context.InvestmentTag
                                                 .Where(x => specialFilterIds.Contains(x.Id))
                                                 .Select(x => x.Id)
                                                 .ToListAsync();
            }

            var campaigns = await _context.Campaigns
                                      .Where(i => i.IsActive!.Value &&
                                                  (i.Stage == InvestmentStage.Public ||
                                                  i.Stage == InvestmentStage.CompletedOngoing) &&
                                                  i.GroupForPrivateAccessId == null)
                                      .ToListAsync();

            if (sourcedByIds.Any())
            {
                campaigns = campaigns
                        .Where(c =>
                            !string.IsNullOrEmpty(c.ApprovedBy) &&
                            c.ApprovedBy.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                        .Select(x => x.Trim())
                                        .Where(x => int.TryParse(x, out _))
                                        .Select(int.Parse)
                                        .Intersect(sourcedByIds)
                                        .Any())
                        .ToList();
            }

            if (themeIds.Any())
            {
                campaigns = campaigns
                        .Where(c =>
                            !string.IsNullOrEmpty(c.Themes) &&
                            c.Themes.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                    .Select(x => x.Trim())
                                    .Where(x => int.TryParse(x, out _))
                                    .Select(int.Parse)
                                    .Intersect(themeIds)
                                    .Any())
                        .ToList();
            }

            if (isInvestmentTypeFilter && investmentTypeIds.Any())
            {
                campaigns = campaigns
                        .Where(c =>
                            !string.IsNullOrEmpty(c.InvestmentTypes) &&
                            c.InvestmentTypes.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                    .Select(x => x.Trim())
                                    .Where(x => int.TryParse(x, out _))
                                    .Select(int.Parse)
                                    .Intersect(investmentTypeIds)
                                    .Any())
                        .ToList();
            }

            if (!isInvestmentTypeAll && isSpecialFilter && specialFilterIds.Any())
            {
                var investmentTagMapping = await _context.InvestmentTagMapping
                                                         .Where(x => specialFilterIds.Contains(x.TagId))
                                                         .Select(x => x.CampaignId)
                                                         .ToListAsync();

                campaigns = campaigns.Where(c => investmentTagMapping.Contains((int)c.Id!)).ToList();
            }

            if (!string.IsNullOrWhiteSpace(requestDto?.SearchValue))
            {
                string search = requestDto.SearchValue.Trim().ToLower();
                campaigns = campaigns.Where(c => c.Name!.Trim().ToLower().Contains(search)).ToList();
            }

            var totalCount = campaigns.Count();

            var campaignIds = campaigns.Select(c => c.Id).ToList();

            var recStats = await _context.Recommendations
                                         .Where(r =>
                                             campaignIds.Contains(r.CampaignId!.Value) &&
                                             (r.Status == "approved" || r.Status == "pending") &&
                                             r.Amount > 0 &&
                                             r.UserEmail != null)
                                         .GroupBy(r => r.CampaignId)
                                         .Select(g => new
                                         {
                                             CampaignId = g.Key!.Value,
                                             CurrentBalance = g.Sum(x => x.Amount ?? 0),
                                             NumberOfInvestors = g.Select(x => x.UserEmail!.ToLower()).Distinct().Count()
                                         })
                                         .ToDictionaryAsync(x => x.CampaignId);

            var avatars = await _context.Recommendations
                                        .Where(r =>
                                            campaignIds.Contains(r.CampaignId!.Value) &&
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

            var avatarLookup = avatars
                               .GroupBy(x => x.CampaignId!.Value)
                               .ToDictionary(
                                   g => g.Key,
                                   g => g.OrderByDescending(x => x.Id)
                                           .Select(x => x.PictureFileName)
                                           .Distinct()
                                           .Take(3)
                                           .ToList()
                               );

            var resultDtos = campaigns.Select(c =>
            {
                var dto = _mapper.Map<CampaignCardDtov2>(c);

                if (recStats.TryGetValue(c.Id!.Value, out var stats))
                {
                    dto.CurrentBalance = stats.CurrentBalance;
                    dto.NumberOfInvestors = stats.NumberOfInvestors;
                }
                
                dto.AddedTotalAdminRaised = c.AddedTotalAdminRaised ?? 0;
                dto.LatestInvestorAvatars = avatarLookup.ContainsKey(c.Id.Value) ? avatarLookup[c.Id.Value]! : new List<string>();

                return dto;
            })
            .OrderByDescending(c => c.FeaturedInvestment)
            .ThenByDescending(c => c.CurrentBalance)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

            return new CampaignCardResponseDto
            {
                Campaigns = resultDtos,
                TotalCount = totalCount
            };
        }

        private async Task<IEnumerable<CampaignCardDtov2>> GetTrendingCampaignsCardDto()
        {
            var campaigns = await _context.Campaigns
                                      .Where(i => i.IsActive!.Value &&
                                                  (i.Stage == InvestmentStage.Public ||
                                                  i.Stage == InvestmentStage.CompletedOngoing) &&
                                                  i.GroupForPrivateAccessId == null)
                                      .ToListAsync();

            var campaignIds = campaigns.Select(c => c.Id).ToList();

            var recStats = await _context.Recommendations
                                         .Where(r =>
                                             campaignIds.Contains(r.CampaignId!.Value) &&
                                             (r.Status == "approved" || r.Status == "pending") &&
                                             r.Amount > 0 &&
                                             r.UserEmail != null)
                                         .GroupBy(r => r.CampaignId)
                                         .Select(g => new
                                         {
                                             CampaignId = g.Key!.Value,
                                             CurrentBalance = g.Sum(x => x.Amount ?? 0),
                                             NumberOfInvestors = g.Select(x => x.UserEmail!.ToLower()).Distinct().Count()
                                         })
                                         .ToDictionaryAsync(x => x.CampaignId);

            var avatars = await _context.Recommendations
                                        .Where(r =>
                                            campaignIds.Contains(r.CampaignId!.Value) &&
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

            var avatarLookup = avatars
                               .GroupBy(x => x.CampaignId!.Value)
                               .ToDictionary(
                                   g => g.Key,
                                   g => g.OrderByDescending(x => x.Id)
                                           .Select(x => x.PictureFileName)
                                           .Distinct()
                                           .Take(3)
                                           .ToList()
                               );

            var resultDtos = campaigns.Select(c =>
            {
                var dto = _mapper.Map<CampaignCardDtov2>(c);

                if (recStats.TryGetValue(c.Id!.Value, out var stats))
                {
                    dto.CurrentBalance = stats.CurrentBalance + (c.AddedTotalAdminRaised ?? 0);
                    dto.NumberOfInvestors = stats.NumberOfInvestors;
                }

                dto.LatestInvestorAvatars = avatarLookup.ContainsKey(c.Id.Value) ? avatarLookup[c.Id.Value]! : new List<string>();

                return dto;
            })
            .OrderByDescending(c => c.NumberOfInvestors)
            .ThenByDescending(c => c.CurrentBalance)
            .Take(6)
            .ToList();

            return resultDtos;
        }

        [HttpGet("Export")]
        public async Task<IActionResult> ExportCampaigns()
        {
            var campaigns = await _context.Campaigns
                                            .Include(c => c.Groups)
                                            .Include(c => c.Recommendations)
                                            .ToListAsync();

            var campaignDtos = campaigns.Select(c => new ExportCampaignDto
            {
                Id = c.Id,
                Name = c.Name,
                Description = c.Description,
                Themes = c.Themes,
                ApprovedBy = c.ApprovedBy,
                SDGs = c.SDGs,
                InvestmentTypes = c.InvestmentTypes,
                Terms = c.Terms,
                MinimumInvestment = c.MinimumInvestment?.ToString(),
                Website = c.Website,
                ContactInfoFullName = c.ContactInfoFullName,
                ContactInfoAddress = c.ContactInfoAddress,
                ContactInfoAddress2 = c.ContactInfoAddress2,
                ContactInfoEmailAddress = c.ContactInfoEmailAddress,
                InvestmentInformationalEmail = c.InvestmentInformationalEmail,
                ContactInfoPhoneNumber = c.ContactInfoPhoneNumber,
                Country = c.Country,
                OtherCountryAddress = c.OtherCountryAddress,
                City = c.City,
                State = c.State,
                ZipCode = c.ZipCode,
                NetworkDescription = c.NetworkDescription,
                ImpactAssetsFundingStatus = c.ImpactAssetsFundingStatus,
                InvestmentRole = c.InvestmentRole,
                ReferredToCataCap = c.ReferredToCataCap,
                Target = c.Target,
                Status = c.Status,
                TileImageFileName = c.TileImageFileName,
                ImageFileName = c.ImageFileName,
                PdfFileName = c.PdfFileName,
                OriginalPdfFileName = c.OriginalPdfFileName,
                LogoFileName = c.LogoFileName,
                IsActive = c.IsActive,
                IsPartOfFund = c.IsPartOfFund,
                AssociatedFundId = c.AssociatedFundId,
                FeaturedInvestment = c.FeaturedInvestment,
                Stage = c.Stage,
                InvestmentTag = "",
                Property = c.Property,
                AddedTotalAdminRaised = c.AddedTotalAdminRaised,
                Groups = c.Groups.ToList(),
                Recommendations = c.Recommendations,
                GroupForPrivateAccess = c.GroupForPrivateAccess,
                EmailSends = c.EmailSends,
                FundraisingCloseDate = c.FundraisingCloseDate,
                MissionAndVision = c.MissionAndVision,
                PersonalizedThankYou = c.PersonalizedThankYou,
                ExpectedTotal = c.ExpectedTotal,
                InvestmentTypeCategory = c.InvestmentTypeCategory,
                EquityValuation = c.EquityValuation,
                EquitySecurityType = c.EquitySecurityType,
                FundTerm = c.FundTerm,
                EquityTargetReturn = c.EquityTargetReturn,
                DebtPaymentFrequency = c.DebtPaymentFrequency,
                DebtMaturityDate = c.DebtMaturityDate,
                DebtInterestRate = c.DebtInterestRate,
                CreatedDate = c.CreatedDate,
                LastNote = "",
                MetaTitle = c.MetaTitle,
                MetaDescription = c.MetaDescription
            }).ToList();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "Investments.xlsx";

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("Campaigns");

                string[] headers = new string[]
                {
                    "Id", "Name", "Description", "Themes", "Approved By", "SDGs", "Type of Investment",
                    "Terms", "Minimum Investment", "Website", "Contact Info FullName", "Contact Info Address1", "Contact Info Address2",
                    "Investment Owner email", "Investment Informational Email", "Contact Info Phone Number", "Country", "Other Country Address", "City", "State", "ZipCode", "Tell us a bit about your network", "ImpactAssetsFundingStatus",
                    "InvestmentRole", "How where you referred to CataCap?", "Target", "Status", "Tile Image File Name", "Image File Name", "Pdf File Name", "Original Pdf File Name",
                    "Logo File Name", "Is Active", "Is Part Of Fund", "Associated Fund", "Featured Investment", "Stage", "Special Filters", "Property", "Added Total Admin Raised",
                    "Groups", "Total Recommendations","Total Investors", "Group For Private Access", "Email Sends", "Expected Fundraising Close Date",
                    "Mission/Vision", "Personalized Thank You", "How much money do you already have in commitments for your investment",
                    "Investment Type", "Equity / Valuation", "Equity / Security Type", "Fund / Term", "Equity / Funds Target Return",
                    "Debt / Payment Frequency", "Debt / Maturity Date", "Debt / Interest Rate", "Created Date", "Last Note", "Meta Title", "Meta Description"
                };

                for (int i = 0; i < headers.Length; i++)
                {
                    worksheet.Cell(1, i + 1).Value = headers[i];
                    worksheet.Cell(1, i + 1).Style.Font.Bold = true;
                }

                for (int index = 0; index < campaignDtos.Count; index++)
                {
                    var dto = campaignDtos[index];
                    int row = index + 2;
                    int col = 1;

                    worksheet.Cell(row, col++).Value = dto.Id;
                    worksheet.Cell(row, col++).Value = dto.Name;
                    worksheet.Cell(row, col++).Value = dto.Description;
                    worksheet.Cell(row, col++).Value = dto.Themes;
                    worksheet.Cell(row, col++).Value = dto.ApprovedBy;
                    worksheet.Cell(row, col++).Value = dto.SDGs;
                    worksheet.Cell(row, col++).Value = dto.InvestmentTypes;
                    worksheet.Cell(row, col++).Value = dto.Terms;
                    worksheet.Cell(row, col++).Value = dto.MinimumInvestment;
                    worksheet.Cell(row, col++).Value = dto.Website;
                    worksheet.Cell(row, col++).Value = dto.ContactInfoFullName;
                    worksheet.Cell(row, col++).Value = dto.ContactInfoAddress;
                    worksheet.Cell(row, col++).Value = dto.ContactInfoAddress2;
                    worksheet.Cell(row, col++).Value = dto.ContactInfoEmailAddress;
                    worksheet.Cell(row, col++).Value = dto.InvestmentInformationalEmail;
                    worksheet.Cell(row, col++).Value = dto.ContactInfoPhoneNumber;
                    worksheet.Cell(row, col++).Value = dto.Country;
                    worksheet.Cell(row, col++).Value = dto.OtherCountryAddress;
                    worksheet.Cell(row, col++).Value = dto.City;
                    worksheet.Cell(row, col++).Value = dto.State;
                    worksheet.Cell(row, col++).Value = dto.ZipCode;
                    worksheet.Cell(row, col++).Value = dto.NetworkDescription;
                    worksheet.Cell(row, col++).Value = dto.ImpactAssetsFundingStatus;
                    worksheet.Cell(row, col++).Value = dto.InvestmentRole;
                    worksheet.Cell(row, col++).Value = dto.ReferredToCataCap;
                    worksheet.Cell(row, col++).Value = dto.Target;
                    worksheet.Cell(row, col++).Value = dto.Status;
                    worksheet.Cell(row, col++).Value = dto.TileImageFileName;
                    worksheet.Cell(row, col++).Value = dto.ImageFileName;
                    worksheet.Cell(row, col++).Value = dto.PdfFileName;
                    worksheet.Cell(row, col++).Value = dto.OriginalPdfFileName;
                    worksheet.Cell(row, col++).Value = dto.LogoFileName;
                    worksheet.Cell(row, col++).Value = dto.IsActive.HasValue && dto.IsActive.Value ? "Active" : "Inactive";
                    worksheet.Cell(row, col++).Value = dto.IsPartOfFund ? "Yes" : "No";

                    var campaign = await _context.Campaigns.FirstOrDefaultAsync(x => x.Id == dto.AssociatedFundId);
                    worksheet.Cell(row, col++).Value = dto.IsPartOfFund ? campaign?.Name : null;

                    worksheet.Cell(row, col++).Value = dto.FeaturedInvestment ? "Yes" : "No";

                    var description = (dto.Stage?.GetType()
                                         .GetField(dto.Stage?.ToString()!)
                                         ?.GetCustomAttributes(typeof(DescriptionAttribute), false)
                                         ?.FirstOrDefault() as DescriptionAttribute)?.Description
                                         ?? dto.Stage.ToString();

                    worksheet.Cell(row, col++).Value = description;

                    var investmentTags = await _context.InvestmentTagMapping.Where(x => x.CampaignId == dto.Id).ToListAsync();
                    var tagString = string.Empty;
                    if (investmentTags != null && investmentTags.Any())
                    {
                        var tagIds = investmentTags.Select(x => x.TagId).ToList();
                        var tags = await _context.InvestmentTag.Where(x => tagIds.Contains(x.Id)).ToListAsync();
                        tagString = string.Join(", ", tags.Select(x => x.Tag));
                    }

                    worksheet.Cell(row, col++).Value = !string.IsNullOrWhiteSpace(tagString) ? tagString : null;

                    worksheet.Cell(row, col++).Value = dto.Property;

                    var adminRaised = dto.AddedTotalAdminRaised ?? 0;
                    var adminRaisedCell = worksheet.Cell(row, col++);
                    adminRaisedCell.Value = adminRaised;
                    adminRaisedCell.Style.NumberFormat.Format = "$#,##0.00";

                    worksheet.Cell(row, col++).Value = string.Join(",", dto.Groups.Select(g => g.Name));

                    var recommendations = dto.Recommendations?
                                                    .Where(r => r != null &&
                                                            (r.Status?.Equals("approved", StringComparison.OrdinalIgnoreCase) == true ||
                                                            r.Status?.Equals("pending", StringComparison.OrdinalIgnoreCase) == true) &&
                                                            r.Campaign?.Id == dto.Id &&
                                                            r.Amount > 0 &&
                                                            !string.IsNullOrWhiteSpace(r.UserEmail))
                                                    .ToList();

                    var totalRecommendedAmount = recommendations?.Sum(r => r.Amount ?? 0) ?? 0;
                    var totalRecommendedAmountCell = worksheet.Cell(row, col++);
                    totalRecommendedAmountCell.Value = totalRecommendedAmount;
                    totalRecommendedAmountCell.Style.NumberFormat.Format = "$#,##0.00";

                    var totalInvestors = recommendations?.Select(r => r.UserEmail).Distinct().Count() ?? 0;
                    worksheet.Cell(row, col++).Value = totalInvestors;

                    worksheet.Cell(row, col++).Value = dto.GroupForPrivateAccess?.Name;
                    worksheet.Cell(row, col++).Value = dto.EmailSends.HasValue && dto.EmailSends.Value ? "Yes" : "No";
                    worksheet.Cell(row, col++).Value = dto.FundraisingCloseDate != null ? dto.FundraisingCloseDate : null;
                    worksheet.Cell(row, col++).Value = dto.MissionAndVision;
                    worksheet.Cell(row, col++).Value = dto.PersonalizedThankYou;

                    var expectedTotalCell = worksheet.Cell(row, col++);
                    expectedTotalCell.Value = dto.ExpectedTotal;
                    expectedTotalCell.Style.NumberFormat.Format = "$#,##0.00";

                    worksheet.Cell(row, col++).Value = dto.InvestmentTypeCategory;

                    var equityValuationCell = worksheet.Cell(row, col++);
                    equityValuationCell.Value = dto.EquityValuation;
                    equityValuationCell.Style.NumberFormat.Format = "$#,##0.00";

                    worksheet.Cell(row, col++).Value = dto.EquitySecurityType;
                    worksheet.Cell(row, col++).Value = dto.FundTerm?.ToString("MM-dd-yyyy");
                    worksheet.Cell(row, col++).Value = dto.EquityTargetReturn;
                    worksheet.Cell(row, col++).Value = dto.DebtPaymentFrequency;
                    worksheet.Cell(row, col++).Value = dto.DebtMaturityDate?.ToString("MM-dd-yyyy");
                    worksheet.Cell(row, col++).Value = dto.DebtInterestRate;
                    worksheet.Cell(row, col++).Value = dto.CreatedDate?.ToString("MM-dd-yyyy");

                    var note = await _context.InvestmentNotes
                                             .Where(x => x.CampaignId == dto.Id)
                                             .OrderByDescending(x => x.Id)
                                             .Select(x => x.Note)
                                             .FirstOrDefaultAsync() ?? null;

                    worksheet.Cell(row, col++).Value = note;

                    worksheet.Cell(row, col++).Value = dto.MetaTitle;
                    worksheet.Cell(row, col++).Value = dto.MetaDescription;
                }

                worksheet.Columns().AdjustToContents();

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    var content = stream.ToArray();
                    return File(content, contentType, fileName);
                }
            }
        }

        [HttpGet("export-investment-notes")]
        public async Task<IActionResult> ExportInvestmentNotes(int campaignId)
        {
            var investmentNotes = await _context.InvestmentNotes
                                                .Where(x => x.CampaignId == campaignId)
                                                .Include(x => x.Campaign)
                                                .Include(x => x.User)
                                                .OrderByDescending(x => x.Id)
                                                .ToListAsync();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "InvestmentNotes.xlsx";

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("InvestmentNotes");

                int row = 1;

                var titleRange = worksheet.Range(row, 1, row += 1, 5).Merge();
                titleRange.Value = "Investment Name: " + investmentNotes.FirstOrDefault()?.Campaign?.Name ?? "Investment Notes";
                titleRange.Style.Font.Bold = true;
                titleRange.Style.Font.FontSize = 13;
                titleRange.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                titleRange.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                row++;

                var headers = new[] { "Date", "Username", "From", "To", "Note" };
                for (int col = 0; col < headers.Length; col++)
                {
                    worksheet.Cell(row, col + 1).Value = headers[col];
                }

                var headerRow = worksheet.Row(row);
                headerRow.Style.Font.Bold = true;

                worksheet.Columns().Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;

                for (int index = 0; index < investmentNotes.Count; index++)
                {
                    var dto = investmentNotes[index];
                    int dataRow = row + 1 + index;
                    int col = 1;

                    worksheet.Cell(dataRow, col++).Value = dto.CreatedAt.ToString("MM-dd-yyyy");
                    worksheet.Cell(dataRow, col++).Value = dto.User?.UserName ?? "";
                    worksheet.Cell(dataRow, col++).Value = dto.OldStatus;
                    worksheet.Cell(dataRow, col++).Value = dto.NewStatus;
                    worksheet.Cell(dataRow, col++).Value = ConvertHtmlNoteToPlainText(dto.Note);
                }

                worksheet.Columns().AdjustToContents();

                foreach (var column in worksheet.Columns())
                {
                    column.Width += 10;
                }

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    return File(stream.ToArray(), contentType, fileName);
                }
            }
        }

        private static string ConvertHtmlNoteToPlainText(string? htmlNote)
        {
            if (string.IsNullOrWhiteSpace(htmlNote))
                return string.Empty;

            string result = System.Text.RegularExpressions.Regex.Replace(htmlNote, @"<(b|strong)>\s*(.*?)\s*<\/\1>", "@$2", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            result = System.Text.RegularExpressions.Regex.Replace(result, @"<[^>]+>", string.Empty);
            result = System.Net.WebUtility.HtmlDecode(result);
            return result.Trim();
        }

        [HttpGet("get-investments-notes")]
        public async Task<IActionResult> GetInvestmentNotes(int investmentId)
        {
            if (investmentId <= 0)
                return Ok(new { Success = false, Message = "Invalid investment id" });

            var notes = await _context.InvestmentNotes
                                        .Where(x => x.CampaignId == investmentId)
                                        .Select(x => new
                                        {
                                            x.Id,
                                            x.OldStatus,
                                            x.NewStatus,
                                            x.Note,
                                            x.User!.UserName,
                                            x.CreatedAt
                                        })
                                        .OrderByDescending(x => x.Id)
                                        .ToListAsync();

            if (notes.Any())
                return Ok(notes);

            return Ok(new { Success = false, Message = "Notes not found" });
        }

        [HttpGet("get-investment-document-url")]
        public IActionResult GetInvestmentDocumentUrl(string pdfFileName, string action, string? originalPdfFileName = null)
        {
            if (string.IsNullOrEmpty(action) || string.IsNullOrEmpty(pdfFileName))
                return Ok(new { Success = false, Message = "Parameters required." });

            BlockBlobClient blobClient = _blobContainerClient.GetBlockBlobClient(pdfFileName);
            var expiryTime = DateTimeOffset.UtcNow.AddMinutes(5);
            string? sasUri = null;

            switch (action)
            {
                case "open":
                    sasUri = blobClient.GenerateSasUri(Azure.Storage.Sas.BlobSasPermissions.Read, expiryTime).ToString();
                    break;

                case "download":
                    var sasBuilder = new BlobSasBuilder
                    {
                        BlobContainerName = blobClient.BlobContainerName,
                        BlobName = blobClient.Name,
                        Resource = "b",
                        ExpiresOn = expiryTime
                    };

                    sasBuilder.SetPermissions(BlobSasPermissions.Read);

                    string downloadFileName = !string.IsNullOrEmpty(originalPdfFileName) ? Uri.UnescapeDataString(originalPdfFileName) : pdfFileName;

                    sasBuilder.ContentDisposition = $"attachment; filename=\"{downloadFileName}\"";

                    var sasToken = sasBuilder.ToSasQueryParameters(new StorageSharedKeyCredential(blobClient.AccountName, "lazVWCLOK9dlE4IIie+X4RhxvssE4XzD/BX1+xbOaHFHOIHR9zhtm4gcEgPTr6aYVBorJuUMZ9Ap+AStrBzF6A==")).ToString();

                    var uriBuilder = new UriBuilder(blobClient.Uri)
                    {
                        Query = sasToken
                    };
                    sasUri = uriBuilder.Uri.ToString();
                    break;
            }

            if (sasUri == null)
                return BadRequest(new { Success = false, Message = "Failed to load document." });

            return Ok(new { Success = true, Message = sasUri });
        }

        [HttpPost("clone-investment")]
        public async Task<IActionResult> CloneInvestment(int campaignId, string campaignName)
        {
            campaignName = campaignName.Trim();
            if (!string.IsNullOrEmpty(campaignName))
            {
                bool nameExists = await _context.Campaigns.AnyAsync(x => x.Name!.Trim() == campaignName);

                if (nameExists)
                    return Ok(new { Success = false, Message = "Campaign name already exists." });
            }

            var campaign = await _context.Campaigns.FirstOrDefaultAsync(x => x.Id == campaignId);
            if (campaign == null)
                return Ok(new { Success = false, Message = "Campaign not found." });

            var property = campaignName?.ToLower();
            var withoutSpacesProperty = property?.Replace(" ", "");
            var updatedProperty = withoutSpacesProperty + $"-qbe-{DateTime.Now.Year}";

            int counter = 1;
            while (await _context.Campaigns.AnyAsync(x => x.Property == updatedProperty))
            {
                updatedProperty = withoutSpacesProperty + $"-qbe-{DateTime.Now.Year}-{counter}";
                counter++;
            }

            var createCampaign = new CampaignDto
            {
                Name = campaignName,
                Description = campaign?.Description,
                Themes = campaign?.Themes,
                ApprovedBy = campaign?.ApprovedBy,
                SDGs = campaign?.SDGs,
                InvestmentTypes = campaign?.InvestmentTypes,
                Terms = campaign?.Terms,
                MinimumInvestment = campaign?.MinimumInvestment,
                Website = campaign?.Website,
                NetworkDescription = campaign?.NetworkDescription,
                ContactInfoFullName = campaign?.ContactInfoFullName,
                ContactInfoAddress = campaign?.ContactInfoAddress,
                ContactInfoAddress2 = campaign?.ContactInfoAddress2,
                ContactInfoEmailAddress = null,
                InvestmentInformationalEmail = null,
                ContactInfoPhoneNumber = campaign?.ContactInfoPhoneNumber,
                Country = campaign?.Country,
                OtherCountryAddress = campaign?.OtherCountryAddress,
                City = campaign?.City,
                State = campaign?.State,
                ZipCode = campaign?.ZipCode,
                ImpactAssetsFundingStatus = campaign?.ImpactAssetsFundingStatus,
                InvestmentRole = campaign?.InvestmentRole,
                ReferredToCataCap = campaign?.ReferredToCataCap,
                Target = campaign?.Target,
                Status = "0",
                TileImageFileName = campaign?.TileImageFileName,
                ImageFileName = campaign?.ImageFileName,
                PdfFileName = campaign?.PdfFileName,
                OriginalPdfFileName = campaign?.OriginalPdfFileName,
                LogoFileName = campaign?.LogoFileName,
                IsActive = false,
                Stage = InvestmentStage.New,
                Property = updatedProperty,
                AddedTotalAdminRaised = 0,
                GroupForPrivateAccessId = null,
                FundraisingCloseDate = campaign?.FundraisingCloseDate,
                MissionAndVision = campaign?.MissionAndVision,
                PersonalizedThankYou = campaign?.PersonalizedThankYou,
                HasExistingInvestors = campaign?.HasExistingInvestors,
                ExpectedTotal = campaign?.ExpectedTotal,
                EmailSends = false,
                CreatedDate = DateTime.Now,
                ModifiedDate = DateTime.Now
            };
            _context.Campaigns.Add(createCampaign);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Investment cloned successfully." });
        }

        [HttpGet("get-all-investment-themes-list")]
        public async Task<IActionResult> GetAllThemesList()
        {
            var investmentThemes = await _context.Themes
                                                .Select(x => new { x.Id, x.Name, x.Mandatory })
                                                .OrderBy(x => x.Name)
                                                .ToListAsync();

            if (investmentThemes != null)
            {
                return Ok(investmentThemes);
            }

            return BadRequest(new { Success = false, Message = "No investment themes found." });
        }

        [HttpGet("get-all-investment-name-list")]
        public async Task<IActionResult> GetAllInvestmentNameList(int investmentStage, int investmentId)
        {
            var investmentTypes = await _context.InvestmentTypes.ToListAsync();

            if (investmentStage == 4)
            {
                var campaignList = await _context.Campaigns
                                                .Where(x => x.Stage != InvestmentStage.ClosedNotInvested && x.Name!.Trim() != string.Empty)
                                                .Select(x => new
                                                {
                                                    x.Id,
                                                    x.Name,
                                                    InvestmentTypeIds = x.InvestmentTypes
                                                })
                                                .OrderBy(x => x.Name)
                                                .ToListAsync();

                var result = campaignList.Select(c => new
                {
                    c.Id,
                    c.Name,
                    IsPrivateDebt = c.InvestmentTypeIds!
                                            .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                            .Select(id => int.Parse(id.Trim()))
                                            .Select(id => investmentTypes.FirstOrDefault(t => t.Id == id)?.Name)
                                            .Any(name => name != null && name.Contains("Private Debt"))
                }).ToList();

                return Ok(result);
            }
            else if (investmentStage == 3)
            {
                var campaignList = await _context.Campaigns
                                                .Where(x => x.Stage == InvestmentStage.ClosedInvested && x.Name!.Trim() != string.Empty)
                                                .Select(x => new
                                                {
                                                    x.Id,
                                                    x.Name
                                                })
                                                .OrderBy(x => x.Name)
                                                .ToListAsync();

                var result = campaignList.Select(c => new
                {
                    c.Id,
                    c.Name
                }).ToList();

                return Ok(result);
            }
            else if (investmentStage == 0)
            {
                var campaignList = await _context.Campaigns
                                                    .Where(x => x.Name!.Trim() != string.Empty && x.Id != investmentId)
                                                    .Select(x => new
                                                    {
                                                        x.Id,
                                                        x.Name
                                                    })
                                                    .OrderBy(x => x.Name)
                                                    .ToListAsync();

                var result = campaignList.Select(c => new
                {
                    c.Id,
                    c.Name
                }).ToList();

                return Ok(result);
            }
            else if (investmentStage == 10)
            {
                var campaignList = await _context.Campaigns
                                                .Where(x => (x.Stage == InvestmentStage.ClosedInvested
                                                                || x.Stage == InvestmentStage.CompletedOngoing
                                                                || x.Stage == InvestmentStage.CompletedOngoingPrivate)
                                                                && x.Name!.Trim() != string.Empty)
                                                .Select(x => new
                                                {
                                                    x.Id,
                                                    x.Name
                                                })
                                                .OrderBy(x => x.Name)
                                                .ToListAsync();

                var result = campaignList.Select(c => new
                {
                    c.Id,
                    c.Name
                }).ToList();

                return Ok(result);
            }

            return BadRequest(new { Success = false, Message = "Invalid investment stage." });
        }

        [HttpGet("get-all-investment-type-list")]
        public async Task<IActionResult> GetAllInvestmentTypeList()
        {
            var investmentTypes = await _context.InvestmentTypes
                                        .Select(i => new { i.Id, i.Name })
                                        .OrderBy(i => i.Name)
                                        .ToListAsync();

            investmentTypes.Add(new { Id = -1, Name = (string?)"Other" });

            if (investmentTypes != null)
            {
                return Ok(investmentTypes);
            }

            return BadRequest(new { Success = false, Message = "Invalid investment stage." });
        }

        [HttpPost("get-completed-investments-details")]
        public async Task<IActionResult> GetAllCompletedInvestmentsDetails([FromBody] CompletedInvestmentsRequestDto requestDto)
        {
            if (requestDto.InvestmentId <= 0)
            {
                return Ok(new { Success = false, Message = "InvestmentId is required." });
            }

            var campaign = await _context.Campaigns
                                            .Where(x => x.Id == requestDto.InvestmentId)
                                            .FirstOrDefaultAsync();

            var recommendations = await _context.Recommendations
                                            .Where(r =>
                                                    r != null &&
                                                    r.Campaign != null &&
                                                    (r.Status!.ToLower() == "approved" || r.Status.ToLower() == "pending") &&
                                                    r.Campaign.Id == requestDto.InvestmentId &&
                                                    r.Amount > 0 &&
                                                    !string.IsNullOrWhiteSpace(r.UserEmail))
                                            .ToListAsync();

            var totalApprovedInvestmentAmount = recommendations?.Where(r => r.Status!.ToLower() == "approved")
                                                                .Sum(r => r.Amount ?? 0) ?? 0;

            var totalPendingInvestmentAmount = recommendations?.Where(r => r.Status!.ToLower() == "pending")
                                                                .Sum(r => r.Amount ?? 0) ?? 0;

            var lastInvestmentDate = recommendations?
                                        .OrderByDescending(x => x.Id)
                                        .Select(x => x.DateCreated?.Date)
                                        .FirstOrDefault();

            CompletedInvestmentsResponseDto responseDto = new CompletedInvestmentsResponseDto
            {
                DateOfLastInvestment = lastInvestmentDate,
                TypeOfInvestmentIds = campaign?.InvestmentTypes,
                ApprovedRecommendationsAmount = totalApprovedInvestmentAmount,
                PendingRecommendationsAmount = totalPendingInvestmentAmount
            };

            if (responseDto != null)
            {
                return Ok(responseDto);
            }

            return Ok(new { Success = false, Message = "No records found for the selected investment." });
        }

        [HttpPost("save-completed-investments-details")]
        public async Task<IActionResult> SaveCompletedInvestmentsDetails([FromBody] CompletedInvestmentsRequestDto requestDto)
        {
            if (requestDto.InvestmentId <= 0)
                return Ok(new { Success = false, Message = "InvestmentId is required." });

            if (requestDto.TotalInvestmentAmount <= 0)
                return Ok(new { Success = false, Message = "Amount must be greater than zero." });

            if (string.IsNullOrEmpty(requestDto.InvestmentDetail))
                return Ok(new { Success = false, Message = "Investment detail is required." });

            if (requestDto.DateOfLastInvestment == null)
                return Ok(new { Success = false, Message = "Last investment date is required." });

            var campaign = await _context.Campaigns
                                            .Where(x => x.Id == requestDto.InvestmentId)
                                            .FirstOrDefaultAsync();

            var recommendations = await _context.Recommendations
                                            .Where(r =>
                                                    r != null &&
                                                    r.Campaign != null &&
                                                    (r.Status!.ToLower() == "approved" || r.Status.ToLower() == "pending") &&
                                                    r.Campaign.Id == requestDto.InvestmentId &&
                                                    r.Amount > 0 &&
                                                    !string.IsNullOrWhiteSpace(r.UserEmail))
                                            .ToListAsync();

            var totalInvestors = recommendations?.Select(r => r.UserEmail).Distinct().Count() ?? 0;

            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var userId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            var investmentTypeIds = requestDto.TypeOfInvestmentIds?
                                                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                                .Select(id => id.Trim())
                                                .Where(id => id != "-1")
                                                .ToList() ?? new List<string>();

            if (!string.IsNullOrWhiteSpace(requestDto.TypeOfInvestmentIds)
                && !string.IsNullOrWhiteSpace(requestDto.TypeOfInvestmentName)
                && requestDto.TypeOfInvestmentIds.Split(',').Any(id => id.Trim() == "-1"))
            {
                var investmentType = new InvestmentType
                {
                    Name = requestDto.TypeOfInvestmentName?.Trim()
                };

                _context.InvestmentTypes.Add(investmentType);
                await _context.SaveChangesAsync();

                investmentTypeIds.Add(investmentType.Id.ToString());
            }

            var updatedTypeOfInvestmentIds = string.Join(",", investmentTypeIds);

            var returnMaster = new CompletedInvestmentsDetails
            {
                DateOfLastInvestment = requestDto.DateOfLastInvestment,
                CampaignId = requestDto.InvestmentId,
                InvestmentDetail = requestDto.InvestmentDetail,
                Amount = requestDto.TotalInvestmentAmount,
                TypeOfInvestment = updatedTypeOfInvestmentIds,
                SiteConfigurationId = requestDto.TransactionTypeId,
                Donors = totalInvestors,
                Themes = campaign?.Themes,
                InvestmentVehicle = !string.IsNullOrWhiteSpace(requestDto.InvestmentVehicle) ? requestDto.InvestmentVehicle : null,
                CreatedBy = userId!,
                CreatedOn = DateTime.Now
            };
            await _context.CompletedInvestmentsDetails.AddAsync(returnMaster);
            await _context.SaveChangesAsync();

            if (!string.IsNullOrWhiteSpace(requestDto.Note))
            {
                var completedInvestmentNotes = new CompletedInvestmentNotes
                {
                    CompletedInvestmentId = returnMaster.Id,
                    CreatedBy = userId,
                    Note = requestDto.Note,
                    NewAmount = requestDto.TotalInvestmentAmount ?? 0m,
                    TransactionType = requestDto.TransactionTypeId,
                    CreatedAt = DateTime.Now.Date
                };
                await _context.CompletedInvestmentNotes.AddAsync(completedInvestmentNotes);
                await _context.SaveChangesAsync();
            }

            return Ok(new { Success = true, Message = "Investment details saved successfully." });
        }

        [HttpPut("update-completed-investments-details")]
        public async Task<IActionResult> UpdateCompletedInvestmentsDetails([FromBody] CompletedInvestmentsRequestDto requestDto)
        {
            if (requestDto.Id <= 0)
                return Ok(new { Success = false, Message = "Id is required." });

            var completedInvestmentsDetails = await _context.CompletedInvestmentsDetails.FirstOrDefaultAsync(x => x.Id == requestDto.Id);
            int? oldTransactionType = completedInvestmentsDetails!.SiteConfigurationId ?? null;
            decimal oldAmount = completedInvestmentsDetails!.Amount ?? 0m;

            if (completedInvestmentsDetails == null)
                return Ok(new { Success = false, Message = "Completed investments details not found." });

            var investmentTypeIds = requestDto.TypeOfInvestmentIds?
                                                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                                .Select(id => id.Trim())
                                                .Where(id => id != "-1")
                                                .ToList() ?? new List<string>();

            if (!string.IsNullOrWhiteSpace(requestDto.TypeOfInvestmentIds)
                && !string.IsNullOrWhiteSpace(requestDto.TypeOfInvestmentName)
                && requestDto.TypeOfInvestmentIds.Split(',').Any(id => id.Trim() == "-1"))
            {
                var investmentType = new InvestmentType
                {
                    Name = requestDto.TypeOfInvestmentName?.Trim()
                };

                _context.InvestmentTypes.Add(investmentType);
                await _context.SaveChangesAsync();

                investmentTypeIds.Add(investmentType.Id.ToString());
            }

            var updatedTypeOfInvestmentIds = string.Join(",", investmentTypeIds);

            completedInvestmentsDetails.DateOfLastInvestment = requestDto.DateOfLastInvestment;
            completedInvestmentsDetails.TypeOfInvestment = updatedTypeOfInvestmentIds;
            completedInvestmentsDetails.InvestmentDetail = requestDto.InvestmentDetail;
            completedInvestmentsDetails.SiteConfigurationId = requestDto.TransactionTypeId;
            completedInvestmentsDetails.Amount = requestDto.TotalInvestmentAmount;
            completedInvestmentsDetails.InvestmentVehicle = requestDto.InvestmentVehicle;
            completedInvestmentsDetails.ModifiedOn = DateTime.Now;
            await _context.SaveChangesAsync();

            var userId = User.FindFirstValue("id");
            if (!string.IsNullOrWhiteSpace(requestDto.Note))
            {
                var completedInvestmentNotes = new CompletedInvestmentNotes
                {
                    CompletedInvestmentId = completedInvestmentsDetails.Id,
                    CreatedBy = userId,
                    Note = requestDto.Note,
                    OldAmount = oldAmount,
                    NewAmount = requestDto.TotalInvestmentAmount ?? 0m,
                    TransactionType = requestDto.TransactionTypeId,
                    CreatedAt = DateTime.Now.Date
                };
                await _context.CompletedInvestmentNotes.AddAsync(completedInvestmentNotes);
                await _context.SaveChangesAsync();
            }

            return Ok(new { Success = true, Message = "Investment details updated successfully." });
        }

        [HttpPost("get-completed-investments-history")]
        public async Task<IActionResult> GetAllCompletedInvestmentsHistory([FromBody] CompletedInvestmentsPaginationDto requestDto)
        {
            var selectedThemeIds = ParseCommaSeparatedIds(requestDto!.ThemesId);
            var selectedInvestmentTypeIds = ParseCommaSeparatedIds(requestDto.InvestmentTypeId);

            var themes = await _context.Themes.ToListAsync();
            var investmentTypes = await _context.InvestmentTypes.ToListAsync();

            var completedDetails = await _context.CompletedInvestmentsDetails
                                                    .Include(x => x.Campaign)
                                                    .Include(x => x.SiteConfiguration)
                                                    .ToListAsync();

            var completedNotes = await _context.CompletedInvestmentNotes
                                                .Where(x => x.CompletedInvestmentId != null)
                                                .Select(x => x.CompletedInvestmentId!.Value)
                                                .Distinct()
                                                .ToListAsync();

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

            var userEmails = usersQuery.Select(u => u.Email);

            var recommendations = await _context.Recommendations
                                                .Where(r =>
                                                        userEmails.Contains(r.UserEmail!) &&
                                                        r != null &&
                                                        r.Campaign != null &&
                                                        (r.Status!.ToLower() == "approved" 
                                                            || r.Status.ToLower() == "pending") 
                                                            && r.Amount > 0 &&
                                                        !string.IsNullOrWhiteSpace(r.UserEmail))
                                                .ToListAsync();

            //var totalInvestors = recommendations?.Select(r => r.UserEmail?.ToLower().Trim()).Distinct().Count() ?? 0;
            var totalInvestors = completedDetails.Select(x => x.Donors).Sum();
            var totalInvestmentAmount = recommendations?.Sum(r => r.Amount ?? 0) ?? 0;

            int completedCount = completedDetails.Count;

            string lastCompletedDate = completedDetails
                                        .Where(x => x.DateOfLastInvestment.HasValue)
                                        .OrderByDescending(x => x.DateOfLastInvestment!.Value)
                                        .Select(x => DateOnly.FromDateTime(x.DateOfLastInvestment!.Value).ToString("MM/dd/yyyy"))
                                        .FirstOrDefault() ?? string.Empty;

            var campaignIds = completedDetails.Select(c => c.CampaignId).ToList();

            var recStats = await _context.Recommendations
                                            .Where(r =>
                                                campaignIds.Contains(r.CampaignId!.Value) &&
                                                (r.Status == "approved" || r.Status == "pending") &&
                                                r.Amount > 0 &&
                                                r.UserEmail != null)
                                            .GroupBy(r => r.CampaignId)
                                            .Select(g => new
                                            {
                                                CampaignId = g.Key!.Value,
                                                CurrentBalance = g.Sum(x => x.Amount ?? 0),
                                                NumberOfInvestors = g.Select(x => x.UserEmail!.ToLower()).Distinct().Count()
                                            })
                                            .ToDictionaryAsync(x => x.CampaignId);

            var avatars = await _context.Recommendations
                                        .Where(r =>
                                            campaignIds.Contains(r.CampaignId!.Value) &&
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

            var avatarLookup = avatars
                                .GroupBy(x => x.CampaignId!.Value)
                                .ToDictionary(
                                    g => g.Key,
                                    g => g.OrderByDescending(x => x.Id)
                                            .Select(x => x.PictureFileName)
                                            .Distinct()
                                            .Take(3)
                                            .ToList()
                                );

            dynamic response = new ExpandoObject();
                
            var completedInvestmentsHistory = completedDetails
                                                .Select(x =>
                                                {
                                                    var campaign = x.Campaign;

                                                    var themeIds = ParseCommaSeparatedIds(campaign?.Themes);
                                                    var invTypeIds = ParseCommaSeparatedIds(x.TypeOfInvestment);

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

                                                    var dto = new CompletedInvestmentsHistoryResponseDto
                                                    {
                                                        Id = x.Id,
                                                        DateOfLastInvestment = x.DateOfLastInvestment,
                                                        Name = campaign?.Name,
                                                        CataCapFund = _context.Campaigns
                                                                                .Where(c => c.Id == campaign!.AssociatedFundId)
                                                                                .Select(c => c.Name)
                                                                                .FirstOrDefault(),
                                                        TileImageFileName = campaign!.TileImageFileName,
                                                        Description = campaign.Description,
                                                        Target = campaign.Target,
                                                        InvestmentDetail = x.InvestmentDetail,
                                                        TransactionType = x.SiteConfiguration?.Id,
                                                        Stage = (campaign.Stage?.GetType()
                                                                .GetField(campaign.Stage.ToString()!)?
                                                                .GetCustomAttributes(typeof(DescriptionAttribute), false)?
                                                                .FirstOrDefault() as DescriptionAttribute)?.Description
                                                                ?? campaign.Stage.ToString(),
                                                        TotalInvestmentAmount = Math.Round(x.Amount ?? 0, 0),
                                                        TypeOfInvestment = string.Join(", ", investmentTypesNames),
                                                        Donors = x.Donors,
                                                        InvestmentVehicle = x.InvestmentVehicle,
                                                        Property = campaign.Property,
                                                        Themes = string.Join(", ", themeNames),
                                                        HasNotes = completedNotes.Contains(x.Id),
                                                        ApprovedRecommendationsAmount = _context.Recommendations
                                                                                                .Where(r =>
                                                                                                    r.CampaignId == campaign.Id &&
                                                                                                    r.Status!.ToLower() == "approved" &&
                                                                                                    r.Amount > 0)
                                                                                                .Sum(r => r.Amount ?? 0),
                                                        LatestInvestorAvatars = avatarLookup.ContainsKey(campaign.Id!.Value)
                                                                                ? avatarLookup[campaign.Id.Value]!
                                                                                : new List<string>()
                                                    };

                                                    if (recStats.TryGetValue(campaign.Id!.Value, out var stats))
                                                    {
                                                        dto.CurrentBalance = stats.CurrentBalance + (campaign.AddedTotalAdminRaised ?? 0);
                                                        dto.NumberOfInvestors = stats.NumberOfInvestors;
                                                    }

                                                    return new
                                                    {
                                                        x.CreatedOn,
                                                        ThemeIds = themeIds,
                                                        InvestmentTypeIds = invTypeIds,
                                                        Dto = dto
                                                    };
                                                })
                                                .Where(x =>
                                                    (selectedThemeIds?.Count == 0 || x.ThemeIds.Any(id => selectedThemeIds!.Contains(id))) &&
                                                    (selectedInvestmentTypeIds?.Count == 0 || x.InvestmentTypeIds.Any(id => selectedInvestmentTypeIds!.Contains(id))) &&
                                                    (string.IsNullOrEmpty(requestDto.SearchValue) ||
                                                        (!string.IsNullOrEmpty(x.Dto.Name) && x.Dto.Name.Contains(requestDto.SearchValue, StringComparison.OrdinalIgnoreCase)) ||
                                                        (!string.IsNullOrEmpty(x.Dto.InvestmentDetail) && x.Dto.InvestmentDetail.Contains(requestDto.SearchValue, StringComparison.OrdinalIgnoreCase)))
                                                )
                                                .ToList();

            bool isAsc = requestDto?.SortDirection?.ToLower() == "asc";
            string? sortField = requestDto?.SortField?.ToLower();

            completedInvestmentsHistory = sortField switch
            {
                "dateoflastinvestment" => isAsc
                    ? completedInvestmentsHistory.OrderBy(x => x.Dto.DateOfLastInvestment).ToList()
                    : completedInvestmentsHistory.OrderByDescending(x => x.Dto.DateOfLastInvestment).ToList(),

                "fund" => isAsc
                    ? completedInvestmentsHistory.OrderBy(x => x.Dto.CataCapFund).ToList()
                    : completedInvestmentsHistory.OrderByDescending(x => x.Dto.CataCapFund).ToList(),

                "investmentname" => isAsc
                    ? completedInvestmentsHistory.OrderBy(x => x.Dto.Name).ToList()
                    : completedInvestmentsHistory.OrderByDescending(x => x.Dto.Name).ToList(),

                "investmentdetail" => isAsc
                    ? completedInvestmentsHistory.OrderBy(x => x.Dto.InvestmentDetail).ToList()
                    : completedInvestmentsHistory.OrderByDescending(x => x.Dto.InvestmentDetail).ToList(),

                "totalinvestmentamount" => isAsc
                    ? completedInvestmentsHistory.OrderBy(x => x.Dto.TotalInvestmentAmount).ToList()
                    : completedInvestmentsHistory.OrderByDescending(x => x.Dto.TotalInvestmentAmount).ToList(),

                "donors" => isAsc
                    ? completedInvestmentsHistory.OrderBy(x => x.Dto.Donors).ToList()
                    : completedInvestmentsHistory.OrderByDescending(x => x.Dto.Donors).ToList(),

                "typeofinvestment" => isAsc
                    ? completedInvestmentsHistory.OrderBy(x => x.Dto.TypeOfInvestment).ToList()
                    : completedInvestmentsHistory.OrderByDescending(x => x.Dto.TypeOfInvestment).ToList(),

                "themes" => isAsc
                    ? completedInvestmentsHistory.OrderBy(x => x.Dto.Themes).ToList()
                    : completedInvestmentsHistory.OrderByDescending(x => x.Dto.Themes).ToList(),

                _ => completedInvestmentsHistory.OrderByDescending(x => x.CreatedOn).ThenBy(x => x.Dto.Name).ToList()
            };

            response.totalCount = completedInvestmentsHistory.Count;

            int currentPage = requestDto?.CurrentPage.GetValueOrDefault() ?? 0;
            int perPage = requestDto?.PerPage.GetValueOrDefault() ?? 0;

            bool hasPagination = currentPage > 0 && perPage > 0;

            if (hasPagination)
                response.items = completedInvestmentsHistory
                                .Skip((currentPage - 1) * perPage)
                                .Take(perPage)
                                .Select(x => x.Dto)
                                .ToList();
            else
                response.items = completedInvestmentsHistory.Select(x => x.Dto).ToList();

            response.completedInvestments = completedCount;
            response.totalInvestmentAmount = Math.Round(totalInvestmentAmount, 0);
            response.totalInvestors = totalInvestors;
            response.lastCompletedInvestmentsDate = lastCompletedDate;

            if (response.totalCount == 0)
                response.message = "No records found for completed investments.";

            return Ok(response);
        }

        [HttpPut("update-completed-investments-notes")]
        public async Task<IActionResult> UpdateCompletedInvestmentsNotes([FromBody] CompletedInvestmentsNoteRequestDto requestDto)
        {
            if (requestDto.CompletedInvestmentNoteId <= 0)
                return Ok(new { Success = false, Message = "Completed investment note id is required." });

            var completedInvestmentsNote = await _context.CompletedInvestmentNotes.FirstOrDefaultAsync(x => x.Id == requestDto.CompletedInvestmentNoteId);

            if (completedInvestmentsNote == null)
                return Ok(new { Success = false, Message = "Record not found." });

            var previousRecord = await _context.CompletedInvestmentNotes
                                                .Where(x => x.CompletedInvestmentId == completedInvestmentsNote!.CompletedInvestmentId
                                                        && x.Id < completedInvestmentsNote.Id)
                                                .OrderByDescending(x => x.Id)
                                                .FirstOrDefaultAsync();

            decimal oldAmount = previousRecord?.NewAmount ?? 0m;

            var userId = User.FindFirstValue("id");

            completedInvestmentsNote.CreatedBy = userId;
            completedInvestmentsNote.Note = requestDto.Note;
            completedInvestmentsNote.OldAmount = oldAmount;
            completedInvestmentsNote.NewAmount = requestDto.Amount;
            completedInvestmentsNote.TransactionType = requestDto.TransactionTypeId;
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Investment note updated successfully." });
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

        [HttpGet("get-completed-investments-notes")]
        public async Task<IActionResult> GetCompletedInvestmentsNotes(int completedInvestmentId)
        {
            if (completedInvestmentId <= 0)
                return Ok(new { Success = false, Message = "Invalid completed investment id" });

            var notes = await _context.CompletedInvestmentNotes
                                        .Where(x => x.CompletedInvestmentId == completedInvestmentId)
                                        .Select(x => new
                                        {
                                            x.Id,
                                            x.User!.UserName,
                                            x.OldAmount,
                                            x.NewAmount,
                                            x.TransactionType,
                                            x.CreatedAt,
                                            x.Note
                                        })
                                        .OrderByDescending(x => x.Id)
                                        .ToListAsync();

            if (notes.Any())
                return Ok(notes);

            return Ok(new { Success = false, Message = "Notes not found" });
        }

        [HttpGet("export-completed-investments")]
        public async Task<IActionResult> ExportCompletedInvestments()
        {
            var themes = await _context.Themes.ToListAsync();
            var investmentTypes = await _context.InvestmentTypes.ToListAsync();

            var query = await _context.CompletedInvestmentsDetails
                                        .Include(x => x.Campaign)
                                        .Include(x => x.SiteConfiguration)
                                        .ToListAsync();

            var completedInvestments = query
                                        .Select(x =>
                                        {
                                            List<int> themeIds = x.Campaign?.Themes?
                                                                            .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                                                            .Select(id => int.TryParse(id.Trim(), out var val) ? val : (int?)null)
                                                                            .Where(id => id.HasValue)
                                                                            .Select(id => id!.Value)
                                                                            .ToList() ?? new List<int>();

                                            var themeNames = themes
                                                                .Where(t => themeIds.Contains(t.Id))
                                                                .Select(t => t.Name)
                                                                .ToList();

                                            List<int> investmentTypesIds = x.TypeOfInvestment?
                                                                                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                                                                .Select(id => int.TryParse(id.Trim(), out var val) ? val : (int?)null)
                                                                                .Where(id => id.HasValue)
                                                                                .Select(id => id!.Value)
                                                                                .ToList() ?? new List<int>();

                                            var investmentTypesNames = investmentTypes
                                                                            .Where(t => investmentTypesIds.Contains(t.Id))
                                                                            .Select(t => t.Name)
                                                                            .ToList();

                                            return new
                                            {
                                                CreatedOn = x.CreatedOn,
                                                Dto = new CompletedInvestmentsHistoryResponseDto
                                                {
                                                    DateOfLastInvestment = x.DateOfLastInvestment,
                                                    Name = x.Campaign?.Name,
                                                    Stage = (x.Campaign!.Stage?.GetType()
                                                             .GetField(x.Campaign.Stage?.ToString()!)
                                                             ?.GetCustomAttributes(typeof(DescriptionAttribute), false)
                                                             ?.FirstOrDefault() as DescriptionAttribute)?.Description
                                                             ?? x.Campaign.Stage.ToString(),
                                                    CataCapFund = _context.Campaigns
                                                                          .Where(c => c.Id == x.Campaign!.AssociatedFundId)
                                                                          .Select(c => c.Name)
                                                                          .FirstOrDefault(),
                                                    InvestmentDetail = x.InvestmentDetail,
                                                    TotalInvestmentAmount = x.Amount,
                                                    TransactionTypeValue = x.SiteConfiguration?.Value,
                                                    TypeOfInvestment = string.Join(", ", investmentTypesNames),
                                                    Donors = x.Donors,
                                                    InvestmentVehicle = x.InvestmentVehicle,
                                                    Themes = string.Join(", ", themeNames)
                                                }
                                            };
                                        })
                                        .OrderByDescending(x => x.CreatedOn)
                                        .ThenBy(x => x.Dto.Name)
                                        .Select(x => x.Dto)
                                        .ToList();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "CompletedInvestmentsDetails.xlsx";

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("Returns");

                var headers = new[]
                {
                    "Date Of Last Investment", "CataCap Investment", "Stage", "CataCap Fund", "Investment Detail", "Amount", "Transaction Type","Type Of Investment", "Donors", "Investment Vehicle", "Themes"
                };

                for (int col = 0; col < headers.Length; col++)
                {
                    worksheet.Cell(1, col + 1).Value = headers[col];
                }

                var headerRow = worksheet.Row(1);
                headerRow.Style.Font.Bold = true;

                worksheet.Columns().Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;

                for (int index = 0; index < completedInvestments.Count; index++)
                {
                    var dto = completedInvestments[index];
                    int row = index + 2;
                    int col = 1;

                    worksheet.Cell(row, col++).Value = dto.DateOfLastInvestment;
                    worksheet.Cell(row, col++).Value = dto.Name;
                    worksheet.Cell(row, col++).Value = dto.Stage;
                    worksheet.Cell(row, col++).Value = dto.CataCapFund;
                    worksheet.Cell(row, col++).Value = dto.InvestmentDetail;

                    var totalInvestmentAmountCell = worksheet.Cell(row, col++);
                    totalInvestmentAmountCell.Value = $"${Convert.ToDecimal(dto.TotalInvestmentAmount):N2}";
                    totalInvestmentAmountCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;

                    worksheet.Cell(row, col++).Value = dto.TransactionTypeValue;
                    worksheet.Cell(row, col++).Value = dto.TypeOfInvestment;
                    worksheet.Cell(row, col++).Value = dto.Donors;
                    worksheet.Cell(row, col++).Value = dto.InvestmentVehicle;
                    worksheet.Cell(row, col++).Value = dto.Themes;
                }
                worksheet.Columns().AdjustToContents();

                foreach (var column in worksheet.Columns())
                {
                    column.Width += 10;
                }

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    return File(stream.ToArray(), contentType, fileName);
                }
            }
        }

        [HttpPost("calculate-returns")]
        public async Task<IActionResult> CalculateReturns([FromBody] ReturnCalculationRequestDto requestDto)
        {
            if (requestDto.InvestmentId <= 0)
                return Ok(new { Success = false, Message = "InvestmentId is required." });
            if (requestDto.ReturnAmount <= 0)
                return Ok(new { Success = false, Message = "Return amount must be greater than zero." });

            var campaignName = await _context.Campaigns.Where(x => x.Id == requestDto.InvestmentId).Select(x => x.Name).SingleOrDefaultAsync();

            var activeUsers = await _context.Users.Where(x => x.IsActive == true).Select(x => x.Email).ToListAsync();

            var recommendations = await _context.Recommendations
                                                .Where(x => x.Campaign != null
                                                            && x.Campaign.Id == requestDto.InvestmentId
                                                            && x.Status!.ToLower() == "approved"
                                                            && activeUsers.Contains(x.UserEmail!))
                                                .ToListAsync();

            decimal totalInvestment = recommendations.Sum(x => x.Amount ?? 0);

            var results = (from r in recommendations
                            join u in _context.Users on r.UserEmail?.ToLower() equals u.Email.ToLower()
                            let userPercentage = (Convert.ToDecimal(r.Amount) / totalInvestment)
                            select new ReturnCalculationResponseDto
                            {
                                InvestmentName = campaignName,
                                FirstName = u.FirstName,
                                LastName = u.LastName,
                                Email = r.UserEmail,
                                InvestmentAmount = Convert.ToDecimal(r.Amount),
                                Percentage = Math.Round(userPercentage * 100m, 2),
                                ReturnedAmount = Math.Round(userPercentage * requestDto.ReturnAmount, 2)
                            })
                            .OrderByDescending(x => x.InvestmentAmount)
                            .ToList();

            int totalCount = results.Count;

            if (requestDto.CurrentPage.HasValue && requestDto.PerPage.HasValue)
            {
                int currentPage = requestDto.CurrentPage ?? 1;
                int perPage = requestDto.PerPage ?? 10;

                results = results.Skip((currentPage - 1) * perPage).Take(perPage).ToList();
            }

            if (totalCount > 0)
            {
                dynamic response = new ExpandoObject();
                response.items = results;
                response.totalCount = totalCount;
                response.investmentName = campaignName;
                response.investmentId = requestDto.InvestmentId;
                return Ok(response);
            }

            return Ok(new { Success = false, Message = "No records found for the selected investment." });
        }

        [HttpPost("save-returns")]
        public async Task<IActionResult> SaveReturns([FromBody] ReturnCalculationRequestDto requestDto)
        {
            if (requestDto.InvestmentId <= 0)
                return Ok(new { Success = false, Message = "InvestmentId is required." });
            if (requestDto.ReturnAmount <= 0)
                return Ok(new { Success = false, Message = "Return amount must be greater than zero." });
            if (string.IsNullOrEmpty(requestDto.MemoNote))
                return Ok(new { Success = false, Message = "Admin memo is required." });

            //var allEmailTasks = new List<Task>();

            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var userId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            var actionResult = await CalculateReturns(requestDto) as OkObjectResult;

            if (actionResult == null || actionResult.Value == null)
                return BadRequest(new { Success = false, Message = "Failed to calculate returns." });

            dynamic responseDto = actionResult.Value;

            var items = (IEnumerable<ReturnCalculationResponseDto>)responseDto.items;

            var returnMaster = new ReturnMaster
            {
                CampaignId = requestDto.InvestmentId,
                CreatedBy = userId!,
                ReturnAmount = requestDto.ReturnAmount,
                TotalInvestors = items.Count(),
                TotalInvestmentAmount = Convert.ToDecimal(items.Sum(x => x.InvestmentAmount)),
                MemoNote = !string.IsNullOrEmpty(requestDto.MemoNote) ? requestDto.MemoNote : null,
                Status = "Accepted",
                PrivateDebtStartDate = requestDto.PrivateDebtStartDate,
                PrivateDebtEndDate = requestDto.PrivateDebtEndDate,
                PostDate = DateTime.Now,
                CreatedOn = DateTime.Now
            };

            _context.ReturnMasters.Add(returnMaster);
            await _context.SaveChangesAsync();

            foreach (var item in items)
            {
                var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == item.Email);

                var returnDetail = new ReturnDetails
                {
                    ReturnMasterId = returnMaster.Id,
                    UserId = user?.Id!,
                    InvestmentAmount = Convert.ToDecimal(item.InvestmentAmount),
                    PercentageOfTotalInvestment = Convert.ToDecimal(item.Percentage),
                    ReturnAmount = Convert.ToDecimal(item.ReturnedAmount)
                };

                _context.ReturnDetails.Add(returnDetail);

                await UpdateUsersWalletBalance(user!, Convert.ToDecimal(item.ReturnedAmount), returnMaster.Campaign?.Name!, returnMaster.Campaign?.Id, returnMaster.Id);

                string request = HttpContext.Request.Headers["Origin"].ToString();
                string formattedAmount = string.Format(CultureInfo.GetCultureInfo("en-US"), "${0:N2}", item.ReturnedAmount);

                var variables = new Dictionary<string, string>
                {
                    { "logoUrl", await _imageService.GetImageUrl() },
                    { "firstName", user!.FirstName ?? "" },
                    { "lastName", user.LastName ?? "" },
                    { "investmentName", item.InvestmentName ?? "" },
                    { "returnedAmount", formattedAmount },
                    { "unsubscribeUrl", $"{_appSecrets.RequestOrigin}/settings" }
                };

                _emailQueue.QueueEmail(async (sp) =>
                {
                    var emailService = sp.GetRequiredService<IEmailTemplateService>();

                    await emailService.SendTemplateEmailAsync(
                        EmailTemplateCategory.InvestmentActivityNotification,
                        user.Email,
                        variables
                    );
                });

                //allEmailTasks.Add(SendReturnsEmail(user!.Email, user.FirstName, user.LastName, item.InvestmentName, Convert.ToDecimal(item.ReturnedAmount)));
            }
            await _context.SaveChangesAsync();
            await _repository.SaveAsync();

            //_ = Task.WhenAll(allEmailTasks);

            return Ok(new { Success = true, Message = "Returns submitted successfully." });
        }
        private async Task UpdateUsersWalletBalance(User user, decimal amount, string investmentName, int? campaignId, int ReturnMastersId)
        {
            var accountBalanceChangeLog = new AccountBalanceChangeLog
            {
                UserId = user.Id,
                PaymentType = $"Return credited, id = {ReturnMastersId}",
                OldValue = user.AccountBalance,
                UserName = user.UserName,
                NewValue = user.AccountBalance + amount,
                InvestmentName = investmentName,
                CampaignId = campaignId
            };

            await _context.AccountBalanceChangeLogs.AddAsync(accountBalanceChangeLog);

            user.AccountBalance += amount;

            await _repository.UserAuthentication.UpdateUser(user);
        }
        private async Task SendReturnsEmail(string emailTo, string? firstName, string? lastName, string? investmentName, decimal returnedAmount)
        {
            string request = HttpContext.Request.Headers["Origin"].ToString();
            string logoUrl = $"{request}/logo-for-email.png";
            string logoHtml = $@"
                                <div style='text-align: center;'>
                                    <a href='https://catacap.org' target='_blank'>
                                        <img src='{logoUrl}' alt='CataCap Logo' width='300' height='150' />
                                    </a>
                                </div>";

            string formattedAmount = string.Format(CultureInfo.GetCultureInfo("en-US"), "${0:N2}", returnedAmount);

            string subject = "You Got Funded! Your CataCap Campaign Is Growing";

            var body = logoHtml + $@"
                                    <html>
                                        <body>
                                            <p><b>Hi {firstName} {lastName},</b></p>
                                            <p>Great news — <b>{investmentName}</b> just returned <b>{formattedAmount}</b> to your donor account on CataCap!</p>
                                            <p>Your available balance now reflects this amount and can be part of a new impact investment.</p>
                                            <p style='margin-bottom: 0px;'>With deep gratitude,</p>
                                            <p style='margin-top: 0px;'>— The CataCap Team</p>
                                            <p>🌍 <a href='https://catacap.org/'>catacap.org</a> | 💼 <a href='https://www.linkedin.com/company/catacap-us/'>Follow us on LinkedIn</a></p>
                                            <p><a href='{request}/settings' target='_blank'>Unsubscribe</a> from CataCap notifications.</p>
                                        </body>
                                    </html>";

            await _mailService.SendMailAsync(emailTo, subject, "", body);
        }

        [HttpPost("get-returns-history")]
        public async Task<IActionResult> GetReturnsHistory([FromBody] ReturnsHistoryRequestDto requestDto)
        {
            var query = _context.ReturnMasters?
                                .Where(x => x.ReturnDetails != null)
                                .Include(x => x.ReturnDetails)!
                                    .ThenInclude(x => x.User)
                                .Include(x => x.Campaign)
                                .AsQueryable();

            if (requestDto.InvestmentId > 0)
            {
                query = query?.Where(x => x.CampaignId == requestDto.InvestmentId);
            }

            List<ReturnMaster> returnMasters = await query!.ToListAsync();

            int totalCount = returnMasters.SelectMany(x => x.ReturnDetails!).Count();

            var returnsHistory = returnMasters
                                .SelectMany(rm => rm.ReturnDetails ?? new List<ReturnDetails>(), (rm, rd) => new
                                {
                                    CreatedOn = rm.CreatedOn,
                                    InvestmentAmount = rd.InvestmentAmount,
                                    Dto = new ReturnsHistoryResponseDto
                                    {
                                        InvestmentName = rm.Campaign?.Name,
                                        FirstName = rd.User?.FirstName,
                                        LastName = rd.User?.LastName,
                                        Email = rd.User?.Email,
                                        InvestmentAmount = rd.InvestmentAmount,
                                        Percentage = rd.PercentageOfTotalInvestment,
                                        ReturnedAmount = rd.ReturnAmount,
                                        Memo = rm.MemoNote,
                                        Status = rm.Status,
                                        PrivateDebtDates = rm.PrivateDebtStartDate.HasValue && rm.PrivateDebtEndDate.HasValue
                                                            ? string.Format(CultureInfo.GetCultureInfo("en-US"), "{0:MM/dd/yy}-{1:MM/dd/yy}",
                                                                rm.PrivateDebtStartDate.Value.Date,
                                                                rm.PrivateDebtEndDate.Value.Date)
                                                            : null,
                                        PostDate = rm.PostDate.Date.ToString("MM/dd/yy", CultureInfo.GetCultureInfo("en-US"))
                                    }
                                })
                                .OrderByDescending(x => x.CreatedOn)
                                .ThenByDescending(x => x.InvestmentAmount)
                                .Select(x => x.Dto)
                                .ToList();

            if (totalCount > 0)
            {
                int currentPage = requestDto.CurrentPage ?? 1;
                int perPage = requestDto.PerPage ?? 10;

                var pagedReturns = returnsHistory.Skip((currentPage - 1) * perPage).Take(perPage).ToList();

                dynamic response = new ExpandoObject();
                response.items = pagedReturns;
                response.totalCount = totalCount;
                return Ok(response);
            }

            return Ok(new { Success = false, Message = "No data found." });
        }

        [HttpGet("export-returns")]
        public async Task<IActionResult> ExportReturns()
        {
            var query = await _context.ReturnMasters
                                        .Where(x => x.ReturnDetails != null)
                                        .Include(x => x.ReturnDetails)!
                                            .ThenInclude(x => x.User)
                                        .Include(x => x.Campaign)
                                        .ToListAsync();

            var returnMasters = query
                                .SelectMany(rm => rm.ReturnDetails ?? new List<ReturnDetails>(), (rm, rd) => new
                                {
                                    CreatedOn = rm.CreatedOn,
                                    InvestmentAmount = rd.InvestmentAmount,
                                    Dto = new ReturnsHistoryResponseDto
                                    {
                                        InvestmentName = rm.Campaign?.Name,
                                        FirstName = rd.User?.FirstName,
                                        LastName = rd.User?.LastName,
                                        Email = rd.User?.Email,
                                        InvestmentAmount = rd.InvestmentAmount,
                                        Percentage = rd.PercentageOfTotalInvestment,
                                        ReturnedAmount = rd.ReturnAmount,
                                        Memo = rm.MemoNote,
                                        Status = rm.Status,
                                        PrivateDebtDates = rm.PrivateDebtStartDate.HasValue && rm.PrivateDebtEndDate.HasValue
                                                            ? string.Format(CultureInfo.GetCultureInfo("en-US"), "{0:MM/dd/yy}-{1:MM/dd/yy}",
                                                                rm.PrivateDebtStartDate.Value.Date,
                                                                rm.PrivateDebtEndDate.Value.Date)
                                                            : null,
                                        PostDate = rm.PostDate.Date.ToString("MM/dd/yy", CultureInfo.GetCultureInfo("en-US"))
                                    }
                                })
                                .OrderByDescending(x => x.CreatedOn)
                                .ThenByDescending(x => x.InvestmentAmount)
                                .Select(x => x.Dto)
                                .ToList();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "Returns.xlsx";

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("Returns");

                var headers = new[]
                {
                    "Investment Name", "Date Range", "Post Date", "First Name", "Last Name", "Email",
                    "Investment Amount", "Percentage", "Returned Amount", "Memo", "Status"
                };

                for (int col = 0; col < headers.Length; col++)
                {
                    worksheet.Cell(1, col + 1).Value = headers[col];
                }

                var headerRow = worksheet.Row(1);
                headerRow.Style.Font.Bold = true;

                worksheet.Columns().Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;

                for (int index = 0; index < returnMasters.Count; index++)
                {
                    var dto = returnMasters[index];
                    int row = index + 2;

                    worksheet.Cell(row, 1).Value = dto.InvestmentName;
                    worksheet.Cell(row, 2).Value = dto.PrivateDebtDates;
                    worksheet.Cell(row, 3).Value = dto.PostDate;
                    worksheet.Cell(row, 4).Value = dto.FirstName;
                    worksheet.Cell(row, 5).Value = dto.LastName;
                    worksheet.Cell(row, 6).Value = dto.Email;
                    worksheet.Cell(row, 7).Value = $"${Convert.ToDecimal(dto.InvestmentAmount):N2}";
                    worksheet.Cell(row, 7).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                    worksheet.Cell(row, 8).Value = dto.Percentage / 100m;
                    worksheet.Cell(row, 8).Style.NumberFormat.Format = "0.00%";
                    worksheet.Cell(row, 8).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                    worksheet.Cell(row, 9).Value = $"${Convert.ToDecimal(dto.ReturnedAmount):N2}";
                    worksheet.Cell(row, 9).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                    worksheet.Cell(row, 10).Value = dto.Memo;
                    worksheet.Cell(row, 11).Value = dto.Status;
                }
                worksheet.Columns().AdjustToContents();

                foreach (var column in worksheet.Columns())
                {
                    column.Width += 10;
                }

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    return File(stream.ToArray(), contentType, fileName);
                }
            }
        }

        [HttpGet("get-campaign-data-for-thank-you-page")]
        public async Task<IActionResult> GetCampaignData(int? campaignId, int? groupId, bool? isReference)
        {
            CampaignDto? campaign = null;
            if (campaignId != null || campaignId > 0)
                campaign = await _context.Campaigns.FirstOrDefaultAsync(c => c.Id == campaignId);

            bool isFromGroup = false;
            Group? group = null;
            List<string> groupMemberEmails = new List<string>();

            if (groupId != null || groupId > 0)
            {
                isFromGroup = true;
                group = await _context.Groups.FirstOrDefaultAsync(x => x.Id == groupId);

                groupMemberEmails = await _context.Requests
                                                    .Where(x => x.GroupToFollow!.Id == groupId
                                                            && x.UserToFollow != null)
                                                    .Select(x => x.UserToFollow!.Email)
                                                    .ToListAsync();
            }

            int totalFellowDonorInvestors = isFromGroup
                                                ? await _context.Requests
                                                                .Where(x => x.GroupToFollow!.Id == groupId
                                                                        && x.Status!.ToLower().Trim() == "accepted")
                                                                .Select(x => x.UserToFollow!.Id)
                                                                .Distinct()
                                                                .CountAsync()
                                                : await (from user in _context.Users
                                                         join userRole in _context.UserRoles on user.Id equals userRole.UserId
                                                         join role in _context.Roles on userRole.RoleId equals role.Id
                                                         where user.IsActive == true
                                                               && role.Name == UserRoles.User
                                                         select user.Id)
                                                        .Distinct()
                                                        .CountAsync();

            var totalRecommendationsAmount = isFromGroup
                                                ? await _context.Recommendations
                                                                .Where(r =>
                                                                        groupMemberEmails.Contains(r.UserEmail!) &&
                                                                        (r.Status == "approved" || r.Status == "pending") &&
                                                                        r.CampaignId != null &&
                                                                        r.Amount > 0)
                                                                .SumAsync(r => (decimal?)r.Amount) ?? 0
                                                : await (
                                                            from r in _context.Recommendations
                                                            join u in _context.Users on r.UserEmail equals u.Email
                                                            join ur in _context.UserRoles on u.Id equals ur.UserId
                                                            join role in _context.Roles on ur.RoleId equals role.Id
                                                            where (r.Status == "approved" || r.Status == "pending")
                                                                  && r.CampaignId != null
                                                                  && r.Amount > 0
                                                                  && r.UserEmail != null
                                                                  && role.Name == UserRoles.User
                                                            select (decimal?)r.Amount
                                                        ).SumAsync() ?? 0;

            int totalCompletedInvestments = await _context.CompletedInvestmentsDetails.CountAsync();

            string themeNamesStr = string.Empty;
            List<MatchedCampaignsCardDto>? matchedCampaignsCardDtos = null;

            if (campaignId > 0)
            {
                List<int> themeIds = campaign?.Themes?
                                            .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                            .Select(id => int.TryParse(id.Trim(), out var val) ? val : (int?)null)
                                            .Where(id => id.HasValue)
                                            .Select(id => id!.Value)
                                            .ToList() ?? new List<int>();

                List<string> themeNames = _context.Themes
                                                    .Where(t => themeIds.Contains(t.Id) && t.Name != null)
                                                    .Select(t => t.Name!)
                                                    .ToList();

                themeNamesStr = string.Join(", ", themeNames);

                var recommendationAggregates = await _context.Recommendations
                                                            .Where(r => r.Amount > 0 &&
                                                                        r.UserEmail != null &&
                                                                        (r.Status == "approved" || r.Status == "pending"))
                                                            .GroupBy(r => r.CampaignId)
                                                            .Select(g => new
                                                            {
                                                                CampaignId = g.Key,
                                                                CurrentBalance = g.Sum(r => (decimal?)r.Amount) ?? 0,
                                                                NumberOfInvestors = g.Select(r => r.UserEmail!).Distinct().Count()
                                                            })
                                                            .ToListAsync();

                var recsWithAvatars = await _context.Recommendations
                                                    .Where(r => r.UserEmail != null && (r.Status == "approved" || r.Status == "pending") && r.CampaignId != null)
                                                    .Join(_context.Users,
                                                            r => r.UserEmail,
                                                            u => u.Email,
                                                            (r, u) => new { r.CampaignId, u.PictureFileName, u.ConsentToShowAvatar, r.Id })
                                                    .Where(x => x.PictureFileName != null && x.ConsentToShowAvatar)
                                                    .OrderByDescending(x => x.CampaignId)
                                                    .ToListAsync();

                var avatarsLookup = recsWithAvatars
                                            .GroupBy(x => x.CampaignId!.Value)
                                            .ToDictionary(
                                                g => g.Key,
                                                g => g.OrderByDescending(x => x.Id)
                                                        .Select(x => x.PictureFileName!)
                                                        .Distinct()
                                                        .Take(3)
                                                        .ToList()
                                            );

                if (themeIds.Any())
                {
                    matchedCampaignsCardDtos = _context.Campaigns
                                                        .Where(c => c.IsActive == true &&
                                                                    c.Stage == InvestmentStage.Public &&
                                                                    c.Id != campaign!.Id)
                                                        .AsEnumerable()
                                                        .Where(c => themeIds.Any(id =>
                                                                c.Themes == id.ToString() ||
                                                                c.Themes!.StartsWith(id + ",") ||
                                                                c.Themes.EndsWith("," + id) ||
                                                                c.Themes.Contains("," + id + ",")))
                                                        .Select(c =>
                                                        {
                                                            var agg = recommendationAggregates.FirstOrDefault(a => a.CampaignId == c.Id);
                                                            return new MatchedCampaignsCardDto
                                                            {
                                                                Id = c.Id,
                                                                Name = c.Name!,
                                                                Description = c.Description!,
                                                                Target = c.Target!,
                                                                TileImageFileName = c.TileImageFileName!,
                                                                ImageFileName = c.ImageFileName!,
                                                                Property = c.Property!,
                                                                CurrentBalance = agg?.CurrentBalance ?? 0,
                                                                NumberOfInvestors = agg?.NumberOfInvestors ?? 0,
                                                                LatestInvestorAvatars = c.Id.HasValue && avatarsLookup.ContainsKey(c.Id.Value)
                                                                                            ? avatarsLookup[c.Id.Value]
                                                                                            : new List<string>()
                                                            };
                                                        })
                                                        .OrderByDescending(c => c.CurrentBalance)
                                                        .Take(3)
                                                        .ToList();
                }
            }

            if (isReference == true && campaign == null)
            {
                var recommendationAggregates = await _context.Recommendations
                                                                .Where(r => r.Amount > 0 &&
                                                                            r.UserEmail != null &&
                                                                            (r.Status == "approved" || r.Status == "pending") &&
                                                                            r.Campaign != null &&
                                                                            r.Campaign.IsActive == true &&
                                                                            r.Campaign.Stage == InvestmentStage.Public)
                                                                .GroupBy(r => r.CampaignId)
                                                                .Select(g => new
                                                                {
                                                                    CampaignId = g.Key,
                                                                    TotalAmount = g.Sum(r => (decimal?)r.Amount) ?? 0,
                                                                    NumberOfInvestors = g.Select(r => r.UserEmail!).Distinct().Count()
                                                                })
                                                                .OrderByDescending(g => g.TotalAmount)
                                                                .Take(3)
                                                                .ToListAsync();

                var recsWithAvatars = await _context.Recommendations
                                                    .Where(r => r.UserEmail != null &&
                                                                (r.Status == "approved" || r.Status == "pending") &&
                                                                r.CampaignId != null)
                                                    .Join(_context.Users,
                                                            r => r.UserEmail,
                                                            u => u.Email,
                                                            (r, u) => new { r.CampaignId, u.PictureFileName, u.ConsentToShowAvatar, r.Id })
                                                    .Where(x => x.PictureFileName != null && x.ConsentToShowAvatar)
                                                    .ToListAsync();

                var avatarsLookup = recsWithAvatars
                                                .GroupBy(x => x.CampaignId!.Value)
                                                .ToDictionary(
                                                    g => g.Key,
                                                    g => g.OrderByDescending(x => x.Id)
                                                            .Select(x => x.PictureFileName!)
                                                            .Distinct()
                                                            .Take(3)
                                                            .ToList()
                                                );

                matchedCampaignsCardDtos = _context.Campaigns
                                                    .Where(c => recommendationAggregates.Select(a => a.CampaignId).Contains(c.Id))
                                                    .AsEnumerable()
                                                    .Select(c =>
                                                    {
                                                        var agg = recommendationAggregates.FirstOrDefault(a => a.CampaignId == c.Id);
                                                        return new MatchedCampaignsCardDto
                                                        {
                                                            Id = c.Id,
                                                            Name = c.Name!,
                                                            Description = c.Description!,
                                                            Target = c.Target!,
                                                            TileImageFileName = c.TileImageFileName!,
                                                            ImageFileName = c.ImageFileName!,
                                                            Property = c.Property!,
                                                            CurrentBalance = agg?.TotalAmount ?? 0,
                                                            NumberOfInvestors = agg?.NumberOfInvestors ?? 0,
                                                            LatestInvestorAvatars = c.Id.HasValue && avatarsLookup.ContainsKey(c.Id.Value)
                                                                                        ? avatarsLookup[c.Id.Value]
                                                                                        : new List<string>()
                                                        };
                                                    })
                                                    .OrderByDescending(c => c.CurrentBalance)
                                                    .ToList();
            }

            var campaignData = new
            {
                themes = themeNamesStr,
                fellowDonorInvestors = totalFellowDonorInvestors,
                totalRaisedforImpact = totalRecommendationsAmount,
                completedInvestments = totalCompletedInvestments,
                matchedCampaigns = matchedCampaignsCardDtos
            };

            return Ok(campaignData);
        }

        [HttpGet("check-missing-investment-urls")]
        public async Task<IActionResult> CheckMissingInvestmentUrls()
        {
            var campaigns = await _context.Campaigns.Where(x => string.IsNullOrWhiteSpace(x.Property)).Select(x => x.Name).ToListAsync();

            return Ok(new { InvestmentUrlNotExist = campaigns });
        }

        [HttpGet("get-list-of-pdf-not-exist-on-azure")]
        public async Task<IActionResult> GetNotExistPdfList()
        {
            var campaigns = await _context.Campaigns
                            .Where(c => !string.IsNullOrEmpty(c.PdfFileName))
                            .Select(c => new { c.Name, c.PdfFileName })
                            .ToListAsync();

            var missingCampaigns = new List<string>();

            foreach (var campaign in campaigns)
            {
                var blobClient = _blobContainerClient.GetBlobClient(campaign.PdfFileName);

                if (!await blobClient.ExistsAsync())
                {
                    missingCampaigns.Add(campaign?.Name!);
                }
            }

            return Ok(new { MissingFilesCampaignName = missingCampaigns });
        }

        [HttpGet("download-all-files-from-container")]
        public async Task<IActionResult> DownloadAllFiles()
        {
            //var zipStream = new MemoryStream();

            //using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, leaveOpen: true))
            //{

                var blobs = _blobContainerClient.GetBlobsAsync();

                // Create a dedicated folder inside temp
                string baseTempFolder = Path.Combine(Path.GetTempPath(), "prodcontainer");

                // Ensure base folder exists
                Directory.CreateDirectory(baseTempFolder);

                await Parallel.ForEachAsync(blobs, async (blobItem, cancellationToken) =>
                {
                    // Create full file path inside that folder
                    string filePath = Path.Combine(baseTempFolder, blobItem.Name);

                    // Ensure subfolders (virtual directories) exist
                    string? directory = Path.GetDirectoryName(filePath);
                    if (!Directory.Exists(directory))
                    {
                        Directory.CreateDirectory(directory);
                    }

                    var blobClient = _blobContainerClient.GetBlobClient(blobItem.Name);

                    Console.WriteLine($"Downloading: {blobItem.Name}");

                    await blobClient.DownloadToAsync(filePath, cancellationToken);
                });
            //var blobs = _blobContainerClient.GetBlobsAsync();
            //string tempFolder = Path.GetTempPath();

            //await Parallel.ForEachAsync(blobs, async (blobItem, cancellationToken) =>
            //{
            //    //string filePath = Path.Combine(tempFolder, "prodcontainer", blobItem.Name);
            //    string filePath = Path.Combine(tempFolder, blobItem.Name);

            //    Directory.CreateDirectory(Path.GetDirectoryName(filePath));

            //    var blobClient = _blobContainerClient.GetBlobClient(blobItem.Name);

            //    Console.WriteLine($"Downloading: {blobItem.Name}");

            //    await blobClient.DownloadToAsync(filePath, cancellationToken);
            //});

            //await foreach (BlobItem blobItem in _blobContainerClient.GetBlobsAsync())
            //{
            //        var blobClient = _blobContainerClient.GetBlobClient(blobItem.Name);
            //        var blobDownloadInfo = await blobClient.DownloadAsync();

            //        var entry = archive.CreateEntry(blobItem.Name, CompressionLevel.Fastest);

            //        using (var entryStream = entry.Open())
            //        {
            //            await blobDownloadInfo.Value.Content.CopyToAsync(entryStream);
            //        }
            //    }

            //zipStream.Position = 0;

            //var containerName = _blobContainerClient.Name;
            //var zipFileName = $"{containerName}_AllFiles.zip";

            //return File(zipStream, "application/zip", zipFileName);
            return Ok();
        }

        [HttpPost("copy-files-qa-to-prod")]
        public async Task<IActionResult> CopyFilesFromQaToProd()
        {
            try
            {
                int copiedCount = 0;

                var connectionString = _appSecrets.BlobConfiguration;

                var qaContainerClient = new BlobContainerClient(connectionString, "qacontainer");
                var prodContainerClient = new BlobContainerClient(connectionString, "prodcontainer");

                var newsImages = await _context.News
                                               .Where(n => !string.IsNullOrEmpty(n.ImageFileName))
                                               .Select(n => n.ImageFileName!)
                                               .Distinct()
                                               .ToListAsync();

                foreach (var blobName in newsImages)
                {
                    if (!IsSupportedFile(blobName))
                        continue;

                    var sourceBlob = qaContainerClient.GetBlobClient(blobName);
                    var destBlob = prodContainerClient.GetBlobClient(blobName);

                    if (!await sourceBlob.ExistsAsync())
                        continue;

                    if (await destBlob.ExistsAsync())
                        continue;

                    var sasUri = sourceBlob.GenerateSasUri(BlobSasPermissions.Read, DateTimeOffset.UtcNow.AddHours(1));

                    await destBlob.StartCopyFromUriAsync(sasUri);

                    copiedCount++;
                }

                return Ok(new
                {
                    Success = true,
                    Message = $"{copiedCount} files copied successfully from QA to PROD."
                });
            }
            catch (Exception ex)
            {
                return Ok(new
                {
                    Success = false,
                    ex.Message
                });
            }
        }

        private bool IsSupportedFile(string fileName)
        {
            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".pdf" };

            return allowedExtensions.Any(ext =>
                fileName.EndsWith(ext, StringComparison.OrdinalIgnoreCase));
        }

        [HttpDelete("delete-today-files")]
        public async Task<IActionResult> DeleteTodayFiles()
        {
            try
            {
                int deletedCount = 0;

                // Get today's date (UTC - Azure stores in UTC)
                DateTime todayUtc = DateTime.UtcNow.Date;
                DateTime tomorrowUtc = todayUtc.AddDays(1);

                var tasks = new List<Task>();

                var containerClient = _blobContainerClient;

                var today = DateTime.UtcNow.Date; // start of today (UTC)
                var tomorrow = today.AddDays(1);

                var todaysBlobs = new List<string>();

                await foreach (var blobItem in containerClient.GetBlobsAsync())
                {
                    var lastModified = blobItem.Properties.LastModified;

                    if (lastModified.HasValue &&
                        lastModified.Value.UtcDateTime >= today &&
                        lastModified.Value.UtcDateTime < tomorrow)
                    {
                        todaysBlobs.Add(blobItem.Name);
                    }
                }

                // Result: list of blob names uploaded today
                //return todaysBlobs;

                return Ok();

                //await foreach (BlobItem blobItem in _blobContainerClient.GetBlobsAsync())
                //{
                //    // Check if blob has LastModified property
                //    if (blobItem.Properties.LastModified.HasValue)
                //    {
                //        var lastModified = blobItem.Properties.LastModified.Value.UtcDateTime;

                //        // Filter today's blobs
                //        if (lastModified >= todayUtc && lastModified < tomorrowUtc)
                //        {
                //            var blobClient = _blobContainerClient.GetBlobClient(blobItem.Name);
                //            tasks.Add(blobClient.DeleteIfExistsAsync());

                //            deletedCount++;
                //        }
                //    }
                //}

                //await Task.WhenAll(tasks);

                //return Ok(new
                //{
                //    Success = true,
                //    Message = $"Deleted {deletedCount} file(s) created today.",
                //    DeletedCount = deletedCount
                //});
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    Success = false,
                    Message = "Error deleting today's files.",
                    Error = ex.Message
                });
            }
        }
    }

    public class Data
    {
        public IEnumerable<Theme> Theme { get; set; } = Enumerable.Empty<Theme>();
        public IEnumerable<Sdg> Sdg { get; set; } = Enumerable.Empty<Sdg>();
        public IEnumerable<InvestmentType> InvestmentType { get; set; } = Enumerable.Empty<InvestmentType>();
        public IEnumerable<ApprovedBy> ApprovedBy { get; set; } = Enumerable.Empty<ApprovedBy>();
        public IEnumerable<InvestmentTag> InvestmentTag { get; set; } = Enumerable.Empty<InvestmentTag>();
    }

    public class Portfolio
    {
        public decimal? AccountBalance { get; set; }
        public decimal? GroupBalance { get; set; }
        public List<RecommendationsDto> Recommendations { get; set; } = new List<RecommendationsDto>();
        public List<Campaign> Campaigns { get; set; } = new List<Campaign>();
    }

    public class NetworkRequest
    {
        public string Token { get; set; } = string.Empty;
    }
}
