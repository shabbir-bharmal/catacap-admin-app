using Invest.Core.Constants;
using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class FormSubmission : BaseEntity
    {
        public int Id { get; set; }
        public FormType FormType { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Email { get; set; }
        public string? Description { get; set; }
        public FormSubmissionStatus Status { get; set; } = FormSubmissionStatus.New;
        public string? LaunchPartners { get; set; }
        public string? TargetRaiseAmount { get; set; }
        public string? SelfRaiseAmountRange { get; set; }

        [Column(TypeName = "datetime")]
        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}
