using AutoMapper;
using Azure.Storage;
using Azure.Storage.Blobs;
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
using System.ComponentModel;
using System.Security.Claims;
using System.Text.Json;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/investment")]
    [ApiController]
    //[Module(Modules.Investment)]
    public class InvestmentsController : ControllerBase
    {
        private readonly RepositoryContext _context;
        protected readonly IRepositoryManager _repository;
        private readonly BlobContainerClient _blobContainerClient;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly AppSecrets _appSecrets;
        private readonly IMapper _mapper;
        private readonly IMailService _mailService;
        private readonly HttpClient _httpClient;
        private readonly EmailQueue _emailQueue;
        private readonly ImageService _imageService;
        private readonly string requestOrigin = string.Empty;

        public InvestmentsController(RepositoryContext context, IRepositoryManager repository, IHttpContextAccessor httpContextAccessor, BlobContainerClient blobContainerClient, AppSecrets appSecrets, IMapper mapper, IMailService mailService, HttpClient httpClient, EmailQueue emailQueue, ImageService imageService)
        {
            _context = context;
            _repository = repository;
            _httpContextAccessor = httpContextAccessor;
            _blobContainerClient = blobContainerClient;
            _appSecrets = appSecrets;
            _mapper = mapper;
            _mailService = mailService;
            _httpClient = httpClient;
            _emailQueue = emailQueue;
            _imageService = imageService;
            requestOrigin = httpContextAccessor.HttpContext!.Request.Headers["Origin"].ToString();
        }
        
        [HttpGet]
        //[ModuleAuthorize(PermissionType.Manage)]
        public async Task<IActionResult> Get([FromQuery] PaginationDto pagination)
        {
            bool? isDeleted = pagination?.IsDeleted;
            var search = pagination?.SearchValue?.Trim();

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

            if (!string.IsNullOrEmpty(pagination?.Stages))
            {
                stages = pagination.Stages
                                    .Split(',', StringSplitOptions.RemoveEmptyEntries)
                                    .Select(int.Parse)
                                    .ToList();
            }

            var query = _context.Campaigns
                                .ApplySoftDeleteFilter(isDeleted)
                                .Where(c =>
                                    (string.IsNullOrEmpty(search)
                                        || (c.Name != null && EF.Functions.Like(c.Name, $"%{search.ToLower()}%")))
                                    && (stages == null
                                        || (c.Stage.HasValue && stages.Contains((int)c.Stage.Value)))
                                    && (!pagination!.InvestmentStatus.HasValue
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
                                    c.MetaDescription,
                                    c.DeletedAt,
                                    c.DeletedByUser
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
                                            c.MetaDescription,
                                            c.DeletedAt,
                                            DeletedBy = c.DeletedByUser != null
                                                        ? $"{c.DeletedByUser.FirstName} {c.DeletedByUser.LastName}"
                                                        : null
                                        };
                                    })
                                    .ToList();

            bool isAsc = pagination?.SortDirection?.ToLower() == "asc";
            enrichedCampaigns = pagination?.SortField?.ToLower() switch
            {
                "name" => isAsc ? enrichedCampaigns.OrderBy(x => x.Name?.Trim()).ToList() : enrichedCampaigns.OrderByDescending(x => x.Name?.Trim()).ToList(),
                "createddate" => isAsc ? enrichedCampaigns.OrderBy(x => x.CreatedDate).ToList() : enrichedCampaigns.OrderByDescending(x => x.CreatedDate).ToList(),
                "catacapfunding" => isAsc ? enrichedCampaigns.OrderBy(x => x.CurrentBalance).ToList() : enrichedCampaigns.OrderByDescending(x => x.CurrentBalance).ToList(),
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

        [HttpGet("request")]
        public async Task<IActionResult> GetInvestmentRequests([FromQuery] PaginationDto pagination, [FromQuery] InvestmentRequestStatus? investmentRequestStatus)
        {
            int page = pagination?.CurrentPage ?? 1;
            int pageSize = pagination?.PerPage ?? 10;
            string sortField = pagination?.SortField?.ToLower() ?? "submitted";
            bool isAsc = pagination?.SortDirection?.ToLower() == "asc";

            IQueryable<InvestmentRequest> query = _context.InvestmentRequest.Include(x => x.User);

            if (investmentRequestStatus.HasValue)
                query = query.Where(x => x.Status == investmentRequestStatus.Value);

            if (!string.IsNullOrWhiteSpace(pagination?.SearchValue))
            {
                string search = pagination.SearchValue.ToLower();

                query = query.Where(x =>
                                       (x.OrganizationName ?? "").ToLower().Contains(search) ||
                                       (x.User!.FirstName + " " + x.User.LastName).ToLower().Contains(search) ||
                                       (x.User!.Email ?? "").ToLower().Contains(search)
                                   );
            }

            query = sortField switch
            {
                "applicant" => isAsc
                                ? query.OrderBy(x => x.User!.FirstName).ThenBy(x => x.User!.LastName)
                                : query.OrderByDescending(x => x.User!.FirstName).ThenByDescending(x => x.User!.LastName),

                "organization" => isAsc
                                    ? query.OrderBy(x => x.OrganizationName)
                                    : query.OrderByDescending(x => x.OrganizationName),

                "status" => isAsc
                                ? query.OrderBy(x => x.Status)
                                : query.OrderByDescending(x => x.Status),

                "createdat" => isAsc
                                ? query.OrderBy(x => x.CreatedAt)
                                : query.OrderByDescending(x => x.CreatedAt),

                _ => query.OrderByDescending(x => x.CreatedAt)
            };

            int totalRecords = await query.CountAsync();

            var data = await query
                       .Skip((page - 1) * pageSize)
                       .Take(pageSize)
                       .Select(x => new
                       {
                           x.Id,
                           x.User!.FirstName,
                           x.User.LastName,
                           FullName = (x.User!.FirstName ?? "") + " " + (x.User.LastName ?? ""),
                           x.User!.Email,
                           Organization = x.OrganizationName,
                           x.Country,
                           Goal = x.CampaignGoal,
                           Submitted = x.CreatedAt,
                           x.Status,
                           StatusName = x.Status.GetDisplayName()
                       })
                       .ToListAsync();

            return Ok(new { totalRecords, items = data });
        }

        [HttpGet("request/{id}")]
        public async Task<IActionResult> GetInvestmentRequestById(int id)
        {
            if (id <= 0)
                return Ok(new { Success = false, Message = "Invalid id." });

            var data = await _context.InvestmentRequest
                                     .Include(x => x.User)
                                     .Where(x => x.Id == id)
                                     .Select(x => new InvestmentRequestDetailDto
                                     {
                                         CurrentStep = x.CurrentStep,
                                         Status = x.Status,
                                         StatusName = x.Status.GetDisplayName(),
                                         FullName = (x.User!.FirstName ?? "") + " " + (x.User.LastName ?? ""),
                                         FirstName = x.User!.FirstName ?? "",
                                         LastName = x.User!.LastName ?? "",
                                         Email = x.User!.Email,
                                         Country = x.Country,
                                         Website = x.Website,
                                         OrganizationName = x.OrganizationName,
                                         CurrentlyRaising = x.CurrentlyRaising,
                                         InvestmentTypes = x.InvestmentTypes,
                                         InvestmentThemes = x.InvestmentThemes,
                                         ThemeDescription = x.ThemeDescription,
                                         CapitalRaised = x.CapitalRaised,
                                         ReferenceableInvestors = x.ReferenceableInvestors,
                                         HasDonorCommitment = x.HasDonorCommitment,
                                         SoftCircledAmount = x.SoftCircledAmount,
                                         Timeline = x.Timeline,
                                         CampaignGoal = x.CampaignGoal,
                                         Role = x.Role,
                                         ReferralSource = x.ReferralSource,
                                         InvestmentTerms = x.InvestmentTerms,
                                         WhyBackYourInvestment = x.WhyBackYourInvestment,
                                         LogoFileName = x.LogoFileName,
                                         HeroImageFileName = x.HeroImageFileName,
                                         PitchDeckFileName = x.PitchDeckFileName,
                                         Logo = x.Logo,
                                         HeroImage = x.HeroImage,
                                         PitchDeck = x.PitchDeck,
                                         CreatedAt = x.CreatedAt
                                     })
                                     .FirstOrDefaultAsync();

            if (data == null)
                return Ok(new { Success = false, Message = "Investment request not found." });

            return Ok(new { item = data });
        }

        [HttpGet("export")]
        public async Task<IActionResult> Export()
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

        [HttpPost("{id}/clone")]
        public async Task<IActionResult> Clone(int id, string name)
        {
            name = name.Trim();
            if (!string.IsNullOrEmpty(name))
            {
                bool nameExists = await _context.Campaigns.AnyAsync(x => x.Name!.Trim() == name);

                if (nameExists)
                    return Ok(new { Success = false, Message = "Campaign name already exists." });
            }

            var campaign = await _context.Campaigns.FirstOrDefaultAsync(x => x.Id == id);
            if (campaign == null)
                return Ok(new { Success = false, Message = "Campaign not found." });

            var property = name?.ToLower();
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
                Name = name,
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

        [HttpGet("document")]
        public IActionResult Document(string action, string pdfFileName, string? originalPdfFileName = null)
        {
            if (string.IsNullOrEmpty(action) || string.IsNullOrEmpty(pdfFileName))
                return Ok(new { Success = false, Message = "Parameters required." });

            BlockBlobClient blobClient = _blobContainerClient.GetBlockBlobClient(pdfFileName);
            var expiryTime = DateTimeOffset.UtcNow.AddMinutes(5);
            string? sasUri = null;

            switch (action)
            {
                case "open":
                    sasUri = blobClient.GenerateSasUri(BlobSasPermissions.Read, expiryTime).ToString();
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

        [HttpGet("types")]
        public async Task<IActionResult> GetTypes()
        {
            var investmentTypes = await _context.InvestmentTypes
                                        .Select(i => new { i.Id, i.Name })
                                        .OrderBy(i => i.Name)
                                        .ToListAsync();

            investmentTypes.Add(new { Id = -1, Name = (string?)"Other" });

            if (investmentTypes != null)
                return Ok(investmentTypes);

            return BadRequest(new { Success = false, Message = "Invalid investment stage." });
        }

        [HttpGet("names")]
        public async Task<IActionResult> GetNames(int stage, int id)
        {
            var investmentTypes = await _context.InvestmentTypes.ToListAsync();

            if (stage == 4)
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
            else if (stage == 3)
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
            else if (stage == 0)
            {
                var campaignList = await _context.Campaigns
                                                    .Where(x => x.Name!.Trim() != string.Empty && x.Id != id)
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
            else if (stage == 10)
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

        [HttpPut("{id}/status")]
        public async Task<ActionResult<CampaignDto>> UpdateStatus(int id, bool status)
        {
            var campaign = await _context.Campaigns.SingleOrDefaultAsync(item => item.Id == id);
            if (campaign == null)
                return BadRequest();

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

        //[HttpDelete("{id}")]
        //public async Task<IActionResult> Delete(int id)
        //{
        //    var campaign = await _context.Campaigns.FindAsync(id);
        //    if (campaign == null)
        //        return NotFound();

        //    var recommendations = _context.Recommendations.Where(r => r.CampaignId == id);
        //    _context.Recommendations.RemoveRange(recommendations);

        //    var accountBalanceChangeLogs = _context.AccountBalanceChangeLogs.Where(r => r.CampaignId == id);
        //    _context.AccountBalanceChangeLogs.RemoveRange(accountBalanceChangeLogs);

        //    var userInvestments = _context.UserInvestments.Where(n => n.CampaignId == id);
        //    _context.UserInvestments.RemoveRange(userInvestments);

        //    var investmentNotes = _context.InvestmentNotes.Where(n => n.CampaignId == id);
        //    _context.InvestmentNotes.RemoveRange(investmentNotes);

        //    var disbursalRequests = _context.DisbursalRequest.Where(d => d.CampaignId == id);

        //    var disbursalRequestIds = disbursalRequests.Select(d => d.Id).ToList();

        //    var disbursalRequestNotes = _context.DisbursalRequestNotes.Where(d => disbursalRequestIds.Contains(d.DisbursalRequestId!.Value));
        //    _context.DisbursalRequestNotes.RemoveRange(disbursalRequestNotes);

        //    _context.DisbursalRequest.RemoveRange(disbursalRequests);

        //    _context.Campaigns.Remove(campaign);
        //    await _context.SaveChangesAsync();

        //    //BlockBlobClient tileImageBlockBlob = _blobContainerClient.GetBlockBlobClient(campaign.TileImageFileName);
        //    //BlockBlobClient imageBlockBlob = _blobContainerClient.GetBlockBlobClient(campaign.ImageFileName);
        //    //BlockBlobClient logoBlockBlob = _blobContainerClient.GetBlockBlobClient(campaign.LogoFileName);
        //    //BlockBlobClient pdfBlockBlob = _blobContainerClient.GetBlockBlobClient(campaign.PdfFileName);

        //    //await tileImageBlockBlob.DeleteIfExistsAsync();
        //    //await imageBlockBlob.DeleteIfExistsAsync();
        //    //await logoBlockBlob.DeleteIfExistsAsync();
        //    //await pdfBlockBlob.DeleteIfExistsAsync();

        //    return NoContent();
        //}

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var campaign = await _context.Campaigns.FirstOrDefaultAsync(x => x.Id == id);

            if (campaign == null)
                return Ok(new { Success = false, Message = "Campaign not found." });

            var pendingGrants = await _context.PendingGrants
                .Where(x => x.CampaignId == id)
                .ToListAsync();

            var pendingGrantIds = pendingGrants.Select(x => x.Id).ToList();

            var assetPayments = await _context.AssetBasedPaymentRequest
                .Where(x => x.CampaignId == id)
                .ToListAsync();

            var assetPaymentIds = assetPayments.Select(x => x.Id).ToList();

            var disbursalRequests = await _context.DisbursalRequest
                .Where(x => x.CampaignId == id)
                .ToListAsync();

            var disbursalRequestIds = disbursalRequests.Select(x => x.Id).ToList();

            var completedInvestments = await _context.CompletedInvestmentsDetails
                .Where(x => x.CampaignId == id)
                .ToListAsync();

            var completedInvestmentIds = completedInvestments.Select(x => x.Id).ToList();

            var returnMasters = await _context.ReturnMasters
                .Where(x => x.CampaignId == id)
                .ToListAsync();

            var returnMasterIds = returnMasters.Select(x => x.Id).ToList();

            var scheduledEmailLogs = await _context.ScheduledEmailLogs
                .Where(x => pendingGrantIds.Contains(x.PendingGrantId))
                .ToListAsync();

            var pendingGrantRecommendations = await _context.Recommendations
                .Where(x => pendingGrantIds.Contains(x.PendingGrantsId!.Value))
                .ToListAsync();

            var returnDetails = await _context.ReturnDetails
                .Where(x => returnMasterIds.Contains(x.ReturnMasterId))
                .ToListAsync();

            var accountLogs = await _context.AccountBalanceChangeLogs
                .Where(x =>
                    x.CampaignId == id ||
                    assetPaymentIds.Contains(x.AssetBasedPaymentRequestId!.Value) ||
                    pendingGrantIds.Contains(x.PendingGrantsId!.Value))
                .ToListAsync();

            var recommendations = await _context.Recommendations
                .Where(x => x.CampaignId == id)
                .ToListAsync();

            var userInvestments = await _context.UserInvestments
                .Where(x => x.CampaignId == id)
                .ToListAsync();

            var achPayments = await _context.ACHPaymentRequests
                .Where(x => x.CampaignId == id)
                .ToListAsync();

            var tagMappings = await _context.InvestmentTagMapping
                .Where(x => x.CampaignId == id)
                .ToListAsync();

            _context.AccountBalanceChangeLogs.RemoveRange(accountLogs);
            _context.ScheduledEmailLogs.RemoveRange(scheduledEmailLogs);
            _context.ACHPaymentRequests.RemoveRange(achPayments);
            _context.UserInvestments.RemoveRange(userInvestments);
            _context.Recommendations.RemoveRange(pendingGrantRecommendations);
            _context.ReturnDetails.RemoveRange(returnDetails);
            _context.PendingGrants.RemoveRange(pendingGrants);
            _context.AssetBasedPaymentRequest.RemoveRange(assetPayments);
            _context.DisbursalRequest.RemoveRange(disbursalRequests);
            _context.CompletedInvestmentsDetails.RemoveRange(completedInvestments);
            _context.ReturnMasters.RemoveRange(returnMasters);
            _context.InvestmentTagMapping.RemoveRange(tagMappings);

            _context.Campaigns.Remove(campaign);

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Campaign deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var campaigns = await _context.Campaigns
                                          .IgnoreQueryFilters()
                                          .Where(x => x.Id.HasValue && ids.Contains(x.Id.Value))
                                          .ToListAsync();

            if (!campaigns.Any())
                return Ok(new { Success = false, Message = "Campaign not found." });

            var deletedCampaigns = campaigns.Where(x => x.IsDeleted).ToList();

            if (!deletedCampaigns.Any())
                return Ok(new { Success = false, Message = "No deleted campaigns found." });

            var campaignIds = deletedCampaigns.Select(x => x.Id).ToList();

            await using var transaction = await _context.Database.BeginTransactionAsync();

            // Cascade-restore parent users that are currently soft-deleted, so
            // the restored campaign is owned by an active user.
            var parentUserIds = deletedCampaigns
                                    .Select(x => x.UserId)
                                    .Where(id => !string.IsNullOrEmpty(id))
                                    .Select(id => id!)
                                    .Distinct()
                                    .ToList();
            var deletedParentUserIds = await _context.Users
                                                     .IgnoreQueryFilters()
                                                     .Where(u => parentUserIds.Contains(u.Id) && u.IsDeleted)
                                                     .Select(u => u.Id)
                                                     .ToListAsync();
            if (deletedParentUserIds.Any())
            {
                await UserCascadeRestoreHelper.RestoreUsersWithCascadeAsync(_context, deletedParentUserIds);
            }

            var pendingGrants = await _context.PendingGrants
                .IgnoreQueryFilters()
                .Where(x => campaignIds.Contains(x.CampaignId) && x.IsDeleted)
                .ToListAsync();

            var pendingGrantIds = pendingGrants.Select(x => x.Id).ToList();

            var assetPayments = await _context.AssetBasedPaymentRequest
                .IgnoreQueryFilters()
                .Where(x => campaignIds.Contains(x.CampaignId) && x.IsDeleted)
                .ToListAsync();

            var assetPaymentIds = assetPayments.Select(x => x.Id).ToList();

            var disbursalRequests = await _context.DisbursalRequest
                .IgnoreQueryFilters()
                .Where(x => campaignIds.Contains(x.CampaignId) && x.IsDeleted)
                .ToListAsync();

            var completedInvestments = await _context.CompletedInvestmentsDetails
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

            var scheduledEmailLogs = await _context.ScheduledEmailLogs
                .IgnoreQueryFilters()
                .Where(x => pendingGrantIds.Contains(x.PendingGrantId) && x.IsDeleted)
                .ToListAsync();

            var pendingGrantRecommendations = await _context.Recommendations
                .IgnoreQueryFilters()
                .Where(x => x.PendingGrantsId != null &&
                            pendingGrantIds.Contains(x.PendingGrantsId.Value) &&
                            x.IsDeleted)
                .ToListAsync();

            var accountLogs = await _context.AccountBalanceChangeLogs
                .IgnoreQueryFilters()
                .Where(x =>
                    (x.CampaignId != null && campaignIds.Contains(x.CampaignId.Value)) ||
                    (x.AssetBasedPaymentRequestId != null && assetPaymentIds.Contains(x.AssetBasedPaymentRequestId.Value)) ||
                    (x.PendingGrantsId != null && pendingGrantIds.Contains(x.PendingGrantsId.Value)))
                .Where(x => x.IsDeleted)
                .ToListAsync();

            var recommendations = await _context.Recommendations
                .IgnoreQueryFilters()
                .Where(x => campaignIds.Contains(x.CampaignId) && x.IsDeleted)
                .ToListAsync();

            var userInvestments = await _context.UserInvestments
                .IgnoreQueryFilters()
                .Where(x => campaignIds.Contains(x.CampaignId) && x.IsDeleted)
                .ToListAsync();

            deletedCampaigns.RestoreRange();
            pendingGrants.RestoreRange();
            assetPayments.RestoreRange();
            disbursalRequests.RestoreRange();
            completedInvestments.RestoreRange();
            returnDetails.RestoreRange();
            scheduledEmailLogs.RestoreRange();
            pendingGrantRecommendations.RestoreRange();
            accountLogs.RestoreRange();
            recommendations.RestoreRange();
            userInvestments.RestoreRange();

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return Ok(new { Success = true, Message = $"{deletedCampaigns.Count} campaign(s) restored successfully." });
        }

        [HttpGet("{id}/notes")]
        public async Task<IActionResult> GetNotes(int id)
        {
            if (id <= 0)
                return Ok(new { Success = false, Message = "Invalid investment id" });

            var notes = await _context.InvestmentNotes
                                        .Where(x => x.CampaignId == id)
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

        [HttpGet("countries")]
        public async Task<IActionResult> Countries()
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

        [HttpGet("{id}/notes/export")]
        public async Task<IActionResult> ExportNotes(int id)
        {
            var investmentNotes = await _context.InvestmentNotes
                                                .Where(x => x.CampaignId == id)
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

        [HttpGet("{id}")]
        [DisableRequestSizeLimit]
        public async Task<ActionResult<Campaign>> Get(int id)
        {
            if (_context.Campaigns == null)
                return NotFound();

            var campaignDto = await _context.Campaigns.Include(x => x.GroupForPrivateAccess).FirstOrDefaultAsync(x => x.Id == id);

            if (campaignDto == null)
                return NotFound();

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

            if (!string.IsNullOrEmpty(campaign.Terms))
                campaign.Terms = NormalizeMentionFormat(campaign.Terms);

            return campaign;
        }

        private static string NormalizeMentionFormat(string html)
        {
            if (string.IsNullOrWhiteSpace(html))
                return html;

            html = html.Replace("\uFEFF", "");

            var alreadyNormalizedRegex = new System.Text.RegularExpressions.Regex(
                @"<span[^>]*class=""bg-sky-100[^""]*""[^>]*contenteditable=""false""[^>]*>(\{.*?\})<\/span>",
                System.Text.RegularExpressions.RegexOptions.Singleline | System.Text.RegularExpressions.RegexOptions.IgnoreCase
            );
            html = alreadyNormalizedRegex.Replace(html, m => m.Groups[1].Value);

            var mentionRegex = new System.Text.RegularExpressions.Regex(
                @"<span[^>]*class=""mention""[^>]*data-value=""(\{.*?\})""[^>]*>.*?<\/span>",
                System.Text.RegularExpressions.RegexOptions.Singleline | System.Text.RegularExpressions.RegexOptions.IgnoreCase
            );
            html = mentionRegex.Replace(html, m =>
            {
                var token = m.Groups[1].Value;
                return $@"<span class=""bg-sky-100 text-sky-900 rounded-md px-1.5 py-0.5 inline-block mx-0.5 font-medium select-none"" contenteditable=""false"">{token}</span>";
            });

            var dupeRegex = new System.Text.RegularExpressions.Regex(
                @"(<span[^>]*contenteditable=""false""[^>]*>(\{.*?\})<\/span>)\2",
                System.Text.RegularExpressions.RegexOptions.Singleline
            );
            html = dupeRegex.Replace(html, m => m.Groups[1].Value);

            return html;
        }

        [HttpPost]
        [DisableRequestSizeLimit]
        public async Task<IActionResult> Create([FromBody] Campaign campaign)
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

        [HttpPut("{id}")]
        [DisableRequestSizeLimit]
        public async Task<ActionResult<Campaign>> Update([FromBody] Campaign campaign)
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
            bool isAdmin = identity?.Claims.Any(c => c.Type == ClaimTypes.Role && (c.Value == UserRoles.Admin || c.Value == UserRoles.SuperAdmin)) == true;

            if (!isAdmin)
                PreserveAdminFields(existingCampaign!, campaign);

            var campaignDto = _mapper.Map(campaign, existingCampaign);

            if (isAdmin)
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

        [HttpGet("{id}/recommendations/export")]
        public async Task<IActionResult> Export(int id)
        {
            var recommendations = await _context.Recommendations
                                            .Include(x => x.Campaign)
                                            .Include(x => x.PendingGrants)
                                            .Where(x => x.CampaignId == id
                                                        && (x.Status!.ToLower().Trim() == "pending"
                                                            || x.Status!.ToLower().Trim() == "approved"))
                                            .OrderByDescending(x => x.Id)
                                            .ToListAsync();

            if (!recommendations.Any())
                return Ok(new { Success = false, Message = "There are no recommendations to export for your investment." });

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "Recommendations.xlsx";

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("Recommendations");

                worksheet.Cell(1, 1).Value = "UserFullName";
                worksheet.Cell(1, 2).Value = "InvestmentName";
                worksheet.Cell(1, 3).Value = "Amount";
                worksheet.Cell(1, 4).Value = "DateCreated";
                worksheet.Cell(1, 5).Value = "InTransitGrant?";

                var headerRow = worksheet.Row(1);
                headerRow.Style.Font.Bold = true;
                worksheet.Columns().Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;

                for (int index = 0; index < recommendations.Count; index++)
                {
                    var dto = recommendations[index];
                    int row = index + 2;
                    int col = 1;

                    worksheet.Cell(row, col++).Value = dto.UserFullName;
                    worksheet.Cell(row, col++).Value = dto.Campaign!.Name;

                    var amountCell = worksheet.Cell(row, col++);
                    amountCell.Value = dto.Amount;
                    amountCell.Style.NumberFormat.Format = "$#,##0.00";

                    var dateCreatedCell = worksheet.Cell(row, col++);
                    dateCreatedCell.Value = dto.DateCreated;
                    dateCreatedCell.Style.DateFormat.Format = "MM/dd/yy HH:mm";

                    worksheet.Cell(row, col++).Value = dto.PendingGrants != null
                                                            ? dto.PendingGrants.status!.ToLower().Trim() == "in transit"
                                                                ? "Yes"
                                                                : ""
                                                            : "";
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

        private static string ConvertHtmlNoteToPlainText(string? htmlNote)
        {
            if (string.IsNullOrWhiteSpace(htmlNote))
                return string.Empty;

            string result = System.Text.RegularExpressions.Regex.Replace(htmlNote, @"<(b|strong)>\s*(.*?)\s*<\/\1>", "@$2", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            result = System.Text.RegularExpressions.Regex.Replace(result, @"<[^>]+>", string.Empty);
            result = System.Net.WebUtility.HtmlDecode(result);
            return result.Trim();
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
    }
}
