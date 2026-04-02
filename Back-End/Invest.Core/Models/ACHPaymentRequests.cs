using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class ACHPaymentRequests
    {
        public int Id { get; set; }
        public string Email { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public int? CampaignId { get; set; }
        public CampaignDto? Campaign { get; set; }
        public decimal Amount { get; set; }

        [Column(TypeName = "datetime")]
        public DateTime CreatedAt { get; set; }
    }
}
