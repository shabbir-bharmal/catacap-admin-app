namespace Invest.Core.Dtos
{
    public class AdminUserResponseDto
    {
        public string Email { get; set; } = string.Empty;
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public string PictureFileName { get; set; } = string.Empty;
        public string RoleName { get; set; } = string.Empty;
        public bool IsSuperAdmin { get; set; }
        public List<RolePermissionItemDto> Permissions { get; set; } = new();
    }
}
