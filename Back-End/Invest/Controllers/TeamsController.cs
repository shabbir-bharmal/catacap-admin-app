using Invest.Core.Dtos;
using Invest.Repo.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Invest.Controllers
{
    [Route("api/team")]
    [ApiController]
    public class TeamsController : ControllerBase
    {
        private readonly RepositoryContext _context;

        public TeamsController (RepositoryContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var data = await _context.CataCapTeam
                                     .OrderBy(x => x.DisplayOrder)
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
                                     })
                                     .ToListAsync();

            var result = new
            {
                Management = data.Where(x => x.IsManagement),
                Team = data.Where(x => !x.IsManagement)
            };

            return Ok(result);
        }
    }
}
