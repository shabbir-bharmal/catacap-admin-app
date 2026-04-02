namespace Invest.Core.Dtos
{
    public class NewsRequestDto
    {
        public int? Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public int? NewsTypeId { get; set; }
        public int? AudienceId { get; set; }
        public int? ThemeId { get; set; }
        public string? Image { get; set; }
        public string? ImageFileName { get; set; }
        public string? NewsLink { get; set; }
        public bool Status { get; set; }
        public DateTime? NewsDate { get; set; }
    }
}
