using System.Net;
using System.Net.Http.Headers;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class DownloadRedirectTests
{
    [Theory]
    [InlineData("https://cdn.invalid/media", false)]
    [InlineData("https://site.invalid:8443/media", false)]
    [InlineData("https://site.invalid/media", true)]
    public async Task RedirectPreservesRangesAndScopesCredentials(string destination, bool keepCredentials)
    {
        int requests = 0;
        using var client = new HttpClient(new DownloadRedirectHandler(new Handler(request => {
            if (++requests == 1) return new(HttpStatusCode.Found) {Headers = {Location = new Uri(destination)}};
            // A raw header has no domain/path policy, so it cannot be forwarded.
            Assert.False(request.Headers.Contains("Cookie"));
            Assert.Equal(keepCredentials, request.Headers.Contains("Authorization"));
            Assert.Equal(keepCredentials, request.Headers.Contains("Origin"));
            Assert.Equal("bytes=3-9", request.Headers.Range?.ToString());
            Assert.Equal("https://site.invalid/watch", request.Headers.Referrer?.AbsoluteUri);
            Assert.Equal(HttpVersion.Version20, request.Version);
            return new(HttpStatusCode.PartialContent) {Content = new ByteArrayContent(new byte[7])};
        })));
        using var message = HttpTransferRequest.Create(HttpMethod.Get, "https://site.invalid/play");
        message.Headers.TryAddWithoutValidation("Cookie", "private=source-only");
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "private-source-token");
        message.Headers.TryAddWithoutValidation("Origin", "https://site.invalid");
        message.Headers.Referrer = new Uri("https://site.invalid/watch");
        message.Headers.Range = new RangeHeaderValue(3, 9);
        using var response = await client.SendAsync(message);
        Assert.Equal(HttpStatusCode.PartialContent, response.StatusCode);
        Assert.Equal(2, requests);
    }

    [Theory]
    [InlineData("http://cdn.invalid/media")]
    [InlineData("file:///tmp/media")]
    [InlineData("https://private:secret@cdn.invalid/media")]
    public async Task UnsafeRedirectsFailWithoutLeakingAddress(string destination)
    {
        int requests = 0;
        using var client = new HttpClient(new DownloadRedirectHandler(new Handler(_ => {
            requests++;return new(HttpStatusCode.Found) {Headers = {Location = new Uri(destination)}};
        })));
        var error = await Assert.ThrowsAsync<HttpRequestException>(() => client.GetAsync("https://site.invalid/play"));
        Assert.Equal(1, requests);Assert.DoesNotContain(destination, error.Message);
    }

    [Fact]
    public async Task RedirectLoopsAreBounded()
    {
        int requests = 0;
        using var client = new HttpClient(new DownloadRedirectHandler(new Handler(_ => {
            requests++;return new(HttpStatusCode.Found) {Headers = {Location = new Uri("/next", UriKind.Relative)}};
        })));
        await Assert.ThrowsAsync<HttpRequestException>(() => client.GetAsync("https://site.invalid/play"));
        Assert.Equal(11, requests);
    }

    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => Task.FromResult(send(request));
    }
}
