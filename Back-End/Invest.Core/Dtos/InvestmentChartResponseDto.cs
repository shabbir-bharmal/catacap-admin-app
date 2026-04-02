namespace Invest.Core.Dtos
{
    public class InvestmentChartResponseDto
    {
        public decimal TotalDonations { get; set; }
        public decimal TotalInvestments { get; set; }
        public decimal GrowthRate { get; set; }
        public int Investors { get; set; }
        public List<MonthlyInvestmentDto> ChartData { get; set; } = new();
    }
    public class MonthlyInvestmentDto
    {
        public string Month { get; set; } = string.Empty;
        public decimal Amount { get; set; }
    }
}
