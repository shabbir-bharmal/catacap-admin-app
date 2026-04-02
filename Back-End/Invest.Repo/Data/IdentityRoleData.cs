using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Invest.Core.Models;

namespace Invest.Repo.Data;

public class IdentityRoleData : IEntityTypeConfiguration<ApplicationRole>
{   // add test data for user and admin
    public void Configure(EntityTypeBuilder<ApplicationRole> builder)
    {
        builder.HasData(
           new ApplicationRole
           {
              ConcurrencyStamp = "d06257e2-4ea8-4931-97f1-af0694b02c4d",
              Id = "460da70e-6557-4584-8fe2-03524ea7f5dc",
              Name = "Admin",
              NormalizedName = "ADMIN",
              IsSuperAdmin = false
           });
    }
}
