// Ignore Spelling: Dto

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
    public class NotificationsController : ControllerBase
    {
        private readonly RepositoryContext _context;
        protected readonly IRepositoryManager _repository;
        private readonly IMapper _mapper;

        public NotificationsController(RepositoryContext context, IRepositoryManager repositoryManager, IMapper mapper)
        {
            _context = context;
            _repository = repositoryManager;
            _mapper = mapper;
        }

        [HttpPost("getAll")]
        public async Task<ActionResult<List<UserNotificationDto>>> GetAllNotificationByUser([FromBody] TokenDto tokenData)
        {
            var user = await _repository.UserAuthentication.GetUser(tokenData.Token);
            if (user == null)
            {
                return BadRequest();
            }

            var userNotifications = await _context.UsersNotifications.Include(n => n.TargetUser).Where(n => n.TargetUser.Id == user.Id).ToListAsync();
            var result = _mapper.Map<List<UsersNotification>, List<UserNotificationDto>>(userNotifications);

            return result != null ? Ok(result) : NotFound();
        }

        [HttpPut("updateAllForUser")]
        public async Task<IActionResult> UpdateAllNotificationForUser([FromBody] TokenDto tokenData)
        {
            var user = await _repository.UserAuthentication.GetUser(tokenData.Token);
            if (user == null)
            {
                return BadRequest();
            }

            var notifications = _context.Set<UsersNotification>()
                                        .Where(notification => !notification.isRead && notification.TargetUser == user)
                                        .AsQueryable();

            foreach (var notification in notifications)
            {
                notification.isRead = true;
            }

            await _context.SaveChangesAsync();

            return Ok();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteNotification(int id)
        {
            if (_context.UsersNotifications == null)
            {
                return NotFound();
            }

            var notification = await _context.UsersNotifications.FirstOrDefaultAsync(x => x.Id == id);
            if (notification == null)
            {
                return NotFound();
            }

            _context.UsersNotifications.Remove(notification);
            await _context.SaveChangesAsync();

            return Ok();
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateNotification(int id, [FromBody] AddUserNotificationDto notificationDto)
        {
            if (_context.UsersNotifications == null)
            {
                return BadRequest();
            }

            var notification = await _context.UsersNotifications.FirstOrDefaultAsync(x => x.Id == id);
            notification!.isRead = notificationDto.isRead;
            await _context.SaveChangesAsync();
            
            return Ok();
        }
    }
}
