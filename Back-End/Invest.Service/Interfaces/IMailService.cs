using Azure.Communication.Email;
using Invest.Core.Dtos;

namespace Invest.Service.Interfaces;
    public interface IMailService
    {
        Dictionary<string, VerificationCodeDto> ResetCodes { get; }
        //Task<bool> SendResetMailAsync(string emailTo, string subject, string htmlContent);
        Task<bool> SendMailAsync(string emailTo, string subject, string plainText, string html, IEnumerable<EmailAttachment>? attachments = null, IEnumerable<string>? cc = null);
        bool IsCodeCorrect(int code, string email);
        int GenerateCode(string email);
    }
