using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Invest.Core.Models;

namespace Invest.Repo.Data;

public class UserData : IEntityTypeConfiguration<User>
{   // add test data for user and admin
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasData(
           new User
           {
               Id = "ccc24a6d-aa14-4f0e-ac7f-09740cb196f8",
               Email = "admin@aa.com",
               FirstName = "admin",
               LastName = "admin",
               UserName = "admin1",
               NormalizedUserName = "ADMIN1",
               PasswordHash = "AQAAAAEAACcQAAAAEKGOT9qPv6LK4JX2BuTAWMqWOyxMgY/5xa01QqSA8c0KfDDNRuqq9HLiwae1XKnnYQ==",
               SecurityStamp = "KLLPL3UL2TBHSLYEJS6ZRECUVFCVFFRZ",
               ConcurrencyStamp = "bde4dffa-8ac6-42c9-82e9-d2ea0c6d047a",
               LockoutEnabled = true
           });
        builder.HasOne(x => x.DeletedByUser).WithMany().HasForeignKey(x => x.DeletedBy);
    }
}
