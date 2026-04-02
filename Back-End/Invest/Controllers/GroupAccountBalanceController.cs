using System.Data;
using AutoMapper;
using Invest.Core.Dtos;
using Invest.Core.Models;
using Invest.Repo.Data;
using Invest.Service.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Invest.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class GroupAccountBalanceController : ControllerBase
    {
        private readonly RepositoryContext _context;
        private readonly IMapper _mapper;
        protected readonly IRepositoryManager _repository;

        public GroupAccountBalanceController(RepositoryContext context, IMapper mapper, IRepositoryManager repository)
        {
            _context = context;
            _mapper = mapper;
            _repository = repository;
        }

        [HttpPost("{id}")]
        public async Task<ActionResult<GroupAccountBalanceDto>> GetGroupAccountBalanceByCampaignId(int id, TokenDto tokenData)
        {
            var user = await _repository.UserAuthentication.GetUser(tokenData.Token);
            if (user == null)
            {
                return BadRequest();
            }

            var totalGroupBalance = await _context.GroupAccountBalance
                                    .Include(gab => gab.Group)
                                        .ThenInclude(g => g.PrivateCampaigns)
                                    .Include(gab => gab.Group)
                                        .ThenInclude(g => g.Campaigns)
                                    .Where(gab => (gab.Group.PrivateCampaigns!.Any(pc => pc.Id == id) ||
                                                   gab.Group.Campaigns!.Any(c => c.Id == id))
                                                   && gab.User.Id == user.Id)
                                    .SumAsync(gab => gab.Balance);

            var groupAccountBalance = await _context.GroupAccountBalance
                .Include(gab => gab.Group)
                    .ThenInclude(g => g.PrivateCampaigns)
                .Include(gab => gab.Group)
                    .ThenInclude(g => g.Campaigns)
                .Where(gab => (gab.Group.PrivateCampaigns!.Any(pc => pc.Id == id) ||
                               gab.Group.Campaigns!.Any(c => c.Id == id))
                               && gab.User.Id == user.Id)
                .FirstOrDefaultAsync();

            if (groupAccountBalance != null)
            {
                groupAccountBalance.Balance = totalGroupBalance;
            }

            var groupAccountBalanceDto = _mapper.Map<GroupAccountBalance, GroupAccountBalanceDto>(groupAccountBalance!);

            return Ok(groupAccountBalanceDto);
        }
    }
}