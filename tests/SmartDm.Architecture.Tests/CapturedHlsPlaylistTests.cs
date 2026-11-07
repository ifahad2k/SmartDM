using System.Net;
using System.Net.Sockets;
using System.Text;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class CapturedHlsPlaylistTests
{
    private const string Playlist = "#EXTM3U\n#EXTINF:2,\nhttps://cdn.invalid/part.m4s\n#EXT-X-ENDLIST\n";

    [Fact]
    public async Task SnapshotEndpoint_OnlyServesItsPrivatePath_AndNeverAcceptsWrites()
    {
        await using var source = new CapturedHlsPlaylist(Playlist, CancellationToken.None);
        using var http = new HttpClient();
        Assert.Equal(IPAddress.Loopback.ToString(), new Uri(source.Url).Host);
        using var response = await http.GetAsync(source.Url);
        Assert.Equal(Playlist, await response.Content.ReadAsStringAsync());
        Assert.True(response.Headers.CacheControl!.NoStore);
        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
        using var unknown = await http.GetAsync(new Uri(new Uri(source.Url), "/playlist.m3u8"));
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        using var post = await http.PostAsync(source.Url, new StringContent("ignored"));
        Assert.Equal(HttpStatusCode.NotFound, post.StatusCode);
        using var headRequest = new HttpRequestMessage(HttpMethod.Head, source.Url);
        using var head = await http.SendAsync(headRequest);
        Assert.Equal(HttpStatusCode.OK, head.StatusCode);
        Assert.Empty(await head.Content.ReadAsByteArrayAsync());
        Assert.Equal(Playlist, await http.GetStringAsync(source.Url));
    }

    [Fact]
    public async Task Cancellation_ClosesAnUnfinishedRequest_AndReleasesThePort()
    {
        using var stop = new CancellationTokenSource();
        var source = new CapturedHlsPlaylist(Playlist, stop.Token);
        var uri = new Uri(source.Url);
        using var client = new TcpClient();
        await client.ConnectAsync(IPAddress.Loopback, uri.Port);
        await client.GetStream().WriteAsync(Encoding.ASCII.GetBytes("GET /incomplete"));
        await stop.CancelAsync();
        await source.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(2));
        using var next = new TcpClient();
        await Assert.ThrowsAnyAsync<SocketException>(() => next.ConnectAsync(IPAddress.Loopback, uri.Port));
    }

    [Fact]
    public async Task OversizedHeaders_DoNotRetainAConnectionOrPreventTheNextRequest()
    {
        await using var source = new CapturedHlsPlaylist(Playlist, CancellationToken.None);
        using var client = new TcpClient();
        await client.ConnectAsync(IPAddress.Loopback, new Uri(source.Url).Port);
        await client.GetStream().WriteAsync(new byte[16 * 1024]);
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
        Assert.Equal(Playlist, await http.GetStringAsync(source.Url));
        Assert.Throws<InvalidDataException>(() => new CapturedHlsPlaylist(new string('s', HlsManifestSnapshot.MaxBytes + 1), CancellationToken.None));
    }
}
