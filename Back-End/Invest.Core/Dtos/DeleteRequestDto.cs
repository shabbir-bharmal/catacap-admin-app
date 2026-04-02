// Ignore Spelling: Dto

namespace Invest.Core.Dtos;

public class DeleteRequestDto
{
    public bool IsFromRequest { get; set; } = false;
    public string RequestOwnerToken { get; set; } = string.Empty;
    public string? FollowedUserId { get; set; }
    public int? FollowedGroupId { get; set; }
}