// Ignore Spelling: Dto

namespace Invest.Core.Dtos;

public class FollowingDataDto
{
    public string FollowingId { get; set; } = string.Empty;
    public string? Identifier { get; set; }
    public string PictureFileName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int InvestmentsCount { get; set; }
    public bool IsGroup { get; set; }
    public string Description { get; set; } = string.Empty;
}