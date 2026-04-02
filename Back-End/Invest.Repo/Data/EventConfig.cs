using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class EventConfig : IEntityTypeConfiguration<Event>
    {
        public void Configure(EntityTypeBuilder<Event> builder)
        {
            builder.HasKey(d => d.Id);
            builder.HasOne(x => x.CreatedByUser).WithMany().HasForeignKey(x => x.CreatedBy);
            builder.HasOne(x => x.ModifiedByUser).WithMany().HasForeignKey(x => x.ModifiedBy);
            builder.Property(x => x.EventDate).HasColumnType("date");
            builder.HasOne(x => x.DeletedByUser).WithMany().HasForeignKey(x => x.DeletedBy);
        }
    }
}
