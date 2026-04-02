using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Specialized;
using Invest.Core.Dtos;
using Invest.Core.Extensions;
using Invest.Core.Models;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/event")]
    [ApiController]
    public class EventsController : ControllerBase
    {
        private readonly RepositoryContext _context;
        private readonly BlobContainerClient _blobContainerClient;

        public EventsController (RepositoryContext context, BlobContainerClient blobContainerClient)
        {
            _context = context;
            _blobContainerClient = blobContainerClient;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] PaginationDto pagination)
        {
            int page = pagination?.CurrentPage ?? 1;
            int pageSize = pagination?.PerPage ?? 10;
            string? sortField = pagination?.SortField?.ToLower();
            bool isAsc = pagination?.SortDirection?.ToLower() == "asc";
            bool? isDeleted = pagination?.IsDeleted;

            var query = _context.Event.ApplySoftDeleteFilter(isDeleted).AsQueryable();

            if (!string.IsNullOrWhiteSpace(pagination?.SearchValue))
            {
                string search = pagination.SearchValue.ToLower();

                query = query.Where(x => x.Title.ToLower().Contains(search));
            }

            query = sortField switch
            {
                "title" => isAsc
                            ? query.OrderBy(x => x.Title)
                            : query.OrderByDescending(x => x.Title),

                "eventdate" => isAsc
                            ? query.OrderBy(x => x.EventDate)
                            : query.OrderByDescending(x => x.EventDate),

                "status" => isAsc
                            ? query.OrderBy(x => x.Status)
                            : query.OrderByDescending(x => x.Status),

                _ => isAsc
                        ? query.OrderBy(x => x.CreatedAt)
                        : query.OrderByDescending(x => x.CreatedAt)
            };

            int totalRecords = await query.CountAsync();

            var data = await query
                            .Skip((page - 1) * pageSize)
                            .Take(pageSize)
                            .Select(x => new EventDto
                            {
                                Id = x.Id,
                                Title = x.Title,
                                Description = x.Description,
                                EventDate = x.EventDate,
                                EventTime = x.EventTime,
                                RegistrationLink = x.RegistrationLink,
                                Status = x.Status,
                                ImageFileName = x.ImageFileName,
                                Image = x.Image,
                                Type = x.Type,
                                Duration = x.Duration,
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
            var data = await _context.Event
                                     .Where(x => x.Id == id)
                                     .Select(x => new EventDto
                                     {
                                         Id = x.Id,
                                         Title = x.Title,
                                         Description = x.Description,
                                         EventDate = x.EventDate,
                                         EventTime = x.EventTime,
                                         RegistrationLink = x.RegistrationLink,
                                         Status = x.Status,
                                         Image = x.Image,
                                         ImageFileName = x.ImageFileName,
                                         Type = x.Type,
                                         Duration = x.Duration
                                     })
                                     .FirstOrDefaultAsync();

            if (data == null)
                return Ok(new { Success = false, Message = "Event not found." });

            return Ok(data);
        }

        [HttpPost]
        public async Task<IActionResult> Save([FromBody] EventDto dto)
        {
            if (dto == null)
                return BadRequest("Invalid data.");

            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var userId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            if (dto.Id.HasValue && dto.Id > 0)
            {
                var existing = await _context.Event.FirstOrDefaultAsync(x => x.Id == dto.Id.Value);

                if (existing == null)
                    return Ok(new { Success = false, Message = "Event not found." });

                existing.Title = dto.Title;
                existing.Description = dto.Description;
                existing.EventDate = dto.EventDate!.Value.Date;
                existing.EventTime = dto.EventTime;
                existing.RegistrationLink = dto.RegistrationLink;
                existing.Status = dto.Status;
                existing.ImageFileName = !string.IsNullOrWhiteSpace(dto.ImageFileName) ? dto.ImageFileName : existing.ImageFileName;
                existing.Image = !string.IsNullOrWhiteSpace(dto.Image)
                                ? await UploadBase64File(dto.Image!)
                                : existing.Image;
                existing.Type = dto.Type;
                existing.Duration = dto.Duration;
                existing.ModifiedAt = DateTime.Now;
                existing.ModifiedBy = userId;

                await _context.SaveChangesAsync();

                return Ok(new { Success = true, Message = "Event updated successfully.", Data = existing.Id });
            }

            var entity = new Event
            {
                Title = dto.Title,
                Description = dto.Description,
                EventDate = dto.EventDate!.Value.Date,
                EventTime = dto.EventTime,
                RegistrationLink = dto.RegistrationLink,
                Status = dto.Status,
                ImageFileName = !string.IsNullOrWhiteSpace(dto.ImageFileName) ? dto.ImageFileName : null,
                Image = !string.IsNullOrWhiteSpace(dto.ImageFileName)
                        ? await UploadBase64File(dto.Image!)
                        : dto.ImageFileName,
                Type = dto.Type,
                Duration = dto.Duration,
                CreatedBy = userId,
                CreatedAt = DateTime.Now
            };

            _context.Event.Add(entity);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Event created successfully.", Data = entity.Id });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.Event.FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null)
                return Ok(new { Success = false, Message = "Event not found." });

            _context.Event.Remove(entity);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Event deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var events = await _context.Event
                                       .IgnoreQueryFilters()
                                       .Where(x => ids.Contains(x.Id))
                                       .ToListAsync();

            if (!events.Any())
                return Ok(new { Success = false, Message = "Event not found." });

            var deletedEvents = events.Where(x => x.IsDeleted).ToList();

            if (!deletedEvents.Any())
                return Ok(new { Success = false, Message = "No deleted events found to restore." });

            deletedEvents.RestoreRange();

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = $"{deletedEvents.Count} event(s) restored successfully." });
        }

        private async Task<string> UploadBase64File(string base64Data)
        {
            if (string.IsNullOrWhiteSpace(base64Data))
                return string.Empty;

            string fileName = $"{Guid.NewGuid()}.jpg";
            var blob = _blobContainerClient.GetBlockBlobClient(fileName);

            var dataIndex = base64Data.Substring(base64Data.IndexOf(',') + 1);
            var bytes = Convert.FromBase64String(dataIndex);

            using var stream = new MemoryStream(bytes);
            await blob.UploadAsync(stream);

            return fileName;
        }
    }
}
