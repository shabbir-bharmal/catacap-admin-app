using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class InvestmentRequestConfig : IEntityTypeConfiguration<InvestmentRequest>
    {
        public void Configure(EntityTypeBuilder<InvestmentRequest> builder)
        {
            builder.HasKey(d => d.Id);
            builder.HasOne(x => x.ModifiedByUser).WithMany().HasForeignKey(x => x.ModifiedBy);
            builder.HasOne(x => x.DeletedByUser).WithMany().HasForeignKey(x => x.DeletedBy);
        }
    }
}
