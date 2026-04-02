using Invest.Core.Constants;

namespace Invest.Core.Dtos
{
    public class DisbursalRequestListDto
    {
        public int Id { get; set; }
        public string? Name { get; set; }
        public int? InvestmentId { get; set; }
        public string? Property { get; set; }
        public string? Email { get; set; }
        public string? Mobile { get; set; }
        public DisbursalRequestStatus? Status { get; set; }
        public string? StatusName { get; set; }
        public string? Quote { get; set; }
        public string? ReceiveDate { get; set; }
        public decimal? DistributedAmount { get; set; }
        public string? InvestmentType { get; set; }
        public string? PitchDeck { get; set; }
        public string? PitchDeckName { get; set; }
        public string? InvestmentDocument { get; set; }
        public string? InvestmentDocumentName { get; set; }
        public bool HasNotes { get; set; }
        public DateTime? DeletedAt { get; set; }
        public string? DeletedBy { get; set; }
    }
}
