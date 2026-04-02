using Invest.Core.Constants;

namespace Invest.Core.Dtos
{
    public class SubmitFormDto
    {
        public string? CaptchaToken { get; set; }
        public FormType FormType { get; set; }
        public FormSubmissionStatus Status { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Email { get; set; }
        public string? Description { get; set; }
        public string? LaunchPartners { get; set; }
        public string? TargetRaiseAmount { get; set; }
        public string? SelfRaiseAmountRange { get; set; }
        public bool OtherInterest { get; set; } = false;
    }
}
