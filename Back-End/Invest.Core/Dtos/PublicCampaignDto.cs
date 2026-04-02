using Invest.Core.Models;

namespace Invest.Core.Dtos
{
    public class PublicCampaignDto
    {
        public int? Id { get; set; }
        public string? Name { get; set; }
        public string? Description { get; set; }
        public string? Themes { get; set; }
        public string? ApprovedBy { get; set; }
        public string? SDGs { get; set; }
        public string? InvestmentTypes { get; set; }
        public string? Terms { get; set; }
        public string? MinimumInvestment { get; set; }
        public string? Website { get; set; }
        public string? NetworkDescription { get; set; }
        public string? ContactInfoFullName { get; set; }
        public string? ContactInfoAddress { get; set; }
        public string? ContactInfoAddress2 { get; set; }
        public string? ContactInfoEmailAddress { get; set; }
        public string? InvestmentInformationalEmail { get; set; }
        public string? ContactInfoPhoneNumber { get; set; }
        public string? OtherCountryAddress { get; set; }
        public string? Country { get; set; }
        public string? City { get; set; }
        public string? State { get; set; }
        public string? ZipCode { get; set; }
        public string? ImpactAssetsFundingStatus { get; set; }
        public string? InvestmentRole { get; set; }
        public string? ReferredToCataCap { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Status { get; set; }
        public string? Target { get; set; }
        public string? TileImageFileName { get; set; }
        public string? ImageFileName { get; set; }
        public string? PdfFileName { get; set; }
        public string? OriginalPdfFileName { get; set; }
        public string? LogoFileName { get; set; }
        public bool? IsActive { get; set; }
        public InvestmentStage? Stage { get; set; }
        public string? Property { get; set; }
        public int? AddedTotalAdminRaised { get; set; }
        public decimal? CurrentBalance { get; set; }
        public int? NumberOfInvestors { get; set; }
        public string? FundraisingCloseDate { get; set; }
        public string? MissionAndVision { get; set; }
        public string? PersonalizedThankYou { get; set; }
        public decimal? ExpectedTotal { get; set; }
        public DateTime? CreatedDate { get; set; }
        public DateTime? ModifiedDate { get; set; }
        public List<MatchedCampaignsCardDto>? MatchedCampaigns { get; set; }
        public decimal HighestInvestment { get; set; }
        public decimal AverageInvestment { get; set; }
        public int ProjectedReturn { get; set; }
        public List<CampaignInvestorDto> InvestorsList { get; set; } = new();
        public string? MetaTitle { get; set; }
        public string? MetaDescription { get; set; }
    }
    public class CampaignInvestorDto
    {
        public string Name { get; set; } = null!;
        public string? ProfileImage { get; set; }
        public decimal Amount { get; set; }
        public string InvestedAgo { get; set; } = null!;
    }
}
