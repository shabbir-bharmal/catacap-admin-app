using Azure.Communication.Email;
using Invest.Core.Constants;

namespace Invest.Service.Interfaces
{
    public interface IEmailTemplateService
    {
        Task SendTemplateEmailAsync(EmailTemplateCategory category, string toEmail, Dictionary<string, string> variables, string subjectPrefix = "", List<EmailAttachment>? attachments = null);
    }
}
