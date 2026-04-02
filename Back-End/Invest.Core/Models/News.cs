using System.ComponentModel.DataAnnotations.Schema;

namespace Invest.Core.Models
{
    public class News : BaseEntity
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public int? NewsTypeId { get; set; }
        public SiteConfiguration? NewsType { get; set; }
        public int? AudienceId { get; set; }
        public SiteConfiguration? Audience { get; set; }
        public int? ThemeId { get; set; }
        public Theme? Theme { get; set; }
        public string? ImageFileName { get; set; }
        public string? NewsLink { get; set; }
        public bool Status { get; set; } = false;
        public string? CreatedBy { get; set; }
        public User? CreatedByUser { get; set; }
        public string? ModifiedBy { get; set; }
        public User? ModifiedByUser { get; set; }

        [Column(TypeName = "date")]
        public DateTime? NewsDate { get; set; }

        [Column(TypeName = "datetime")]
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        
        [Column(TypeName = "datetime")]
        public DateTime? ModifiedAt { get; set; }
    }
}
