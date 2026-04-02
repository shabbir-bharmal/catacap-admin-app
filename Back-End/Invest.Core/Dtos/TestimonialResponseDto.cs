namespace Invest.Core.Dtos
{
    public class TestimonialResponseDto
    {
        public int Id { get; set; }
        public int DisplayOrder { get; set; }
        public string? PerspectiveText { get; set; }
        public string? Description { get; set; }
        public List<TestimonialMetricDto>? Metrics { get; set; }
        public string? Role { get; set; }
        public bool Status { get; set; }
        public string? OrganizationName { get; set; }
        public string? UserFullName { get; set; }
        public string? UserId { get; set; }
        public string? ProfilePicture { get; set; }
        public DateTime? DeletedAt { get; set; }
        public string? DeletedBy { get; set; }
    }
}
