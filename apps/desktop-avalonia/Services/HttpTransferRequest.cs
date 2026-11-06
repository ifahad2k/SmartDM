using System;
using System.Net;
using System.Net.Http;

namespace SmartDm.Desktop.Avalonia.Services;

// Use ALPN when available; retain compatibility with HTTP/1.1-only origins.
// Apply to explicit messages too: HttpClient defaults do not override them.
public static class HttpTransferRequest
{
    public static HttpRequestMessage Create(HttpMethod method, string address) => Configure(new(method, address));
    public static HttpRequestMessage Create(HttpMethod method, Uri address) => Configure(new(method, address));

    private static HttpRequestMessage Configure(HttpRequestMessage request)
    {
        request.Version = HttpVersion.Version20;
        request.VersionPolicy = HttpVersionPolicy.RequestVersionOrLower;
        return request;
    }
}
