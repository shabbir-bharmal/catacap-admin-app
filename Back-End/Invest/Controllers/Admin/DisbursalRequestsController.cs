using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Specialized;
using ClosedXML.Excel;
using Invest.Core.Constants;
using Invest.Core.Dtos;
using Invest.Core.Extensions;
using Invest.Core.Models;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/disbursal-request")]
    [ApiController]
    public class DisbursalRequestsController : ControllerBase
    {
        private readonly RepositoryContext _context;
        private readonly BlobContainerClient _blobContainerClient;

        public DisbursalRequestsController(RepositoryContext context, BlobContainerClient blobContainerClient)
        {
            _context = context;
            _blobContainerClient = blobContainerClient;
        }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] PaginationDto dto, DisbursalRequestStatus? disbursalRequestStatus)
        {
            bool isAsc = dto?.SortDirection?.ToLower() == "asc";
            int page = dto?.CurrentPage ?? 1;
            int pageSize = dto?.PerPage ?? 50;
            bool? isDeleted = dto?.IsDeleted;

            var query = await (from d in _context.DisbursalRequest.ApplySoftDeleteFilter(isDeleted)
                               join c in _context.Campaigns
                                   on d.CampaignId equals c.Id
                               select new
                               {
                                   d.Id,
                                   d.ReceiveDate,
                                   d.User.Email,
                                   d.Mobile,
                                   d.DistributedAmount,
                                   c.Name,
                                   InvestmentId = c.Id,
                                   c.Property,
                                   d.Quote,
                                   d.Status,
                                   d.PitchDeck,
                                   d.PitchDeckName,
                                   d.InvestmentDocument,
                                   d.InvestmentDocumentName,
                                   c.InvestmentTypes,
                                   d.DeletedAt,
                                   d.DeletedByUser
                               })
                                .ToListAsync();

            int totalCount = query.Count();

            if (!string.IsNullOrWhiteSpace(dto?.SearchValue))
            {
                var searchValue = dto.SearchValue.Trim().ToLower();

                query = query.Where(u => (u.Name ?? "").Trim().ToLower().Contains(searchValue) || u.Email.ToLower().Contains(searchValue)).ToList();
            }

            if (disbursalRequestStatus.HasValue)
                query = query.Where(x => x.Status == disbursalRequestStatus.Value).ToList();

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
                HasNotes = _context.DisbursalRequestNotes.Any(d => d.DisbursalRequestId == x.Id),
                DeletedAt = x.DeletedAt,
                DeletedBy = x.DeletedByUser != null
                            ? $"{x.DeletedByUser.FirstName} {x.DeletedByUser.LastName}"
                            : null
            });

            var items = result
                        .Skip((page - 1) * pageSize)
                        .Take(pageSize)
                        .ToList();

            if (items.Any())
                return Ok(new { items, totalCount });

            return Ok(new { Success = false, Message = "Data not found." });
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
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
                query.Quote,
                query.Status,
                StatusName = query.Status.GetDisplayName(),
                query.DistributedAmount,
                query.Property,
                query.InvestmentRemainOpen,
                ReceiveDate = query.ReceiveDate == DateTime.MinValue ? "" : query.ReceiveDate!.Value.ToString("MM-dd-yyyy"),
                query.PitchDeck,
                query.PitchDeckName,
                query.InvestmentDocument,
                query.InvestmentDocumentName,
                query.ImpactAssetsFundingPreviously,
                investmentTypeNames
            };

            return Ok(data);
        }

        [HttpGet("export")]
        public async Task<IActionResult> Export()
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

        [HttpGet("{id}/notes")]
        public async Task<IActionResult> GetNotes(int id)
        {
            if (id <= 0)
                return Ok(new { Success = false, Message = "Invalid disbursal request id" });

            var notes = await _context.DisbursalRequestNotes
                                        .Where(x => x.DisbursalRequestId == id)
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

        [HttpPut("{id}/status")]
        public async Task<IActionResult> UpdateDisbursalRequestStatus(int id, DisbursalRequestStatus status)
        {
            if (!Enum.IsDefined(typeof(DisbursalRequestStatus), status))
                return Ok(new { Success = false, Message = "Invalid status value." });

            var disbursal = await _context.DisbursalRequest.FirstOrDefaultAsync(x => x.Id == id);

            if (disbursal == null)
                return Ok(new { Success = false, Message = "Disbursal request not found." });
            
            disbursal.Status = status;
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Disbursal request status updated successfully." });
        }

        [HttpPost("{id}/notes")]
        public async Task<IActionResult> SaveNote(int id, [FromBody] string note)
        {
            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            if (string.IsNullOrEmpty(loginUserId))
                return BadRequest(new { Success = false, Message = "User not found." });

            var disbursalRequest = await _context.DisbursalRequest.FirstOrDefaultAsync(x => x.Id == id);

            if (disbursalRequest == null)
                return Ok(new { Success = false, Message = "Disbursal Request not found." });

            _context.DisbursalRequestNotes.Add(new DisbursalRequestNotes
            {
                DisbursalRequestId = disbursalRequest.Id,
                Note = note.Trim(),
                CreatedBy = loginUserId,
                CreatedAt = DateTime.Now
            });
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Note saved successfully." });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.DisbursalRequest.FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null)
                return Ok(new { Success = false, Message = "Disbursal request not found." });

            _context.DisbursalRequest.Remove(entity);

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Disbursal request deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var entities = await _context.DisbursalRequest
                                         .IgnoreQueryFilters()
                                         .Where(x => ids.Contains(x.Id))
                                         .ToListAsync();

            if (!entities.Any())
                return Ok(new { Success = false, Message = "Disbursal request not found." });

            var deletedEntities = entities.Where(x => x.IsDeleted).ToList();

            if (!deletedEntities.Any())
                return Ok(new { Success = false, Message = "No deleted records found to restore." });

            await using var transaction = await _context.Database.BeginTransactionAsync();

            var parentUserIds = deletedEntities
                                    .Select(x => x.UserId)
                                    .Where(id => !string.IsNullOrEmpty(id))
                                    .Distinct()
                                    .ToList();
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
                Message = $"{deletedEntities.Count} disbursal request(s) restored successfully.{userSuffix}",
                RestoredCount = deletedEntities.Count,
                RestoredUserCount = restoredUserCount,
            });
        }
    }
}
