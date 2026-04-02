using AutoMapper;
using Invest.Core.Constants;
using Invest.Core.Dtos;
using Invest.Core.Models;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Invest.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [EnableCors("AllowAllCors")]
    public class PublicController : ControllerBase
    {
        private readonly RepositoryContext _context;
        private readonly IMapper _mapper;

        public PublicController(IMapper mapper, RepositoryContext context) 
        {
            _context = context;
            _mapper = mapper;
        }

        [HttpGet("get-investments")]
        public async Task<ActionResult<List<InvestmentDto>>> GetAllInvestments([FromQuery] InvestmentRequestDto dto)
        {
            try
            {
                var requestedThemeIds = ParseCommaSeparatedIds(dto.Themes);
                var requestedInvestmentTypeIds = ParseCommaSeparatedIds(dto.InvestmentTypes);
                var requestedSpecialFilterIds = ParseCommaSeparatedIds(dto.SpecialFilters);
                var requestedSourcedByIds = ParseCommaSeparatedIds(dto.SourcedBy);
               
                var query = _context.Campaigns
                            .AsNoTracking()
                            .Where(c => c.IsActive == dto.IsActive
                                     && (c.Stage == InvestmentStage.Public ||
                                         c.Stage == InvestmentStage.CompletedOngoing)
                                     && c.GroupForPrivateAccessId == null);

                var campaigns = await query.ToListAsync();

                if (!string.IsNullOrWhiteSpace(dto?.SearchValue))
                {
                    string search = dto.SearchValue.Trim().ToLower();
                    campaigns = campaigns.Where(c => c.Name!.Trim().ToLower().Contains(search)).ToList();
                }

                if (requestedThemeIds.Any())
                {
                    campaigns = campaigns
                        .Where(c =>
                            !string.IsNullOrEmpty(c.Themes) &&
                            ParseCommaSeparatedIds(c.Themes)
                                .Any(t => requestedThemeIds.Contains(t))
                        )
                        .ToList();
                }

                if (requestedInvestmentTypeIds.Any())
                {
                    campaigns = campaigns
                        .Where(c =>
                            !string.IsNullOrEmpty(c.InvestmentTypes) &&
                            ParseCommaSeparatedIds(c.InvestmentTypes)
                                .Any(t => requestedInvestmentTypeIds.Contains(t))
                        )
                        .ToList();
                }

                if (requestedSourcedByIds.Any())
                {
                    campaigns = campaigns
                        .Where(c =>
                            !string.IsNullOrEmpty(c.ApprovedBy) &&
                            ParseCommaSeparatedIds(c.ApprovedBy)
                                .Any(t => requestedSourcedByIds.Contains(t))
                        )
                        .ToList();
                }

                if (requestedSpecialFilterIds.Any())
                {
                    campaigns = campaigns
                        .Where(c => _context.InvestmentTagMapping
                            .Any(m => m.CampaignId == c.Id 
                                    && requestedSpecialFilterIds.Contains(m.TagId)))
                        .ToList();

                }

                var campaignIds = campaigns.Select(c => c.Id!.Value).ToList();

                var recStats = await _context.Recommendations
                                             .AsNoTracking()
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
                                                 NumberOfInvestors = g.Select(x => x.UserEmail!.ToLower()).Distinct().Count(),
                                                 HighestInvestment = g.Max(x => x.Amount ?? 0),
                                                 AverageInvestment =
                                                                     Math.Round(
                                                                         g.Sum(x => x.Amount ?? 0) /
                                                                         g.Select(x => x.UserEmail!.ToLower()).Distinct().Count(),
                                                                         2)
                                             })
                                             .ToDictionaryAsync(x => x.CampaignId);

                var avatars = await _context.Recommendations
                                            .AsNoTracking()
                                            .Where(r =>
                                                campaignIds.Contains(r.CampaignId!.Value) &&
                                                (r.Status == "approved" || r.Status == "pending") &&
                                                r.UserEmail != null)
                                            .Join(_context.Users.AsNoTracking(),
                                                  r => r.UserEmail,
                                                  u => u.Email,
                                                  (r, u) => new
                                                  {
                                                      r.CampaignId,
                                                      r.Id,
                                                      u.PictureFileName,
                                                      u.ConsentToShowAvatar
                                                  })
                                            .Where(x => x.PictureFileName != null && x.ConsentToShowAvatar)
                                            .OrderByDescending(x => x.Id)
                                            .ToListAsync();

                var avatarLookup = avatars
                                    .GroupBy(x => x.CampaignId!.Value)
                                    .ToDictionary(
                                        g => g.Key,
                                        g => g.Select(x => x.PictureFileName!)
                                              .Distinct()
                                              .Take(3)
                                              .ToList()
                                    );

                var tagMappings = await _context.InvestmentTagMapping
                                                .Where(x => campaignIds.Contains(x.CampaignId))
                                                .ToListAsync();

                var tagLookup = tagMappings
                                .GroupBy(x => x.CampaignId)
                                .ToDictionary(
                                    g => g.Key!,
                                    g => string.Join(",", g.Select(x => x.TagId))
                                );

                var random = new Random();
                const string baseUrl = "https://catacapstorage.blob.core.windows.net/prodcontainer/";

                var resultDtos = campaigns.Select(c =>
                {
                    var dto = _mapper.Map<InvestmentDto>(c);

                    if (recStats.TryGetValue(c.Id!.Value, out var stats))
                    {
                        dto.Raised = stats.CurrentBalance;
                        dto.Investors = stats.NumberOfInvestors;
                        dto.HighestInvestment = stats.HighestInvestment;
                        dto.AverageInvestment = stats.AverageInvestment;
                    }

                    dto.Id = c.Id;
                    dto.Name = c.Name;
                    dto.Description = c.Description;
                    dto.Goal = c.Target;
                    dto.AdminRaised = c.AddedTotalAdminRaised ?? 0m;
                    dto.DaysSinceCreated = c.CreatedDate.HasValue ? (DateTime.UtcNow.Date - c.CreatedDate.Value.Date).Days : 0;
                    dto.Themes = c.Themes;
                    dto.InvestmentTypes = c.InvestmentTypes;
                    dto.SpecialFilters = tagLookup.ContainsKey(c.Id.Value) ? tagLookup[c.Id.Value] : "";
                    dto.SourcedBy = c.ApprovedBy;
                    dto.ProjectedReturn = random.Next(5, 11);
                    dto.Image = string.IsNullOrEmpty(c.TileImageFileName) ? null : $"{baseUrl}{c.TileImageFileName}";
                    dto.LatestInvestorAvatar = avatarLookup.ContainsKey(c.Id.Value) ? avatarLookup[c.Id.Value]! : new List<string>();
                    dto.FeaturedInvestment = c.FeaturedInvestment;
                    dto.MetaTitle = c.MetaTitle;
                    dto.MetaDescription = c.MetaDescription;
                    dto.Property = c.Property;

                    return dto;
                })
                .OrderByDescending(c => c.FeaturedInvestment)
                .ThenByDescending(c => c.Raised)
                .ToList();

                return Ok(resultDtos);
            }
            catch (Exception)
            {
                return Ok(new List<InvestmentDto>());
            }
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

        [HttpGet("get-themes")]
        public async Task<ActionResult<List<ThemeResponseDto>>> GetAllThemes()
        {
            try
            {
                var themes = await _context.Themes
                                   .Select(t => new ThemeResponseDto
                                   {
                                       Id = t.Id,
                                       Name = t.Name,
                                       Description = t.Description
                                   })
                                   .ToListAsync();

                var rawCampaigns = await _context.Campaigns
                                                 .Where(c => !string.IsNullOrEmpty(c.Themes))
                                                 .Select(c => new
                                                 {
                                                     c.Id,
                                                     c.Themes
                                                 })
                                                 .AsNoTracking()
                                                 .ToListAsync();

                var campaignThemes = rawCampaigns
                                     .Select(c => new
                                     {
                                         c.Id,
                                         ThemeIds = c.Themes!
                                                     .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                                     .Select(x => int.Parse(x.Trim()))
                                                     .ToList()
                                     })
                                     .ToList();

                var relevantRecs = await _context.Recommendations
                                                 .Where(r => (r.Status == "pending" || r.Status == "approved")
                                                         && r.CampaignId != null)
                                                 .Select(r => new
                                                 {
                                                     CampaignId = r.CampaignId!.Value,
                                                     r.Amount
                                                 })
                                                 .ToListAsync();

                var recLookup = relevantRecs
                                .GroupBy(r => r.CampaignId)
                                .ToDictionary(g => g.Key, g => g.ToList());

                foreach (var theme in themes)
                {
                    var relatedCampaignIds = campaignThemes
                                             .Where(c => c.ThemeIds.Contains(theme.Id))
                                             .Select(c => c.Id)
                                             .ToList();

                    var themeRecs = relatedCampaignIds
                                    .Where(id => recLookup.ContainsKey(id!.Value))
                                    .SelectMany(id => recLookup[id!.Value])
                                    .ToList();

                    var totalAmount = themeRecs.Sum(r => r.Amount) ?? 0m;
                    var investmentCount = themeRecs.Count;

                    theme.TotalInvestedAmount = Math.Round(totalAmount, 2);
                    theme.AverageInvestmentAmount = investmentCount > 0
                                                    ? Math.Round(totalAmount / investmentCount, 2)
                                                    : 0m;
                    theme.InvestmentCount = investmentCount;
                    theme.CampaignCount = relatedCampaignIds.Count;
                    theme.Description = theme.Description;
                }

                return Ok(themes);
            }
            catch (Exception)
            {
                return Ok(new List<ThemeResponseDto>());
            }
        }

        private static string GetTimeAgo(DateTime date)
        {
            var span = DateTime.Now - date;

            if (span.TotalMinutes < 60)
                return $"{(int)span.TotalMinutes} minutes ago";

            if (span.TotalHours < 24)
                return $"{(int)span.TotalHours} hours ago";

            return $"{(int)span.TotalDays} day{((int)span.TotalDays > 1 ? "s" : "")} ago";
        }

        [HttpGet("related-investments")]
        public async Task<ActionResult<List<InvestmentDto>>> RelatedInvestments([FromQuery] int id)
        {
            var currentCampaign = await _context.Campaigns
                                                .AsNoTracking()
                                                .FirstOrDefaultAsync(c => c.Id == id);

            if (currentCampaign == null || string.IsNullOrEmpty(currentCampaign.Themes))
                return Ok(new List<InvestmentDto>());

            var currentThemeIds = ParseCommaSeparatedIds(currentCampaign.Themes);

            var campaigns = await _context.Campaigns
                                          .AsNoTracking()
                                          .Where(c => c.Id != id
                                                      && c.IsActive == true
                                                      && (c.Stage == InvestmentStage.Public ||
                                                          c.Stage == InvestmentStage.CompletedOngoing)
                                                      && c.GroupForPrivateAccessId == null
                                                      && !string.IsNullOrEmpty(c.Themes))
                                          .ToListAsync();

            campaigns = campaigns
                        .Where(c =>
                            ParseCommaSeparatedIds(c.Themes)
                                .Any(t => currentThemeIds.Contains(t))
                        )
                        .ToList();

            var campaignIds = campaigns.Select(c => c.Id!.Value).ToList();

            var recStats = await _context.Recommendations
                                            .AsNoTracking()
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
                                                NumberOfInvestors = g.Select(x => x.UserEmail!.ToLower()).Distinct().Count(),
                                                HighestInvestment = g.Max(x => x.Amount ?? 0),
                                                AverageInvestment =
                                                    Math.Round(
                                                        g.Sum(x => x.Amount ?? 0) /
                                                        g.Select(x => x.UserEmail!.ToLower()).Distinct().Count(),
                                                        2)
                                            })
                                            .ToDictionaryAsync(x => x.CampaignId);

            var avatars = await _context.Recommendations
                                        .AsNoTracking()
                                        .Where(r =>
                                            campaignIds.Contains(r.CampaignId!.Value) &&
                                            (r.Status == "approved" || r.Status == "pending") &&
                                            r.UserEmail != null)
                                        .Join(_context.Users.AsNoTracking(),
                                                r => r.UserEmail,
                                                u => u.Email,
                                                (r, u) => new
                                                {
                                                    r.CampaignId,
                                                    r.Id,
                                                    u.PictureFileName,
                                                    u.ConsentToShowAvatar
                                                })
                                        .Where(x => x.PictureFileName != null && x.ConsentToShowAvatar)
                                        .OrderByDescending(x => x.Id)
                                        .ToListAsync();

            var avatarLookup = avatars
                                .GroupBy(x => x.CampaignId!.Value)
                                .ToDictionary(
                                    g => g.Key,
                                    g => g.Select(x => x.PictureFileName!)
                                            .Distinct()
                                            .Take(3)
                                            .ToList()
                                );

            var tagMappings = await _context.InvestmentTagMapping
                                            .Where(x => campaignIds.Contains(x.CampaignId))
                                            .ToListAsync();

            var tagLookup = tagMappings
                            .GroupBy(x => x.CampaignId)
                            .ToDictionary(
                                g => g.Key!,
                                g => string.Join(",", g.Select(x => x.TagId))
                            );

            var random = new Random();
            const string baseUrl = "https://catacapstorage.blob.core.windows.net/prodcontainer/";

            var resultDtos = campaigns.Select(c =>
            {
                var dto = _mapper.Map<InvestmentDto>(c);

                if (recStats.TryGetValue(c.Id!.Value, out var stats))
                {
                    dto.Raised = stats.CurrentBalance;
                    dto.Investors = stats.NumberOfInvestors;
                    dto.HighestInvestment = stats.HighestInvestment;
                    dto.AverageInvestment = stats.AverageInvestment;
                }

                dto.Id = c.Id;
                dto.Name = c.Name;
                dto.AdminRaised = c.AddedTotalAdminRaised ?? 0m;
                dto.Description = c.Description;
                dto.Goal = c.Target;
                dto.DaysSinceCreated = c.CreatedDate.HasValue
                                        ? (DateTime.UtcNow.Date - c.CreatedDate.Value.Date).Days
                                        : 0;
                dto.Themes = c.Themes;
                dto.InvestmentTypes = c.InvestmentTypes;
                dto.SpecialFilters = tagLookup.ContainsKey(c.Id.Value) ? tagLookup[c.Id.Value] : "";
                dto.SourcedBy = c.ApprovedBy;
                dto.ProjectedReturn = random.Next(5, 11);
                dto.Image = string.IsNullOrEmpty(c.TileImageFileName) ? null : $"{baseUrl}{c.TileImageFileName}";
                dto.LatestInvestorAvatar = avatarLookup.ContainsKey(c.Id.Value)
                                            ? avatarLookup[c.Id.Value]
                                            : new List<string>();
                dto.FeaturedInvestment = c.FeaturedInvestment;
                dto.MetaTitle = c.MetaTitle;
                dto.MetaDescription = c.MetaDescription;
                dto.Property = c.Property;

                return dto;
            })
            .OrderByDescending(c => c.FeaturedInvestment)
            .ThenByDescending(c => c.Raised)
            .ToList();

            return Ok(resultDtos);
        }

        [HttpGet("{identifier}")]
        public async Task<ActionResult<PublicCampaignDto>> GetCampaign(string identifier)
        {
            if (_context.Campaigns == null)
                return NotFound();

            int? campaignId = null;

            if (int.TryParse(identifier, out var parsedId))
                campaignId = parsedId;

            var campaign = await _context.Campaigns
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

            const string baseUrl = "https://catacapstorage.blob.core.windows.net/prodcontainer/";
            var random = new Random();

            var campaignResponse = _mapper.Map<PublicCampaignDto>(campaign);

            var siteConfigs = await _context.SiteConfiguration.Where(x => x.Type == SiteConfigurationType.StaticValue).ToDictionaryAsync(x => x.Key, x => x.Value);

            campaignResponse.Terms = ReplaceSiteConfigTokens(campaignResponse.Terms!, siteConfigs);

            var recommendationsQuery = _context.Recommendations
                                               .Where(r =>
                                                       r.Campaign!.Id == campaign.Id &&
                                                       r.Amount > 0 &&
                                                       r.UserEmail != null &&
                                                       (r.Status == "approved" || r.Status == "pending"));

            var investmentStats = await recommendationsQuery
                                    .GroupBy(_ => 1)
                                    .Select(g => new
                                    {
                                        CurrentBalance = g.Sum(x => x.Amount ?? 0),
                                        NumberOfInvestors = g.Select(x => x.UserEmail).Distinct().Count(),
                                        HighestInvestment = g.Max(x => x.Amount ?? 0),
                                        AverageInvestment = g.Any()
                                                            ? Math.Round(
                                                                g.Sum(x => x.Amount ?? 0) /
                                                                g.Select(x => x.UserEmail!).Distinct().Count(),
                                                                2)
                                                            : 0
                                    })
                                    .FirstOrDefaultAsync();

            campaignResponse.CurrentBalance = investmentStats?.CurrentBalance ?? 0;
            campaignResponse.NumberOfInvestors = investmentStats?.NumberOfInvestors ?? 0;
            campaignResponse.HighestInvestment = investmentStats?.HighestInvestment ?? 0;
            campaignResponse.AverageInvestment = investmentStats?.AverageInvestment ?? 0;
            campaignResponse.ProjectedReturn = random.Next(5, 11);

            campaignResponse.ImageFileName = string.IsNullOrEmpty(campaign.ImageFileName) ? null : $"{baseUrl}{campaign.ImageFileName}";
            campaignResponse.TileImageFileName = string.IsNullOrEmpty(campaign.TileImageFileName) ? null : $"{baseUrl}{campaign.TileImageFileName}";
            campaignResponse.LogoFileName = string.IsNullOrEmpty(campaign.LogoFileName) ? null : $"{baseUrl}{campaign.LogoFileName}";
            campaignResponse.PdfFileName = string.IsNullOrEmpty(campaign.PdfFileName) ? null : $"{baseUrl}{campaign.PdfFileName}";

            campaignResponse.AddedTotalAdminRaised = campaign.AddedTotalAdminRaised ?? 0;
            campaignResponse.MetaTitle = campaign.MetaTitle;
            campaignResponse.MetaDescription = campaign.MetaDescription;

            campaignResponse.InvestorsList = await recommendationsQuery
                                            .Join(_context.Users,
                                                r => r.UserEmail,
                                                u => u.Email,
                                                (r, u) => new
                                                {
                                                    r.Amount,
                                                    r.DateCreated,
                                                    u.FirstName,
                                                    u.LastName,
                                                    u.PictureFileName,
                                                    u.ConsentToShowAvatar
                                                })
                                            .OrderByDescending(x => x.DateCreated)
                                            .Take(5)
                                            .Select(x => new CampaignInvestorDto
                                            {
                                                Name = string.IsNullOrWhiteSpace(x.FirstName)
                                                        ? "Anonymous"
                                                        : $"{x.FirstName} {x.LastName}",

                                                ProfileImage = x.ConsentToShowAvatar && !string.IsNullOrEmpty(x.PictureFileName)
                                                                ? $"{baseUrl}{x.PictureFileName}"
                                                                : null,

                                                Amount = x.Amount ?? 0,
                                                InvestedAgo = GetTimeAgo(x.DateCreated!.Value)
                                            })
                                            .ToListAsync();

            if (campaign.Stage == InvestmentStage.ClosedInvested || campaign.Stage == InvestmentStage.CompletedOngoing || campaign.Stage == InvestmentStage.CompletedOngoingPrivate)
            {
                var themeIds = ParseCommaSeparatedIds(campaign.Themes);

                if (themeIds.Any())
                {
                    var candidateCampaigns = await _context.Campaigns
                                                           .Where(c =>
                                                               c.IsActive == true &&
                                                               c.Stage == InvestmentStage.Public &&
                                                               c.Id != campaign.Id &&
                                                               c.Themes != null)
                                                           .Select(c => new
                                                           {
                                                               c.Id,
                                                               c.Name,
                                                               c.Description,
                                                               c.Target,
                                                               c.TileImageFileName,
                                                               c.ImageFileName,
                                                               c.Property,
                                                               c.Themes
                                                           })
                                                           .Take(50)
                                                           .ToListAsync();

                    var matchedCampaigns = candidateCampaigns
                                            .Where(c =>
                                                themeIds.Any(id =>
                                                    c.Themes == id.ToString() ||
                                                    c.Themes!.StartsWith(id + ",") ||
                                                    c.Themes.EndsWith("," + id) ||
                                                    c.Themes.Contains("," + id + ",")
                                                ))
                                            .Take(10)
                                            .ToList();

                    if (matchedCampaigns.Any())
                    {
                        var matchedIds = matchedCampaigns.Select(c => c.Id).ToList();

                        var matchedStats = await _context.Recommendations
                                                         .Where(r =>
                                                             matchedIds.Contains(r.CampaignId!.Value) &&
                                                             r.Amount > 0 &&
                                                             r.UserEmail != null &&
                                                             (r.Status == "approved" || r.Status == "pending"))
                                                         .GroupBy(r => r.CampaignId)
                                                         .Select(g => new
                                                         {
                                                             CampaignId = g.Key!.Value,
                                                             Balance = g.Sum(x => x.Amount ?? 0),
                                                             Investors = g.Select(x => x.UserEmail!).Distinct().Count()
                                                         })
                                                         .ToDictionaryAsync(x => x.CampaignId);

                        campaignResponse.MatchedCampaigns = matchedCampaigns
                                                            .Select(c => new MatchedCampaignsCardDto
                                                            {
                                                                Id = c.Id,
                                                                Name = c.Name!,
                                                                Description = c.Description!,
                                                                Target = c.Target!,
                                                                Property = c.Property!,
                                                                TileImageFileName = string.IsNullOrEmpty(c.TileImageFileName) ? null : $"{baseUrl}{c.TileImageFileName}",
                                                                ImageFileName = string.IsNullOrEmpty(c.ImageFileName) ? null : $"{baseUrl}{c.ImageFileName}",
                                                                CurrentBalance = matchedStats.ContainsKey((int)c.Id!) ? matchedStats[(int)c.Id].Balance : 0,
                                                                NumberOfInvestors = matchedStats.ContainsKey((int)c.Id) ? matchedStats[(int)c.Id].Investors : 0
                                                            })
                                                            .OrderByDescending(x => x.CurrentBalance)
                                                            .Take(3)
                                                            .ToList();
                    }
                }
            }
            return campaignResponse;
        }

        private static string ReplaceSiteConfigTokens(string html, Dictionary<string, string> siteConfigs)
        {

            if (string.IsNullOrWhiteSpace(html))
                return html;

            return System.Text.RegularExpressions.Regex.Replace(html, @"<span[^>]*class\s*=\s*""mention""[^>]*>.*?\{(.*?)\}.*?<\/span>",
                match =>
                {
                    var key = match.Groups[1].Value.Trim();

                    if (!siteConfigs.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value))
                        return string.Empty;

                    return RemoveOuterPTags(value);
                },
                System.Text.RegularExpressions.RegexOptions.Singleline | System.Text.RegularExpressions.RegexOptions.IgnoreCase
            );
        }

        private static string RemoveOuterPTags(string html)
        {
            html = html.Trim();

            var match = System.Text.RegularExpressions.Regex.Match(html, @"^\s*<p[^>]*>(.*?)<\/p>\s*$", System.Text.RegularExpressions.RegexOptions.Singleline | System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            return match.Success ? match.Groups[1].Value.Trim() : html;
        }
    }
}
