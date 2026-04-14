using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Specialized;
using Invest.Core.Dtos;
using Invest.Core.Extensions;
using Invest.Core.Models;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/news")]
    [ApiController]
    public class NewsController : ControllerBase
    {
        private readonly RepositoryContext _context;
        private readonly BlobContainerClient _blobContainerClient;

        public NewsController (RepositoryContext context, BlobContainerClient blobContainerClient) 
        {
            _context = context;
            _blobContainerClient = blobContainerClient;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] PaginationDto dto)
        {
            bool? isDeleted = dto?.IsDeleted;

            var query = _context.News
                                .ApplySoftDeleteFilter(isDeleted)
                                .AsNoTracking()
                                .Include(x => x.NewsType)
                                .Include(x => x.Audience)
                                .Include(x => x.Theme)
                                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(dto?.SearchValue))
            {
                string search = dto.SearchValue.ToLower();
                query = query.Where(x => x.Title.ToLower().Contains(search));
            }

            if (!string.IsNullOrWhiteSpace(dto?.Status))
            {
                if (bool.TryParse(dto.Status, out bool status))
                    query = query.Where(x => x.Status == status);
            }

            bool isAsc = dto?.SortDirection?.ToLower() == "asc";

            query = dto?.SortField?.ToLower() switch
            {
                "title" => isAsc ? query.OrderBy(x => x.Title)
                                 : query.OrderByDescending(x => x.Title),

                "type" => isAsc ? query.OrderBy(x => x.NewsType!.Value)
                                : query.OrderByDescending(x => x.NewsType!.Value),

                "date" => isAsc ? query.OrderBy(x => x.NewsDate)
                                : query.OrderByDescending(x => x.NewsDate),

                "status" => isAsc ? query.OrderBy(x => x.Status)
                                  : query.OrderByDescending(x => x.Status),

                _ => query.OrderByDescending(x => x.NewsDate)
                          .ThenByDescending(x => x.Id)
            };

            int page = dto?.CurrentPage ?? 1;
            int pageSize = dto?.PerPage ?? 10;

            int totalCount = await query.CountAsync();

            var data = await query.Skip((page - 1) * pageSize)
                                  .Take(pageSize)
                                  .Select(x => new NewsResponseDto
                                  {
                                      Id = x.Id,
                                      Title = x.Title,
                                      Description = x.Description,
                                      TypeId = x.NewsTypeId,
                                      Type = x.NewsType != null ? x.NewsType.Value : null,
                                      Audience = x.Audience != null ? x.Audience.Value : null,
                                      Theme = x.Theme != null ? x.Theme.Name : null,
                                      ImageFileName = x.ImageFileName,
                                      Status = x.Status,
                                      Link = x.NewsLink,
                                      NewsDate = x.NewsDate.HasValue
                                                    ? x.NewsDate.Value.ToString("dd MMM yyyy")
                                                    : null,
                                      DeletedAt = x.DeletedAt,
                                      DeletedBy = x.DeletedByUser != null
                                                        ? $"{x.DeletedByUser.FirstName} {x.DeletedByUser.LastName}"
                                                        : null
                                  })
                                  .ToListAsync();

            return Ok(new { totalCount, items = data });
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var entity = await _context.News
                                       .Include(x => x.NewsType)
                                       .Include(x => x.Audience)
                                       .Include(x => x.Theme)
                                       .FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null)
                return Ok(new { Success = false, Message = "News not found." });

            var result = new NewsResponseDto
            {
                Id = entity.Id,
                Title = entity.Title,
                Description = entity.Description,
                TypeId = entity.NewsTypeId,
                Type = entity.NewsType?.Value,
                AudienceId = entity.AudienceId,
                Audience = entity.Audience?.Value,
                ThemeId = entity.ThemeId,
                Theme = entity.Theme?.Name,
                ImageFileName = entity.ImageFileName,
                Link = entity.NewsLink,
                Status = entity.Status,
                NewsDate = entity.NewsDate.ToString()
            };

            return Ok(result);
        }

        [HttpPost]
        public async Task<IActionResult> CreateOrUpdate([FromBody] NewsRequestDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Title))
                return Ok(new { Success = false, Message = "Title is required." });

            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var userId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            if (dto.Id.HasValue && dto.Id > 0)
            {
                var entity = await _context.News.FirstOrDefaultAsync(x => x.Id == dto.Id);

                if (entity == null)
                    return Ok(new { Success = false, Message = "News not found." });

                entity.Title = dto.Title;
                entity.Description = dto.Description;
                entity.NewsTypeId = dto.NewsTypeId;
                entity.AudienceId = dto.AudienceId;
                entity.ThemeId = dto.ThemeId;
                entity.ImageFileName = string.IsNullOrWhiteSpace(dto.ImageFileName) 
                                       ? await UploadBase64File(dto.Image!) 
                                       : dto.ImageFileName;
                entity.NewsLink = dto.NewsLink;
                entity.Status = dto.Status;
                entity.NewsDate = dto.NewsDate;
                entity.ModifiedAt = DateTime.Now;
                entity.ModifiedBy = userId;

                await _context.SaveChangesAsync();

                return Ok(new { Success = true, Message = "News updated successfully.", Data = entity.Id });
            }

            var newEntity = new News
            {
                Title = dto.Title,
                Description = dto.Description,
                NewsTypeId = dto.NewsTypeId,
                AudienceId = dto.AudienceId,
                ThemeId = dto.ThemeId,
                ImageFileName = !string.IsNullOrWhiteSpace(dto.Image)
                                ? await UploadBase64File(dto.Image!)
                                : null,
                NewsLink = dto.NewsLink,
                Status = dto.Status,
                NewsDate = dto.NewsDate,
                CreatedAt = DateTime.Now,
                CreatedBy = userId
            };

            _context.News.Add(newEntity);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "News created successfully.", Data = newEntity.Id });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.News.FirstOrDefaultAsync(x => x.Id == id);

            if (entity == null)
                return Ok(new { Success = false, Message = "News not found." });

            _context.News.Remove(entity);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "News deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var entities = await _context.News
                                         .IgnoreQueryFilters()
                                         .Where(x => ids.Contains(x.Id))
                                         .ToListAsync();

            if (!entities.Any())
                return Ok(new { Success = false, Message = "News not found." });

            var deletedEntities = entities.Where(x => x.IsDeleted).ToList();

            if (!deletedEntities.Any())
                return Ok(new { Success = false, Message = "No deleted news found." });

            deletedEntities.RestoreRange();

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = $"{deletedEntities.Count} news item(s) restored successfully." });
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
