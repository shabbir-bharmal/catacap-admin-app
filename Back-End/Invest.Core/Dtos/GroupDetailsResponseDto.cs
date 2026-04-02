namespace Invest.Core.Dtos
{
    public class GroupDetailsResponseDto
    {
        public GroupDto? Group { get; set; }
        public List<object>? Leaders { get; set; }
        public List<object>? Champions { get; set; }
        public int? TotalMembers { get; set; }
        public decimal? TotalInvestedByMembers { get; set; }
        public decimal? CompletedInvestments { get; set; }
    }
}
