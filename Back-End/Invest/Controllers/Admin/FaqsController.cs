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
    [Route("api/admin/faq")]
    [ApiController]
    public class FaqsController : ControllerBase
    {
        private readonly RepositoryContext _context;

        public FaqsController(RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetFaqs([FromQuery] PaginationDto pagination, FaqCategory? category)
        {
            int page = pagination?.CurrentPage ?? 1;
            int pageSize = pagination?.PerPage ?? 10;
            string sortField = pagination?.SortField?.ToLower() ?? "displayorder";
            bool isAsc = pagination?.SortDirection?.ToLower() == "asc";
            bool? isDeleted = pagination?.IsDeleted;

            var query = _context.Faq.ApplySoftDeleteFilter(isDeleted).AsQueryable();

            if (!string.IsNullOrWhiteSpace(pagination?.SearchValue))
            {
                string search = pagination.SearchValue.ToLower();
                query = query.Where(x => x.Question!.ToLower().Contains(search) || x.Answer!.ToLower().Contains(search));
            }

            if (category.HasValue)
                query = query.Where(x => x.Category == category.Value);

            if (!string.IsNullOrWhiteSpace(pagination?.Status))
            {
                if (pagination.Status.ToLower() == "true")
                    query = query.Where(x => x.Status == true);
                else if (pagination.Status.ToLower() == "false")
                    query = query.Where(x => x.Status == false);
            }

            query = sortField switch
            {
                "question" => isAsc
                                ? query.OrderBy(x => x.Question)
                                       .ThenBy(x => x.DisplayOrder)
                                : query.OrderByDescending(x => x.Question)
                                       .ThenByDescending(x => x.DisplayOrder),

                "category" => isAsc
                                ? query.OrderBy(x => x.Category)
                                       .ThenBy(x => x.DisplayOrder)
                                : query.OrderByDescending(x => x.Category)
                                       .ThenByDescending(x => x.DisplayOrder),

                "status" => isAsc
                                ? query.OrderBy(x => x.Status)
                                       .ThenBy(x => x.DisplayOrder)
                                : query.OrderByDescending(x => x.Status)
                                       .ThenByDescending(x => x.DisplayOrder),

                _ => isAsc ? query.OrderBy(x => x.DisplayOrder)
                           : query.OrderByDescending(x => x.DisplayOrder)
            };

            int totalRecords = await query.CountAsync();

            var data = await query
                        .Skip((page - 1) * pageSize)
                        .Take(pageSize)
                        .Select(x => new FaqDto
                        {
                            Id = x.Id,
                            Category = x.Category,
                            CategoryName = x.Category.GetDisplayName(),
                            Question = x.Question,
                            Answer = x.Answer,
                            DisplayOrder = x.DisplayOrder,
                            Status = x.Status,
                            DeletedAt = x.DeletedAt,
                            DeletedBy = x.DeletedByUser != null
                                        ? $"{x.DeletedByUser.FirstName} {x.DeletedByUser.LastName}"
                                        : null
                        })
                        .ToListAsync();

            return Ok(new { totalRecords, items = data });
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var faq = await _context.Faq
                                    .Where(x => x.Id == id)
                                    .Select(x => new FaqDto
                                    {
                                        Id = x.Id,
                                        Question = x.Question,
                                        Answer = x.Answer,
                                        Category = x.Category,
                                        CategoryName = x.Category.GetDisplayName(),
                                        DisplayOrder = x.DisplayOrder,
                                        Status = x.Status
                                    })
                                    .ToListAsync();

            if (faq == null)
                return Ok(new { Success = false, Message = "FAQ not found." });

            return Ok(faq);
        }

        [HttpPost]
        public async Task<IActionResult> Save([FromBody] FaqDto dto)
        {
            if (dto == null)
                return BadRequest("Invalid data.");

            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var userId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            if (dto.Id.HasValue && dto.Id > 0)
            {
                var existingFaq = await _context.Faq.FirstOrDefaultAsync(x => x.Id == dto.Id.Value);
                if (existingFaq == null)
                    return NotFound("FAQ not found.");

                existingFaq.Category = dto.Category;
                existingFaq.Question = dto.Question;
                existingFaq.Answer = dto.Answer;
                existingFaq.Status = dto.Status;
                existingFaq.ModifiedAt = DateTime.Now;
                existingFaq.ModifiedBy = userId;

                await _context.SaveChangesAsync();

                return Ok(new { Success = true, Message = "FAQ updated successfully.", Data = existingFaq.Id });
            }

            var lastOrder = await _context.Faq.Where(x => x.Category == dto.Category).MaxAsync(x => (int?)x.DisplayOrder) ?? 0;

            var faq = new Faq
            {
                Category = dto.Category,
                Question = dto.Question,
                Answer = dto.Answer,
                Status = dto.Status,
                DisplayOrder = lastOrder + 1,
                CreatedAt = DateTime.Now,
                CreatedBy = userId
            };

            _context.Faq.Add(faq);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "FAQ created successfully.", Data = faq.Id });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var faq = await _context.Faq.FirstOrDefaultAsync(x => x.Id == id);

            if (faq == null)
                return Ok(new { Success = false, Message = "FAQ not found." });

            _context.Faq.Remove(faq);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "FAQ deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var faqs = await _context.Faq
                                     .IgnoreQueryFilters()
                                     .Where(x => ids.Contains(x.Id))
                                     .ToListAsync();

            if (!faqs.Any())
                return Ok(new { Success = false, Message = "FAQ not found." });

            var deletedFaqs = faqs.Where(x => x.IsDeleted).ToList();

            if (!deletedFaqs.Any())
                return Ok(new { Success = false, Message = "No deleted FAQs found to restore." });

            deletedFaqs.RestoreRange();

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = $"{deletedFaqs.Count} FAQ(s) restored successfully." });
        }

        [HttpPost("reorder")]
        public async Task<IActionResult> Reorder(List<ReorderDto> items)
        {
            var ids = items.Select(x => x.Id).ToList();
            var faqs = await _context.Faq.Where(x => ids.Contains(x.Id)).ToListAsync();

            var orderDictionary = items.ToDictionary(x => x.Id, x => x.DisplayOrder);

            foreach (var faq in faqs)
                faq.DisplayOrder = orderDictionary[faq.Id];

            await _context.SaveChangesAsync();

            var updatedData = await _context.Faq
                                            .OrderBy(x => x.Category)
                                            .ThenBy(x => x.DisplayOrder)
                                            .Select(x => new FaqDto
                                            {
                                                Id = x.Id,
                                                Category = x.Category,
                                                CategoryName = x.Category.GetDisplayName(),
                                                Question = x.Question,
                                                Answer = x.Answer,
                                                DisplayOrder = x.DisplayOrder,
                                                Status = x.Status
                                            })
                                            .ToListAsync();

            return Ok(new { Success = true, Message = "FAQ reordered successfully.", Data = updatedData });
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetSummary()
        {
            var faqData = await _context.Faq.ToListAsync();

            var result = Enum.GetValues(typeof(FaqCategory))
                        .Cast<FaqCategory>()
                        .Select(category => new
                        {
                            CategoryName = category.GetDisplayName(),
                            ActiveCount = faqData.Count(x => x.Category == category && x.Status),
                            TotalCount = faqData.Count(x => x.Category == category)
                        })
                        .ToList();

            return Ok(result);
        }
    }
}
