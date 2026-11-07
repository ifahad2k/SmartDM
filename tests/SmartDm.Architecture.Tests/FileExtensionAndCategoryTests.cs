using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.ViewModels;
using Xunit;

namespace SmartDm.Architecture.Tests;

public class FileExtensionAndCategoryTests
{
    private readonly HttpProbeService _probeService = new();

    [Theory]
    // 1. Executables & Installers
    [InlineData("application/vnd.microsoft.portable-executable", ".exe")]
    [InlineData("application/x-msdownload", ".exe")]
    [InlineData("application/x-msi", ".msi")]
    [InlineData("application/vnd.android.package-archive", ".apk")]
    [InlineData("application/x-apple-diskimage", ".dmg")]
    [InlineData("application/x-debian-package", ".deb")]
    [InlineData("application/x-rpm", ".rpm")]
    [InlineData("application/appx", ".appx")]
    [InlineData("application/msix", ".msix")]
    [InlineData("application/vnd.appimage", ".appimage")]
    // 2. Torrents
    [InlineData("application/x-bittorrent", ".torrent")]
    [InlineData("application/x-torrent", ".torrent")]
    // 3. Archives
    [InlineData("application/zip", ".zip")]
    [InlineData("application/x-7z-compressed", ".7z")]
    [InlineData("application/x-tar", ".tar")]
    [InlineData("application/gzip", ".gz")]
    [InlineData("application/x-bzip2", ".bz2")]
    [InlineData("application/x-xz", ".xz")]
    [InlineData("application/zstd", ".zst")]
    [InlineData("application/x-iso9660-image", ".iso")]
    [InlineData("application/vnd.ms-cab-compressed", ".cab")]
    // 4. Documents
    [InlineData("application/pdf", ".pdf")]
    [InlineData("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx")]
    [InlineData("application/msword", ".doc")]
    [InlineData("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx")]
    [InlineData("application/vnd.ms-excel", ".xls")]
    [InlineData("application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx")]
    [InlineData("application/vnd.ms-powerpoint", ".ppt")]
    [InlineData("text/plain", ".txt")]
    [InlineData("text/csv", ".csv")]
    [InlineData("application/rtf", ".rtf")]
    [InlineData("application/epub+zip", ".epub")]
    // 5. Media
    [InlineData("video/mp4", ".mp4")]
    [InlineData("video/x-matroska", ".mkv")]
    [InlineData("video/webm", ".webm")]
    [InlineData("video/quicktime", ".mov")]
    [InlineData("video/x-msvideo", ".avi")]
    [InlineData("audio/mpeg", ".mp3")]
    [InlineData("audio/flac", ".flac")]
    [InlineData("audio/wav", ".wav")]
    [InlineData("audio/aac", ".aac")]
    [InlineData("audio/ogg", ".ogg")]
    [InlineData("audio/opus", ".opus")]
    [InlineData("audio/mp4", ".m4a")]
    [InlineData("image/png", ".png")]
    [InlineData("image/jpeg", ".jpg")]
    [InlineData("image/webp", ".webp")]
    [InlineData("image/svg+xml", ".svg")]
    // 6. Developer / Code
    [InlineData("application/json", ".json")]
    [InlineData("application/xml", ".xml")]
    [InlineData("text/css", ".css")]
    [InlineData("text/javascript", ".js")]
    [InlineData("text/x-python", ".py")]
    [InlineData("text/x-shellscript", ".sh")]
    [InlineData("text/yaml", ".yaml")]
    [InlineData("application/sql", ".sql")]
    [InlineData("application/wasm", ".wasm")]
    [InlineData("application/java-archive", ".jar")]
    [InlineData("application/x-wheel+zip", ".whl")]
    public void MimeTypeToExtension_AllCategoriesCovered(string mimeType, string expectedExt)
    {
        string actual = HttpProbeService.GetExtensionFromMimeType(mimeType);
        Assert.Equal(expectedExt, actual);
    }

    [Theory]
    // Software
    [InlineData("installer.exe", "Software")]
    [InlineData("setup.msi", "Software")]
    [InlineData("app.apk", "Software")]
    [InlineData("installer.dmg", "Software")]
    [InlineData("package.deb", "Software")]
    [InlineData("package.rpm", "Software")]
    [InlineData("bundle.appx", "Software")]
    [InlineData("app.appimage", "Software")]
    // Torrents
    [InlineData("sintel.torrent", "Torrents")]
    [InlineData("ubuntu-24.04.torrent", "Torrents")]
    // Archives
    [InlineData("archive.zip", "Archives")]
    [InlineData("backup.tar.gz", "Archives")]
    [InlineData("files.7z", "Archives")]
    [InlineData("data.rar", "Archives")]
    [InlineData("system.iso", "Archives")]
    [InlineData("disk.img", "Archives")]
    [InlineData("archive.tar.xz", "Archives")]
    [InlineData("archive.zst", "Archives")]
    // Documents
    [InlineData("report.pdf", "Documents")]
    [InlineData("document.docx", "Documents")]
    [InlineData("legacy.doc", "Documents")]
    [InlineData("sheet.xlsx", "Documents")]
    [InlineData("presentation.pptx", "Documents")]
    [InlineData("notes.txt", "Documents")]
    [InlineData("data.csv", "Documents")]
    [InlineData("book.epub", "Documents")]
    // Audio
    [InlineData("track.mp3", "Audio")]
    [InlineData("song.flac", "Audio")]
    [InlineData("sound.wav", "Audio")]
    [InlineData("audio.m4a", "Audio")]
    [InlineData("stream.opus", "Audio")]
    [InlineData("music.aac", "Audio")]
    // Media (Video / Image)
    [InlineData("movie.mp4", "Media")]
    [InlineData("clip.mkv", "Media")]
    [InlineData("video.webm", "Media")]
    [InlineData("recording.mov", "Media")]
    [InlineData("photo.png", "Media")]
    [InlineData("picture.jpg", "Media")]
    [InlineData("image.webp", "Media")]
    // Code
    [InlineData("script.py", "Code")]
    [InlineData("main.js", "Code")]
    [InlineData("styles.css", "Code")]
    [InlineData("package.json", "Code")]
    [InlineData("deploy.sh", "Code")]
    [InlineData("app.jar", "Code")]
    [InlineData("lib.whl", "Code")]
    // AI
    [InlineData("model.gguf", "AI")]
    [InlineData("weights.safetensors", "AI")]
    [InlineData("network.onnx", "AI")]
    public void DetectCategory_AllCategoriesMappedCorrectly(string fileName, string expectedCategory)
    {
        string actual = _probeService.DetectCategory(fileName, "application/octet-stream");
        Assert.Equal(expectedCategory, actual);
    }

    [Fact]
    public void ExtractFileNameFromContentDisposition_HandlesRfc5987AndUnquoted()
    {
        // 1. Quoted filename
        var resp1 = new HttpResponseMessage(HttpStatusCode.OK);
        resp1.Content.Headers.TryAddWithoutValidation("Content-Disposition", "attachment; filename=\"setup-v1.0.exe\"");
        Assert.Equal("setup-v1.0.exe", HttpProbeService.ExtractFileNameFromContentDisposition(resp1));

        // 2. Unquoted filename with spaces
        var resp2 = new HttpResponseMessage(HttpStatusCode.OK);
        resp2.Content.Headers.TryAddWithoutValidation("Content-Disposition", "attachment; filename=my setup file.exe");
        Assert.Equal("my setup file.exe", HttpProbeService.ExtractFileNameFromContentDisposition(resp2));

        // 3. RFC 5987 UTF-8'' format
        var resp3 = new HttpResponseMessage(HttpStatusCode.OK);
        resp3.Content.Headers.TryAddWithoutValidation("Content-Disposition", "attachment; filename*=UTF-8''my%20archive%20%281%29.torrent");
        Assert.Equal("my archive (1).torrent", HttpProbeService.ExtractFileNameFromContentDisposition(resp3));
    }

    [Fact]
    public void ExtractFileNameFromUrl_HandlesQueryParamsAndBasename()
    {
        // Query param ?file=
        var uri1 = new Uri("https://example.com/download.php?file=my_app_installer.exe&token=123");
        Assert.Equal("my_app_installer.exe", HttpProbeService.ExtractFileNameFromUrl(uri1));

        // Query param ?filename=
        var uri2 = new Uri("https://example.com/get?id=99&filename=sintel-1080p.torrent");
        Assert.Equal("sintel-1080p.torrent", HttpProbeService.ExtractFileNameFromUrl(uri2));

        // URL path basename
        var uri3 = new Uri("https://releases.ubuntu.com/24.04/ubuntu-24.04-desktop-amd64.iso");
        Assert.Equal("ubuntu-24.04-desktop-amd64.iso", HttpProbeService.ExtractFileNameFromUrl(uri3));
    }

    [Fact]
    public void InferFileNameFromUrl_IdentifiesNonMediaFiles()
    {
        Assert.Equal("setup.exe", _probeService.InferFileNameFromUrl("https://example.com/downloads/setup.exe"));
        Assert.Equal("sintel.torrent", _probeService.InferFileNameFromUrl("https://webtorrent.io/torrents/sintel.torrent"));
        Assert.Equal("document.pdf", _probeService.InferFileNameFromUrl("https://example.com/docs/document.pdf?view=inline"));
        Assert.Equal("ubuntu.iso", _probeService.InferFileNameFromUrl("https://releases.ubuntu.com/ubuntu.iso"));
        Assert.Equal("installer.msi", _probeService.InferFileNameFromUrl("https://example.com/api?file=installer.msi"));
    }

    [Fact]
    public async Task AddDownloadViewModel_PreservesNonMediaFileNameAndCategory()
    {
        // Simulate a real probe response returning setup.exe
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(new byte[1024 * 1024])
        };
        mockResponse.Content.Headers.ContentLength = 1024 * 1024;
        mockResponse.Content.Headers.ContentType = new MediaTypeHeaderValue("application/x-msdownload");
        mockResponse.Content.Headers.TryAddWithoutValidation("Content-Disposition", "attachment; filename=\"SmartDmSetup.exe\"");

        var testClient = new HttpClient(new TestMockHandler(mockResponse));
        var probeService = new HttpProbeService(testClient);
        var settings = new AppSettingsModel();

        // 1. When adding URL with initialUrl pointing to setup.exe
        var vm = new AddDownloadViewModel(
            settings: settings,
            initialUrl: "https://example.com/downloads/SmartDmSetup.exe",
            probeService: probeService
        );

        // Constructor should immediately infer SmartDmSetup.exe, not video.mp4!
        Assert.Equal("SmartDmSetup.exe", vm.FileName);
        Assert.NotEqual("video.mp4", vm.FileName);

        // Run ProbeUrlAsync
        await vm.ProbeUrlCommand.ExecuteAsync(null);

        // After probe, FileName must remain SmartDmSetup.exe and Category must be Software
        Assert.Equal("SmartDmSetup.exe", vm.FileName);
        Assert.Equal("Software", vm.Category);
        Assert.EndsWith("SmartDmSetup.exe", vm.SavePath);
    }

    [Fact]
    public async Task AddDownloadViewModel_TorrentDownload_NeverRenamedToVideoMp4()
    {
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(new byte[25000])
        };
        mockResponse.Content.Headers.ContentLength = 25000;
        mockResponse.Content.Headers.ContentType = new MediaTypeHeaderValue("application/x-bittorrent");
        mockResponse.Content.Headers.TryAddWithoutValidation("Content-Disposition", "attachment; filename=\"sintel.torrent\"");

        var testClient = new HttpClient(new TestMockHandler(mockResponse));
        var probeService = new HttpProbeService(testClient);
        var settings = new AppSettingsModel();

        var vm = new AddDownloadViewModel(
            settings: settings,
            initialUrl: "https://webtorrent.io/torrents/sintel.torrent",
            probeService: probeService
        );

        Assert.Equal("sintel.torrent", vm.FileName);
        Assert.NotEqual("video.mp4", vm.FileName);

        await vm.ProbeUrlCommand.ExecuteAsync(null);

        Assert.Equal("sintel.torrent", vm.FileName);
        Assert.Equal("Torrents", vm.Category);
    }

    [Fact]
    public void MainViewModel_MatchesCategory_RoutesAllCategories()
    {
        var vm = new MainViewModel(isDemoMode: true);

        // Check helper method via reflection or direct testing on downloads
        var softwareDl = new DownloadModel { Title = "setup.exe", SavePath = @"C:\Downloads\setup.exe", Category = "Software" };
        var torrentDl = new DownloadModel { Title = "sintel.torrent", SavePath = @"C:\Downloads\sintel.torrent", Category = "Torrents" };
        var archiveDl = new DownloadModel { Title = "ubuntu.iso", SavePath = @"C:\Downloads\ubuntu.iso", Category = "Archives" };
        var documentDl = new DownloadModel { Title = "doc.pdf", SavePath = @"C:\Downloads\doc.pdf", Category = "Documents" };
        var audioDl = new DownloadModel { Title = "song.mp3", SavePath = @"C:\Downloads\song.mp3", Category = "Audio" };
        var mediaDl = new DownloadModel { Title = "movie.mp4", SavePath = @"C:\Downloads\movie.mp4", Category = "Media" };
        var codeDl = new DownloadModel { Title = "package.whl", SavePath = @"C:\Downloads\package.whl", Category = "Code" };
        var aiDl = new DownloadModel { Title = "weights.safetensors", SavePath = @"C:\Downloads\weights.safetensors", Category = "AI" };

        var method = typeof(MainViewModel).GetMethod("MatchesCategory", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        Assert.NotNull(method);

        Assert.True((bool)method.Invoke(vm, new object[] { softwareDl, "Software" })!);
        Assert.True((bool)method.Invoke(vm, new object[] { torrentDl, "Torrents" })!);
        Assert.True((bool)method.Invoke(vm, new object[] { archiveDl, "Archives" })!);
        Assert.True((bool)method.Invoke(vm, new object[] { documentDl, "Documents" })!);
        Assert.True((bool)method.Invoke(vm, new object[] { audioDl, "Audio" })!);
        Assert.True((bool)method.Invoke(vm, new object[] { mediaDl, "Media" })!);
        Assert.True((bool)method.Invoke(vm, new object[] { codeDl, "Code" })!);
        Assert.True((bool)method.Invoke(vm, new object[] { aiDl, "AI" })!);
    }

    private sealed class TestMockHandler : HttpMessageHandler
    {
        private readonly HttpResponseMessage _response;
        public TestMockHandler(HttpResponseMessage response) => _response = response;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(_response);
        }
    }
}
