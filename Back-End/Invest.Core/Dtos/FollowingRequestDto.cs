// Ignore Spelling: Dto

namespace Invest.Core.Dtos;

public class FollowingRequestDto
{
    public int Id { get; set; }
    public string? RequestOwnerName { get; set; }
    public string? RequestOwnerPicture { get; set; }
    public string? UserToFollowId { get; set; }
    public int? GroupToFollowId { get; set; }
    public string? Status { get; set; }
    public DateTime? CreatedAt { get; set; }
}