using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class AssetTypeData : IEntityTypeConfiguration<AssetType>
    {
        public void Configure(EntityTypeBuilder<AssetType> builder)
        {
            builder.HasData(
                new AssetType { Id = 1, Type = "Cryptocurrency" },
                new AssetType { Id = 2, Type = "Real estate" },
                new AssetType { Id = 3, Type = "Stock" },
                new AssetType { Id = 4, Type = "Other" }
            );
        }
    }
}
