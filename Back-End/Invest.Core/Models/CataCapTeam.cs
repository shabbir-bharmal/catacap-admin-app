using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class CataCapTeam : BaseEntity
    {
        public int Id { get; set; }
        public string FirstName { get; set; } = null!;
        public string LastName { get; set; } = null!;
        public string Designation { get; set; } = null!;
        public string Description { get; set; } = null!;
        public string? ImageFileName { get; set; }
        public string? LinkedInUrl { get; set; }
        public bool IsManagement { get; set; } = false;
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
