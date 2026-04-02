namespace Invest.Core.Dtos
{
    public class AuditLogDto
    {
        public string? Id { get; set; }
        public string? TableName { get; set; }
        public string? Identifier { get; set; }
        public string? ActionType { get; set; }
        public string? OldValues { get; set; }
        public string? NewValues { get; set; }
        public string? ChangedColumns { get; set; }
        public string? UpdatedBy { get; set; }
        public DateTime UpdatedDate { get; set; }
        public string? UpdatedAt { get; set; }
    }
}
