namespace Invest.Core.Dtos
{
    public class InvestmentThemeResponseDto
    {
        public string Name { get; set; } = string.Empty;
        public decimal TotalAmount { get; set; }
        public decimal Percentage { get; set; }
    }
}
