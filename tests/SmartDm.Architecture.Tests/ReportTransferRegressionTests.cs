using System.Net;
using System.Net.Http.Headers;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;
namespace SmartDm.Architecture.Tests;
public sealed class ReportTransferRegressionTests
{
    [Theory]
    [InlineData("https://cdn.invalid/v?token=a%20b~c&sig=x%2fy&range=original", "https://cdn.invalid/v?token=a%20b~c&sig=x%2fy&range=original")]
    [InlineData("https://cdn.invalid/v?token=a%20b~c&bytestart=0&byteend=99&x=%2f", "https://cdn.invalid/v?token=a%20b~c&x=%2f")]
    [InlineData("https://cdn.invalid/v?range=0-99#frag?range=1-2", "https://cdn.invalid/v#frag?range=1-2")]
    public void SignedQuerySpellingIsPreserved(string input, string expected) => Assert.Equal(expected, DownloadEngine.SanitizeMediaUrl(input));

    [Fact]
    public void NetscapeCookiesRespectHostPathExpirySecureAndHttpOnly()
    {
        const string jar = "# Netscape HTTP Cookie File\n" +
            "www.cdn.invalid\tFALSE\t/\tTRUE\t0\thost\twww\n" +
            ".cdn.invalid\tTRUE\t/media\tTRUE\t0\tmedia\tyes\n" +
            ".cdn.invalid\tTRUE\t/\tFALSE\t1\texpired\tno\n" +
            "#HttpOnly_.cdn.invalid\tTRUE\t/\tTRUE\t0\tprivate\tyes\n";
        Assert.Equal("media=yes; private=yes", DownloadEngine.FormatCookieHeader(jar, "https://other.cdn.invalid/media/video"));
        Assert.Equal("private=yes", DownloadEngine.FormatCookieHeader(jar, "https://other.cdn.invalid/mediator"));
        Assert.Null(DownloadEngine.FormatCookieHeader(jar, "http://other.cdn.invalid/media/video"));
        Assert.Null(DownloadEngine.FormatCookieHeader(jar, "https://cdn.invalid.evil/media/video"));
        Assert.Null(DownloadEngine.FormatCookieHeader(jar, "https://unrelated.invalid/"));
    }

    [Fact]
    public async Task ProbeDoesNotSendOtherSitesCookies()
    {
        using var client = new HttpClient(new Handler(request => {
            Assert.Equal("match=yes", string.Join("; ", request.Headers.GetValues("Cookie")));
            return new(HttpStatusCode.OK) {Content = new ByteArrayContent(new byte[16])};
        }));
        var result = await new HttpProbeService(client).ProbeUrlAsync("https://files.invalid/doc.pdf", "https://files.invalid/list", "Browser-UA",
            "# Netscape\nfiles.invalid\tFALSE\t/\tTRUE\t0\tmatch\tyes\nelsewhere.invalid\tFALSE\t/\tTRUE\t0\tsecret\tno\n");
        Assert.True(result.IsSuccess, result.ErrorMessage);
    }

    [Fact]
    public async Task OrdinaryMediaWorkerKeepsNonSocialRefererEvenWhenItEndsWithMp4()
    {
        using var client = new HttpClient(new Handler(request => {
            Assert.Equal("https://player.invalid/watch.mp4", request.Headers.Referrer?.AbsoluteUri);
            return new(HttpStatusCode.OK) {Content = new ByteArrayContent(new byte[32])};
        }));
        string path = Path.GetTempFileName();
        try {
            var worker = new SegmentWorker(client, "https://cdn.invalid/media", path, 1, 0, -1, referer: "https://player.invalid/watch.mp4");
            await worker.ExecuteAsync(default);
            Assert.True(worker.Progress.IsCompleted, worker.LastError);
        } finally {File.Delete(path);}
    }

    [Fact]
    public async Task LegacyMislabelledHlsMp4UsesBinaryTransferInsteadOfReadingItAsAPlaylist()
    {
        byte[] bytes = new byte[8192]; "ftyp"u8.CopyTo(bytes.AsSpan(4));
        await using var server = new TestHttpServer(bytes) {CustomContentType = "video/mp4"};
        string dir = Path.Combine(Path.GetTempPath(), "smartdm-report-" + Guid.NewGuid()); Directory.CreateDirectory(dir);
        var model = new DownloadModel {Url = server.BaseUrl + "/video.mp4", SavePath = Path.Combine(dir, "clip.mp4"), MediaKind = "hls", TotalBytes = bytes.Length};
        var engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner());
        try {
            await engine.StartDownloadAsync(model);
            for(int i=0;i<300 && model.Status is not (DownloadStatus.Completed or DownloadStatus.Failed);i++) await Task.Delay(20);
            Assert.Equal(DownloadStatus.Completed, model.Status);
            Assert.Equal("http", model.MediaKind);
            Assert.Equal(bytes, await File.ReadAllBytesAsync(model.SavePath));
        } finally {await engine.PauseDownloadAsync(model.Id); Directory.Delete(dir,true);}
    }
    private sealed class Handler(Func<HttpRequestMessage,HttpResponseMessage> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) => Task.FromResult(send(request));
    }
}
