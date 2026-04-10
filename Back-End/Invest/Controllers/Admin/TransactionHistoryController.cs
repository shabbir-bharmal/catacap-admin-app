using ClosedXML.Excel;
using Invest.Core.Dtos;
using Invest.Core.Extensions;
using Invest.Repo.Data;
using Invest.Service.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/transaction-history")]
    [ApiController]
    public class TransactionHistoryController : ControllerBase
    {
        private readonly RepositoryContext _context;
        protected readonly IRepositoryManager _repository;

        public TransactionHistoryController(RepositoryContext context, IRepositoryManager repository)
        {
            _context = context;
            _repository = repository;
        }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] PaginationDto pagination)
        {
            bool isAsc = pagination?.SortDirection?.ToLower() == "asc";
            string? sortField = pagination?.SortField?.ToLower();
            int page = pagination?.CurrentPage ?? 1;
            int pageSize = pagination?.PerPage ?? 50;
            bool? isDeleted = pagination?.IsDeleted;

            var query = _context.AccountBalanceChangeLogs
                                .ApplySoftDeleteFilter(isDeleted)
                                .AsNoTracking()
                                .Select(i => new AccountHistoryDto
                                {
                                    Id = i.Id,
                                    UserName = i.UserName,
                                    Email = i.User!.Email,
                                    ChangeDate = i.ChangeDate,
                                    OldValue = i.OldValue,
                                    NewValue = i.NewValue,
                                    PaymentType = i.PaymentType,
                                    InvestmentName = i.InvestmentName,
                                    Comment = i.Comment,
                                    Fees = i.Fees,
                                    NetAmount = i.NetAmount,
                                    GrossAmount = i.GrossAmount,
                                    DeletedAt = i.DeletedAt,
                                    DeletedBy = i.DeletedByUser != null
                                                ? $"{i.DeletedByUser.FirstName} {i.DeletedByUser.LastName}"
                                                : null
                                });

            if (!string.IsNullOrWhiteSpace(pagination?.SearchValue))
            {
                var search = pagination.SearchValue.Trim();

                query = query.Where(u =>
                                        EF.Functions.Like(u.UserName ?? "", $"%{search}%") ||
                                        EF.Functions.Like(u.Email ?? "", $"%{search}%") ||
                                        EF.Functions.Like(u.PaymentType ?? "", $"%{search}%") ||
                                        EF.Functions.Like(u.InvestmentName ?? "", $"%{search}%")
                                    );
            }

            query = sortField switch
            {
                "changedate" => isAsc ? query.OrderBy(i => i.ChangeDate).ThenBy(i => i.Id) : query.OrderByDescending(i => i.ChangeDate).ThenByDescending(i => i.Id),
                "investmentname" => isAsc ? query.OrderBy(i => i.InvestmentName).ThenBy(i => i.Id) : query.OrderByDescending(i => i.InvestmentName).ThenByDescending(i => i.Id),
                _ => query.OrderByDescending(i => i.ChangeDate).ThenByDescending(i => i.Id)
            };

            int totalCount = await query.CountAsync();

            var pagedData = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

            if (pagedData.Any())
                return Ok(new { items = pagedData, totalCount });

            return Ok(new { Success = false, Message = "Data not found." });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.AccountBalanceChangeLogs.FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null)
                return Ok(new { Success = false, Message = "Account history not found." });

            _context.AccountBalanceChangeLogs.Remove(entity);

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Account history deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var logs = await _context.AccountBalanceChangeLogs
                                     .IgnoreQueryFilters()
                                     .Where(x => ids.Contains(x.Id))
                                     .ToListAsync();

            if (!logs.Any())
                return Ok(new { Success = false, Message = "Account history not found." });

            var deletedLogs = logs.Where(x => x.IsDeleted).ToList();

            if (!deletedLogs.Any())
                return Ok(new { Success = false, Message = "No deleted account history found." });

            deletedLogs.RestoreRange();

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = $"{deletedLogs.Count} account history record(s) restored successfully." });
        }

        [HttpGet("export")]
        public async Task<IActionResult> Export()
        {
            var items = await _context.AccountBalanceChangeLogs
                                      .OrderByDescending(i => i.ChangeDate)
                                      .ThenByDescending(i => i.Id)
                                      .ToListAsync();

            var data = items.ToList();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "AccountBalanceHistory.xlsx";

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("AccountBalanceHistory");

                var headers = new[]
                {
                    "User Name", "Change Date", "Investment Name", "Payment Type", "Old Value", "New Value", "Gross Amount", "Fees", "Net Amount", "Zip Code", "Comment"
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

                    var grossAmount = worksheet.Cell(row, col++);
                    grossAmount.Value = dto.GrossAmount;
                    grossAmount.Style.NumberFormat.Format = "$#,##0.00";

                    var fees = worksheet.Cell(row, col++);
                    fees.Value = dto.Fees;
                    fees.Style.NumberFormat.Format = "$#,##0.00";

                    var netAmount = worksheet.Cell(row, col++);
                    netAmount.Value = dto.NetAmount;
                    netAmount.Style.NumberFormat.Format = "$#,##0.00";

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
    }
}
