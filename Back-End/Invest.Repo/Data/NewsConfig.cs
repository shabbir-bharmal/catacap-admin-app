using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class NewsConfig : IEntityTypeConfiguration<News>
    {
        public void Configure(EntityTypeBuilder<News> builder)
        {
            builder.HasKey(d => d.Id);
            builder.HasOne(x => x.NewsType).WithMany().HasForeignKey(x => x.NewsTypeId);
            builder.HasOne(x => x.Audience).WithMany().HasForeignKey(x => x.AudienceId);
            builder.HasOne(x => x.Theme).WithMany().HasForeignKey(x => x.ThemeId);
            builder.HasOne(x => x.CreatedByUser).WithMany().HasForeignKey(x => x.CreatedBy);
            builder.HasOne(x => x.ModifiedByUser).WithMany().HasForeignKey(x => x.ModifiedBy);
            builder.HasOne(x => x.DeletedByUser).WithMany().HasForeignKey(x => x.DeletedBy);
        }
    }
}
