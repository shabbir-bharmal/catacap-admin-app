// Ignore Spelling: Dto Dtos Daf

namespace Invest.Core.Dtos
{
    public class SendEmailDto
    {
        public string UserToken { get; set; } = string.Empty;
        public string Variant { get; set; } = string.Empty;
        public string DafOrFoundationName { get; set; } = string.Empty;
    }
}