using Invest.Core.Models;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;

namespace Invest.Repo.Data;

public class GroupConfig : IEntityTypeConfiguration<Group>
{
    public void Configure(EntityTypeBuilder<Group> builder)
    {
        builder.HasOne(i => i.Owner).WithMany(i => i.Groups);
        builder.HasMany(i => i.Campaigns).WithMany(i => i.Groups);
        builder.HasOne(x => x.DeletedByUser).WithMany().HasForeignKey(x => x.DeletedBy);
    }
}