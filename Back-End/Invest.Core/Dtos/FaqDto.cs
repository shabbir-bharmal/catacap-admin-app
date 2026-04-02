using Invest.Core.Constants;

namespace Invest.Core.Dtos
{
    public class FaqDto
    {
        public int? Id { get; set; }
        public FaqCategory Category { get; set; }
        public string? CategoryName { get; set; }
        public string? Question { get; set; }
        public string? Answer { get; set; }
        public bool Status { get; set; }
        public int? DisplayOrder { get; set; }
        public DateTime? DeletedAt { get; set; }
        public string? DeletedBy { get; set; }
    }
}
