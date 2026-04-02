using ClosedXML.Excel;
using Invest.Core.Dtos;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Invest.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AccountBalanceHistory : ControllerBase
    {
        private readonly RepositoryContext _context;

        public AccountBalanceHistory(RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet("get-account-history")]
        public async Task<IActionResult> GetAll([FromQuery] PaginationDto pagination)
        {
            bool isAsc = pagination?.SortDirection?.ToLower() == "asc";
            string? sortField = pagination?.SortField?.ToLower();
            int page = pagination?.CurrentPage ?? 1;
            int pageSize = pagination?.PerPage ?? 50;

            var query = _context.AccountBalanceChangeLogs
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
                                    Comment = i.Comment
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
                "changedate" => isAsc ? query.OrderBy(i => i.ChangeDate) : query.OrderByDescending(i => i.ChangeDate),
                "investmentname" => isAsc ? query.OrderBy(i => i.InvestmentName) : query.OrderByDescending(i => i.InvestmentName),
                _ => query.OrderByDescending(i => i.ChangeDate)
            };

            int totalCount = await query.CountAsync();

            var pagedData = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

            if (pagedData.Any())
                return Ok(new { items = pagedData, totalCount = totalCount });

            return Ok(new { Success = false, Message = "Data not found." });
        }

        [HttpGet("getAll/{groupId}")]
        public async Task<IActionResult> GetAll(int groupId, string? sortField = null, string? sortDirection = null)
        {
            sortField = sortField?.ToLower();

            var query = _context.AccountBalanceChangeLogs
                                .Where(i => i.GroupId == groupId)
                                .Select(i => new
                                {
                                    i.Id,
                                    i.UserName,
                                    i.ChangeDate,
                                    i.OldValue,
                                    i.NewValue,
                                    i.InvestmentName
                                })
                                .AsQueryable();

            bool isAsc = sortDirection?.ToLower() == "asc";

            switch (sortField)
            {
                case "changedate":
                    query = isAsc ? query.OrderBy(i => i.ChangeDate) : query.OrderByDescending(i => i.ChangeDate);
                    break;
                case "investmentname":
                    query = isAsc ? query.OrderBy(i => i.InvestmentName) : query.OrderByDescending(i => i.InvestmentName);
                    break;
                default:
                    query = query.OrderByDescending(i => i.ChangeDate);
                    break;
            }

            var result = await query.ToListAsync();

            return Ok(result);
        }

        [HttpGet("Export")]
        public async Task<IActionResult> GetExportAccountBalanceHistories(int? groupId = null)
        {
            var items = await _context.AccountBalanceChangeLogs
                .Where(i => groupId != null ? i.GroupId == groupId : true)
                .OrderByDescending(i => i)
                .ToListAsync();

            var data = items.OrderByDescending(d => d.Id).ToList();

            string contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            string fileName = "AccountBalanceHistory.xlsx";

            using (var workbook = new XLWorkbook())
            {
                IXLWorksheet worksheet = workbook.Worksheets.Add("AccountBalanceHistory");

                var headers = new[]
                {
                    "UserName", "ChangeDate", "InvestmentName", "PaymentType", "OldValue", "NewValue", "ZipCode", "Comment"
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
