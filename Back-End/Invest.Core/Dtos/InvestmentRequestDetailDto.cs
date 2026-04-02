using Invest.Core.Constants;

namespace Invest.Core.Dtos
{
    public class InvestmentRequestDetailDto
    {
        public int CurrentStep { get; set; }
        public InvestmentRequestStatus Status { get; set; }
        public string? StatusName { get; set; }
        public string? FullName { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Email { get; set; }
        public string? Country { get; set; }
        public string? Website { get; set; }
        public string? OrganizationName { get; set; }
        public bool CurrentlyRaising { get; set; }
        public string? InvestmentTypes { get; set; }
        public string? InvestmentThemes { get; set; }
        public string? ThemeDescription { get; set; }

        public string? CapitalRaised { get; set; }
        public string? ReferenceableInvestors { get; set; }
        public bool? HasDonorCommitment { get; set; }

        public decimal? SoftCircledAmount { get; set; }
        public string? Timeline { get; set; }
        public decimal? CampaignGoal { get; set; }

        public string? Role { get; set; }
        public string? ReferralSource { get; set; }

        public string? InvestmentTerms { get; set; }
        public string? WhyBackYourInvestment { get; set; }

        public string? LogoFileName { get; set; }
        public string? HeroImageFileName { get; set; }
        public string? PitchDeckFileName { get; set; }

        public string? Logo { get; set; }
        public string? HeroImage { get; set; }
        public string? PitchDeck { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}
