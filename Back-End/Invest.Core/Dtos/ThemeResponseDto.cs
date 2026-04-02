namespace Invest.Core.Dtos
{
    public class ThemeResponseDto
    {
        public int Id { get; set; }
        public string? Name { get; set; }
        public decimal TotalInvestedAmount { get; set; }
        public decimal AverageInvestmentAmount { get; set; }
        public int InvestmentCount { get; set; }
        public int CampaignCount { get; set; }
        public string? Description { get; set; }
    }
}
