using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class Testimonial : BaseEntity
    {
        public int Id { get; set; }
        public int DisplayOrder { get; set; }
        public string? PerspectiveText { get; set; }
        public string? Description { get; set; }
        public string? Metrics { get; set; }
        public bool Status { get; set; } = false;
        public string? Role { get; set; }
        public string? OrganizationName { get; set; }
        public string? UserId { get; set; }
        public User? User { get; set; }

        [Column(TypeName = "datetime")]
        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}
