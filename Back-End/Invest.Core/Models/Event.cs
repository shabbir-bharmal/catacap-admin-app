using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class Event : BaseEntity
    {
        public int Id { get; set; }
        public string Title { get; set; } = null!;
        public string Description { get; set; } = null!;
        public string? RegistrationLink { get; set; }
        public string? EventTime { get; set; }

        [Column(TypeName = "date")]
        public DateTime EventDate { get; set; }

        public bool Status { get; set; } = false;
        public string? Duration { get; set; }
        public string? Type { get; set; }
        public string? Image { get; set; }
        public string? ImageFileName { get; set; }

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
