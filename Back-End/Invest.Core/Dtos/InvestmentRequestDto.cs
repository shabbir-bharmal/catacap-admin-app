namespace Invest.Core.Dtos
{
    public class InvestmentRequestDto
    {
        public bool? IsActive { get; set; } = true;
        public string? Themes { get; set; }
        public string? InvestmentTypes { get; set; }
        public string? SpecialFilters { get; set; }
        public string? SourcedBy { get; set; }
        public string? SearchValue { get; set; }
    }
}
