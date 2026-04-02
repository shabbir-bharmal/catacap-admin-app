using Invest.Core.Constants;
using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class InvestmentRequest : BaseEntity
    {
        public int Id { get; set; }

        public int CurrentStep { get; set; }

        public InvestmentRequestStatus Status { get; set; }

        // Step 2 - Country
        public string? Country { get; set; }

        // Step 3 - Basic Info
        public string? UserId { get; set; }
        public User? User { get; set; }

        public string? Website { get; set; }
        public string? OrganizationName { get; set; }

        // Step 4
        public bool CurrentlyRaising { get; set; } = false;
        public string? InvestmentTypes { get; set; }

        // Step 5
        public string? InvestmentThemes { get; set; }
        public string? ThemeDescription { get; set; }

        // Step 6
        public string? CapitalRaised { get; set; }
        public string? ReferenceableInvestors { get; set; }

        // Step 7
        public bool HasDonorCommitment { get; set; } = false;
        public decimal SoftCircledAmount { get; set; }

        // Step 8
        public string? Timeline { get; set; }
        public decimal CampaignGoal { get; set; }

        // Step 9
        public string? Role { get; set; }
        public string? ReferralSource { get; set; }

        // Files
        public string? Logo { get; set; }
        public string? LogoFileName { get; set; }
        public string? HeroImage { get; set; }
        public string? HeroImageFileName { get; set; }
        public string? PitchDeck { get; set; }
        public string? PitchDeckFileName { get; set; }

        public string? InvestmentTerms { get; set; }
        public string? WhyBackYourInvestment { get; set; }

        public string? ModifiedBy { get; set; }
        public User? ModifiedByUser { get; set; }

        [Column(TypeName = "datetime")]
        public DateTime CreatedAt { get; set; } = DateTime.Now;

        [Column(TypeName = "datetime")]
        public DateTime? ModifiedAt { get; set; }
    }
}
