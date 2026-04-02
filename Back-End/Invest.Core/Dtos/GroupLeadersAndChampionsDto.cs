namespace Invest.Core.Dtos
{
    public interface IGroupMemberDto
    {
        string? UserId { get; set; }
        string? RoleAndTitle { get; set; }
        string? Description { get; set; }
    }
    public class GroupLeadersAndChampionsDto
    {
        public string? UserId { get; set; }
        public string? RoleAndTitle { get; set; }
        public string? Description { get; set; }
        public string? LinkedInUrl { get; set; }
        public int? MemberSince { get; set; }
    }
    public class GroupLeadersDto : IGroupMemberDto
    {
        public string? UserId { get; set; }
        public string? RoleAndTitle { get; set; }
        public string? Description { get; set; }
        public string? LinkedInUrl { get; set; }
    }
    public class GroupChampionsDto : IGroupMemberDto
    {
        public string? UserId { get; set; }
        public string? RoleAndTitle { get; set; }
        public string? Description { get; set; }
        public int? MemberSince { get; set; }
    }
}
