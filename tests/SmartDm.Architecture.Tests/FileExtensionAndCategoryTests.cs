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
    public void TorrentBD_UrlInference_ExtractsTorrentIdAndCategory()
    {
        string url = "https://www.torrentbd.net/download.php?id=1338395";
        string? fileName = _probeService.InferFileNameFromUrl(url);
        Assert.Equal("torrent_1338395.torrent", fileName);

        string category = _probeService.DetectCategory(fileName!, "application/octet-stream");
        Assert.Equal("Torrents", category);
    }

    [Fact]
    public async Task TorrentBD_AddDownloadViewModel_Probe403_NeverLeavesFileNameBlankOrCategoryGeneral()
    {
        // Simulate a 403 Forbidden probe response (unauthenticated or bot-blocked)
        var forbiddenResp = new HttpResponseMessage(HttpStatusCode.Forbidden);
        var testClient = new HttpClient(new TestMockHandler(forbiddenResp));
        var probeService = new HttpProbeService(testClient);
        var settings = new AppSettingsModel();

        var vm = new AddDownloadViewModel(
            settings: settings,
            initialUrl: "https://www.torrentbd.net/download.php?id=1338395",
            probeService: probeService
        );

        // Immediately inferred from URL
        Assert.Equal("torrent_1338395.torrent", vm.FileName);
        Assert.Equal("Torrents", vm.Category);
        Assert.EndsWith("torrent_1338395.torrent", vm.SavePath);

        // Execute probe (which fails with 403)
        await vm.ProbeUrlCommand.ExecuteAsync(null);

        // Even though probe failed with 403, FileName and Category must NOT be cleared or set to General!
        Assert.False(vm.IsProbeSuccessful);
        Assert.Contains("403", vm.ProbeStatus);
        Assert.Equal("torrent_1338395.torrent", vm.FileName);
        Assert.Equal("Torrents", vm.Category);
        Assert.EndsWith("torrent_1338395.torrent", vm.SavePath);
    }

    [Fact]
    public async Task TorrentBD_WithSessionCookiesAndReferer_SucceedsAndReadsContentDisposition()
    {
        HttpRequestMessage? capturedRequest = null;
        var okResp = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(new byte[15000])
        };
        okResp.Content.Headers.ContentLength = 15000;
        okResp.Content.Headers.ContentType = new MediaTypeHeaderValue("application/x-bittorrent");
        okResp.Content.Headers.TryAddWithoutValidation("Content-Disposition", "attachment; filename=\"Devara.Part.1.2024.1080p.WEB-DL.torrent\"");

        var testClient = new HttpClient(new CustomCaptureHandler(req =>
        {
            capturedRequest = req;
            return okResp;
        }));
        var probeService = new HttpProbeService(testClient);
        var settings = new AppSettingsModel();

        var vm = new AddDownloadViewModel(
            settings: settings,
            initialUrl: "https://www.torrentbd.net/download.php?id=1338395",
            probeService: probeService,
            initialReferer: "https://www.torrentbd.net/torrent/view/1338395",
            initialCookies: "uid=12345; pass=abcdef123456"
        );

        await vm.ProbeUrlCommand.ExecuteAsync(null);

        Assert.True(vm.IsProbeSuccessful);
        Assert.Equal("Devara.Part.1.2024.1080p.WEB-DL.torrent", vm.FileName);
        Assert.Equal("Torrents", vm.Category);
        Assert.NotNull(capturedRequest);
        Assert.True(capturedRequest.Headers.Contains("Cookie"));
        Assert.True(capturedRequest.Headers.Contains("Referer"));
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

    [Theory]
    [InlineData("https://docs.google.com/spreadsheets/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/export?format=xlsx", "1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.xlsx")]
    [InlineData("https://docs.google.com/spreadsheets/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/export?format=pdf", "1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.pdf")]
    [InlineData("https://docs.google.com/spreadsheets/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/export?format=csv", "1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.csv")]
    [InlineData("https://docs.google.com/spreadsheets/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/export?format=ods", "1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.ods")]
    [InlineData("https://docs.google.com/spreadsheets/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/export?format=tsv", "1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.tsv")]
    [InlineData("https://docs.google.com/spreadsheets/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/export?output=pdf", "1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.pdf")]
    [InlineData("https://docs.google.com/spreadsheets/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/export?exportFormat=xlsx", "1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.xlsx")]
    [InlineData("https://doc-0c-9o-sheets.googleusercontent.com/export/itnre3ko9oljkbc7b6s85f2pm0/crb89js4flu73b?format=xlsx&id=1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU", "1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.xlsx")]
    [InlineData("https://doc-0c-9o-sheets.googleusercontent.com/export/itnre3ko9oljkbc7b6s85f2pm0/crb89js4flu73b?format=pdf", "crb89js4flu73b.pdf")]
    public void ExtractFileNameFromUrl_GoogleSheetsAndDocs_InfersCorrectExtensionAndDocId(string url, string expectedFileName)
    {
        var uri = new Uri(url);
        string? extracted = HttpProbeService.ExtractFileNameFromUrl(uri);
        Assert.Equal(expectedFileName, extracted);
    }

    [Fact]
    public async Task HttpProbeService_GoogleExportReturnsHtml_PreservesDocumentExtensionAndCategory()
    {
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                "<!DOCTYPE html><html><head><title>1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU - Google Sheets</title></head><body>Google Preview</body></html>",
                System.Text.Encoding.UTF8,
                "text/html")
        };

        var handler = new TestMockHandler(mockResponse);
        var httpClient = new HttpClient(handler);
        var probeService = new HttpProbeService(httpClient);

        string url = "https://doc-0c-9o-sheets.googleusercontent.com/export/itnre3ko9oljkbc7b6s85f2pm0/crb89js4flu73b?format=xlsx&id=1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU";
        var res = await probeService.ProbeUrlAsync(url);

        Assert.True(res.IsSuccess);
        Assert.Equal("1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.xlsx", res.FileName);
        Assert.False(res.FileName.EndsWith(".html"), "Probe filename must not end with .html for Google export!");
        Assert.Equal("Documents", res.SuggestedCategory);
        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", res.MimeType);
    }

    [Fact]
    public async Task AddDownloadViewModel_AuthoritativeExcelOrPdf_NeverOverwrittenByHtmlProbe()
    {
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                "<!DOCTYPE html><html><head><title>1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU</title></head><body>Unauthorized preview</body></html>",
                System.Text.Encoding.UTF8,
                "text/html")
        };

        var handler = new TestMockHandler(mockResponse);
        var httpClient = new HttpClient(handler);
        var probeService = new HttpProbeService(httpClient);

        string url = "https://doc-0c-9o-sheets.googleusercontent.com/export/itnre3ko9oljkbc7b6s85f2pm0/crb89js4flu73b";
        var vm = new AddDownloadViewModel(
            probeService: probeService,
            initialUrl: url,
            initialFileName: "QuarterlyReport.xlsx"
        );

        await vm.ProbeUrlCommand.ExecuteAsync(null);

        Assert.Equal("QuarterlyReport.xlsx", vm.FileName);
        Assert.Equal("Documents", vm.Category);
        Assert.NotEqual("Code", vm.Category);
        Assert.False(vm.FileName.EndsWith(".html"));
    }

    [Fact]
    public async Task AddDownloadViewModel_GoogleSheetsUrlWithoutInitialFileName_InfersXlsxAndDocumentsCategory()
    {
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                "<!DOCTYPE html><html><head><title>1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU</title></head><body>Preview</body></html>",
                System.Text.Encoding.UTF8,
                "text/html")
        };

        var handler = new TestMockHandler(mockResponse);
        var httpClient = new HttpClient(handler);
        var probeService = new HttpProbeService(httpClient);

        string url = "https://docs.google.com/spreadsheets/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/export?format=xlsx";
        var vm = new AddDownloadViewModel(
            probeService: probeService,
            initialUrl: url
        );

        await vm.ProbeUrlCommand.ExecuteAsync(null);

        Assert.Equal("1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.xlsx", vm.FileName);
        Assert.Equal("Documents", vm.Category);
        Assert.NotEqual("Code", vm.Category);
    }

    [Fact]
    public async Task AddDownloadViewModel_GoogleSheetsMultiAccountPdfExport_SanitizesHtmlFileNameToPdf()
    {
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                "<!DOCTYPE html><html><head><title>1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU</title></head><body>Preview</body></html>",
                System.Text.Encoding.UTF8,
                "text/html")
        };

        var handler = new TestMockHandler(mockResponse);
        var httpClient = new HttpClient(handler);
        var probeService = new HttpProbeService(httpClient);

        string url = "https://docs.google.com/spreadsheets/u/1/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/export?format=pdf";
        var vm = new AddDownloadViewModel(
            probeService: probeService,
            initialUrl: url,
            initialFileName: "1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.html",
            initialMime: "application/pdf"
        );

        // Constructor should immediately sanitize .html to .pdf
        Assert.Equal("1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.pdf", vm.FileName);
        Assert.Equal("Documents", vm.Category);

        await vm.ProbeUrlCommand.ExecuteAsync(null);

        // After probe returning text/html, it MUST NOT revert to .html or Code category!
        Assert.Equal("1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.pdf", vm.FileName);
        Assert.Equal("Documents", vm.Category);
        Assert.NotEqual("Code", vm.Category);
        Assert.False(vm.FileName.EndsWith(".html"));
    }

    [Fact]
    public void HttpProbeService_ExtractFileNameFromUrl_GoogleDocsWordExport_InfersDocx()
    {
        var uri = new Uri("https://docs.google.com/document/u/0/d/1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU/export?format=docx");
        string? extracted = HttpProbeService.ExtractFileNameFromUrl(uri);
        Assert.Equal("1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.docx", extracted);
    }

    [Fact]
    public async Task HttpProbeService_GoogleSheetsExportReturnsHtml_WithSheetTitle_InfersTitleAndPdf()
    {
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                "<!DOCTYPE html><html><head><title>Q4 Budget Report - Google Sheets</title></head><body>Preview</body></html>",
                System.Text.Encoding.UTF8,
                "text/html")
        };

        var handler = new TestMockHandler(mockResponse);
        var httpClient = new HttpClient(handler);
        var probeService = new HttpProbeService(httpClient);

        string url = "https://doc-0c-9o-sheets.googleusercontent.com/export/itnre3ko9oljkbc7b6s85f2pm0/crb89js4flu73b?format=pdf";
        var res = await probeService.ProbeUrlAsync(url);

        Assert.True(res.IsSuccess);
        Assert.Equal("Q4 Budget Report.pdf", res.FileName);
        Assert.Equal("Documents", res.SuggestedCategory);
        Assert.Equal("application/pdf", res.MimeType);
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

    private sealed class CustomCaptureHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;
        public CustomCaptureHandler(Func<HttpRequestMessage, HttpResponseMessage> handler) => _handler = handler;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(_handler(request));
        }
    }
}
