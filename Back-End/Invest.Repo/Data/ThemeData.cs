using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data;

public class ThemeData : IEntityTypeConfiguration<Theme>
{
    public void Configure(EntityTypeBuilder<Theme> builder)
    {
        builder.HasData(
            new Theme
            {
                Id = 1,
                Name = "Climate",
                Mandatory = true
            },
            new Theme
            {
                Id = 2,
                Name = "Gender",
                Mandatory = true
            },
            new Theme
            {
                Id = 3,
                Name = "Racial",
                Mandatory = true
            },
            new Theme
            {
                Id = 4,
                Name = "Poverty",
                Mandatory = true
            });
    }
}
