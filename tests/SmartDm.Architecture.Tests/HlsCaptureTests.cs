using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public class HlsCaptureTests
{
    private const string Playlist = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\npart.ts\n#EXT-X-ENDLIST\n";

    [Fact]
    public void AddDialog_KeepsHlsCaptureEvenWhenQualityIsUnknown()
    {
        var vm = new SmartDm.Desktop.Avalonia.ViewModels.AddDownloadViewModel(
            initialUrl: "https://cdn.invalid/opaque", initialTitle: "Fixture",
            initialFormats: new List<MediaFormatDto> { new() { FormatId = "capture", Resolution = "Playing quality", DirectUrl = "https://cdn.invalid/opaque", MediaKind = "hls", ManifestText = Playlist } });
        Assert.Equal("hls", vm.SelectedFormat!.MediaKind);
        Assert.Equal(Playlist, vm.SelectedFormat.ManifestText);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public async Task SegmentTransport_UnwrapsPngAndWebp_WithOrWithoutMask(bool webp, bool masked)
    {
        byte[] mask = { 157, 42, 241, 71, 179, 142, 92, 112, 166, 25, 228, 59, 216, 98, 15, 197 };
        byte[] media = Enumerable.Range(0, 188 * 1000).Select(i => (byte)(i % 251)).ToArray();
        for (int i = 0; i < media.Length; i += 188) media[i] = 0x47;
        byte[] header = webp ? "RIFF0000WEBP"u8.ToArray() : new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 };
        byte[] body = media.Select((b, i) => (byte)(b ^ (masked ? mask[i & 15] : 0))).ToArray();
        string path = Path.GetTempFileName();
        try
        {
            await File.WriteAllBytesAsync(path, header.Concat(body).ToArray());
            Assert.Equal(media.Length, await HlsSegmentTransport.NormalizeAsync(path, CancellationToken.None));
            Assert.Equal(media, await File.ReadAllBytesAsync(path));
            Assert.False(File.Exists(path + ".decoded"));
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public async Task SegmentTransport_RejectsAnActualImageAndPreservesInput()
    {
        byte[] data = new byte[1024];
        new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }.CopyTo(data, 0);
        string path = Path.GetTempFileName();
        try
        {
            await File.WriteAllBytesAsync(path, data);
            await Assert.ThrowsAsync<InvalidDataException>(() => HlsSegmentTransport.NormalizeAsync(path, CancellationToken.None));
            Assert.Equal(data, await File.ReadAllBytesAsync(path));
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public async Task SegmentTransport_CancellationDoesNotReplaceInput()
    {
        string path = Path.GetTempFileName();
        try
        {
            byte[] data = new byte[1024];
            await File.WriteAllBytesAsync(path, data);
            using var stop = new CancellationTokenSource();
            stop.Cancel();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => HlsSegmentTransport.NormalizeAsync(path, stop.Token));
            Assert.Equal(data, await File.ReadAllBytesAsync(path));
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void Snapshot_ResolvesSegmentsAndMapAgainstPlaylistNotPage()
    {
        var text = Playlist.Replace("#EXTINF", "#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF");
        var result = HlsManifestSnapshot.Normalize(text, "https://cdn.invalid/asset/level");
        Assert.Contains("https://cdn.invalid/asset/part.ts", result);
        Assert.Contains("URI=\"https://cdn.invalid/asset/init.mp4\"", result);
    }

    [Theory]
    [InlineData("file:///C:/private.txt")]
    [InlineData("crypto:https://cdn.invalid/segment")]
    [InlineData("data:text/plain,private")]
    [InlineData("https://user:password@cdn.invalid/a")]
    public void Snapshot_RejectsNonHttpAndEmbeddedCredentials(string address)
        => Assert.Throws<InvalidDataException>(() => HlsManifestSnapshot.Normalize(Playlist.Replace("part.ts", address), "https://cdn.invalid/level"));

    [Theory]
    [InlineData("#EXT-X-KEY:METHOD=SAMPLE-AES,URI=\"https://cdn.invalid/key\"")]
    [InlineData("#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES")]
    [InlineData("#EXT-X-MAP:URI=\"file:///C:/private.txt\"")]
    [InlineData("#EXT-X-STREAM-INF:BANDWIDTH=100")]
    public void Snapshot_RejectsUnsupportedDirectives(string directive)
        => Assert.Throws<InvalidDataException>(() => HlsManifestSnapshot.Normalize(Playlist.Replace("#EXTINF", directive + "\n#EXTINF"), "https://cdn.invalid/level"));

    [Fact]
    public void Snapshot_AcceptsLongMoviePlaylistWithSignedSegmentUrls()
    {
        var movie = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n" + string.Concat(Enumerable.Range(0, 974)
            .Select(i => $"#EXTINF:6,\nhttps://cdn.invalid/{i}.m4s?token={new string('s', 700)}\n")) + "#EXT-X-ENDLIST\n";
        Assert.True(movie.Length > 700_000);
        var result = HlsManifestSnapshot.Normalize(movie, "https://cdn.invalid/v1.m3u8");
        Assert.Equal(974, result.Split("#EXTINF:").Length - 1);
        Assert.Contains("https://cdn.invalid/973.m4s?token=", result);
    }

    [Fact]
    public async Task PlaylistReader_AcceptsMovieAndRejectsOversizedResponse()
    {
        string movie = Playlist + "#" + new string('s', 704_377);
        using var valid = new System.Net.Http.StringContent(movie);
        Assert.Equal(movie, await HlsManifestSnapshot.ReadAsync(valid, CancellationToken.None));
        using var oversized = new System.Net.Http.ByteArrayContent(new byte[HlsManifestSnapshot.MaxBytes + 1]);
        await Assert.ThrowsAsync<InvalidDataException>(() => HlsManifestSnapshot.ReadAsync(oversized, CancellationToken.None));
        using var stop = new CancellationTokenSource(); stop.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => HlsManifestSnapshot.ReadAsync(valid, stop.Token));
    }

    [Fact]
    public void Snapshot_RejectsLiveAndOversizedData()
    {
        Assert.Throws<InvalidDataException>(() => HlsManifestSnapshot.Normalize(Playlist.Replace("#EXT-X-ENDLIST", ""), "https://cdn.invalid/level"));
        Assert.Throws<InvalidDataException>(() => HlsManifestSnapshot.Normalize(Playlist + "#" + new string('x', 4 * 1024 * 1024), "https://cdn.invalid/level"));
        Assert.Throws<InvalidDataException>(() => HlsManifestSnapshot.Normalize(Playlist + "#" + new string('\u20ac', 2 * 1024 * 1024), "https://cdn.invalid/level"));
    }

    [Fact]
    public async Task Migration5_CaptureSurvivesRestartAndUpdate()
    {
        var dir = Path.Combine(Path.GetTempPath(), "smartdm-hls-test-" + Guid.NewGuid());
        Directory.CreateDirectory(dir);
        try
        {
            var path = Path.Combine(dir, "history.db");
            var repo = new SqliteDatabaseRepository(path);
            await repo.InitializeAsync();
            var model = new DownloadModel { Url = "https://cdn.invalid/extensionless", MediaKind = "hls", ManifestText = Playlist, AudioManifestText = Playlist };
            await repo.SaveDownloadAsync(model);
            repo = new SqliteDatabaseRepository(path);
            await repo.InitializeAsync();
            var loaded = Assert.Single(await repo.GetAllDownloadsAsync());
            Assert.Equal("hls", loaded.MediaKind);
            Assert.Equal(Playlist, loaded.ManifestText);
            Assert.Equal(Playlist, loaded.AudioManifestText);
            loaded.ManifestText = Playlist.Replace("part.ts", "next.ts");
            await repo.SaveDownloadAsync(loaded);
            Assert.Equal(loaded.ManifestText, Assert.Single(await repo.GetAllDownloadsAsync()).ManifestText);
        }
        finally { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); Directory.Delete(dir, true); }
    }

    [Fact]
    public async Task HlsMediaResolver_ResolvesExtensionlessMasterPlaylist()
    {
        var masterContent = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\nstream-1080p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720\nstream-720p.m3u8\n";
        var handler = new MockHlsHttpMessageHandler((req) =>
        {
            var res = new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent(masterContent, System.Text.Encoding.UTF8, "application/vnd.apple.mpegurl")
            };
            return res;
        });
        using var client = new HttpClient(handler);
        HlsMediaResolver.SetHttpClientForTesting(client);
        try
        {
            var res = await HlsMediaResolver.ResolveHlsFormatsAsync("https://movy.sx/stream-embed/playlist/1263337");
            Assert.True(res.Success);
            Assert.Equal(2, res.Formats.Count);
            Assert.Equal(1080, res.Formats[0].Height);
            Assert.Equal(720, res.Formats[1].Height);
        }
        finally
        {
            HlsMediaResolver.SetHttpClientForTesting(null);
        }
    }

    private sealed class MockHlsHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;
        public MockHlsHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) => _responder = responder;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(_responder(request));
    }
    [Fact]
    public async Task HlsMediaResolver_ResolvesMasterFromChildStreamEmbedMediaCandidate()
    {
        var childContent = "#EXTM3U\n#EXTINF:6,\nchunk-0.ts\n#EXT-X-ENDLIST\n";
        var masterContent = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\nstream-1080p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\nstream-720p.m3u8\n";

        var handler = new MockHlsHttpMessageHandler((req) =>
        {
            var uri = req.RequestUri?.ToString() ?? "";
            if (uri.Contains("/stream-embed/playlist/"))
            {
                return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
                {
                    Content = new StringContent(masterContent, System.Text.Encoding.UTF8, "application/vnd.apple.mpegurl")
                };
            }
            if (uri.Contains("/stream-embed/media/"))
            {
                return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
                {
                    Content = new StringContent(childContent, System.Text.Encoding.UTF8, "application/vnd.apple.mpegurl")
                };
            }
            return new HttpResponseMessage(System.Net.HttpStatusCode.NotFound);
        });

        using var client = new HttpClient(handler);
        HlsMediaResolver.SetHttpClientForTesting(client);
        try
        {
            var res = await HlsMediaResolver.ResolveHlsFormatsAsync("https://primeshows.org/stream-embed/media/213375");
            Assert.True(res.Success);
            Assert.Equal("https://primeshows.org/stream-embed/playlist/213375", res.MasterUrl);
            Assert.Equal(2, res.Formats.Count);
            Assert.Equal(1080, res.Formats[0].Height);
            Assert.Equal(720, res.Formats[1].Height);
        }
        finally
        {
            HlsMediaResolver.SetHttpClientForTesting(null);
        }
    }

    [Fact]
    public async Task NativeReplyKeepsLongResolvedPlaylistInsideDesktopAndRestoresItForDownload()
    {
        string playlist = Playlist + "#" + new string('s', 1_200_000);
        using var client = new HttpClient(new MockHlsHttpMessageHandler(_ => new(System.Net.HttpStatusCode.OK)
            {Content = new StringContent(playlist, System.Text.Encoding.UTF8, "application/vnd.apple.mpegurl")}));
        HlsMediaResolver.SetHttpClientForTesting(client);
        var ipc = new LocalIpcService();
        try
        {
            var dispatch = typeof(LocalIpcService).GetMethod("DispatchNativeAsync", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!;
            byte[] response = await (Task<byte[]>)dispatch.Invoke(ipc, new object[]{"{\"protocolVersion\":1,\"type\":\"RESOLVE_M3U8_VARIANTS\",\"url\":\"https://cdn.invalid/long.m3u8\"}",CancellationToken.None})!;
            Assert.InRange(response.Length, 1, BrowserProtocol.MaximumResponseBytes);
            using var json = System.Text.Json.JsonDocument.Parse(response);
            Assert.True(json.RootElement.GetProperty("success").GetBoolean());
            string formats = json.RootElement.GetProperty("formats").GetRawText();
            Assert.DoesNotContain(new string('s',1000),formats);
            BrowserDownloadRequest? received = null; ipc.DownloadRequestedFromBrowser += request => received = request;
            string download = "{\"protocolVersion\":1,\"type\":\"START_MEDIA_DOWNLOAD\",\"url\":\"https://cdn.invalid/long.m3u8\",\"formats\":" + formats + "}";
            await (Task<byte[]>)dispatch.Invoke(ipc, new object[]{download,CancellationToken.None})!;
            Assert.Equal(playlist,Assert.Single(received!.Formats!).ManifestText);
        }
        finally {HlsMediaResolver.SetHttpClientForTesting(null);}
    }

}
