namespace Invest.Core.Dtos
{
    public class CompletedInvestmentsNoteRequestDto
    {
        public int CompletedInvestmentNoteId {  get; set; }
        public int? TransactionTypeId { get; set; }
        public decimal Amount { get; set; }
        public string Note { get; set; } = string.Empty;
    }
}
