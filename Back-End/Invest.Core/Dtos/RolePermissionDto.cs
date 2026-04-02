namespace Invest.Core.Dtos
{
    public class RolePermissionDto
    {
        public string RoleId { get; set; } = string.Empty;
        public string RoleName { get; set; } = string.Empty;
        public bool IsSuperAdmin { get; set; }
        public List<RolePermissionItemDto> Permissions { get; set; } = new();
    }

    public class RolePermissionItemDto
    {
        public int ModuleId { get; set; }
        public string? ModuleName { get; set; }
        public bool IsManage { get; set; }
        public bool IsDelete { get; set; }
    }
}
