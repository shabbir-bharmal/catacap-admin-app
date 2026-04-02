using Invest.Core.Models;

namespace Invest.Core.Dtos
{
    public class CampaignCardResponseDto
    {
        public List<CampaignCardDtov2> Campaigns { get; set; } = new();
        public int TotalCount { get; set; }
    }
}
