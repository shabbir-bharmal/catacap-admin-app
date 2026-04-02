using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class CompletedInvestmentNotes
    {
        public int Id { get; set; }
        public int? CompletedInvestmentId { get; set; }
        public CompletedInvestmentsDetails? CompletedInvestmentsDetails { get; set; }
        public string? Note { get; set; }
        public int? TransactionType { get; set; }
        public decimal OldAmount { get; set; }
        public decimal NewAmount { get; set; }
        public string? CreatedBy { get; set; }
        public User? User { get; set; }

        [Column(TypeName = "date")]
        public DateTime CreatedAt { get; set; }
    }
}
