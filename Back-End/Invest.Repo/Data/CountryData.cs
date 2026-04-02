using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class CountryData : IEntityTypeConfiguration<Country>
    {
        public void Configure(EntityTypeBuilder<Country> builder)
        {
            builder.HasData(
                new Country { Id = 1, Name = "USA", IsActive = true, SortOrder = 1, Code = "US" },
                new Country { Id = 2, Name = "Argentina", IsActive = true, SortOrder = 2, Code = "AR" },
                new Country { Id = 3, Name = "Australia", IsActive = true, SortOrder = 2, Code = "AU" },
                new Country { Id = 4, Name = "Austria", IsActive = true, SortOrder = 2, Code = "AT" },
                new Country { Id = 5, Name = "Belgium", IsActive = true, SortOrder = 2, Code = "BE" },
                new Country { Id = 6, Name = "Belize", IsActive = true, SortOrder = 2, Code = "BZ" },
                new Country { Id = 7, Name = "Brazil", IsActive = true, SortOrder = 2, Code = "BR" },
                new Country { Id = 8, Name = "Bulgaria", IsActive = true, SortOrder = 2, Code = "BG" },
                new Country { Id = 9, Name = "Canada", IsActive = true, SortOrder = 2, Code = "CA" },
                new Country { Id = 10, Name = "Chile", IsActive = true, SortOrder = 2, Code = "CL" },
                new Country { Id = 11, Name = "China", IsActive = true, SortOrder = 2, Code = "CN" },
                new Country { Id = 12, Name = "Colombia", IsActive = true, SortOrder = 2, Code = "CO" },
                new Country { Id = 13, Name = "Costa Rica", IsActive = true, SortOrder = 2, Code = "CR" },
                new Country { Id = 14, Name = "Czechia (Czech Republic)", IsActive = true, SortOrder = 2, Code = "CZ" },
                new Country { Id = 15, Name = "Denmark", IsActive = true, SortOrder = 2, Code = "DK" },
                new Country { Id = 16, Name = "Finland", IsActive = true, SortOrder = 2, Code = "FI" },
                new Country { Id = 17, Name = "France", IsActive = true, SortOrder = 2, Code = "FR" },
                new Country { Id = 18, Name = "Germany", IsActive = true, SortOrder = 2, Code = "DE" },
                new Country { Id = 19, Name = "Greece", IsActive = true, SortOrder = 2, Code = "GR" },
                new Country { Id = 20, Name = "Hungary", IsActive = true, SortOrder = 2, Code = "HU" },
                new Country { Id = 21, Name = "Iceland", IsActive = true, SortOrder = 2, Code = "IS" },
                new Country { Id = 22, Name = "India", IsActive = true, SortOrder = 2, Code = "IN" },
                new Country { Id = 23, Name = "Indonesia", IsActive = true, SortOrder = 2, Code = "ID" },
                new Country { Id = 24, Name = "Ireland", IsActive = true, SortOrder = 2, Code = "IE" },
                new Country { Id = 25, Name = "Israel", IsActive = true, SortOrder = 2, Code = "IL" },
                new Country { Id = 26, Name = "Italy", IsActive = true, SortOrder = 2, Code = "IT" },
                new Country { Id = 27, Name = "Japan", IsActive = true, SortOrder = 2, Code = "JP" },
                new Country { Id = 28, Name = "Mexico", IsActive = true, SortOrder = 2, Code = "MX" },
                new Country { Id = 29, Name = "Netherlands", IsActive = true, SortOrder = 2, Code = "NL" },
                new Country { Id = 30, Name = "New Zealand", IsActive = true, SortOrder = 2, Code = "NZ" },
                new Country { Id = 31, Name = "Norway", IsActive = true, SortOrder = 2, Code = "NO" },
                new Country { Id = 32, Name = "Peru", IsActive = true, SortOrder = 2, Code = "PE" },
                new Country { Id = 33, Name = "Philippines", IsActive = true, SortOrder = 2, Code = "PH" },
                new Country { Id = 34, Name = "Poland", IsActive = true, SortOrder = 2, Code = "PL" },
                new Country { Id = 35, Name = "Portugal", IsActive = true, SortOrder = 2, Code = "PT" },
                new Country { Id = 36, Name = "Romania", IsActive = true, SortOrder = 2, Code = "RO" },
                new Country { Id = 37, Name = "Russia", IsActive = true, SortOrder = 2, Code = "RU" },
                new Country { Id = 38, Name = "Singapore", IsActive = true, SortOrder = 2, Code = "SG" },
                new Country { Id = 39, Name = "South Africa", IsActive = true, SortOrder = 2, Code = "ZA" },
                new Country { Id = 40, Name = "Spain", IsActive = true, SortOrder = 2, Code = "ES" },
                new Country { Id = 41, Name = "Sweden", IsActive = true, SortOrder = 2, Code = "SE" },
                new Country { Id = 42, Name = "Switzerland", IsActive = true, SortOrder = 2, Code = "CH" },
                new Country { Id = 43, Name = "United Kingdom", IsActive = true, SortOrder = 2, Code = "UK" }
            );
        }
    }
}
