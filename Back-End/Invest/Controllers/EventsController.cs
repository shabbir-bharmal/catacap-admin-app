using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Invest.Controllers
{
    [Route("api/event")]
    [ApiController]
    public class EventsController : ControllerBase
    {
        private readonly RepositoryContext _context;

        public EventsController (RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetUpcoming()
        {
            var today = DateTime.Today;

            var data = await _context.Event
                                     .Where(x => x.EventDate >= today && x.Status)
                                     .OrderBy(x => x.EventDate)
                                     .Select(x => new
                                     {
                                         x.Id,
                                         x.Title,
                                         x.Description,
                                         x.EventDate,
                                         x.EventTime,
                                         x.Image,
                                         x.ImageFileName,
                                         x.Duration,
                                         x.Type,
                                         x.RegistrationLink
                                     })
                                     .ToListAsync();

            return Ok(data);
        }
    }
}
