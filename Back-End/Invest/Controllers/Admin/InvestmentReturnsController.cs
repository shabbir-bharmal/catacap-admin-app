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
using Quartz.Util;
using System.Dynamic;
using System.Globalization;
using System.Security.Claims;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/investment-return")]
    [ApiController]
    public class InvestmentReturnsController : ControllerBase
    {
        private readonly RepositoryContext _context;
        protected readonly IRepositoryManager _repository;
        private readonly IMailService _mailService;
        private readonly EmailQueue _emailQueue;
        private readonly ImageService _imageService;
        private readonly AppSecrets _appSecrets;

        public InvestmentReturnsController(RepositoryContext context, IRepositoryManager repository, IMailService mailService, EmailQueue emailQueue, ImageService imageService, AppSecrets appSecrets)
        {
            _context = context;
            _repository = repository;
            _mailService = mailService;
            _emailQueue = emailQueue;
            _imageService = imageService;
            _appSecrets = appSecrets;
        }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] ReturnsHistoryRequestDto requestDto)
        {
            bool? isDeleted = requestDto?.IsDeleted;

            var query = _context.ReturnMasters
                                .Include(x => x.Campaign)
                                .AsQueryable();

            if (requestDto?.InvestmentId > 0)
                query = query.Where(x => x.CampaignId == requestDto.InvestmentId);

            List<ReturnMaster> returnMasters = await query.ToListAsync();

            if (!returnMasters.Any())
                return Ok(new { Success = false, Message = "No data found." });

            var masterIds = returnMasters.Select(x => x.Id).ToList();

            var allDetails = await _context.ReturnDetails
                                            .IgnoreQueryFilters()
                                            .Include(x => x.User)
                                            .Include(x => x.DeletedByUser)
                                            .Where(x => masterIds.Contains(x.ReturnMasterId))
                                            .ToListAsync();

            foreach (var master in returnMasters)
            {
                master.ReturnDetails = allDetails
                                    .Where(rd => rd.ReturnMasterId == master.Id)
                                    .ToList();
            }

            var culture = CultureInfo.GetCultureInfo("en-US");

            var returnsHistory = returnMasters
                                .SelectMany(rm => rm.ReturnDetails ?? new List<ReturnDetails>(), (rm, rd) => new
                                {
                                    rm.CreatedOn,
                                    rd.InvestmentAmount,
                                    rd.IsDeleted,
                                    Dto = new ReturnsHistoryResponseDto
                                    {
                                        Id = rd.Id,
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
                                            ? string.Format(culture, "{0:MM/dd/yy}-{1:MM/dd/yy}",
                                                rm.PrivateDebtStartDate.Value.Date,
                                                rm.PrivateDebtEndDate.Value.Date)
                                            : null,
                                        PostDate = rm.PostDate.Date.ToString("MM/dd/yy", culture),
                                        DeletedAt = rd.DeletedAt,
                                        DeletedBy = rd.DeletedByUser != null
                                            ? $"{rd.DeletedByUser.FirstName} {rd.DeletedByUser.LastName}"
                                            : null
                                    }
                                })
                                .Where(x => !isDeleted.HasValue || x.IsDeleted == isDeleted.Value)
                                .OrderByDescending(x => x.CreatedOn)
                                .ThenByDescending(x => x.InvestmentAmount)
                                .Select(x => x.Dto)
                                .ToList();

            int totalCount = returnsHistory.Count();

            if (totalCount == 0)
                return Ok(new { Success = false, Message = "No data found." });

            int currentPage = requestDto?.CurrentPage ?? 1;
            int perPage = requestDto?.PerPage ?? 10;

            var pagedReturns = returnsHistory
                                .Skip((currentPage - 1) * perPage)
                                .Take(perPage)
                                .ToList();

            dynamic response = new ExpandoObject();
            response.items = pagedReturns;
            response.totalCount = totalCount;

            return Ok(response);
        }

        [HttpGet("calculate")]
        public async Task<IActionResult> Calculate([FromQuery] ReturnCalculationRequestDto requestDto)
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

        [HttpPost]
        public async Task<IActionResult> Save([FromBody] ReturnCalculationRequestDto requestDto)
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

            var actionResult = await Calculate(requestDto) as OkObjectResult;

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

        [HttpGet("export")]
        public async Task<IActionResult> Export()
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

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.ReturnDetails.FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null)
                return Ok(new { Success = false, Message = "Return not found." });

            _context.ReturnDetails.Remove(entity);

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Return deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var returns = await _context.ReturnDetails
                                        .IgnoreQueryFilters()
                                        .Where(x => ids.Contains(x.Id))
                                        .ToListAsync();

            if (!returns.Any())
                return Ok(new { Success = false, Message = "Return not found." });

            var deletedReturns = returns.Where(x => x.IsDeleted).ToList();

            if (!deletedReturns.Any())
                return Ok(new { Success = false, Message = "No deleted returns found to restore." });

            await using var transaction = await _context.Database.BeginTransactionAsync();

            var parentUserIds = deletedReturns
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

            deletedReturns.RestoreRange();

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            var userSuffix = restoredUserCount > 0
                ? $" {restoredUserCount} owning user account(s) were also restored."
                : string.Empty;
            return Ok(new
            {
                Success = true,
                Message = $"{deletedReturns.Count} return(s) restored successfully.{userSuffix}",
                RestoredCount = deletedReturns.Count,
                RestoredUserCount = restoredUserCount,
            });
        }

        private async Task UpdateUsersWalletBalance(User user, decimal amount, string investmentName, int? campaignId, int ReturnMastersId)
        {
            var accountBalanceChangeLog = new AccountBalanceChangeLog
            {
                UserId = user.Id,
                PaymentType = $"Return credited, Id = {ReturnMastersId}",
                OldValue = user.AccountBalance,
                UserName = user.UserName,
                NewValue = user.AccountBalance + amount,
                InvestmentName = investmentName,
                CampaignId = campaignId,
                Fees = 0m,
                GrossAmount = amount,
                NetAmount = amount
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
    }
}
