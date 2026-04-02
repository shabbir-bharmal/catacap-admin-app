// Ignore Spelling: Repo

using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class ScheduledEmailLogsConfig : IEntityTypeConfiguration<ScheduledEmailLog>
    {
        public void Configure(EntityTypeBuilder<ScheduledEmailLog> builder)
        {
            builder.HasKey(x => x.Id);
            builder.HasOne(x => x.PendingGrants).WithMany().HasForeignKey(x => x.PendingGrantId);
            builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
        }
    }
}
