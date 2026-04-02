using System.ComponentModel.DataAnnotations;

namespace Invest.Core.Constants
{
    public enum FaqCategory
    {
        [Display(Name = "Donors/Investors")]
        DonorsInvestors = 1,

        [Display(Name = "Group Leaders")]
        GroupLeaders = 2,

        [Display(Name = "Investments")]
        Investments = 3
    }
}
