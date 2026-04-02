// Ignore Spelling: Dto Approuve

namespace Invest.Core.Dtos;

public class CreateGroupDto
{
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
    public string? GroupThemes { get; set; }
    public string? SDGs { get; set; }
    public bool IsApprouveRequired { get; set; }
    public bool IsDeactivated { get; set; }
    public bool IsPrivateGroup { get; set; } = false;
    public string? MetaTitle { get; set; }
    public string? MetaDescription { get; set; }
}