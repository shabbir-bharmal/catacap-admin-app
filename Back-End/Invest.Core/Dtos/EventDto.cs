namespace Invest.Core.Dtos
{
    public class EventDto
    {
        public int? Id { get; set; }
        public string Title { get; set; } = null!;
        public string Description { get; set; } = null!;
        public DateTime? EventDate { get; set; }
        public string? EventTime { get; set; }
        public string? RegistrationLink { get; set; }
        public bool Status { get; set; }
        public string? Image { get; set; }
        public string? ImageFileName { get; set; }
        public string? Type { get; set; }
        public string? Duration { get; set; }
        public DateTime? DeletedAt { get; set; }
        public string? DeletedBy { get; set; }
    }
}
