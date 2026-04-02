using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class InvestmentTagMappingConfig : IEntityTypeConfiguration<InvestmentTagMapping>
    {
        public void Configure(EntityTypeBuilder<InvestmentTagMapping> builder)
        {
            builder.HasKey(d => d.Id);
            builder.HasOne(i => i.InvestmentTag).WithMany().HasForeignKey(i => i.TagId);
            builder.HasOne(i => i.Campaign).WithMany().HasForeignKey(i => i.CampaignId);
        }
    }
}
