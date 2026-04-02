namespace Invest.Core.Dtos
{
    public class TeamRequestDto
    {
        public int Id { get; set; }
        public string FirstName { get; set; } = null!;
        public string LastName { get; set; } = null!;
        public string Designation { get; set; } = null!;
        public string Description { get; set; } = null!;
        public string? Image { get; set; }
        public string? ImageFileName { get; set; }
        public string? LinkedInUrl { get; set; }
        public bool IsManagement { get; set; } = false;
    }
}
