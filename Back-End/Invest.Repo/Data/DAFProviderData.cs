using Invest.Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Invest.Repo.Data
{
    public class DAFProviderData : IEntityTypeConfiguration<DAFProviders>
    {
        public void Configure(EntityTypeBuilder<DAFProviders> builder)
        {
            builder.HasData(
                new DAFProviders { Id = 1, ProviderName = "Fidelity Charitable", ProviderURL = "https://charitablegift.fidelity.com/public/login/donor", IsActive = true },
                new DAFProviders { Id = 2, ProviderName = "Jewish Foundation", ProviderURL = "https://www.iphiview.com/ujef/Home/tabid/326/Default.aspx", IsActive = true },
                new DAFProviders { Id = 3, ProviderName = "ImpactAssets", ProviderURL = "https://iphi.stellartechsol.com/calvert/LogIn/tabid/444/Default.aspx", IsActive = true },
                new DAFProviders { Id = 4, ProviderName = "National Philanthropic Trust", ProviderURL = "https://nptgivingpoint.org/", IsActive = true },
                new DAFProviders { Id = 5, ProviderName = "DAFgiving360: Charles Schwab", ProviderURL = "https://www.schwab.com/", IsActive = true },
                new DAFProviders { Id = 6, ProviderName = "Silicon Valley Community Foundation", ProviderURL = "https://donor.siliconvalleycf.org/s/login/", IsActive = true },
                new DAFProviders { Id = 7, ProviderName = "Vanguard Charitable", ProviderURL = "https://www.vanguardcharitable.org/", IsActive = true },
                new DAFProviders { Id = 8, ProviderName = "Bay Area Jewish Federation", ProviderURL = "https://jewishfed.my.site.com/portal/s/login/", IsActive = true }
            );
        }
    }
}
