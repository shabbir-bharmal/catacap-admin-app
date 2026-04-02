using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class AssetBasedPaymentRequest : BaseEntity
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public User User { get; set; } = null!;
        public int? CampaignId { get; set; }
        public CampaignDto? Campaign { get; set; }
        public int AssetTypeId { get; set; }
        public AssetType AssetType { get; set; } = null!;
        public string? AssetDescription { get; set; }
        public decimal ApproximateAmount { get; set; }
        public decimal ReceivedAmount { get; set; }
        public string ContactMethod { get; set; } = string.Empty;
        public string ContactValue { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string? Reference { get; set; }


        [Column(TypeName = "datetime")]
        public DateTime CreatedAt { get; set; } = DateTime.Now;

        [Column(TypeName = "datetime")]
        public DateTime? UpdatedAt { get; set; }

        public string? UpdatedBy { get; set; }
        public User? UpdatedByUser { get; set; }
    }
}
