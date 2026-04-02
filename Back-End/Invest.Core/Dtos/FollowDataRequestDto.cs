// Ignore Spelling: Dto

namespace Invest.Core.Dtos;

public class FollowDataRequestDto
{
    public string UserToken { get; set; } = string.Empty;
    public bool IsFollowRequest { get; set; }

    public int? Page { get; set; }
    public int? PageSize { get; set; }
    public string? Search { get; set; }

    public bool SelectedOption { get; set; }
}