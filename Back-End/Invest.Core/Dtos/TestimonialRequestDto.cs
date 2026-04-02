namespace Invest.Core.Dtos
{
    public class TestimonialRequestDto
    {
        public int? Id { get; set; }
        public int DisplayOrder { get; set; }
        public string? PerspectiveText { get; set; }
        public string? Description { get; set; }
        public bool Status { get; set; } = false;
        public List<TestimonialMetricDto>? Metrics { get; set; }
        public string? Role { get; set; }
        public string? OrganizationName { get; set; }
        public string? UserId { get; set; }
    }
}
