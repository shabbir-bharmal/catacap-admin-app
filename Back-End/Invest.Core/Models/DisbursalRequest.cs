using Invest.Core.Constants;
using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class DisbursalRequest : BaseEntity
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public User User { get; set; } = null!;
        public int? CampaignId { get; set; }
        public CampaignDto? Campaign { get; set; }
        public string? Role { get; set; }
        public string? Mobile{ get; set; }
        public DisbursalRequestStatus Status { get; set; } = DisbursalRequestStatus.Pending;
        public string? Quote { get; set; }
        public decimal DistributedAmount { get; set; }
        public string? ImpactAssetsFundingPreviously { get; set; }
        public string? InvestmentRemainOpen { get; set; }

        [Column(TypeName = "date")]
        public DateTime? ReceiveDate { get; set; }
        public string? PitchDeck { get; set; }
        public string? PitchDeckName { get; set; }
        public string? InvestmentDocument { get; set; }
        public string? InvestmentDocumentName { get; set; }
        public bool? TracksMetrics { get; set; }
        public string? MetricsReport { get; set; }
        public string? MetricsReportName { get; set; }

        [Column(TypeName = "jsonb")]
        public string? MetricsPairs { get; set; }

        [Column(TypeName = "datetime")]
        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}
