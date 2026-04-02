using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class AssetBasedPaymentRequestNotes
    {
        public int Id { get; set; }
        public int RequestId { get; set; }
        public AssetBasedPaymentRequest AssetBasedPaymentRequest { get; set; } = null!;
        public string? Note { get; set; }
        public string? OldStatus { get; set; }
        public string? NewStatus { get; set; }
        public string? CreatedBy { get; set; }
        public User? User { get; set; }

        [Column(TypeName = "date")]
        public DateTime CreatedAt { get; set; }
    }
}
