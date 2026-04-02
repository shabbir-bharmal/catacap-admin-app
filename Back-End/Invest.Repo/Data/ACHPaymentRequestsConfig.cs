using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class ACHPaymentRequestsConfig : IEntityTypeConfiguration<ACHPaymentRequests>
    {
        public void Configure(EntityTypeBuilder<ACHPaymentRequests> builder)
        {
            builder.HasKey(d => d.Id);
            builder.HasOne(d => d.Campaign).WithMany().HasForeignKey(d => d.CampaignId);
        }
    }
}
