using Invest.Core.Dtos;
using Invest.Core.Extensions;
using Invest.Core.Models;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/testimonial")]
    public class TestimonialController : ControllerBase
    {
        private readonly RepositoryContext _context;

        public TestimonialController(RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] PaginationDto pagination)
        {
            bool isAsc = pagination?.SortDirection?.ToLower() == "asc";
            int page = pagination?.CurrentPage ?? 1;
            int pageSize = pagination?.PerPage ?? 50;
            bool? isDeleted = pagination?.IsDeleted;

            var query = _context.Testimonial
                                .ApplySoftDeleteFilter(isDeleted)
                                .Include(x => x.User)
                                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(pagination?.SearchValue))
            {
                var searchValue = pagination.SearchValue.Trim().ToLower();

                query = query.Where(x =>
                    (x.User!.FirstName ?? "").ToLower().Contains(searchValue)
                    || (x.User.LastName ?? "").ToLower().Contains(searchValue)
                    || ((x.User.FirstName ?? "") + " " + (x.User.LastName ?? "")).ToLower().Contains(searchValue));
            }

            query = pagination?.SortField?.ToLower() switch 
            { 
                "person" => isAsc 
                            ? query.OrderBy(x => x.User!.FirstName).ThenBy(x => x.User!.LastName) 
                            : query.OrderByDescending(x => x.User!.FirstName).ThenByDescending(x => x.User!.LastName), 
                "perspective" => isAsc 
                                ? query.OrderBy(x => x.PerspectiveText) 
                                : query.OrderByDescending(x => x.PerspectiveText), 
                "status" => isAsc 
                            ? query.OrderBy(x => x.Status) 
                            : query.OrderByDescending(x => x.Status), 
                "displayorder" => isAsc 
                                    ? query.OrderBy(x => x.DisplayOrder) 
                                    : query.OrderByDescending(x => x.DisplayOrder), 
                _ => query.OrderBy(x => x.DisplayOrder).ThenByDescending(x => x.Id) 
            };

            var totalCount = await query.CountAsync();

            var rawData = await query
                            .Skip((page - 1) * pageSize)
                            .Take(pageSize)
                            .Select(x => new 
                            { 
                                x.Id, 
                                x.DisplayOrder, 
                                x.PerspectiveText, 
                                x.Description, 
                                x.Status, 
                                x.Metrics, 
                                x.Role, 
                                x.OrganizationName, 
                                x.User!.FirstName, 
                                x.User.LastName, 
                                UserId = x.User.Id, 
                                Picture = x.User.PictureFileName,
                                x.DeletedAt,
                                x.DeletedByUser
                            })
                            .ToListAsync();

            var data = rawData.Select(x => new TestimonialResponseDto
            { 
                Id = x.Id, 
                DisplayOrder = x.DisplayOrder, 
                PerspectiveText = x.PerspectiveText, 
                Description = x.Description, 
                Status = x.Status, 
                Metrics = string.IsNullOrEmpty(x.Metrics) 
                            ? new List<TestimonialMetricDto>() 
                            : JsonSerializer.Deserialize<List<TestimonialMetricDto>>(x.Metrics), 
                Role = x.Role, 
                OrganizationName = x.OrganizationName, 
                UserFullName = (x.FirstName ?? "") + " " + (x.LastName ?? ""), 
                UserId = x.UserId, 
                ProfilePicture = x.Picture,
                DeletedAt = x.DeletedAt,
                DeletedBy = x.DeletedByUser != null
                            ? $"{x.DeletedByUser.FirstName} {x.DeletedByUser.LastName}"
                            : null
            })
            .ToList();

            return Ok(new { items = data, totalCount });
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var testimonial = await _context.Testimonial.Include(x => x.User).FirstOrDefaultAsync(x => x.Id == id);

            if (testimonial == null)
                return Ok(new { Success = false, Message = "Testimonial not found." });

            var result = new TestimonialResponseDto
            {
                Id = testimonial.Id,
                DisplayOrder = testimonial.DisplayOrder,
                PerspectiveText = testimonial.PerspectiveText,
                Description = testimonial.Description,
                Status = testimonial.Status,
                Metrics = string.IsNullOrEmpty(testimonial.Metrics)
                            ? new List<TestimonialMetricDto>()
                            : JsonSerializer.Deserialize<List<TestimonialMetricDto>>(testimonial.Metrics),
                Role = testimonial.Role,
                OrganizationName = testimonial.OrganizationName,
                UserFullName = $"{testimonial.User?.FirstName} {testimonial.User?.LastName}",
                UserId = testimonial.User?.Id,
                ProfilePicture = testimonial.User?.PictureFileName
            };

            return Ok(result);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] TestimonialRequestDto dto)
        {
            var isDuplicate = await _context.Testimonial
                                            .AnyAsync(x => x.DisplayOrder == dto.DisplayOrder
                                                        && (dto.Id == null || x.Id != dto.Id));

            if (isDuplicate)
                return Ok(new { Success = false, Message = "Display order already exists." });

            if (dto.Id.HasValue && dto.Id > 0)
            {
                var testimonial = await _context.Testimonial.FirstOrDefaultAsync(x => x.Id == dto.Id);

                if (testimonial == null)
                    return Ok(new { Success = false, Message = "Testimonial not found." });

                testimonial.DisplayOrder = dto.DisplayOrder;
                testimonial.PerspectiveText = dto.PerspectiveText;
                testimonial.Description = dto.Description;
                testimonial.Status = dto.Status;
                testimonial.Metrics = dto.Metrics != null
                                        ? JsonSerializer.Serialize(dto.Metrics)
                                        : null;
                testimonial.Role = dto.Role;
                testimonial.OrganizationName = dto.OrganizationName;
                testimonial.UserId = dto.UserId;

                await _context.SaveChangesAsync();

                return Ok(new { Success = true, Message = "Testimonial updated successfully.", Data = testimonial.Id });
            }

            var entity = new Testimonial
            {
                DisplayOrder = dto.DisplayOrder,
                PerspectiveText = dto.PerspectiveText,
                Description = dto.Description,
                Status = dto.Status,
                Metrics = dto.Metrics != null
                          ? JsonSerializer.Serialize(dto.Metrics)
                          : null,
                Role = dto.Role,
                OrganizationName = dto.OrganizationName,
                UserId = dto.UserId,
                CreatedAt = DateTime.Now
            };

            _context.Testimonial.Add(entity);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Testimonial created successfully.", Data = entity.Id });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.Testimonial.FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null)
                return Ok(new { Success = false, Message = "Testimonial not found." });

            _context.Testimonial.Remove(entity);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Testimonial deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var testimonials = await _context.Testimonial
                                             .IgnoreQueryFilters()
                                             .Where(x => ids.Contains(x.Id))
                                             .ToListAsync();

            if (!testimonials.Any())
                return Ok(new { Success = false, Message = "Testimonial not found." });

            var deletedTestimonials = testimonials.Where(x => x.IsDeleted).ToList();

            if (!deletedTestimonials.Any())
                return Ok(new { Success = false, Message = "No deleted testimonials found." });

            await using var transaction = await _context.Database.BeginTransactionAsync();

            var parentUserIds = deletedTestimonials
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
            int restoredUserCount = 0;
            if (deletedParentUserIds.Any())
            {
                restoredUserCount = await UserCascadeRestoreHelper.RestoreUsersWithCascadeAsync(_context, deletedParentUserIds);
            }

            deletedTestimonials.RestoreRange();

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            var userSuffix = restoredUserCount > 0
                ? $" {restoredUserCount} owning user account(s) were also restored."
                : string.Empty;
            return Ok(new
            {
                Success = true,
                Message = $"{deletedTestimonials.Count} testimonial(s) restored successfully.{userSuffix}",
                RestoredCount = deletedTestimonials.Count,
                RestoredUserCount = restoredUserCount,
            });
        }
    }
}
