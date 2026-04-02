using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class CompletedInvestmentNotesConfig : IEntityTypeConfiguration<CompletedInvestmentNotes>
    {
        public void Configure(EntityTypeBuilder<CompletedInvestmentNotes> builder)
        {
            builder.HasKey(x => x.Id);
            builder.HasOne(x => x.CompletedInvestmentsDetails).WithMany().HasForeignKey(x => x.CompletedInvestmentId);
            builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.CreatedBy);
            builder.Property(r => r.CreatedAt).HasColumnType("date");
        }
    }
}
