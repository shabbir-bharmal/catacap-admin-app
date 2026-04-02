using System.ComponentModel.DataAnnotations;

namespace Invest.Core.Constants
{
    public enum DisbursalRequestStatus
    {
        [Display(Name = "Pending")]
        Pending = 1,

        [Display(Name = "Completed")]
        Completed = 2
    }
}
