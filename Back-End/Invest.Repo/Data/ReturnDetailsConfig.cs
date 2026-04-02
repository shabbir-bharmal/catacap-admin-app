using Invest.Core.Models;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;

namespace Invest.Repo.Data
{
    public class ReturnDetailsConfig : IEntityTypeConfiguration<ReturnDetails>
    {
        public void Configure(EntityTypeBuilder<ReturnDetails> builder)
        {
            builder.HasKey(d => d.Id);
            builder.HasOne(d => d.ReturnMaster).WithMany(r => r.ReturnDetails).HasForeignKey(d => d.ReturnMasterId);
            builder.HasOne(d => d.User).WithMany().HasForeignKey(d => d.UserId).OnDelete(DeleteBehavior.Restrict);
            builder.HasOne(x => x.DeletedByUser).WithMany().HasForeignKey(x => x.DeletedBy);
        }
    }
}
