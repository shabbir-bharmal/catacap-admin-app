namespace Invest.Core.Dtos
{
    public class AccountHistoryDto
    {
        public int Id { get; set; }
        public string? UserName { get; set; }
        public string? Email { get; set; }
        public DateTime ChangeDate { get; set; }
        public decimal? OldValue { get; set; }
        public decimal? NewValue { get; set; }
        public string? PaymentType { get; set; }
        public string? InvestmentName { get; set; }
        public string? Comment { get; set; }
        public decimal GrossAmount { get; set; }
        public decimal Fees { get; set; }
        public decimal NetAmount { get; set; }
        public DateTime? DeletedAt { get; set; }
        public string? DeletedBy { get; set; }
    }
}
