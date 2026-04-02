using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class AssetBasedPaymentRequestNotesConfig : IEntityTypeConfiguration<AssetBasedPaymentRequestNotes>
    {
        public void Configure(EntityTypeBuilder<AssetBasedPaymentRequestNotes> builder)
        {
            builder.HasKey(x => x.Id);
            builder.HasOne(x => x.AssetBasedPaymentRequest).WithMany().HasForeignKey(x => x.RequestId);
            builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.CreatedBy);
            builder.Property(r => r.CreatedAt).HasColumnType("date");
        }
    }
}
