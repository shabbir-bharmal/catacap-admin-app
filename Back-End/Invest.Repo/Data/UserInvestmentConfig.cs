// Ignore Spelling: Repo

using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class UserInvestmentConfig : IEntityTypeConfiguration<UserInvestments>
    {
        public void Configure(EntityTypeBuilder<UserInvestments> builder)
        {
            builder.HasKey(x => x.Id);
            builder.HasOne(x => x.Campaign).WithMany().HasForeignKey(x => x.CampaignId);
            builder.HasOne(x => x.DeletedByUser).WithMany().HasForeignKey(x => x.DeletedBy);
        }
    }
}
