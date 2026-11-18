using System;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

// Redirect entry points may be reusable when the final signed CDN address is not.
// Follow them without forwarding source-site credentials to another authority.
public sealed class DownloadRedirectHandler(HttpMessageHandler transport) : DelegatingHandler(transport)
{
    private static readonly HttpRequestOptionsKey<Func<string, string?>> CookiePolicy = new("SmartDM.CookiePolicy");

    public static void ApplyCookies(HttpRequestMessage request, string? credentials, string? sourceUrl)
    {
        Func<string, string?> policy = target => CookieHeaderPolicy.Select(credentials, target, sourceUrl);
        request.Options.Set(CookiePolicy, policy);
        string? cookie = policy(request.RequestUri!.AbsoluteUri);
        request.Headers.Remove("Cookie");
        if (cookie != null) request.Headers.TryAddWithoutValidation("Cookie", cookie);
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        HttpRequestMessage current = request;
        try
        {
            for (int hop = 0; ; hop++)
            {
                var response = await base.SendAsync(current, cancellationToken).ConfigureAwait(false);
                if (response.StatusCode is not (HttpStatusCode.MovedPermanently or HttpStatusCode.Found or
                    HttpStatusCode.SeeOther or HttpStatusCode.TemporaryRedirect or HttpStatusCode.PermanentRedirect) ||
                    response.Headers.Location is null) return response;

                Uri target;
                try { target = new Uri(current.RequestUri!, response.Headers.Location); }
                catch { response.Dispose(); throw new HttpRequestException("The download redirect address is invalid."); }
                if (hop >= 10 || target.Scheme is not ("http" or "https") || !string.IsNullOrEmpty(target.UserInfo) ||
                    (current.RequestUri!.Scheme == "https" && target.Scheme != "https"))
                {
                    response.Dispose();
                    throw new HttpRequestException("The download redirect was refused by the transport policy.");
                }
                if (current.Content is not null || (current.Method != HttpMethod.Get && current.Method != HttpMethod.Head))
                {
                    response.Dispose();
                    throw new HttpRequestException("Only bodyless download requests can follow redirects.");
                }

                bool sameOrigin = current.RequestUri!.Scheme == target.Scheme &&
                    current.RequestUri.IdnHost == target.IdnHost && current.RequestUri.Port == target.Port;
                var next = new HttpRequestMessage(current.Method, target) {Version = current.Version, VersionPolicy = current.VersionPolicy};
                foreach (var header in current.Headers)
                {
                    if (header.Key.Equals("Host", StringComparison.OrdinalIgnoreCase) ||
                        header.Key.Equals("Cookie", StringComparison.OrdinalIgnoreCase) ||
                        (!sameOrigin && (header.Key.Equals("Authorization", StringComparison.OrdinalIgnoreCase) ||
                        header.Key.Equals("Proxy-Authorization", StringComparison.OrdinalIgnoreCase) ||
                        header.Key.Equals("Origin", StringComparison.OrdinalIgnoreCase)))) continue;
                    next.Headers.TryAddWithoutValidation(header.Key, header.Value);
                }
                if (current.Options.TryGetValue(CookiePolicy, out var policy))
                {
                    next.Options.Set(CookiePolicy, policy);
                    string? cookie = policy(target.AbsoluteUri);
                    if (cookie != null) next.Headers.TryAddWithoutValidation("Cookie", cookie);
                }
                response.Dispose();
                if (!ReferenceEquals(current, request)) current.Dispose();
                current = next;
            }
        }
        finally { if (!ReferenceEquals(current, request)) current.Dispose(); }
    }
}
