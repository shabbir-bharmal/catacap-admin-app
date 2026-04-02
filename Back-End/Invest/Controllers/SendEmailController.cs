using Microsoft.AspNetCore.Mvc;
using Invest.Service.Interfaces;
using Invest.Core.Dtos;

namespace Invest.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class SendEmailController : ControllerBase
    {
        protected readonly IRepositoryManager _repository;
        private readonly IMailService _mailService;

        public SendEmailController(
            IRepositoryManager repository,
            IMailService mailService)
        {
            _repository = repository;
            _mailService = mailService;
        }

        [HttpPost]
        public async Task<IActionResult> SendEmail(SendEmailDto sendEmail)
        {
            if (sendEmail.UserToken == null)
            {
                return BadRequest();
            }

            var user = await _repository.UserAuthentication.GetUser(sendEmail.UserToken);
            var emailTo = "ken@catacap.org";
            await _mailService.SendMailAsync(emailTo, "Transfer Request from my IA DAF to CataCap IA DAF #439888",
                           $"{sendEmail.Variant}",
                           $"<html><body><p>{sendEmail.Variant}</p><br/>" +
                           $"<p>Daf or Foundation Name: {sendEmail.DafOrFoundationName}</p>" +
                           $"<p>User Full Name: {user.UserName} {user.LastName}</p>" +
                           $"<p>User Email: {user.Email}</p>" +
                           $"</body>" +
                           $"</html>");

            return Ok();
        }
    }
}
