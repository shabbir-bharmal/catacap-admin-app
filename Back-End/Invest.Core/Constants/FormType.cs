using System.ComponentModel.DataAnnotations;

namespace Invest.Core.Constants
{
    public enum FormType
    {
        [Display(Name = "Companies")]
        Companies = 1,

        [Display(Name = "Home")]
        Home = 2,

        [Display(Name = "Champion Deal")]
        ChampionDeal = 3,

        [Display(Name = "About")]
        About = 4,

        [Display(Name = "Group")]
        Group = 5
    }
}
