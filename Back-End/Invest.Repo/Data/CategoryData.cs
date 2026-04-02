using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Invest.Core.Models;

namespace Invest.Repo.Data;

public class ApprovedByData : IEntityTypeConfiguration<ApprovedBy>
{   // add test data for user and admin
    public void Configure(EntityTypeBuilder<ApprovedBy> builder)
    {
        builder.HasData(
            new ApprovedBy
            {
                Id = 1,
                Name = "Impact Assets"
            },
            new ApprovedBy
            {
                Id = 2,
                Name = "Toniic Investors"
            });
    }
}
