using AutoMapper;
using ClosedXML.Excel;
using Invest.Core.Dtos;
using Invest.Core.Extensions;
using Invest.Core.Models;
using Invest.Core.Settings;
using Invest.Repo.Data;
using Invest.Service.Interfaces;
using Invest.Service.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/other-asset")]
    [ApiController]
    public class OtherAssetsController : ControllerBase
    {
        private readonly RepositoryContext _context;
        private readonly IRepositoryManager _repositoryManager;
        private readonly IHttpContextAccessor _httpContextAccessors;
        private readonly IMailService _mailService;
        private readonly IMapper _mapper;
        private readonly EmailQueue _emailQueue;
        private readonly ImageService _imageService;
        private readonly AppSecrets _appSecrets;

        public OtherAssetsController(RepositoryContext context, IRepositoryManager repositoryManager, IHttpContextAccessor httpContextAccessor, IMailService mailService, IMapper mapper, EmailQueue emailQueue, ImageService imageService, AppSecrets appSecrets)
        {
            _context = context;
            _repositoryManager = repositoryManager;
            _httpContextAccessors = httpContextAccessor;
            _mailService = mailService;
            _mapper = mapper;
            _emailQueue = emailQueue;
            _imageService = imageService;
            _appSecrets = appSecrets;
        }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] PaginationDto dto)
        {
            if (dto == null)
                return BadRequest(new { Success = false, Message = "Invalid request data." });

            bool isAsc = dto?.SortDirection?.ToLower() == "asc";
            bool? isDeleted = dto?.IsDeleted;

            var statusList = dto?.Status?.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                            .Select(s => s.Trim().ToLower())
                                            .ToList();

            var query = _context.AssetBasedPaymentRequest
                                .ApplySoftDeleteFilter(isDeleted)
                                .AsNoTracking()
                                .Where(i => statusList == null || statusList.Count == 0 ||
                                        (statusList.Contains("pending")
                                            ? (string.IsNullOrEmpty(i.Status) && statusList.Contains("pending")) ||
                                                (!string.IsNullOrEmpty(i.Status) && statusList.Contains(i.Status.ToLower()))
                                            : (!string.IsNullOrEmpty(i.Status) && statusList.Contains(i.Status.ToLower()))
                                        )
                                )
                                .Select(i => new AssetBasedPaymentResponseDto
                                {
                                    Id = i.Id,
                                    Name = i.User.FirstName + " " + i.User.LastName,
                                    Email = i.User.Email,
                                    InvestmentName = !string.IsNullOrWhiteSpace(i.Campaign!.Name)
                                                        ? i.Campaign.Name
                                                        : null,
                                    AssetType = !string.IsNullOrWhiteSpace(i.AssetDescription)
                                                        ? i.AssetDescription
                                                        : i.AssetType.Type,
                                    ApproximateAmount = i.ApproximateAmount,
                                    ReceivedAmount = i.ReceivedAmount,
                                    ContactMethod = i.ContactMethod,
                                    ContactValue = i.ContactValue,
                                    Status = i.Status,
                                    CreatedAt = i.CreatedAt,
                                    HasNotes = _context.AssetBasedPaymentRequestNotes.Any(n => n.RequestId == i.Id),
                                    DeletedAt = i.DeletedAt,
                                    DeletedBy = i.DeletedByUser != null
                                                        ? $"{i.DeletedByUser.FirstName} {i.DeletedByUser.LastName}"
                                                        : null
                                });

            query = dto?.SortField?.ToLower() switch
            {
                "name" => isAsc
                            ? query.OrderBy(x => x.Name)
                            : query.OrderByDescending(x => x.Name),

                "status" => isAsc
                                ? query.OrderBy(i => i.Status)
                                : query.OrderByDescending(i => i.Status),

                "assettype" => isAsc
                                ? query.OrderBy(i => i.AssetType)
                                : query.OrderByDescending(i => i.AssetType),

                "createdat" => isAsc
                                  ? query.OrderBy(x => x.CreatedAt)
                                  : query.OrderByDescending(x => x.CreatedAt),

                _ => query.OrderByDescending(x => x.Id)
            };

            int page = dto?.CurrentPage ?? 1;
            int pageSize = dto?.PerPage ?? 50;
            int totalCount = await query.CountAsync();

            var items = await query
                        .Skip((page - 1) * pageSize)
                        .Take(pageSize)
                        .ToListAsync();

            if (totalCount > 0)
                return Ok(new { items, totalCount });

            return Ok(new { Success = false, Message = "Data not found." });
        }

        [HttpPut("{id}/status")]
        public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdateAssetPaymentDto dto)
        {
            var assetPayment = await _context.AssetBasedPaymentRequest
                                                .Include(x => x.Campaign)
                                                .Include(x => x.User)
                                                .Include(x => x.AssetType)
                                                .FirstOrDefaultAsync(x => x.Id == id);

            if (assetPayment == null)
                return BadRequest(new { Success = false, Message = "Asset payment request not found." });

            var user = assetPayment.User;
            if (user == null)
                return BadRequest(new { Success = false, Message = "Associated user not found." });

            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            if (string.IsNullOrEmpty(loginUserId))
                return Unauthorized(new { Success = false, Message = "Unauthorized access." });

            var loginUser = await _repositoryManager.UserAuthentication.GetUserById(loginUserId!);

            if (loginUser == null)
                return Unauthorized(new { Success = false, Message = "Logged-in user not found." });

            string oldStatus = assetPayment.Status ?? "Pending";
            string newStatus = dto.Status ?? "Pending";

            if (!string.IsNullOrWhiteSpace(dto.Note))
            {
                await _context.AssetBasedPaymentRequestNotes.AddAsync(new AssetBasedPaymentRequestNotes
                {
                    RequestId = assetPayment.Id,
                    Note = dto.Note.Trim(),
                    OldStatus = oldStatus,
                    NewStatus = newStatus,
                    CreatedBy = loginUserId!,
                    CreatedAt = DateTime.Now
                });
            }

            if (oldStatus == "Pending" && newStatus == "In Transit")
            {
                assetPayment.Status = newStatus;
            }
            else if (oldStatus == "In Transit" && newStatus == "Received")
            {
                assetPayment.ReceivedAmount = dto.Amount > 0 ? dto.Amount : assetPayment.ReceivedAmount;

                decimal grossAmount = assetPayment.ApproximateAmount;
                decimal netAmount = assetPayment.ReceivedAmount;
                decimal fees = grossAmount - netAmount;

                var paymentType = !string.IsNullOrWhiteSpace(assetPayment.AssetDescription)
                                    ? $"{assetPayment.AssetDescription}, {loginUser.UserName.Trim().ToLower()}"
                                    : $"{assetPayment.AssetType.Type}, {loginUser.UserName.Trim().ToLower()}";

                var isSuccess = await UpdateAccountBalance(user, assetPayment.ReceivedAmount, paymentType, assetPayment.Id, fees, grossAmount, netAmount);

                if (!isSuccess)
                    return BadRequest(new { Success = false, Message = "Failed to update account balance." });

                if (assetPayment.CampaignId.HasValue)
                {
                    await new RecommendationsController(
                        _context,
                        _repositoryManager,
                        _mapper,
                        _httpContextAccessors,
                        _mailService,
                        _emailQueue,
                        _imageService,
                        _appSecrets)
                        .Create(new AddRecommendationDto
                        {
                            Amount = user.AccountBalance,
                            Campaign = assetPayment.Campaign,
                            User = assetPayment.User,
                            UserEmail = assetPayment.User.Email,
                            UserFullName = $"{user.FirstName} {user.LastName}",
                            AssetBasedPaymentRequest = assetPayment
                        });

                    await _context.UserInvestments.AddAsync(new UserInvestments
                    {
                        UserId = user.Id,
                        PaymentType = paymentType,
                        CampaignName = assetPayment.Campaign!.Name,
                        CampaignId = assetPayment.Campaign!.Id,
                        LogTriggered = true
                    });
                }
                assetPayment.Status = newStatus;
                user.IsFreeUser = false;
                user.IsActive = true;
            }
            else if ((oldStatus == "Pending" || oldStatus == "In Transit") && newStatus == "Rejected")
            {
                assetPayment.Status = newStatus;
            }

            var affectedRows = await _context.SaveChangesAsync();

            if (affectedRows <= 0)
                return BadRequest(new { Success = false, Message = "No changes were saved." });

            return Ok(new { Success = true, Message = "Asset payment status updated successfully." });
        }

        [HttpGet("export")]
        public async Task<IActionResult> Export()
        {
            var data = await _context.AssetBasedPaymentRequest
                                     .Include(x => x.User)
                                     .Include(x => x.Campaign)
                                     .Include(x => x.AssetType)
                                     .ToListAsync();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "AssetPaymentRequests.xlsx";

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("AssetPaymentRequests");

                var headers = new[]
                {
                    "Name", "Email", "Investment Name", "Asset Type", "Approximate Amount", "Received Amount", "Contact Method",
                    "Contact Value", "Status", "Date Created"
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

                    worksheet.Cell(row, col++).Value = dto.User.FirstName + " " + dto.User.LastName;
                    worksheet.Cell(row, col++).Value = dto.User.Email;
                    worksheet.Cell(row, col++).Value = dto.Campaign?.Name;
                    worksheet.Cell(row, col++).Value = !string.IsNullOrWhiteSpace(dto.AssetDescription) ? dto.AssetDescription : dto.AssetType.Type;

                    var approximateAmountCell = worksheet.Cell(row, col++);
                    approximateAmountCell.Value = $"${Convert.ToDecimal(dto.ApproximateAmount):N2}";
                    approximateAmountCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;

                    var receivedAmountCell = worksheet.Cell(row, col++);
                    receivedAmountCell.Value = $"${Convert.ToDecimal(dto.ReceivedAmount):N2}";
                    receivedAmountCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;

                    worksheet.Cell(row, col++).Value = dto.ContactMethod;
                    worksheet.Cell(row, col++).Value = dto.ContactValue;
                    worksheet.Cell(row, col++).Value = dto.Status;
                    worksheet.Cell(row, col++).Value = dto.CreatedAt.ToString("MM-dd-yyyy HH:mm");
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
                return Ok(new { Success = false, Message = "Invalid asset payment id" });

            var notes = await _context.AssetBasedPaymentRequestNotes
                                        .Where(x => x.RequestId == id)
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

            return Ok(notes);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.AssetBasedPaymentRequest.FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null)
                return Ok(new { Success = false, Message = "Other asset not found." });

            var accountLogs = await _context.AccountBalanceChangeLogs
                                            .Where(x => x.AssetBasedPaymentRequestId == id)
                                            .ToListAsync();
            
            _context.AccountBalanceChangeLogs.RemoveRange(accountLogs);
            _context.AssetBasedPaymentRequest.Remove(entity);

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Other asset deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var assets = await _context.AssetBasedPaymentRequest
                                       .IgnoreQueryFilters()
                                       .Where(x => ids.Contains(x.Id))
                                       .ToListAsync();

            if (!assets.Any())
                return Ok(new { Success = false, Message = "Other asset not found." });

            var deletedAssets = assets.Where(x => x.IsDeleted).ToList();

            if (!deletedAssets.Any())
                return Ok(new { Success = false, Message = "No deleted assets found to restore." });

            var assetIds = deletedAssets.Select(x => x.Id).ToList();

            var accountLogs = await _context.AccountBalanceChangeLogs
                                            .IgnoreQueryFilters()
                                            .Where(x => x.AssetBasedPaymentRequestId != null &&
                                                        assetIds.Contains(x.AssetBasedPaymentRequestId.Value) &&
                                                        x.IsDeleted)
                                            .ToListAsync();

            deletedAssets.RestoreRange();
            accountLogs.RestoreRange();

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = $"{deletedAssets.Count} other asset(s) restored successfully." });
        }

        private async Task<bool> UpdateAccountBalance(User user, decimal amount, string paymentType, int assetPaymentId, decimal fees, decimal grossAmount, decimal netAmount)
        {
            var accountBalanceLog = new AccountBalanceChangeLog
            {
                UserId = user.Id,
                PaymentType = paymentType,
                OldValue = user.AccountBalance,
                NewValue = user.AccountBalance + amount,
                UserName = user.UserName,
                AssetBasedPaymentRequestId = assetPaymentId,
                Fees = fees,
                GrossAmount = grossAmount,
                NetAmount = netAmount
            };
            await _context.AccountBalanceChangeLogs.AddAsync(accountBalanceLog);

            user.AccountBalance = accountBalanceLog.NewValue;

            var affectedRows = await _context.SaveChangesAsync();

            return affectedRows > 0;
        }
    }
}
