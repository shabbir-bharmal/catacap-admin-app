using Invest.Core.Constants;
using Invest.Core.Dtos;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Invest.Controllers
{
    [Route("api/news")]
    [ApiController]
    public class NewsController : ControllerBase
    {
        private readonly RepositoryContext _context;

        public NewsController (RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var data = await _context.News
                                     .Where(x => x.Status == true)
                                     .OrderByDescending(x => x.NewsDate)
                                     .Select(x => new NewsResponseDto
                                     {
                                         Id = x.Id,
                                         Title = x.Title,
                                         Description = x.Description,
                                         Type = x.NewsType != null ? x.NewsType.Value : null,
                                         Audience = x.Audience != null ? x.Audience.Value : null,
                                         Theme = x.Theme != null ? x.Theme.Name : null,
                                         ImageFileName = x.ImageFileName,
                                         Status = x.Status,
                                         Link = x.NewsLink,
                                         NewsDate = x.NewsDate.HasValue
                                                    ? x.NewsDate.Value.ToString("MMMM d, yyyy")
                                                    : null
                                     })
                                     .ToListAsync();

            var newsTypes = await _context.SiteConfiguration
                                          .Where(x => x.Type == SiteConfigurationType.NewsType)
                                          .ToListAsync();

            var grouped = newsTypes.ToDictionary(
                t => t.Value,
                t => data.Where(x => x.Type == t.Value).ToList()
            );

            return Ok(grouped);
        }
    }
}
