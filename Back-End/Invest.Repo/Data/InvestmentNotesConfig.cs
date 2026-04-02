using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class InvestmentNotesConfig : IEntityTypeConfiguration<InvestmentNotes>
    {
        public void Configure(EntityTypeBuilder<InvestmentNotes> builder)
        {
            builder.HasKey(x => x.Id);
            builder.HasOne(x => x.Campaign).WithMany().HasForeignKey(x => x.CampaignId);
            builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.CreatedBy);
            builder.Property(r => r.CreatedAt).HasColumnType("date");
        }
    }
}
