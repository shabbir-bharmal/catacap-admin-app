using Invest.Core.Constants;
using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class Faq : BaseEntity
    {
        public int Id { get; set; }
        public FaqCategory Category { get; set; }
        public string? Question { get; set; }
        public string? Answer { get; set; }
        public bool Status { get; set; } = false;
        public int DisplayOrder { get; set; }
        public string? CreatedBy { get; set; }
        public User? CreatedByUser { get; set; }
        public string? ModifiedBy { get; set; }
        public User? ModifiedByUser { get; set; }

        [Column(TypeName = "datetime")]
        public DateTime CreatedAt { get; set; } = DateTime.Now;

        [Column(TypeName = "datetime")]
        public DateTime? ModifiedAt { get; set; }
    }
}
