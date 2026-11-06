using System.Diagnostics;
using System.Text;
using System.Security.Cryptography;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class HlsPipelineIntegrationTests
{
    // Explicit opt-in: invokes the user's checksum-verified FFmpeg, uses synthetic
    // media and loopback servers, and never contacts an anime site or user profile DB.
    [HlsPipelineTheory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public async Task RealEngine_RemuxesExtensionlessOrCapturedPairedHls_WithAudio(bool capturedPair, bool encrypted)
    {
        string ffmpeg = DownloadEngine.ResolveFfmpegPath() ?? throw new InvalidOperationException("Verified FFmpeg required.");
        string dir = Path.Combine(Path.GetTempPath(), "smartdm-media-fixture-" + Guid.NewGuid());
        Directory.CreateDirectory(dir);
        DownloadEngine? engine = null;
        var model = new DownloadModel { SavePath = Path.Combine(dir, "result.mp4"), ParallelThreads = 2, MediaKind = "hls" };
        try
        {
            string video = Path.Combine(dir, "video.ts"), audio = Path.Combine(dir, "audio.ts");
            var args = new List<string> { "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24" };
            if (!capturedPair) args.AddRange(new[] { "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000" });
            args.AddRange(new[] { "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-f", "mpegts", video });
            await RunFfmpeg(ffmpeg, args);
            await RunFfmpeg(ffmpeg, new[] { "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000", "-t", "2", "-c:a", "aac", "-f", "mpegts", audio });
            byte[] mask = { 157, 42, 241, 71, 179, 142, 92, 112, 166, 25, 228, 59, 216, 98, 15, 197 };
            byte[] Wrap(byte[] bytes) => new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }.Concat(bytes.Select((b, i) => (byte)(b ^ mask[i & 15]))).ToArray();
            byte[] key = Enumerable.Range(0, 16).Select(i => (byte)(i + 5)).ToArray();
            byte[] secondKey = key.Reverse().ToArray();
            byte[] iv = new byte[16]; iv[15] = 3;
            byte[] audioIv = Enumerable.Repeat((byte)17, 16).ToArray();
            byte[] Encrypt(byte[] bytes, byte[] k, byte[] vector)
            {
                using var aes = Aes.Create(); aes.Key = k;
                return aes.EncryptCbc(bytes, vector, PaddingMode.PKCS7);
            }
            byte[] videoBytes = Wrap(await File.ReadAllBytesAsync(video)), audioBytes = await File.ReadAllBytesAsync(audio);
            await using var keyServer = new TestHttpServer(key);
            await using var audioKeyServer = new TestHttpServer(secondKey);
            await using var videoServer = new TestHttpServer(encrypted ? Encrypt(videoBytes, key, iv) : videoBytes);
            await using var audioServer = new TestHttpServer(encrypted ? Encrypt(audioBytes, secondKey, audioIv) : audioBytes);
            string Playlist(string segment, string? keyUrl = null, byte[]? vector = null) =>
                $"#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:3\n#EXT-X-ALLOW-CACHE:NO\n" +
                (keyUrl == null ? "" : $"#EXT-X-KEY:METHOD=AES-128,URI=\"{keyUrl}\"" + (vector == null ? "" : ",IV=0x" + Convert.ToHexString(vector)) + "\n") +
                $"#EXTINF:2,\n{segment}\n#EXT-X-ENDLIST\n";
            string playlist = Playlist(videoServer.BaseUrl + "/segment.png", encrypted ? keyServer.BaseUrl + "/key" : null);
            await using var manifestServer = new TestHttpServer(Encoding.UTF8.GetBytes(playlist));
            model.Url = manifestServer.BaseUrl + "/opaque";
            if (capturedPair)
            {
                model.ManifestText = playlist;
                model.AudioUrl = audioServer.BaseUrl + "/opaque-audio";
                model.AudioManifestText = Playlist(audioServer.BaseUrl + "/audio.ts", encrypted ? audioKeyServer.BaseUrl + "/key" : null, audioIv);
            }
            engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner());
            await engine.StartDownloadAsync(model);
            var deadline = Stopwatch.StartNew();
            while (model.Status is not (DownloadStatus.Completed or DownloadStatus.Failed) && deadline.Elapsed < TimeSpan.FromSeconds(35))
                await Task.Delay(20);
            Assert.True(model.Status == DownloadStatus.Completed, model.StatusDetail);
            Assert.True(new FileInfo(model.SavePath).Length > 1024);
            // Both mappings are mandatory: a silent/video-only output fails here.
            await RunFfmpeg(ffmpeg, new[] { "-i", model.SavePath, "-map", "0:v:0", "-map", "0:a:0", "-t", "1", "-f", "null", "-" });
        }
        finally
        {
            if (engine != null) await engine.PauseDownloadAsync(model.Id);
            Directory.Delete(dir, true);
        }
    }

    private static async Task RunFfmpeg(string path, IEnumerable<string> args)
    {
        var start = new ProcessStartInfo(path) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true };
        foreach (var arg in new[] { "-hide_banner", "-nostdin", "-y" }.Concat(args)) start.ArgumentList.Add(arg);
        using var process = Process.Start(start)!;
        var error = process.StandardError.ReadToEndAsync();
        try { await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(25)); }
        catch { process.Kill(true); await process.WaitForExitAsync(); throw; }
        Assert.True(process.ExitCode == 0, await error);
    }
}

public sealed class HlsPipelineTheoryAttribute : TheoryAttribute
{
    public HlsPipelineTheoryAttribute()
    {
        if (Environment.GetEnvironmentVariable("SMARTDM_MEDIA_TESTS") != "1")
            Skip = "Set SMARTDM_MEDIA_TESTS=1 with checksum-verified FFmpeg to run real media integration.";
    }
}
