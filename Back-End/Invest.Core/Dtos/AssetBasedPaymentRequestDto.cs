namespace Invest.Core.Dtos
{
    public class AssetBasedPaymentRequestDto
    {
        public int? CampaignId { get; set; }
        public int AssetTypeId { get; set; }
        public string? AssetDescription { get; set; }
        public decimal ApproximateAmount { get; set; }
        public string ContactMethod { get; set; } = string.Empty;
        public string ContactValue { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public bool IsAnonymous { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Email { get; set; }
        public string? userName { get; set; }
        public decimal InvestmentAmountWithFees { get; set; }
        public bool CoverFees { get; set; }
        public string? ZipCode { get; set;}
        public string? Reference { get; set; }
    }
}
