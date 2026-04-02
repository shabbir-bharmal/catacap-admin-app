using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Invest.Core.Models;

namespace Invest.Repo.Data;

public class FollowingRequestConfig : IEntityTypeConfiguration<FollowingRequest>
{
    public void Configure(EntityTypeBuilder<FollowingRequest> builder)
    {
        builder.HasOne(i => i.RequestOwner).WithMany(i => i.Requests);
        builder.HasOne(i => i.UserToFollow).WithMany(i => i.RequestsToAccept);
        builder.HasOne(i => i.GroupToFollow).WithMany(i => i.Requests);
        builder.HasOne(x => x.DeletedByUser).WithMany().HasForeignKey(x => x.DeletedBy);
    }
}