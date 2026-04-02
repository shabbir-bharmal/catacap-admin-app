using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class ModuleAccessPermissionConfig : IEntityTypeConfiguration<ModuleAccessPermission>
    {
        public void Configure(EntityTypeBuilder<ModuleAccessPermission> builder)
        {
            builder.HasKey(d => d.Id);
            builder.HasOne(x => x.Role).WithMany().HasForeignKey(x => x.RoleId);
            builder.HasOne(x => x.UpdatedByUser).WithMany().HasForeignKey(x => x.UpdatedBy);
        }
    }
}
