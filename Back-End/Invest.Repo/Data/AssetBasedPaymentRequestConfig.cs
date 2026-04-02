using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class AssetBasedPaymentRequestConfig : IEntityTypeConfiguration<AssetBasedPaymentRequest>
    {
        public void Configure(EntityTypeBuilder<AssetBasedPaymentRequest> builder)
        {
            builder.HasKey(d => d.Id);
            builder.HasOne(r => r.User).WithMany().HasForeignKey(r => r.UserId);
            builder.HasOne(r => r.Campaign).WithMany().HasForeignKey(r => r.CampaignId);
            builder.HasOne(r => r.AssetType).WithMany().HasForeignKey(r => r.AssetTypeId);
            builder.HasOne(x => x.UpdatedByUser).WithMany().HasForeignKey(x => x.UpdatedBy);
            builder.HasOne(x => x.DeletedByUser).WithMany().HasForeignKey(x => x.DeletedBy);
        }
    }
}
