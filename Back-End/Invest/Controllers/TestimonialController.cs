using Invest.Core.Dtos;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Invest.Controllers
{
    [Route("api/testimonial")]
    public class TestimonialController : ControllerBase
    {
        private readonly RepositoryContext _context;

        public TestimonialController(RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var data = await _context.Testimonial
                                     .Include(x => x.User)
                                     .OrderBy(x => x.DisplayOrder)
                                     .ThenByDescending(x => x.Id)
                                     .ToListAsync();

            var result = data.Select(x => new TestimonialResponseDto
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
                UserFullName = $"{x.User?.FirstName} {x.User?.LastName}",
                UserId = x.User?.Id,
                ProfilePicture = x.User?.PictureFileName
            });

            return Ok(result);
        }
    }
}
