namespace Invest.Core.Models
{
    public class InvestmentTagMapping
    {
        public int Id { get; set; }
        public InvestmentTag? InvestmentTag { get; set; }
        public int TagId { get; set; }
        public CampaignDto? Campaign { get; set; }
        public int CampaignId { get; set; }
    }
}
