// Ignore Spelling: Dto Dtos

namespace Invest.Core.Dtos
{
	public class GroupAccountBalanceDto
    {
        public string UserId { get; set; } = string.Empty;
        public int GroupId { get; set; }
        public string GroupName { get; set; } = string.Empty;
        public decimal Balance { get; set; }
    }
}

