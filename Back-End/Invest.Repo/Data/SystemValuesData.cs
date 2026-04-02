using Invest.Core.Models;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;

namespace Invest.Repo.Data;

public class SystemValuesData : IEntityTypeConfiguration<SystemValues>
{
    public void Configure(EntityTypeBuilder<SystemValues> builder)
    {
        builder.HasData(
            new SystemValues()
            {
                Id = 1,
                Name = "DonationsIds",
                Value = ""
            });
    }
}