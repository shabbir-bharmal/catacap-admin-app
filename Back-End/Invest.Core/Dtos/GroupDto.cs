// Ignore Spelling: Approuve Dto

using Invest.Core.Models;

namespace Invest.Core.Dtos;

public class GroupDto
{
    public int Id { get; set; }
    public string Token { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string PictureFileName { get; set; } = string.Empty;
    public string BackgroundPictureFileName { get; set; } = string.Empty;
    public string Website { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Identifier { get; set; }
    public string? VideoLink { get; set; }
    public string? OurWhyDescription { get; set; }
    public string? DidYouKnow { get; set; }
    public decimal? OriginalBalance { get; set; }
    public decimal? CurrentBalance { get; set; }
    public bool IsApprouveRequired { get; set; }
    public bool IsDeactivated { get; set; }
    public bool IsOwner { get; set; }
    public bool IsFollowing { get; set; }
    public bool IsFollowPending { get; set; }
    public bool IsLeader { get; set; }
    public bool IsCorporateGroup { get; set; } = false;
    public bool IsPrivateGroup { get; set; } = false;
    public string? Leaders { get; set; }
    public string? ChampionsAndCatalysts { get; set; }
    public string? Themes { get; set; }
    public string? SDGs { get; set; }
    public string? GroupThemes { get; set; }
    public string? MetaTitle { get; set; }
    public string? MetaDescription { get; set; }

    public GroupAccountBalanceDto groupAccountBalance { get; set; } = new GroupAccountBalanceDto();
    public List<Campaign>? Campaigns { get; set; }
    public List<CampaignCardDtov2>? ActiveCampaigns { get; set; }
    public List<CampaignCardDtov2>? CompletedCampaigns { get; set; } 
    public List<CampaignCardDto>? PrivateCampaigns { get; set; }
}