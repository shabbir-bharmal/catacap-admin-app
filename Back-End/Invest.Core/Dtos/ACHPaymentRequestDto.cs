namespace Invest.Core.Dtos
{
    public class ACHPaymentRequestDto
    {
        public string Email { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public int? CampaignId { get; set; }
    }
}
