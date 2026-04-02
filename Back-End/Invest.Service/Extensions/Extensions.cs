using System.Net.Http.Headers;

namespace Invest.Service.Extensions;

public static class ExceptionMiddlewareExtension
{
    public static void AddDonorboxAuthHeader(this HttpClient client)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic",
            Convert.ToBase64String(System.Text.Encoding.ASCII.GetBytes(
                // TODO MOVE TO CONFIGURATION
                "ken@impactree.org:b2tx-XGt2NM12TCv4rV0ijRkv32ew2Tc9xOKbdiyr0MoJClNTTQ-Gw")));
    }
}