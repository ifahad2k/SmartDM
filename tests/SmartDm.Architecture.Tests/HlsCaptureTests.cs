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
    public void Snapshot_RejectsLiveAndOversizedData()
    {
        Assert.Throws<InvalidDataException>(() => HlsManifestSnapshot.Normalize(Playlist.Replace("#EXT-X-ENDLIST", ""), "https://cdn.invalid/level"));
        Assert.Throws<InvalidDataException>(() => HlsManifestSnapshot.Normalize(new string('x', 500_001), "https://cdn.invalid/level"));
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
}
