namespace Invest.Core.Dtos
{
    public class NewsResponseDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public int? TypeId { get; set; }
        public string? Type { get; set; }
        public int? AudienceId { get; set; }
        public string? Audience { get; set; }
        public int? ThemeId { get; set; }
        public string? Theme { get; set; }
        public string? ImageFileName { get; set; }
        public string? Link { get; set; }
        public bool Status { get; set; }
        public string? NewsDate { get; set; }
        public DateTime? DeletedAt { get; set; }
        public string? DeletedBy { get; set; }
    }
}
