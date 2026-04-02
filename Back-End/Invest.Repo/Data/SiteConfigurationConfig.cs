using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class SiteConfigurationConfig : IEntityTypeConfiguration<SiteConfiguration>
    {
        public void Configure(EntityTypeBuilder<SiteConfiguration> builder)
        {
            builder.HasKey(d => d.Id);
            builder.HasOne(x => x.DeletedByUser).WithMany().HasForeignKey(x => x.DeletedBy);
        }
    }
}
