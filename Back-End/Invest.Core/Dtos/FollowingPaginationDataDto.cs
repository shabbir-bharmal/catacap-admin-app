// Ignore Spelling: Dto Dtos

namespace Invest.Core.Dtos
{
	public class FollowingPaginationDataDto
	{
        public List<FollowingDataDto> FollowingDataDto { get; set; } = new List<FollowingDataDto>();
        public int TotalItems { get; set; }
    }
}

