// Ignore Spelling: Dto

namespace Invest.Core.Dtos;

public class AddFollowingRequestDto
{
    public string RequestOwnerToken { get; set; } = string.Empty;
    public string? UserToFollowId { get; set; }
    public int? GroupToFollowId { get; set; }
}