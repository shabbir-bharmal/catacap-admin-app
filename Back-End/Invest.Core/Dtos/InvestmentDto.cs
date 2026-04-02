namespace Invest.Core.Dtos
{
    public class InvestmentDto
    {
        public int? Id { get; set; }
        public string? Name { get; set; }
        public string? Description { get; set; }
        public decimal? Raised { get; set; }
        public decimal AdminRaised { get; set; }
        public int? ProjectedReturn { get; set; }
        public string? Goal { get; set; }
        public int? Investors { get; set; }
        public string? Image { get; set; }
        public string? Themes { get; set; }
        public string? InvestmentTypes { get; set; }
        public string? SpecialFilters { get; set; }
        public string? SourcedBy { get; set; }
        public int? DaysSinceCreated { get; set; }
        public decimal HighestInvestment { get; set; }
        public decimal AverageInvestment { get; set; }
        public bool FeaturedInvestment { get; set; } = false;
        public List<string>? LatestInvestorAvatar { get; set; }
        public string? MetaTitle { get; set; }
        public string? MetaDescription { get; set; }
        public string? Property { get; set; }
    }
}
