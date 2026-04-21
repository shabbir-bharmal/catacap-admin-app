using ClosedXML.Excel;
using Invest.Core.Dtos;
using Invest.Core.Extensions;
using Invest.Core.Models;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel;
using System.Dynamic;
using System.Security.Claims;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/completed-investment")]
    [ApiController]
    public class CompletedInvestmentsController : ControllerBase
    {
        private readonly RepositoryContext _context;

        public CompletedInvestmentsController(RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] CompletedInvestmentsPaginationDto requestDto)
        {
            var selectedThemeIds = ParseCommaSeparatedIds(requestDto!.ThemesId);
            var selectedInvestmentTypeIds = ParseCommaSeparatedIds(requestDto.InvestmentTypeId);
            bool? isDeleted = requestDto.IsDeleted;

            var themes = await _context.Themes.ToListAsync();
            var investmentTypes = await _context.InvestmentTypes.ToListAsync();

            IQueryable<CompletedInvestmentsDetails> query = _context.CompletedInvestmentsDetails
                                                                    .Include(x => x.Campaign)
                                                                    .Include(x => x.SiteConfiguration)
                                                                    .Include(x => x.DeletedByUser)
                                                                    .ApplySoftDeleteFilter(isDeleted);

            var completedDetails = await query.ToListAsync();

            var notesQuery = _context.CompletedInvestmentNotes.AsQueryable();

            var completedNotes = await notesQuery
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
                                                userEmails.Contains(r.UserEmail!) &&
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
                                                        Property = campaign.Property,
                                                        Themes = string.Join(", ", themeNames),
                                                        InvestmentVehicle = x.InvestmentVehicle,
                                                        HasNotes = completedNotes.Contains(x.Id),
                                                        ApprovedRecommendationsAmount = _context.Recommendations
                                                                                                .Where(r =>
                                                                                                    r.CampaignId == campaign.Id &&
                                                                                                    r.Status!.ToLower() == "approved" &&
                                                                                                    r.Amount > 0)
                                                                                                .Sum(r => r.Amount ?? 0),
                                                        LatestInvestorAvatars = avatarLookup.ContainsKey(campaign.Id!.Value)
                                                                                ? avatarLookup[campaign.Id.Value]!
                                                                                : new List<string>(),
                                                        DeletedAt = x.DeletedAt,
                                                        DeletedBy = x.DeletedByUser != null 
                                                                    ? $"{x.DeletedByUser.FirstName} {x.DeletedByUser.LastName}" 
                                                                    : null,
                                                    };

                                                    if (recStats.TryGetValue(campaign.Id!.Value, out var stats))
                                                    {
                                                        dto.CurrentBalance = stats.CurrentBalance + (campaign.AddedTotalAdminRaised ?? 0);
                                                        dto.NumberOfInvestors = stats.NumberOfInvestors;
                                                    }

                                                    return new
                                                    {
                                                        CreatedOn = x.CreatedOn,
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

        [HttpGet("details")]
        public async Task<IActionResult> GetDetails([FromQuery] CompletedInvestmentsRequestDto requestDto)
        {
            if (requestDto.InvestmentId <= 0)
                return Ok(new { Success = false, Message = "InvestmentId is required." });

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
                PendingRecommendationsAmount = totalPendingInvestmentAmount,
                InvestmentVehicle = requestDto.InvestmentVehicle
            };

            if (responseDto != null)
                return Ok(responseDto);

            return Ok(new { Success = false, Message = "No records found for the selected investment." });
        }

        [HttpPost]
        public async Task<IActionResult> SaveOrUpdate([FromBody] CompletedInvestmentsRequestDto requestDto)
        {
            if (requestDto.InvestmentId <= 0)
                return Ok(new { Success = false, Message = "InvestmentId is required." });

            if (requestDto.TotalInvestmentAmount <= 0)
                return Ok(new { Success = false, Message = "Amount must be greater than zero." });

            if (string.IsNullOrEmpty(requestDto.InvestmentDetail))
                return Ok(new { Success = false, Message = "Investment detail is required." });

            if (requestDto.DateOfLastInvestment == null)
                return Ok(new { Success = false, Message = "Last investment date is required." });

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
                    Name = requestDto.TypeOfInvestmentName.Trim()
                };

                _context.InvestmentTypes.Add(investmentType);
                await _context.SaveChangesAsync();

                investmentTypeIds.Add(investmentType.Id.ToString());
            }

            var updatedTypeIds = string.Join(",", investmentTypeIds);

            var campaign = await _context.Campaigns.Where(x => x.Id == requestDto.InvestmentId).FirstOrDefaultAsync();

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

            var updatedTypeOfInvestmentIds = string.Join(",", investmentTypeIds);

            if (requestDto.Id == null || requestDto.Id == 0)
            {
                var entity = new CompletedInvestmentsDetails
                {
                    CampaignId = requestDto.InvestmentId,
                    InvestmentDetail = requestDto.InvestmentDetail,
                    Amount = requestDto.TotalInvestmentAmount,
                    DateOfLastInvestment = requestDto.DateOfLastInvestment,
                    TypeOfInvestment = updatedTypeIds,
                    SiteConfigurationId = requestDto.TransactionTypeId,
                    Donors = totalInvestors,
                    Themes = campaign?.Themes,
                    InvestmentVehicle = !string.IsNullOrWhiteSpace(requestDto.InvestmentVehicle) ? requestDto.InvestmentVehicle : null,
                    CreatedBy = userId!,
                    CreatedOn = DateTime.Now
                };

                await _context.CompletedInvestmentsDetails.AddAsync(entity);
                await _context.SaveChangesAsync();

                await SaveNoteIfExists(entity.Id, requestDto, userId!, null);

                return Ok(new { Success = true, Message = "Investment details saved successfully." });
            }

            var existing = await _context.CompletedInvestmentsDetails.FirstOrDefaultAsync(x => x.Id == requestDto.Id);

            if (existing == null)
                return Ok(new { Success = false, Message = "Record not found." });

            decimal oldAmount = existing.Amount ?? 0m;

            existing.InvestmentDetail = requestDto.InvestmentDetail;
            existing.Amount = requestDto.TotalInvestmentAmount;
            existing.DateOfLastInvestment = requestDto.DateOfLastInvestment;
            existing.TypeOfInvestment = updatedTypeIds;
            existing.SiteConfigurationId = requestDto.TransactionTypeId;
            existing.InvestmentVehicle = requestDto.InvestmentVehicle;
            existing.ModifiedOn = DateTime.Now;
            await _context.SaveChangesAsync();

            await SaveNoteIfExists(existing.Id, requestDto, userId!, oldAmount);

            return Ok(new { Success = true, Message = "Investment details updated successfully." });
        }

        [HttpGet("export")]
        public async Task<IActionResult> Export()
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
                                                x.CreatedOn,
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
                    "Date Of Last Investment", "CataCap Investment", "Stage", "CataCap Fund", "Investment Detail", "Amount", "Transaction Type","Type Of Investment", "Donors", "Balance Sheet", "Themes"
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

        [HttpGet("{id}/notes")]
        public async Task<IActionResult> GetNotes(int id)
        {
            if (id <= 0)
                return Ok(new { Success = false, Message = "Invalid completed investment id" });

            var notes = await _context.CompletedInvestmentNotes
                                        .Where(x => x.CompletedInvestmentId == id)
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

        [HttpPut("notes/{noteId}")]
        public async Task<IActionResult> UpdateNotes(int noteId, [FromBody] CompletedInvestmentsNoteRequestDto requestDto)
        {
            var completedInvestmentsNote = await _context.CompletedInvestmentNotes.FirstOrDefaultAsync(x => x.Id == noteId);

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

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.CompletedInvestmentsDetails.FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null)
                return Ok(new { Success = false, Message = "Completed investment not found." });

            _context.CompletedInvestmentsDetails.Remove(entity);

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Completed investment deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var entities = await _context.CompletedInvestmentsDetails
                                         .IgnoreQueryFilters()
                                         .Where(x => ids.Contains(x.Id))
                                         .ToListAsync();

            if (!entities.Any())
                return Ok(new { Success = false, Message = "Completed investments not found." });

            var deletedEntities = entities.Where(x => x.IsDeleted).ToList();

            if (!deletedEntities.Any())
                return Ok(new { Success = false, Message = "No deleted records found to restore." });

            await using var transaction = await _context.Database.BeginTransactionAsync();

            var campaignIds = deletedEntities.Select(x => x.CampaignId).Distinct().ToList();
            var parentUserIds = await _context.Campaigns
                                              .IgnoreQueryFilters()
                                              .Where(c => campaignIds.Contains(c.Id) && c.UserId != null)
                                              .Select(c => c.UserId!)
                                              .Distinct()
                                              .ToListAsync();
            var deletedParentUserIds = await _context.Users
                                                     .IgnoreQueryFilters()
                                                     .Where(u => parentUserIds.Contains(u.Id) && u.IsDeleted)
                                                     .Select(u => u.Id)
                                                     .ToListAsync();
            int restoredUserCount = 0;
            if (deletedParentUserIds.Any())
            {
                restoredUserCount = await UserCascadeRestoreHelper.RestoreUsersWithCascadeAsync(_context, deletedParentUserIds);
            }

            deletedEntities.RestoreRange();

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            var userSuffix = restoredUserCount > 0
                ? $" {restoredUserCount} owning user account(s) were also restored."
                : string.Empty;
            return Ok(new
            {
                Success = true,
                Message = $"{deletedEntities.Count} completed investment(s) restored successfully.{userSuffix}",
                RestoredCount = deletedEntities.Count,
                RestoredUserCount = restoredUserCount,
            });
        }

        private async Task SaveNoteIfExists(int completedInvestmentId, CompletedInvestmentsRequestDto requestDto, string userId, decimal? oldAmount)
        {
            if (string.IsNullOrWhiteSpace(requestDto.Note))
                return;

            var note = new CompletedInvestmentNotes
            {
                CompletedInvestmentId = completedInvestmentId,
                CreatedBy = userId,
                Note = requestDto.Note,
                OldAmount = oldAmount ?? 0m,
                NewAmount = requestDto.TotalInvestmentAmount ?? 0m,
                TransactionType = requestDto.TransactionTypeId,
                CreatedAt = DateTime.Now.Date
            };

            await _context.CompletedInvestmentNotes.AddAsync(note);
            await _context.SaveChangesAsync();
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
