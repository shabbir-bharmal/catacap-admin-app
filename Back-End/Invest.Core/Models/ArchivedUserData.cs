namespace Invest.Core.Models
{
    public class ArchivedUserData
    {
        public int Id { get; set; }
        public string SourceTable { get; set; } = string.Empty;
        public string RecordId { get; set; } = string.Empty;
        public string? UserId { get; set; }
        public int DaysOld { get; set; }
        public string RecordJson { get; set; } = string.Empty;
        public DateTime? ArchivedAt { get; set; } = DateTime.Now;
        public DateTime? DeletedAt { get; set; } = DateTime.Now;
    }
}
