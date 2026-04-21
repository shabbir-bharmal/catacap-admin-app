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
    [Route("api/admin/form-submission")]
    [ApiController]
    public class FormSubmissionsController : ControllerBase
    {
        private readonly RepositoryContext _context;

        public FormSubmissionsController (RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] PaginationDto dto, [FromQuery] FormType? formType)
        {
            bool isAsc = dto.SortDirection?.ToLower() == "asc";
            int page = dto.CurrentPage ?? 1;
            int pageSize = dto.PerPage ?? 10;
            bool? isDeleted = dto?.IsDeleted;

            var query = _context.FormSubmission
                                .ApplySoftDeleteFilter(isDeleted)
                                .AsNoTracking()
                                .AsQueryable();

            if (formType.HasValue)
                query = query.Where(x => x.FormType == formType.Value);

            if (!string.IsNullOrWhiteSpace(dto?.SearchValue))
            {
                string search = dto.SearchValue.ToLower();
                query = query.Where(x =>
                    x.FirstName!.ToLower().Contains(search) ||
                    x.LastName!.ToLower().Contains(search) ||
                    (x.FirstName + " " + x.LastName).ToLower().Contains(search) ||
                    x.Email!.ToLower().Contains(search));
            }

            query = dto?.SortField?.ToLower() switch
            {
                "firstname" => isAsc ? query.OrderBy(x => x.FirstName).ThenBy(x => x.LastName)
                                     : query.OrderByDescending(x => x.FirstName).ThenByDescending(x => x.LastName),
                "formtype" => isAsc ? query.OrderBy(x => (int)x.FormType)
                                    : query.OrderByDescending(x => (int)x.FormType),
                "status" => isAsc ? query.OrderBy(x => (int)x.Status)
                                  : query.OrderByDescending(x => (int)x.Status),
                "email" => isAsc ? query.OrderBy(x => x.Email)
                                 : query.OrderByDescending(x => x.Email),
                "createdat" => isAsc ? query.OrderBy(x => x.CreatedAt)
                                     : query.OrderByDescending(x => x.CreatedAt),
                _ => query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            };

            int totalCount = await query.CountAsync();

            var data = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var themeIds = data.Where(x => (x.FormType == FormType.Home)
                                           && !string.IsNullOrEmpty(x.Description))
                               .SelectMany(x => x.Description!.Split(','))
                               .Select(int.Parse)
                               .Distinct()
                               .ToList();

            var interestIds = data.Where(x => x.FormType == FormType.About
                                              && !string.IsNullOrEmpty(x.Description))
                                  .SelectMany(x => x.Description!.Split(','))
                                  .Select(int.Parse)
                                  .Distinct()
                                  .ToList();

            var themes = themeIds.Any()
                        ? await _context.Themes
                                        .Where(x => themeIds.Contains(x.Id))
                                        .ToDictionaryAsync(x => x.Id, x => x.Name)
                        : new Dictionary<int, string>();

            var interests = interestIds.Any()
                            ? await _context.SiteConfiguration
                                            .Where(x => interestIds.Contains(x.Id))
                                            .ToDictionaryAsync(x => x.Id, x => x.Value)
                            : new Dictionary<int, string>();

            var result = data.Select(x =>
            {
                string? description = x.Description;

                if (!string.IsNullOrWhiteSpace(x.Description))
                {
                    if (x.FormType == FormType.Home)
                    {
                        var ids = ExtractIds(x.Description);

                        description = string.Join(", ",
                            ids.Where(id => themes.ContainsKey(id))
                               .Select(id => themes[id]));
                    }
                    else if (x.FormType == FormType.About)
                    {
                        var ids = ExtractIds(x.Description);

                        description = string.Join(", ",
                            ids.Where(id => interests.ContainsKey(id))
                               .Select(id => interests[id]));
                    }
                    else
                    {
                        description = x.Description;
                    }
                }

                return new
                {
                    x.Id,
                    x.FormType,
                    FormTypeName = x.FormType.GetDisplayName(),
                    x.Status,
                    StatusName = x.Status.GetDisplayName(),
                    x.FirstName,
                    x.LastName,
                    FullName = x.FirstName + " " + x.LastName,
                    x.Email,
                    x.CreatedAt,
                    Description = description,
                    x.TargetRaiseAmount,
                    x.LaunchPartners,
                    x.SelfRaiseAmountRange,
                    x.DeletedAt,
                    DeletedBy = x.DeletedByUser != null
                                ? $"{x.DeletedByUser.FirstName} {x.DeletedByUser.LastName}"
                                : null
                };
            });

            result = dto?.SortField?.ToLower() switch
            {
                "formtype" => isAsc ? result.OrderBy(x => x.FormTypeName) : result.OrderByDescending(x => x.FormTypeName),
                "status" => isAsc ? result.OrderBy(x => x.StatusName) : result.OrderByDescending(x => x.StatusName),
                _ => result
            };

            return Ok(new { totalCount, items = result.ToList() });
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var record = await _context.FormSubmission
                                       .AsNoTracking()
                                       .FirstOrDefaultAsync(x => x.Id == id);

            if (record == null)
                return Ok(new { Success = false, Message = "Form not found." });

            object? description = record.Description;

            if (!string.IsNullOrWhiteSpace(record.Description))
            {
                if (record.FormType == FormType.Home || record.FormType == FormType.Group)
                {
                    var ids = record.Description.Split(',')
                                .Select(int.Parse)
                                .ToList();

                    description = await _context.Themes
                                                .Where(x => ids.Contains(x.Id))
                                                .Select(x => new
                                                {
                                                    x.Id,
                                                    x.Name
                                                })
                                                .ToListAsync();
                }
                else if (record.FormType == FormType.About)
                {
                    var ids = record.Description.Split(',')
                                                .Select(int.Parse)
                                                .ToList();

                    description = await _context.SiteConfiguration
                                                .Where(x => ids.Contains(x.Id))
                                                .Select(x => new
                                                {
                                                    x.Id,
                                                    x.Value
                                                })
                                                .ToListAsync();
                }
            }

            var result = new
            {
                record.Id,
                record.FormType,
                FormTypeName = record.FormType.GetDisplayName(),
                record.FirstName,
                record.LastName,
                record.Email,
                Description = description,
                record.LaunchPartners,
                record.TargetRaiseAmount,
                record.SelfRaiseAmountRange,
                record.Status,
                StatusName = record.Status.GetDisplayName(),
                record.CreatedAt
            };

            return Ok(result);
        }

        [HttpPut]
        public async Task<IActionResult> Update([FromBody] UpdateFormSubmissionDto dto)
        {
            var record = await _context.FormSubmission.FirstOrDefaultAsync(x => x.Id == dto.Id);

            if (record == null)
                return Ok(new { Success = false, Message = "Form not found." });

            string? oldStatus = null;
            string? newStatus = null;

            if (record.Status != dto.Status)
            {
                oldStatus = record.Status.ToString();
                newStatus = dto.Status.ToString();
            }

            if (!string.IsNullOrWhiteSpace(dto.Note))
            {
                var identity = HttpContext.User.Identity as ClaimsIdentity;
                var userId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

                _context.FormSubmissionNotes.Add(new FormSubmissionNotes
                {
                    FormSubmissionId = record.Id,
                    Note = !string.IsNullOrWhiteSpace(dto.Note) ? dto.Note.Trim() : null,
                    CreatedBy = userId,
                    CreatedAt = DateTime.Now,
                    OldStatus = oldStatus,
                    NewStatus = newStatus
                });
            }

            record.Status = dto.Status;

            await _context.SaveChangesAsync();

            return Ok(new { success = true, message = "Form updated successfully." });
        }

        [HttpGet("{id}/notes")]
        public async Task<IActionResult> GetNotes(int id)
        {
            if (id <= 0)
                return Ok(new { Success = false, Message = "Invalid id" });

            var notes = await _context.FormSubmissionNotes
                                      .Where(x => x.FormSubmissionId == id)
                                      .Include(x => x.User)
                                      .OrderByDescending(x => x.Id)
                                      .ToListAsync();

            var result = notes.Select(x => new
            {
                x.Id,
                OldStatus = !string.IsNullOrWhiteSpace(x.OldStatus) ? x.OldStatus : null,
                NewStatus = !string.IsNullOrWhiteSpace(x.NewStatus) ? x.NewStatus : null,
                x.Note,
                x.User!.UserName,
                x.CreatedAt
            }).ToList();

            if (result.Any())
                return Ok(result);

            return Ok(new { Success = false, Message = "Notes not found" });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.FormSubmission.FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null)
                return Ok(new { Success = false, Message = "Form not found." });

            _context.FormSubmission.Remove(entity);
            
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Form deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var forms = await _context.FormSubmission
                                      .IgnoreQueryFilters()
                                      .Where(x => ids.Contains(x.Id))
                                      .ToListAsync();

            if (!forms.Any())
                return Ok(new { Success = false, Message = "Form not found." });

            var deletedForms = forms.Where(x => x.IsDeleted).ToList();

            if (!deletedForms.Any())
                return Ok(new { Success = false, Message = "No deleted forms found to restore." });

            deletedForms.RestoreRange();

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = $"{deletedForms.Count} form(s) restored successfully." });
        }

        private static IEnumerable<int> ExtractIds(string description)
        {
            return description
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.Trim())
                .Where(x => int.TryParse(x, out _))
                .Select(int.Parse);
        }
    }
}
