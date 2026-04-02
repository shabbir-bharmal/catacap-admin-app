// Ignore Spelling: Dto

namespace Invest.Core.Dtos;

public class AddUserNotificationDto
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string UrlToRedirect { get; set; } = string.Empty;
    public bool isRead { get; set; }
    public string PictureFileName { get; set; } = string.Empty;
    public string TargetUserToken { get; set; } = string.Empty;
}
