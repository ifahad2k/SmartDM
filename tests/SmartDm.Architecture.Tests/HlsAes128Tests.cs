using System.Net;
using System.Security.Cryptography;
using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.ViewModels;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class HlsAes128Tests
{
    private const string Prefix = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:257\n";
    private const string Segment = "#EXTINF:6,\npart.ts\n";
    private const string End = "#EXT-X-ENDLIST";

    [Theory]
    [InlineData(null)]
    [InlineData("hls")]
    public async Task SingleVerifiedFormat_PreservesTransportAndIdentityWithoutResolutionGuess(string? kind)
    {
        var format = new MediaFormatDto {FormatId = "exact-source", DirectUrl = "https://cdn.invalid/opaque",
            MediaKind = kind, Resolution = "Original stream (resolution unknown)", ManifestText = kind == "hls" ? Prefix + Segment + End : null};
        var vm = new AddDownloadViewModel(probeService: new NoProbe(), catalogService: new NoCatalog(),
            initialUrl: format.DirectUrl, initialFormatId: format.FormatId, initialFormats: new() {format},
            initialFileName: "fixture-" + Guid.NewGuid() + ".mp4", settings: new() {DefaultDownloadDirectory = Path.GetTempPath()});
        DownloadModel? created = null;
        vm.DownloadCreated += value => created = value;
        await vm.AddToQueueCommand.ExecuteAsync(null);
        Assert.NotNull(created);
        Assert.Equal(format.DirectUrl, created.Url);
        Assert.Equal(format.FormatId, created.FormatId);
        Assert.Equal(kind, created.MediaKind);
        Assert.Equal(format.ManifestText, created.ManifestText);
    }

    [Fact]
    public void RotatingKeys_ExplicitAndSequenceIvs_AndClearReset()
    {
        string text = Prefix + "#EXT-X-ALLOW-CACHE:NO\n#EXT-X-KEY:METHOD=AES-128,URI=\"keys/first\"\n" + Segment +
            "#EXT-X-KEY:METHOD=AES-128,URI=\"keys/second\",IV=0xabcdef,KEYFORMAT=\"identity\"\n" + Segment +
            "#EXT-X-KEY:METHOD=NONE\n" + Segment + End;
        string normalized = HlsManifestSnapshot.Normalize(text, "https://cdn.invalid/asset/list");
        var rows = HlsAes128.ParseSegments(normalized, "https://cdn.invalid/asset/list");
        Assert.Equal(3, rows.Count);
        Assert.Equal("https://cdn.invalid/asset/keys/first", rows[0].Encryption!.KeyUrl);
        Assert.Equal("00000000000000000000000000000101", rows[0].Encryption!.IvHex);
        Assert.Equal("00000000000000000000000000ABCDEF", rows[1].Encryption!.IvHex);
        Assert.Null(rows[2].Encryption);
    }

    [Theory]
    [InlineData("METHOD=SAMPLE-AES,URI=\"https://cdn.invalid/key\"")]
    [InlineData("METHOD=AES-128,URI=\"file:///private/key\"")]
    [InlineData("METHOD=AES-128,URI=\"https://user:secret@cdn.invalid/key\"")]
    [InlineData("METHOD=AES-128,URI=\"data:text/plain,secret\"")]
    [InlineData("METHOD=AES-128,URI=\"https://cdn.invalid/key\",KEYFORMAT=\"com.apple.streamingkeydelivery\"")]
    [InlineData("METHOD=AES-128,URI=\"https://cdn.invalid/key\",IV=0xNOTHEX")]
    [InlineData("METHOD=AES-128,URI=\"https://cdn.invalid/key\",IV=0x100000000000000000000000000000000")]
    [InlineData("METHOD=AES-128,URI=\"https://cdn.invalid/key\",METHOD=NONE")]
    public void RejectsUnsafeOrUnsupportedKeys(string attributes)
        => Assert.Throws<InvalidDataException>(() => HlsManifestSnapshot.Normalize(Prefix + "#EXT-X-KEY:" + attributes + "\n" + Segment + End, "https://cdn.invalid/list"));

    [Theory]
    [InlineData(15)]
    [InlineData(17)]
    [InlineData(65536)]
    public async Task InvalidKey_IsBounded_AndNeverReplacesInput(int keyLength)
    {
        using var client = new HttpClient(new KeyHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) {Content = new ByteArrayContent(new byte[keyLength])}));
        using var cache = new HlsAes128KeyCache(null, null, _ => null, client);
        string path = Path.GetTempFileName();
        byte[] input = new byte[64];
        try
        {
            await File.WriteAllBytesAsync(path, input);
            await Assert.ThrowsAsync<InvalidDataException>(() => cache.DecryptAsync(path, new("https://cdn.invalid/key?secret=token", new string('0', 32)), CancellationToken.None));
            Assert.Equal(input, await File.ReadAllBytesAsync(path));
            Assert.False(File.Exists(path + ".aes"));
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public async Task DecryptsStreamingPkcs7_AndBoundsKeyCache()
    {
        int requests = 0;
        byte[] key = Enumerable.Range(0, 16).Select(i => (byte)i).ToArray(), iv = new byte[16];
        using var client = new HttpClient(new KeyHandler(_ => {requests++; return new(HttpStatusCode.OK) {Content = new ByteArrayContent(key)};}));
        using var cache = new HlsAes128KeyCache(null, null, _ => null, client);
        byte[] media = Enumerable.Range(0, 500_003).Select(i => (byte)(i % 251)).ToArray();
        using var aes = Aes.Create(); aes.Key = key;
        byte[] encrypted = aes.EncryptCbc(media, iv, PaddingMode.PKCS7);
        string path = Path.GetTempFileName();
        async Task Decrypt(string address)
        {
            await File.WriteAllBytesAsync(path, encrypted);
            await cache.DecryptAsync(path, new(address, Convert.ToHexString(iv)), CancellationToken.None);
            Assert.Equal(media, await File.ReadAllBytesAsync(path));
        }
        try
        {
            await Decrypt("https://cdn.invalid/key-0");
            await Decrypt("https://cdn.invalid/key-0");
            Assert.Equal(1, requests);
            for (int i = 1; i <= 32; i++) await Decrypt("https://cdn.invalid/key-" + i);
            await Decrypt("https://cdn.invalid/key-0");
            Assert.Equal(34, requests);
            Assert.False(File.Exists(path + ".aes"));
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public async Task KeyRedirect_RescopesCookies_AndRejectsTlsDowngrade()
    {
        var cookieScopes = new List<string>();
        using var client = new HttpClient(new KeyHandler(request => request.RequestUri!.Host == "first.invalid" ?
            new(HttpStatusCode.Found) {Headers = {Location = new Uri("https://second.invalid/key")}} :
            new(HttpStatusCode.Found) {Headers = {Location = new Uri("http://second.invalid/key")}}));
        using var cache = new HlsAes128KeyCache(null, null, url => {cookieScopes.Add(new Uri(url).Host); return null;}, client);
        string path = Path.GetTempFileName();
        try
        {
            await Assert.ThrowsAsync<InvalidDataException>(() => cache.DecryptAsync(path, new("https://first.invalid/key", new string('0', 32)), CancellationToken.None));
            Assert.Equal(new[] {"first.invalid", "second.invalid"}, cookieScopes);
        }
        finally { File.Delete(path); }
    }

    private sealed class KeyHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(respond(request));
    }

    private sealed class NoProbe : IHttpProbeService
    {
        public Task<ProbeResult> ProbeUrlAsync(string url, CancellationToken cancellationToken = default) => throw new InvalidOperationException("Verified format must not be replaced by a page probe.");
        public string SanitizeFileName(string rawFileName) => rawFileName;
        public string DetectCategory(string fileName, string mimeType) => "Media";
    }
    private sealed class NoCatalog : IFileCatalogService
    {
        public Task InitializeAsync() => Task.CompletedTask;
        public Task IndexFileAsync(string filePath, string? sourceUrl = null, string? sha256 = null) => Task.CompletedTask;
        public Task<CatalogMatch?> FindDuplicateAsync(string? url, string? fileName, string? expectedSha256 = null) => Task.FromResult<CatalogMatch?>(null);
        public string GenerateUniquePath(string path, Func<string, bool>? isPathInUse = null) => path;
        public Task ScanCommonFoldersAsync(CancellationToken ct = default) => Task.CompletedTask;
    }
}
