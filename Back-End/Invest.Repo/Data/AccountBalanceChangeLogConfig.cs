// Ignore Spelling: Repo

using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class AccountBalanceChangeLogConfig : IEntityTypeConfiguration<AccountBalanceChangeLog>
    {
        public void Configure(EntityTypeBuilder<AccountBalanceChangeLog> builder)
        {
            builder.HasKey(d => d.Id);
            builder.HasOne(r => r.User).WithMany().HasForeignKey(r => r.UserId);
            builder.HasOne(r => r.Campaign).WithMany().HasForeignKey(r => r.CampaignId);
            builder.HasOne(r => r.Group).WithMany().HasForeignKey(r => r.GroupId);
            builder.HasOne(r => r.PendingGrants).WithMany().HasForeignKey(r => r.PendingGrantsId);
            builder.HasOne(r => r.AssetBasedPaymentRequest).WithMany().HasForeignKey(r => r.AssetBasedPaymentRequestId);
            builder.HasOne(x => x.DeletedByUser).WithMany().HasForeignKey(x => x.DeletedBy);
        }
    }
}
