using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class DisbursalRequestConfig : IEntityTypeConfiguration<DisbursalRequest>
    {
        public void Configure(EntityTypeBuilder<DisbursalRequest> builder)
        {
            builder.HasKey(d => d.Id);
            builder.HasOne(i => i.User).WithMany().HasForeignKey(i => i.UserId);
            builder.HasOne(i => i.Campaign).WithMany().HasForeignKey(i => i.CampaignId);
            builder.Property(r => r.ReceiveDate).HasColumnType("date").IsRequired(false);
            builder.HasOne(x => x.DeletedByUser).WithMany().HasForeignKey(x => x.DeletedBy);
        }
    }
}
