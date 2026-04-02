using Invest.Core.Constants;

namespace Invest.Core.Dtos
{
    public class UpdateFormSubmissionDto
    {
        public int Id { get; set; }
        public FormSubmissionStatus Status { get; set; }
        public string? Note { get; set; }
    }
}
