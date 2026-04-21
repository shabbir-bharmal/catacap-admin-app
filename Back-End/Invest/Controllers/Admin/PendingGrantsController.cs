using AutoMapper;
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
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/pending-grant")]
    [ApiController]
    public class PendingGrantsController : ControllerBase
    {
        private readonly RepositoryContext _context;
        protected readonly IRepositoryManager _repository;
        private readonly IHttpContextAccessor _httpContextAccessors;
        private readonly IMailService _mailService;
        private readonly IMapper _mapper;
        private readonly EmailQueue _emailQueue;
        private readonly ImageService _imageService;
        private readonly AppSecrets _appSecrets;

        public PendingGrantsController(RepositoryContext context, IRepositoryManager repository, IHttpContextAccessor httpContextAccessors, IMailService mailService, IMapper mapper, EmailQueue emailQueue, ImageService imageService, AppSecrets appSecrets)
        {
            _context = context;
            _repository = repository;
            _httpContextAccessors = httpContextAccessors;
            _mailService = mailService;
            _mapper = mapper;
            _emailQueue = emailQueue;
            _imageService = imageService;
            _appSecrets = appSecrets;
        }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] PaginationDto pagination, string? dafProvider)
        {
            bool isAsc = pagination?.SortDirection?.ToLower() == "asc";
            bool? isDeleted = pagination?.IsDeleted;

            var statusList = pagination?.Status?.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                                .Select(s => s.Trim().ToLower())
                                                .ToList();
            var now = DateTime.UtcNow;

            var dafProviders = await _context.DAFProviders
                                             .Select(x => x.ProviderName!.ToLower().Trim())
                                             .ToListAsync();

            var providerList = string.IsNullOrEmpty(dafProvider)
                                ? new List<string>()
                                : dafProvider.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                             .Select(x => x.Trim().ToLower())
                                             .ToList();
                
            var hasOther = providerList.Contains("other");

            var selectedProviders = providerList
                                    .Where(p => p != "other")
                                    .ToList();

            var query = _context.PendingGrants
                                .ApplySoftDeleteFilter(isDeleted)
                                .Where(i => (statusList == null || statusList.Count == 0 ||
                                                (statusList.Contains("pending")
                                                    ? string.IsNullOrEmpty(i.status) && statusList.Contains("pending") ||
                                                        !string.IsNullOrEmpty(i.status) && statusList.Contains(i.status.ToLower())
                                                    : !string.IsNullOrEmpty(i.status) && statusList.Contains(i.status.ToLower())
                                                )
                                            )
                                            && (string.IsNullOrEmpty(pagination!.SearchValue)
                                                || (i.User.FirstName + " " + i.User.LastName).ToLower().Contains(pagination.SearchValue.ToLower())
                                                || i.User.Email.ToLower().Contains(pagination.SearchValue.ToLower())
                                            )
                                            && (
                                                providerList.Count == 0
                                                || selectedProviders.Contains(i.DAFProvider.ToLower().Trim())

                                                || (
                                                    hasOther
                                                    && !dafProviders.Contains(i.DAFProvider.ToLower().Trim())
                                                    && i.DAFProvider.ToLower().Trim() != "foundation grant"
                                                )
                                            )
                                )
                                .Select(i => new
                                {
                                    i.Id,
                                    i.User.FirstName,
                                    i.User.LastName,
                                    i.User.Email,
                                    i.Amount,
                                    i.AmountAfterFees,
                                    i.DAFName,
                                    i.DAFProvider,
                                    InvestmentName = i.Campaign!.Name,
                                    i.Reference,
                                    Status = string.IsNullOrEmpty(i.status) ? "Pending" : i.status,
                                    i.CreatedDate,
                                    HasNotes = _context.PendingGrantNotes.Any(n => n.PendingGrantId == i.Id),
                                    i.DeletedAt,
                                    i.DeletedByUser
                                });

            switch (pagination?.SortField?.ToLower())
            {
                case "fullname":
                    query = isAsc
                                ? query.OrderBy(i => i.Status.ToLower() == "rejected" ? 1 : 0)
                                        .ThenBy(i => i.FirstName)
                                        .ThenBy(i => i.LastName)
                                : query.OrderBy(i => i.Status.ToLower() == "rejected" ? 1 : 0)
                                        .ThenByDescending(i => i.FirstName)
                                        .ThenByDescending(i => i.LastName);
                    break;

                case "createddate":
                    query = isAsc
                                ? query.OrderBy(i => i.Status.ToLower() == "rejected" ? 1 : 0)
                                        .ThenBy(i => i.CreatedDate ?? DateTime.MaxValue)
                                : query.OrderBy(i => i.Status.ToLower() == "rejected" ? 1 : 0)
                                        .ThenByDescending(i => i.CreatedDate ?? DateTime.MinValue);
                    break;

                case "status":
                    query = isAsc
                                ? query.OrderBy(i => i.Status)
                                : query.OrderByDescending(i => i.Status);
                    break;

                case "dayscount":
                    query = isAsc
                                ? query.OrderBy(i => i.Status.ToLower() == "pending" ? 0
                                                        : string.IsNullOrEmpty(i.Status)
                                                        ? 2 : 1)
                                        .ThenBy(i => i.CreatedDate ?? DateTime.MaxValue)
                                : query.OrderBy(i => i.Status.ToLower() == "pending" ? 0
                                                        : string.IsNullOrEmpty(i.Status)
                                                        ? 2 : 1)
                                        .ThenByDescending(i => i.CreatedDate ?? DateTime.MinValue);
                    break;

                default:
                    query = query.OrderBy(i => i.Status.ToLower() == "rejected")
                                    .ThenByDescending(i => i.CreatedDate);
                    break;
            }

            int page = pagination?.CurrentPage ?? 1;
            int pageSize = pagination?.PerPage ?? 50;
            int totalCount = await query.CountAsync();

            var results = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

            var pagedData = results.Select(i => new
            {
                i.Id,
                i.FirstName,
                i.LastName,
                FullName = i.FirstName + " " + i.LastName,
                i.Email,
                i.Amount,
                i.AmountAfterFees,
                i.DAFName,
                i.DAFProvider,
                i.InvestmentName,
                i.Reference,
                Status = string.IsNullOrEmpty(i.Status) ? "Pending" : i.Status,
                i.CreatedDate,
                i.HasNotes,
                DaysCount = !string.IsNullOrEmpty(i.Status) && i.Status.ToLower() == "pending" && i.CreatedDate != null
                                ? GetReadableDuration(i.CreatedDate.Value, now)
                                : null,
                i.DeletedAt,
                DeletedBy = i.DeletedByUser != null
                            ? $"{i.DeletedByUser.FirstName} {i.DeletedByUser.LastName}"
                            : null
            }).ToList();

            if (pagedData.Any())
                return Ok(new { items = pagedData, totalCount });

            return Ok(new { Success = false, Message = "Data not found." });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdatePendingGrantsDto pendingGrantsData)
        {
            var pendingGrant = await _context.PendingGrants
                                             .Include(p => p.Campaign)
                                             .Include(p => p.User)
                                             .FirstOrDefaultAsync(i => i.Id == id);
            if (pendingGrant == null)
                return BadRequest(new { Success = false, Message = "Wrong pending grand id." });

            pendingGrant.ModifiedDate = DateTime.Now;

            string currentStatus = pendingGrant.status ?? "Pending";
            decimal pendingGrandAmount = Convert.ToDecimal(pendingGrant.Amount);

            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;
            var loginUser = await _repository.UserAuthentication.GetUserById(loginUserId!);

            if (pendingGrantsData.Status == "In Transit" && currentStatus == "Pending")
            {
                var user = await _context.Users.FirstOrDefaultAsync(i => i.Email == pendingGrant.User.Email);
                if (user == null)
                    return BadRequest(new { Success = false, Message = "User not found." });

                bool isFreeUser = user.IsFreeUser.GetValueOrDefault();
                decimal totalCataCapFee = pendingGrandAmount * 0.05m; //CataCap Fee
                decimal amount = pendingGrant.AmountAfterFees > 0 ? pendingGrant.AmountAfterFees ?? 0m : (pendingGrandAmount - totalCataCapFee);

                var groupAccountBalance = await _context.GroupAccountBalance
                                                .Include(gab => gab.Group)
                                                .Where(gab => gab.User.Id == user.Id)
                                                .OrderBy(gab => gab.Id)
                                                .ToListAsync();

                decimal totalGroupBalance = groupAccountBalance.Sum(gab => gab.Balance);
                decimal fromWallet = Convert.ToDecimal(pendingGrant.InvestedSum) - (pendingGrandAmount + totalGroupBalance);

                if (user.AccountBalance < fromWallet)
                    return Ok(new { Success = false, Message = "User do not have sufficient wallet balance." });

                pendingGrant.status = "In Transit";

                var grantType = pendingGrant.DAFProvider.ToLower().Trim() == "foundation grant" ? "Foundation grant" : "DAF grant";

                string? zipCode = null;
                if (!string.IsNullOrWhiteSpace(pendingGrant.Address))
                {
                    var address = JsonSerializer.Deserialize<AddressDto>(pendingGrant.Address);
                    zipCode = address?.ZipCode;
                }

                decimal fees = pendingGrant.GrantAmount - pendingGrant.AmountAfterFees ?? 0m;

                var balanceResult = await UpdateAccountBalance(pendingGrant.User.Email, amount, pendingGrandAmount, fees, grantType, pendingGrant.Id, pendingGrant.TotalInvestedAmount ?? 0m, pendingGrant.Reference, pendingGrant.Campaign?.Name, zipCode);
                if(!balanceResult.Success)
                    return Ok(new { Success = false, balanceResult.Message });

                decimal totalAvailable = Convert.ToDecimal(user.AccountBalance + amount + totalGroupBalance);
                decimal finalInvestmentAmount = Math.Min(totalAvailable, Convert.ToDecimal(pendingGrant.InvestedSum));

                if (pendingGrant.Campaign != null)
                {
                    var recommendation = new AddRecommendationDto
                    {
                        Amount = finalInvestmentAmount,
                        IsGroupAccountBalance = true,
                        IsRequestForInTransit = true,
                        Campaign = pendingGrant.Campaign,
                        User = pendingGrant.User,
                        UserEmail = pendingGrant.User.Email,
                        UserFullName = pendingGrant.User.FirstName + " " + pendingGrant.User.LastName,
                        PendingGrants = pendingGrant
                    };

                    await new RecommendationsController(
                        _context,
                        _repository,
                        _mapper,
                        _httpContextAccessors,
                        _mailService,
                        _emailQueue,
                        _imageService,
                        _appSecrets)
                        .Create(recommendation);

                    var userInvestment = new UserInvestments
                    {
                        UserId = user.Id,
                        PaymentType = $"Manually, {loginUser.UserName.Trim().ToLower()}",
                        CampaignName = pendingGrant.Campaign.Name,
                        CampaignId = pendingGrant.Campaign.Id,
                        LogTriggered = true
                    };
                    await _context.UserInvestments.AddAsync(userInvestment);
                }
                user.IsActive = true;
                user.IsFreeUser = false;
                await _context.SaveChangesAsync();
            }
            else if (pendingGrantsData.Status == "Rejected")
            {
                if (currentStatus == "In Transit")
                {
                    var user = await _context.Users.FirstOrDefaultAsync(i => i.Email == pendingGrant.User.Email);

                    if (user == null)
                        return BadRequest(new { Success = false, Message = "User not found" });

                    pendingGrant.status = "Rejected";
                    pendingGrant.RejectedBy = loginUserId!;
                    pendingGrant.RejectionMemo = pendingGrantsData.RejectionMemo.Trim();
                    pendingGrant.RejectionDate = DateTime.Now;

                    if (pendingGrant?.Campaign?.Id == null)
                    {
                        var existingLog = await _context.AccountBalanceChangeLogs
                                                .Include(x => x.PendingGrants)
                                                .Where(x => x.UserId == pendingGrant!.UserId && x.PendingGrantsId == pendingGrant.Id)
                                                .OrderByDescending(x => x.Id)
                                                .FirstOrDefaultAsync();

                        if (existingLog != null)
                        {
                            await AccountBalanceChangeLog(user, -existingLog!.PendingGrants!.AmountAfterFees!.Value, $"Pending grant reverted, id = {pendingGrant?.Id}", pendingGrant!.Id, existingLog.Reference);
                            await _context.SaveChangesAsync();
                        }
                    }
                    else
                    {
                        var recommendation = await _context.Recommendations.FirstOrDefaultAsync(x =>
                                                        x.Campaign != null &&
                                                        x.UserEmail == user.Email &&
                                                        x.Campaign.Id == pendingGrant.Campaign.Id &&
                                                        x.PendingGrantsId == pendingGrant.Id);

                        var existingLog = await _context.AccountBalanceChangeLogs
                                                .Where(x => x.UserId == pendingGrant.UserId)
                                                .OrderByDescending(x => x.Id)
                                                .FirstOrDefaultAsync();

                        if (existingLog != null)
                        {
                            // decimal totalCataCapFee = (pendingGrandAmount * 0.05m); //CataCap Fee
                            // decimal amount = pendingGrandAmount - totalCataCapFee;

                            decimal amount = pendingGrant.AmountAfterFees ?? pendingGrandAmount - (pendingGrandAmount * 0.05m);

                            if (recommendation?.Status != "rejected")
                                await AccountBalanceChangeLog(user, recommendation?.Amount ?? 0, $"Recommendation reverted due to pending grant rollback, id = {recommendation?.Id}", pendingGrant.Id, existingLog.Reference, recommendation?.Campaign?.Name, recommendation?.Campaign?.Id);

                            await AccountBalanceChangeLog(user, -amount, $"Pending grant reverted, id = {pendingGrant.Id}", pendingGrant.Id, existingLog.Reference);
                        }

                        if (recommendation != null)
                            recommendation.Status = "rejected";

                        await _context.SaveChangesAsync();
                    }
                }
                else if (currentStatus == "Pending")
                {
                    pendingGrant.status = "Rejected";
                    pendingGrant.RejectedBy = loginUserId!;
                    pendingGrant.RejectionMemo = pendingGrantsData.RejectionMemo.Trim();
                    pendingGrant.RejectionDate = DateTime.Now;

                    await _context.SaveChangesAsync();
                }
            }
            else if (pendingGrantsData.Status == "Received" && currentStatus == "In Transit")
            {
                pendingGrant.status = "Received";
                await _context.SaveChangesAsync();
            }

            if (!string.IsNullOrWhiteSpace(pendingGrantsData.Note))
            {
                _context.PendingGrantNotes.Add(new PendingGrantNotes
                {
                    PendingGrantId = pendingGrant!.Id,
                    Note = pendingGrantsData.Note.Trim(),
                    CreatedBy = loginUserId,
                    CreatedAt = DateTime.Now,
                    OldStatus = currentStatus,
                    NewStatus = pendingGrantsData.Status
                });
                await _context.SaveChangesAsync();
            }

            return Ok(new
            {
                Success = true,
                Message = $"Grant set {pendingGrantsData.Status}"
            });
        }

        [HttpGet("{id}/notes")]
        public async Task<IActionResult> GetNotes(int id)
        {
            var notes = await _context.PendingGrantNotes
                                        .Where(x => x.PendingGrantId == id)
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

        [HttpGet("daf-providers")]
        public async Task<IActionResult> GetDAFProviders()
        {
            var dafProviders = await _context.DAFProviders
                                             .Select(x => new
                                             {
                                                 x.Id,
                                                 Value = x.ProviderName,
                                                 Link = x.ProviderURL
                                             })
                                             .ToListAsync();

            if (dafProviders.Any())
                return Ok(dafProviders);

            return Ok(new { Success = false, Message = "Data not found." });
        }

        [HttpGet("export")]
        public async Task<IActionResult> Export()
        {
            var data = await _context.PendingGrants
                                        .Include(i => i.Campaign)
                                        .Include(i => i.User)
                                        .OrderByDescending(i => i.Id)
                                        .ToListAsync();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "PendingGrants.xlsx";

            var now = DateTime.UtcNow;

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("PendingGrants");

                var headers = new[]
                {
                    "Full Name", "Email", "Original Amount", "Amount After Fees", "DAF Provider", "DAF Name",
                    "Investment Name", "Grant Source", "Status", "Address", "Date Created", "Day Count"
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

                    var amountCell = worksheet.Cell(row, col++);
                    amountCell.Value = $"${Convert.ToDecimal(dto.Amount):N2}";
                    amountCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;

                    var amountAfterFeesCell = worksheet.Cell(row, col++);
                    amountAfterFeesCell.Value = $"${Convert.ToDecimal(dto.AmountAfterFees):N2}";
                    amountAfterFeesCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;

                    worksheet.Cell(row, col++).Value = dto.DAFProvider;
                    worksheet.Cell(row, col++).Value = dto.DAFName;
                    worksheet.Cell(row, col++).Value = dto.Campaign?.Name;
                    worksheet.Cell(row, col++).Value = dto.Reference;
                    worksheet.Cell(row, col++).Value = string.IsNullOrEmpty(dto.status) ? "Pending" : dto.status;
                    worksheet.Cell(row, col++).Value = dto.Address;
                    worksheet.Cell(row, col++).Value = dto.CreatedDate?.ToString("MM-dd-yyyy HH:mm");

                    var createdDateCell = worksheet.Cell(row, col++);
                    if (string.IsNullOrEmpty(dto.status) || dto.status.ToLower() == "pending")
                    {
                        createdDateCell.Value = dto.CreatedDate != null
                                                    ? GetReadableDuration(dto.CreatedDate.Value, now)
                                                    : "";
                    }
                    else
                    {
                        createdDateCell.Value = "";
                    }
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

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.PendingGrants.FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null)
                return Ok(new { Success = false, Message = "Pending grant not found." });

            var logs = await _context.AccountBalanceChangeLogs
                                     .Where(x => x.PendingGrantsId == id)
                                     .ToListAsync();

            var recommendations = await _context.Recommendations
                                                .Where(x => x.PendingGrantsId == id)
                                                .ToListAsync();

            var scheduledEmails = await _context.ScheduledEmailLogs
                                                .Where(x => x.PendingGrantId == id)
                                                .ToListAsync();

            _context.AccountBalanceChangeLogs.RemoveRange(logs);
            _context.Recommendations.RemoveRange(recommendations);
            _context.ScheduledEmailLogs.RemoveRange(scheduledEmails);
            _context.PendingGrants.Remove(entity);

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Pending grant deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var grants = await _context.PendingGrants
                                       .IgnoreQueryFilters()
                                       .Where(x => ids.Contains(x.Id))
                                       .ToListAsync();

            if (!grants.Any())
                return Ok(new { Success = false, Message = "Pending grant not found." });

            var deletedGrants = grants.Where(x => x.IsDeleted).ToList();

            if (!deletedGrants.Any())
                return Ok(new { Success = false, Message = "No deleted pending grants found." });

            var grantIds = deletedGrants.Select(x => x.Id).ToList();

            await using var transaction = await _context.Database.BeginTransactionAsync();

            var parentUserIds = deletedGrants
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

            var logs = await _context.AccountBalanceChangeLogs
                                     .IgnoreQueryFilters()
                                     .Where(x => x.PendingGrantsId != null &&
                                                 grantIds.Contains(x.PendingGrantsId.Value) &&
                                                 x.IsDeleted)
                                     .ToListAsync();

            var recommendations = await _context.Recommendations
                                                .IgnoreQueryFilters()
                                                .Where(x => x.PendingGrantsId != null &&
                                                            grantIds.Contains(x.PendingGrantsId.Value) &&
                                                            x.IsDeleted)
                                                .ToListAsync();

            var scheduledEmails = await _context.ScheduledEmailLogs
                                                .IgnoreQueryFilters()
                                                .Where(x => grantIds.Contains(x.PendingGrantId) &&
                                                            x.IsDeleted)
                                                .ToListAsync();

            deletedGrants.RestoreRange();
            logs.RestoreRange();
            recommendations.RestoreRange();
            scheduledEmails.RestoreRange();

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return Ok(new { Success = true, Message = $"{deletedGrants.Count} pending grant(s) restored successfully." });
        }

        private async Task<(bool Success, string Message)> UpdateAccountBalance(string email, decimal accountBalance, decimal originalAmount, decimal totalCataCapFee, string grantType, int pendingGrantsId, decimal totalInvestmentAmount, string? reference = null, string? investmentName = null, string? zipCode = null)
        {
            var user = await _context.Users.FirstOrDefaultAsync(i => i.Email == email);

            if (user?.AccountBalance + accountBalance < 0)
                return (false, "Insufficient balance in user account.");

            var identity = HttpContext?.User.Identity as ClaimsIdentity == null ? _httpContextAccessors.HttpContext?.User.Identity as ClaimsIdentity : HttpContext.User.Identity as ClaimsIdentity;
            var loginUserId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;
            var loginUser = await _repository.UserAuthentication.GetUserById(loginUserId!);

            var accountBalanceChangeLog = new AccountBalanceChangeLog
            {
                UserId = user!.Id,
                PaymentType = string.IsNullOrWhiteSpace(grantType)
                                ? $"Manually, {loginUser.UserName.Trim().ToLower()}"
                                : $"{grantType}, {loginUser.UserName.Trim().ToLower()}",
                OldValue = user.AccountBalance,
                UserName = user.UserName,
                NewValue = user.AccountBalance + accountBalance,
                PendingGrantsId = pendingGrantsId,
                Fees = totalCataCapFee,
                GrossAmount = originalAmount,
                NetAmount = accountBalance,
                Reference = !string.IsNullOrWhiteSpace(reference) ? reference.Trim() : null,
                ZipCode = !string.IsNullOrWhiteSpace(zipCode) ? zipCode.Trim() : null,
            };
            await _context.AccountBalanceChangeLogs.AddAsync(accountBalanceChangeLog);

            if (user.IsFreeUser == true)
                user.IsFreeUser = false;

            user.AccountBalance = user.AccountBalance == null ? accountBalance : user.AccountBalance + accountBalance;

            await _context.SaveChangesAsync();

            if (user.OptOutEmailNotifications == null || !user.OptOutEmailNotifications.Value)
            {
                var request = _httpContextAccessors.HttpContext?.Request.Headers["Origin"].ToString();

                decimal newValue = accountBalanceChangeLog.NewValue ?? 0m;
                decimal userBalance = user.AccountBalance ?? 0m;
                decimal amountAfterInvestment = newValue - Math.Min(userBalance, totalInvestmentAmount);
                decimal investmentAmount;

                if (newValue > userBalance!)
                    investmentAmount = newValue;
                else if (newValue < totalInvestmentAmount)
                    investmentAmount = newValue;
                else
                    investmentAmount = originalAmount;

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
                    
                    //_ = SendEmail(request!, email, user.FirstName!, user.LastName!, originalAmount, accountBalance, investmentName, investmentAmount, amountAfterInvestment);
                }
            }

            return (true, "Account balance has been updated successfully!");
        }

        private async Task AccountBalanceChangeLog(User user, decimal amount, string type, int pendingGrandId, string? reference = null, string? investmentName = null, int? campaignId = null)
        {
            var log = new AccountBalanceChangeLog
            {
                UserId = user.Id,
                PaymentType = type,
                OldValue = user.AccountBalance,
                UserName = user.UserName,
                NewValue = user.AccountBalance + amount,
                PendingGrantsId = pendingGrandId,
                Reference = !string.IsNullOrWhiteSpace(reference) ? reference : null,
                InvestmentName = investmentName,
                CampaignId = campaignId
            };

            await _context.AccountBalanceChangeLogs.AddAsync(log);
            user.AccountBalance = log.NewValue;
        }

        private static string GetReadableDuration(DateTime from, DateTime to)
        {
            int years = to.Year - from.Year;
            int months = to.Month - from.Month;
            int days = to.Day - from.Day;

            if (days < 0)
            {
                months--;
                days += DateTime.DaysInMonth(from.Year, from.Month);
            }

            if (months < 0)
            {
                years--;
                months += 12;
            }

            List<string> parts = new List<string>();
            if (years > 0) parts.Add($"{years} year{(years > 1 ? "s" : "")}");
            if (months > 0) parts.Add($"{months} month{(months > 1 ? "s" : "")}");
            if (days > 0) parts.Add($"{days} day{(days > 1 ? "s" : "")}");

            return parts.Count > 0 ? string.Join(", ", parts) : "0 days";
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
    }
}
