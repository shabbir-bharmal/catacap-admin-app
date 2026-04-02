namespace Invest.Core.Models
{
	public class UserInvestments : BaseEntity
	{
        public int Id { get; set; }
        public string? UserId { get; set; }
        public User? User { get; set; }
        public string? CampaignName { get; set; }
        public int? CampaignId { get; set; }
        public CampaignDto? Campaign { get; set; }
        public string? PaymentType { get; set; }
        public bool? LogTriggered { get; set; }
    }
}