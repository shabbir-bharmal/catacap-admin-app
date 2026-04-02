namespace Invest.Core.Dtos
{
    public class RecentInvestmentDto
    {
        public string Investor { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public string Investment { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? Date { get; set; }
    }
}
