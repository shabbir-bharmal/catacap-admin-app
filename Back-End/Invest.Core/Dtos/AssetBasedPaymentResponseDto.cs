namespace Invest.Core.Dtos
{
    public class AssetBasedPaymentResponseDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? InvestmentName { get; set; }
        public string AssetType { get; set; } = string.Empty;
        public decimal ApproximateAmount { get; set; }
        public decimal ReceivedAmount { get; set; }
        public string ContactMethod { get; set; } = string.Empty;
        public string ContactValue { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public bool HasNotes { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? DeletedAt { get; set; }
        public string? DeletedBy { get; set; }
    }
}
