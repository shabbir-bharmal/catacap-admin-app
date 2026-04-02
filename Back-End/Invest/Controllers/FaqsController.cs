using Invest.Core.Extensions;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Invest.Controllers
{
    [Route("api/faq")]
    [ApiController]
    public class FaqsController : ControllerBase
    {
        private readonly RepositoryContext _context;

        public FaqsController (RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll ()
        {
            var data = await _context.Faq
                                     .Where(x => x.Status)
                                     .OrderBy(x => x.Category)
                                     .ThenBy(x => x.DisplayOrder)
                                     .ToListAsync();

            var groupedData = data
                             .GroupBy(x => x.Category)
                             .Select(g => new
                             {
                                 CategoryName = g.Key.GetDisplayName(),
                                 Questions = g.Select(x => new
                                 {
                                     x.Question,
                                     x.Answer,
                                     x.DisplayOrder
                                 }).ToList()
                             })
                             .ToList();

            return Ok(groupedData);
        }
    }
}
