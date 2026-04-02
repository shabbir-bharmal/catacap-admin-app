using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class DisbursalRequestNotesConfig : IEntityTypeConfiguration<DisbursalRequestNotes>
    {
        public void Configure(EntityTypeBuilder<DisbursalRequestNotes> builder)
        {
            builder.HasKey(x => x.Id);
            builder.HasOne(x => x.DisbursalRequest).WithMany().HasForeignKey(x => x.DisbursalRequestId);
            builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.CreatedBy);
            builder.Property(r => r.CreatedAt).HasColumnType("date");
        }
    }
}
