using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Specialized;
using DocumentFormat.OpenXml.Wordprocessing;
using Invest.Core.Dtos;
using Invest.Core.Extensions;
using Invest.Core.Models;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Invest.Controllers.Admin
{
    [Route("api/admin/team")]
    [ApiController]
    public class TeamsController : ControllerBase
    {
        private readonly RepositoryContext _context;
        private readonly BlobContainerClient _blobContainerClient;

        public TeamsController (RepositoryContext context, BlobContainerClient blobContainerClient)
        {
            _context = context;
            _blobContainerClient = blobContainerClient;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] PaginationDto dto, bool? isManagement)
        {
            int page = dto?.CurrentPage ?? 1;
            int pageSize = dto?.PerPage ?? 10;
            string sortField = dto?.SortField?.ToLower() ?? "displayorder";
            bool isAsc = dto?.SortDirection?.ToLower() == "asc";
            bool? isDeleted = dto?.IsDeleted;

            var query = _context.CataCapTeam.ApplySoftDeleteFilter(isDeleted).AsQueryable();

            if (!string.IsNullOrWhiteSpace(dto?.SearchValue))
            {
                dto.SearchValue = dto.SearchValue.ToLower();

                query = query.Where(x =>
                    x.FirstName.ToLower().Contains(dto.SearchValue) ||
                    x.LastName.ToLower().Contains(dto.SearchValue) ||
                    (x.FirstName + " " + x.LastName).ToLower().Contains(dto.SearchValue) ||
                    x.Designation.ToLower().Contains(dto.SearchValue));
            }

            if (isManagement.HasValue)
                query = query.Where(x => x.IsManagement == isManagement.Value);

            query = dto?.SortField?.ToLower() switch
            {
                "name" => isAsc
                            ? query.OrderBy(x => x.FirstName)
                                   .ThenBy(x => x.LastName)
                                   .ThenBy(x => x.DisplayOrder)
                            : query.OrderByDescending(x => x.FirstName)
                                   .ThenByDescending(x => x.LastName)
                                   .ThenByDescending(x => x.DisplayOrder),

                "designation" => isAsc
                                    ? query.OrderBy(x => x.Designation)
                                           .ThenBy(x => x.DisplayOrder)
                                    : query.OrderByDescending(x => x.Designation)
                                           .ThenByDescending(x => x.DisplayOrder),

                _ => isAsc
                        ? query.OrderBy(x => x.IsManagement)
                               .ThenBy(x => x.DisplayOrder)
                        : query.OrderByDescending(x => x.IsManagement)
                               .ThenByDescending(x => x.DisplayOrder)
            };

            int totalCount = await query.CountAsync();

            var data = await query.Skip((page - 1) * pageSize)
                                  .Take(pageSize)
                                  .Select(x => new TeamResponseDto
                                  {
                                      Id = x.Id,
                                      FullName = $"{x.FirstName} {x.LastName}",
                                      FirstName = x.FirstName,
                                      LastName = x.LastName,
                                      Designation = x.Designation,
                                      Description = x.Description,
                                      ImageFileName = x.ImageFileName,
                                      LinkedInUrl = x.LinkedInUrl,
                                      IsManagement = x.IsManagement,
                                      DisplayOrder = x.DisplayOrder,
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
            var team = await _context.CataCapTeam
                                     .Where(x => x.Id == id)
                                     .Select(x => new TeamResponseDto
                                     {
                                         Id = x.Id,
                                         FirstName = x.FirstName,
                                         LastName = x.LastName,
                                         Designation = x.Designation,
                                         Description = x.Description,
                                         ImageFileName = x.ImageFileName,
                                         LinkedInUrl = x.LinkedInUrl,
                                         IsManagement = x.IsManagement,
                                         DisplayOrder = x.DisplayOrder
                                     })
                                     .FirstOrDefaultAsync();

            if (team == null)
                return Ok(new { Success = false, Message = "Team member not found." });

            return Ok(team);
        }

        [HttpPost]
        public async Task<IActionResult> CreateOrUpdate([FromBody] TeamRequestDto dto)
        {
            if (dto == null)
                return BadRequest("Invalid data.");

            var identity = HttpContext.User.Identity as ClaimsIdentity;
            var userId = identity?.Claims.FirstOrDefault(i => i.Type == "id")?.Value;

            if (dto.Id > 0)
            {
                var existing = await _context.CataCapTeam.FirstOrDefaultAsync(x => x.Id == dto.Id);
                if (existing == null)
                    return NotFound("Team member not found.");

                existing.FirstName = dto.FirstName;
                existing.LastName = dto.LastName;
                existing.Designation = dto.Designation;
                existing.Description = dto.Description;
                existing.ImageFileName = string.IsNullOrWhiteSpace(dto.ImageFileName)
                                           ? await UploadBase64File(dto.Image!)
                                           : dto.ImageFileName;
                existing.LinkedInUrl = dto.LinkedInUrl;
                existing.IsManagement = dto.IsManagement;
                existing.ModifiedAt = DateTime.Now;
                existing.ModifiedBy = userId;

                await _context.SaveChangesAsync();

                return Ok(new { Success = true, Message = "Team member updated successfully.", Data = existing.Id });
            }

            var lastOrder = await _context.CataCapTeam
                                          .Where(x => x.IsManagement == dto.IsManagement)
                                          .MaxAsync(x => (int?)x.DisplayOrder) ?? 0;

            var cataCapTeam = new CataCapTeam
            {
                FirstName = dto.FirstName,
                LastName = dto.LastName,
                Designation = dto.Designation,
                Description = dto.Description,
                ImageFileName = !string.IsNullOrWhiteSpace(dto.Image)
                                ? await UploadBase64File(dto.Image!)
                                : null,
                LinkedInUrl = dto.LinkedInUrl,
                IsManagement = dto.IsManagement,
                DisplayOrder = lastOrder + 1,
                CreatedAt = DateTime.Now,
                CreatedBy = userId
            };

            _context.CataCapTeam.Add(cataCapTeam);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Team member created successfully.", Data = cataCapTeam.Id });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var team = await _context.CataCapTeam.FirstOrDefaultAsync(x => x.Id == id);

            if (team == null)
                return Ok(new { Success = false, Message = "Team member not found." });

            _context.CataCapTeam.Remove(team);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = "Team member deleted successfully." });
        }

        [HttpPut("restore")]
        public async Task<IActionResult> Restore([FromBody] List<int> ids)
        {
            if (ids == null || !ids.Any())
                return Ok(new { Success = false, Message = "No IDs provided." });

            var teams = await _context.CataCapTeam
                                      .IgnoreQueryFilters()
                                      .Where(x => ids.Contains(x.Id))
                                      .ToListAsync();

            if (!teams.Any())
                return Ok(new { Success = false, Message = "Team member not found." });

            var deletedTeams = teams.Where(x => x.IsDeleted).ToList();

            if (!deletedTeams.Any())
                return Ok(new { Success = false, Message = "No deleted team members found." });

            deletedTeams.RestoreRange();

            await _context.SaveChangesAsync();

            return Ok(new { Success = true, Message = $"{deletedTeams.Count} team member(s) restored successfully." });
        }

        [HttpPost("reorder")]
        public async Task<IActionResult> Reorder(List<ReorderDto> items)
        {
            var ids = items.Select(x => x.Id).ToList();
            var teams = await _context.CataCapTeam.Where(x => ids.Contains(x.Id)).ToListAsync();

            var orderDictionary = items.ToDictionary(x => x.Id, x => x.DisplayOrder);

            foreach (var team in teams)
                team.DisplayOrder = orderDictionary[team.Id];

            await _context.SaveChangesAsync();

            var updatedData = await _context.CataCapTeam
                                            .OrderBy(x => x.IsManagement)
                                            .ThenBy(x => x.DisplayOrder)
                                            .Select(x => new TeamResponseDto
                                            {
                                                Id = x.Id,
                                                FullName = x.FirstName + " " + x.LastName,
                                                FirstName = x.FirstName,
                                                LastName = x.LastName,
                                                Designation = x.Designation,
                                                Description = x.Description,
                                                ImageFileName = x.ImageFileName,
                                                LinkedInUrl = x.LinkedInUrl,
                                                IsManagement = x.IsManagement,
                                                DisplayOrder = x.DisplayOrder
                                            })
                                            .ToListAsync();

            return Ok(new { Success = true, Message = "Team reordered successfully.", Data = updatedData });
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
