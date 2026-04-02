// Ignore Spelling: Dto Dtos

namespace Invest.Core.Dtos
{
    public class UpdatePendingGrantsDto
    {
        public int? Id { get; set; }
        public string Status { get; set; } = string.Empty;
        public string RejectionMemo { get; set; } = string.Empty;
        public string? Note { get; set; }
    }
}
