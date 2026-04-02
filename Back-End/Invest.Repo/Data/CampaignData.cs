using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Invest.Core.Models;

namespace Invest.Repo.Data;

public class CampaignData : IEntityTypeConfiguration<CampaignDto>
{   // add test data for user and admin
    public void Configure(EntityTypeBuilder<CampaignDto> builder)
    {
        builder.HasKey(x => x.Id);
        builder.HasOne(i => i.GroupForPrivateAccess).WithMany(i => i.PrivateCampaigns).HasForeignKey(i => i.GroupForPrivateAccessId);
        builder.HasOne(d => d.User).WithMany().HasForeignKey(d => d.UserId);
        builder.Property(c => c.FundTerm).HasColumnType("date").IsRequired(false);
        builder.Property(c => c.DebtMaturityDate).HasColumnType("date").IsRequired(false);
        builder.HasOne(x => x.DeletedByUser).WithMany().HasForeignKey(x => x.DeletedBy);
    }
}
