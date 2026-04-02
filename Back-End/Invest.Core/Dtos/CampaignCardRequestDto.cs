namespace Invest.Core.Dtos
{
    public class CampaignCardRequestDto
    {
        public string? Theme {  get; set; }
        public string? InvestmentType {  get; set; }
        public string? SourcedBy {  get; set; }
        public string? SpecialFilter { get; set; }
        public string? SearchValue { get; set; }
        public int? CurrentPage { get; set; }
        public int? PerPage { get; set; }
    }
}
