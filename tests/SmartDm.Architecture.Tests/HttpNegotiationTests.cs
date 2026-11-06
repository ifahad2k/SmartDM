using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class HttpNegotiationTests
{
    [Fact]
    public async Task HeadAndRangeFallback_BothNegotiateInsteadOfForcingHttp11()
    {
        var requests = new List<(Version Version, HttpVersionPolicy Policy)>();
        using var client = new HttpClient(new Handler(request =>
        {
            requests.Add((request.Version, request.VersionPolicy));
            if (request.Method == HttpMethod.Head) return new(HttpStatusCode.MethodNotAllowed);
            var response = new HttpResponseMessage(HttpStatusCode.PartialContent) {Content = new ByteArrayContent(new byte[1])};
            response.Content.Headers.ContentRange = new ContentRangeHeaderValue(0, 0, 4096);
            response.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            return response;
        }));
        var result = await new HttpProbeService(client).ProbeUrlAsync("https://cdn.invalid/file.bin");
        Assert.True(result.IsSuccess, result.ErrorMessage);
        Assert.Equal(2, requests.Count);
        Assert.All(requests, request =>
        {
            Assert.Equal(HttpVersion.Version20, request.Version);
            Assert.Equal(HttpVersionPolicy.RequestVersionOrLower, request.Policy);
        });
    }

    [Fact]
    public async Task HlsWorker_UsesNegotiation_AndKeepsFullSegmentIntegrityChecks()
    {
        var requests = new List<(Version Version, HttpVersionPolicy Policy)>();
        byte[] bytes = Enumerable.Repeat((byte)71, 4096).ToArray();
        using var client = new HttpClient(new Handler(request =>
        {
            requests.Add((request.Version, request.VersionPolicy));
            return new(HttpStatusCode.OK) {Content = new ByteArrayContent(bytes)};
        }));
        string file = Path.GetTempFileName();
        bool completed = false;
        try
        {
            var task = new HlsSegmentTask {Url = "https://cdn.invalid/segment", TargetPath = file};
            var worker = new SegmentWorker(client, task.Url, file, 1, 0, 0);
            await worker.ExecuteHlsChunkQueueAsync(new ConcurrentQueue<HlsSegmentTask>(new[] {task}), () => completed,
                CancellationToken.None, (_, _) => completed = true).WaitAsync(TimeSpan.FromSeconds(3));
            Assert.True(completed, worker.LastError);
            Assert.Equal(bytes, await File.ReadAllBytesAsync(file));
            Assert.Equal(HttpVersion.Version20, Assert.Single(requests).Version);
            Assert.Equal(HttpVersionPolicy.RequestVersionOrLower, requests[0].Policy);
        }
        finally {foreach (string suffix in new[] {"", ".tmp", ".checkpoint"}) File.Delete(file + suffix);}
    }

    [Fact]
    public async Task KeyFetch_UsesSameNegotiationAsMediaSegments()
    {
        using var aes = System.Security.Cryptography.Aes.Create();
        aes.KeySize = 128;
        byte[] data = new byte[188 * 3], iv = new byte[16];
        var seen = new List<(Version Version, HttpVersionPolicy Policy)>();
        using var client = new HttpClient(new Handler(request =>
        {
            seen.Add((request.Version, request.VersionPolicy));
            return new(HttpStatusCode.OK) {Content = new ByteArrayContent(aes.Key)};
        }));
        using var keys = new HlsAes128KeyCache(null, null, _ => null, client);
        string file = Path.GetTempFileName();
        try
        {
            await File.WriteAllBytesAsync(file, aes.EncryptCbc(data, iv));
            await keys.DecryptAsync(file, new("https://cdn.invalid/key", Convert.ToHexString(iv)), CancellationToken.None);
            Assert.Equal(data, await File.ReadAllBytesAsync(file));
            Assert.Equal(HttpVersion.Version20, Assert.Single(seen).Version);
            Assert.Equal(HttpVersionPolicy.RequestVersionOrLower, seen[0].Policy);
        }
        finally {File.Delete(file); File.Delete(file + ".aes");}
    }

    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(respond(request));
    }
}
