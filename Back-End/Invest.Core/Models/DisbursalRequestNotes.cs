using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class DisbursalRequestNotes
    {
        public int Id { get; set; }
        public int? DisbursalRequestId { get; set; }
        public DisbursalRequest? DisbursalRequest { get; set; }
        public string? Note { get; set; }
        public string? CreatedBy { get; set; }
        public User? User { get; set; }
        
        [Column(TypeName = "date")]
        public DateTime CreatedAt { get; set; }
    }
}
