using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class PendingGrantNotesConfig : IEntityTypeConfiguration<PendingGrantNotes>
    {
        public void Configure(EntityTypeBuilder<PendingGrantNotes> builder)
        {
            builder.HasKey(x => x.Id);
            builder.HasOne(x => x.PendingGrants).WithMany().HasForeignKey(x => x.PendingGrantId);
            builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.CreatedBy);
            builder.Property(r => r.CreatedAt).HasColumnType("date");
        }
    }
}
