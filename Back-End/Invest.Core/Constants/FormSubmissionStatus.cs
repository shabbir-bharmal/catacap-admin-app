using System.ComponentModel.DataAnnotations;

namespace Invest.Core.Constants
{
    public enum FormSubmissionStatus
    {
        [Display(Name = "New")]
        New = 1,

        [Display(Name = "Contacted")]
        Contacted = 2,

        [Display(Name = "In Progress")]
        InProgress = 3,

        [Display(Name = "Completed")]
        Completed = 4,

        [Display(Name = "Archived")]
        Archived = 5
    }
}
