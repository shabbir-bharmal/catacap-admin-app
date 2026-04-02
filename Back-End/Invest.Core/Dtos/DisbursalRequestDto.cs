using Invest.Core.Constants;

namespace Invest.Core.Dtos
{
    public class DisbursalRequestDto
    {
        public int? Id { get; set; }
        public int? CampaignId { get; set; }
        public string? Role { get; set; }
        public string? Mobile { get; set; }
        public decimal DistributedAmount { get; set; }
        public DisbursalRequestStatus? Status { get; set; } = DisbursalRequestStatus.Pending;
        public string? ImpactAssetsFundingPreviously { get; set; }
        public string? InvestmentRemainOpen { get; set; }
        public DateTime ReceiveDate { get; set; }
        public string? PitchDeck { get; set; }
        public string? PitchDeckName { get; set; }
        public string? InvestmentDocument { get; set; }
        public string? InvestmentDocumentName { get; set; }
        public string? Note { get; set; }
        public string? Quote { get; set; }
    }
}
