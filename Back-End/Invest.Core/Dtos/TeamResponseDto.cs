namespace Invest.Core.Dtos
{
    public class TeamResponseDto
    {
        public int Id { get; set; }
        public string? FullName { get; set; }
        public string FirstName { get; set; } = null!;
        public string LastName { get; set; } = null!;
        public string Designation { get; set; } = null!;
        public string Description { get; set; } = null!;
        public string? ImageFileName { get; set; }
        public string? LinkedInUrl { get; set; }
        public bool IsManagement { get; set; } = false;
        public int DisplayOrder { get; set; }
        public DateTime? DeletedAt { get; set; }
        public string? DeletedBy { get; set; }
    }
}
