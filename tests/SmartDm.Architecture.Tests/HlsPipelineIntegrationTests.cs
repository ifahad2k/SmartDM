using System.Diagnostics;
using System.Text;
using System.Security.Cryptography;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class HlsPipelineIntegrationTests
{
    [HlsPipelineTheory]
    [InlineData(false, false, true, false, false)]
    [InlineData(true, false, true, false, false)]
    [InlineData(true, true, true, false, false)]
    [InlineData(true, true, false, false, true)]
    [InlineData(false, false, false, false, false)]
    [InlineData(true, false, false, true, false)]
    public async Task RealEngine_RemuxesLongFmp4Playlist_WithRequiredReferrer(bool captured, bool separateAudio, bool longPlaylist, bool staleMaster, bool audioUrlOnly)
    {
        string ffmpeg = DownloadEngine.ResolveFfmpegPath() ?? throw new InvalidOperationException("Verified FFmpeg required.");
        string dir = Path.Combine(Path.GetTempPath(), "smartdm-movie-fixture-" + Guid.NewGuid());
        Directory.CreateDirectory(dir);
        const string referer = "https://player.invalid/embed/movie";
        var model = new DownloadModel { SavePath = Path.Combine(dir, "result.mp4"), MediaKind = "hls", Referer = referer, ParallelThreads = 4 };
        DownloadEngine? engine = null;
        try
        {
            var videoArgs = new List<string> { "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
                "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-hls_time", "4", "-hls_segment_type", "fmp4",
                "-hls_playlist_type", "vod", "-hls_fmp4_init_filename", "init.mp4", "-hls_segment_filename", Path.Combine(dir, "part%d.m4s") };
            if (separateAudio) videoArgs.Add("-an");
            videoArgs.Add(Path.Combine(dir, "source.m3u8"));
            await RunFfmpeg(ffmpeg, videoArgs, dir);
            if (separateAudio)
                await RunFfmpeg(ffmpeg, new[] { "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000", "-t", "2", "-c:a", "aac",
                    "-hls_time", "4", "-hls_segment_type", "fmp4", "-hls_playlist_type", "vod", "-hls_fmp4_init_filename", "audio-init.mp4",
                    "-hls_segment_filename", Path.Combine(dir, "audio%d.m4s"), Path.Combine(dir, "audio.m3u8") }, dir);
            await using var initServer = new TestHttpServer(await File.ReadAllBytesAsync(Path.Combine(dir, "init.mp4"))) { RequiredReferer = referer };
            await using var segmentServer = new TestHttpServer(await File.ReadAllBytesAsync(Path.Combine(dir, "part0.m4s")))
            { RequiredReferer = referer, ChunkDelayMs = separateAudio ? 200 : 0 };
            await using var audioInitServer = separateAudio ? new TestHttpServer(await File.ReadAllBytesAsync(Path.Combine(dir, "audio-init.mp4"))) { RequiredReferer = referer } : null;
            await using var audioSegmentServer = separateAudio ? new TestHttpServer(await File.ReadAllBytesAsync(Path.Combine(dir, "audio0.m4s")))
            { RequiredReferer = referer, ChunkDelayMs = 200 } : null;
            string playlist = (await File.ReadAllTextAsync(Path.Combine(dir, "source.m3u8")))
                .Replace("init.mp4", initServer.BaseUrl + "/init.mp4").Replace("part0.m4s", segmentServer.BaseUrl + "/part.m4s")
                + (longPlaylist ? "#" + new string('s', 704_377) + "\n" : "");
            await using var manifestServer = new TestHttpServer(Encoding.UTF8.GetBytes(playlist)) { RequiredReferer = referer };
            model.Url = manifestServer.BaseUrl + "/movie.m3u8";
            if (captured) model.ManifestText = staleMaster
                ? "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nmovie.m3u8\n"
                : playlist;
            string? audioPlaylist = separateAudio
                ? (await File.ReadAllTextAsync(Path.Combine(dir, "audio.m3u8")))
                    .Replace("audio-init.mp4", audioInitServer!.BaseUrl + "/init.mp4").Replace("audio0.m4s", audioSegmentServer!.BaseUrl + "/part.m4s")
                : null;
            await using var audioPlaylistServer = audioUrlOnly
                ? new TestHttpServer(Encoding.UTF8.GetBytes(audioPlaylist!)) { RequiredReferer = referer }
                : null;
            if (separateAudio)
            {
                model.AudioUrl = (audioPlaylistServer?.BaseUrl ?? manifestServer.BaseUrl) + "/audio.m3u8";
                if (!audioUrlOnly) model.AudioManifestText = audioPlaylist;
            }
            engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner());
            bool usedNativeChunks = false;
            int peakActiveWorkers = 0;
            engine.DownloadProgressChanged += download =>
            {
                if (download.StatusDetail?.StartsWith("Remuxing stream to MP4", StringComparison.Ordinal) == true)
                    usedNativeChunks = true;
                peakActiveWorkers = Math.Max(peakActiveWorkers, engine.GetSegments(download.Id).Count(s => s.IsActive));
            };
            await engine.StartDownloadAsync(model);
            var deadline = Stopwatch.StartNew();
            while (deadline.Elapsed < TimeSpan.FromSeconds(25) && model.Status is not (DownloadStatus.Completed or DownloadStatus.Failed))
                await Task.Delay(50);
            Assert.True(model.Status == DownloadStatus.Completed, model.StatusDetail);
            Assert.True(usedNativeChunks, "Initialization and media fragments must be downloaded before local remux.");
            Assert.Equal(4, model.ParallelThreads);
            Assert.Contains(referer, initServer.ObservedReferers);
            Assert.Contains(referer, segmentServer.ObservedReferers);
            if (separateAudio)
            {
                Assert.True(peakActiveWorkers >= 2, "Video and audio fragment requests must overlap.");
                Assert.Contains(referer, audioInitServer!.ObservedReferers);
                Assert.Contains(referer, audioSegmentServer!.ObservedReferers);
            }
            await RunFfmpeg(ffmpeg, new[] { "-i", model.SavePath, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-" });
        }
        finally
        {
            if (engine != null) await engine.PauseDownloadAsync(model.Id);
            Directory.Delete(dir, true);
        }
    }

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

    [HlsPipelineTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RealEngine_DualProgressiveTracksMuxAndDecode(bool videoHasOwnAudio)
    {
        string ffmpeg = DownloadEngine.ResolveFfmpegPath() ?? throw new InvalidOperationException("Verified FFmpeg required.");
        string dir = Path.Combine(Path.GetTempPath(), "smartdm-dual-report-" + Guid.NewGuid());
        Directory.CreateDirectory(dir);
        DownloadEngine? engine = null;
        var model = new DownloadModel {SavePath = Path.Combine(dir, "result.mp4"), Referer = "https://player.invalid/selected"};
        try
        {
            var args = new List<string> {"-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24"};
            if (videoHasOwnAudio) args.AddRange(new[] {"-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"});
            args.AddRange(new[] {"-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", Path.Combine(dir, "video.mp4")});
            await RunFfmpeg(ffmpeg, args);
            await RunFfmpeg(ffmpeg, new[] {"-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000", "-t", "2", "-c:a", "aac", Path.Combine(dir, "audio.m4a")});
            await using var video = new TestHttpServer(await File.ReadAllBytesAsync(Path.Combine(dir, "video.mp4"))) {CustomContentType = "video/mp4", RequiredReferer = model.Referer};
            await using var audio = new TestHttpServer(await File.ReadAllBytesAsync(Path.Combine(dir, "audio.m4a"))) {CustomContentType = "audio/mp4", RequiredReferer = model.Referer};
            model.Url = video.BaseUrl + "/video.mp4";
            model.AudioUrl = audio.BaseUrl + "/audio.m4a";
            engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner());
            await engine.StartDownloadAsync(model);
            var timer = Stopwatch.StartNew();
            while (model.Status is not (DownloadStatus.Completed or DownloadStatus.Failed) && timer.Elapsed < TimeSpan.FromSeconds(25)) await Task.Delay(25);
            Assert.True(model.Status == DownloadStatus.Completed, model.StatusDetail);
            await RunFfmpeg(ffmpeg, new[] {"-i", model.SavePath, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"});
        }
        finally {if (engine != null) await engine.PauseDownloadAsync(model.Id); Directory.Delete(dir,true);}
    }

    private static async Task RunFfmpeg(string path, IEnumerable<string> args, string? workingDirectory = null)
    {
        var start = new ProcessStartInfo(path) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true };
        if (workingDirectory != null) start.WorkingDirectory = workingDirectory;
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
