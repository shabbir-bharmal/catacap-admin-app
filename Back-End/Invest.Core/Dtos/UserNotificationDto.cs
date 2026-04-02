// Ignore Spelling: Dto Dtos

namespace Invest.Core.Dtos
{
    public class UserNotificationDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string UrlToRedirect { get; set; } = string.Empty;
        public bool isRead { get; set; }
        public string PictureFileName { get; set; } = string.Empty;
        public string TargetUserToken { get; set; } = string.Empty;
    }
}
