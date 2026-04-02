using Invest.Core.Constants;
using Invest.Repo.Data;
using Invest.Service.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Invest.Service.Services
{
    public class ImageService : IImageService
    {
        private readonly IMemoryCache _cache;
        private readonly RepositoryContext _db;

        public ImageService(IMemoryCache cache, RepositoryContext db)
        {
            _cache = cache;
            _db = db;
        }

        public async Task<string> GetImageUrl()
        {
            string cacheKey = "logo-url";

            if (!_cache.TryGetValue(cacheKey, out string imageUrl))
            {
                imageUrl = await _db.SiteConfiguration
                                    .Where(x => x.Type == SiteConfigurationType.EmailLogo)
                                    .Select(x => x.Value)
                                    .FirstOrDefaultAsync() ?? "";

                _cache.Set(cacheKey, imageUrl, TimeSpan.FromHours(24));
            }

            return imageUrl;
        }
    }
}
