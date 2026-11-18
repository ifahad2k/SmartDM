using System.Collections.Concurrent;
using System.Net;
using System.Text;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class SecurityRemediationTests
{
    private const string Jar = "# Netscape HTTP Cookie File\nsource.invalid\tFALSE\t/private\tTRUE\t0\tsession\tcanary\ncdn.invalid\tFALSE\t/\tTRUE\t0\tcdn\tpermitted\n";

    [Fact]
    public void CookieSelectionPreservesScopeUntilTheActualRequest()
    {
        Assert.Equal("session=canary", DownloadEngine.FormatCookieHeader(Jar, "https://source.invalid/private/file"));
        Assert.Null(DownloadEngine.FormatCookieHeader(Jar, "https://source.invalid/public/file"));
        Assert.Null(DownloadEngine.FormatCookieHeader(Jar, "http://source.invalid/private/file"));
        Assert.Equal("cdn=permitted", DownloadEngine.FormatCookieHeader(Jar, "https://cdn.invalid/segment"));
        Assert.Null(DownloadEngine.FormatCookieHeader("session=canary", "https://evil.invalid/file", "https://source.invalid/file"));
        Assert.Null(DownloadEngine.FormatCookieHeader("session=canary", "https://source.invalid/other", "https://source.invalid/file"));
        Assert.Equal("session=canary", DownloadEngine.FormatCookieHeader("session=canary", "https://source.invalid/file?new", "https://source.invalid/file?old"));
    }

    [Theory]
    [InlineData("https://source.invalid/public/part", null)]
    [InlineData("https://evil.invalid/part", null)]
    [InlineData("http://source.invalid/private/part", null)]
    [InlineData("https://cdn.invalid/part", "cdn=permitted")]
    public async Task HlsWorkerUsesEachChunkCookieScope(string target, string? expected)
    {
        string path = Path.GetTempFileName();
        int requests = 0;
        using var client = new HttpClient(new Handler(request => {
            requests++;
            Assert.Equal(expected, request.Headers.TryGetValues("Cookie", out var values) ? string.Join("; ", values) : null);
            return new(HttpStatusCode.OK) {Content = new ByteArrayContent(new byte[188 * 3])};
        }));
        try
        {
            var worker = new SegmentWorker(client, "https://source.invalid/private/list", path, 1, 0, 0, cookies: Jar);
            var queue = new ConcurrentQueue<HlsSegmentTask>(new[] {new HlsSegmentTask {Url=target,TargetPath=path,Index=0}});
            await worker.ExecuteHlsChunkQueueAsync(queue, () => queue.IsEmpty, default).WaitAsync(TimeSpan.FromSeconds(5));
            Assert.Null(worker.LastError);
            Assert.Equal(1, requests);
        }
        finally {File.Delete(path);}
    }

    [Fact]
    public async Task HtmlMetadataRejectsOversizeWithoutReturningPartialText()
    {
        using var content = new StringContent(new string('x', BoundedMetadata.HtmlBytes + 1));
        await Assert.ThrowsAsync<InvalidDataException>(() => BoundedMetadata.ReadAsync(content, BoundedMetadata.HtmlBytes, default));
        using var control = new StringContent("<title>Ordinary title</title>");
        Assert.Equal("<title>Ordinary title</title>", await BoundedMetadata.ReadAsync(control, BoundedMetadata.HtmlBytes, default));
    }

    [Fact]
    public async Task UnknownLengthMetadataStopsAtTheStreamingBudget()
    {
        using var source=new CountingMetadataStream();using var content=new StreamContent(source);
        await Assert.ThrowsAsync<InvalidDataException>(()=>BoundedMetadata.ReadAsync(content,BoundedMetadata.HtmlBytes,default));
        Assert.InRange(source.BytesRead,BoundedMetadata.HtmlBytes,BoundedMetadata.HtmlBytes+1);
    }

    private sealed class CountingMetadataStream:Stream
    {
        public int BytesRead;
        public override bool CanRead=>true;public override bool CanSeek=>false;public override bool CanWrite=>false;
        public override long Length=>throw new NotSupportedException();public override long Position{get=>throw new NotSupportedException();set=>throw new NotSupportedException();}
        public override int Read(byte[] buffer,int offset,int count){Array.Fill(buffer,(byte)'x',offset,count);BytesRead+=count;return count;}
        public override ValueTask<int> ReadAsync(Memory<byte> buffer,CancellationToken token=default){buffer.Span.Fill((byte)'x');BytesRead+=buffer.Length;return ValueTask.FromResult(buffer.Length);}
        public override void Flush()=>throw new NotSupportedException();public override long Seek(long offset,SeekOrigin origin)=>throw new NotSupportedException();
        public override void SetLength(long length)=>throw new NotSupportedException();public override void Write(byte[] buffer,int offset,int count)=>throw new NotSupportedException();
    }

    private sealed class Handler(Func<HttpRequestMessage,HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token) => Task.FromResult(respond(request));
    }

    [Theory]
    [InlineData("https://source.invalid/public/collect", null)]
    [InlineData("https://source.invalid/private/next", "session=canary")]
    [InlineData("https://cdn.invalid/next", "cdn=permitted")]
    public async Task RedirectsReevaluateCookieScopeIncludingSameHostPaths(string redirect, string? expected)
    {
        int requests=0;
        using var client=new HttpClient(new DownloadRedirectHandler(new Handler(request=>{
            requests++;
            if(requests==1) return new(HttpStatusCode.Found){Headers={Location=new Uri(redirect)}};
            Assert.Equal(expected,request.Headers.TryGetValues("Cookie",out var values)?string.Join("; ",values):null);
            return new(HttpStatusCode.OK){Content=new StringContent("control")};
        })));
        using var original=new HttpRequestMessage(HttpMethod.Get,"https://source.invalid/private/list");
        DownloadRedirectHandler.ApplyCookies(original,Jar,original.RequestUri!.AbsoluteUri);
        using var response=await client.SendAsync(original);Assert.Equal(2,requests);
    }

    [Fact]
    public async Task PairedAudioDoesNotRebindTheVideoRawCookieSource()
    {
        int requests=0;string path=Path.GetTempFileName();
        using var client=new HttpClient(new Handler(request=>{
            requests++;Assert.False(request.Headers.Contains("Cookie"));
            return new(HttpStatusCode.OK){Content=new ByteArrayContent(new byte[]{1,2,3})};
        }));
        try
        {
            var worker=new SegmentWorker(client,"https://audio.invalid/file",path,1,0,-1,cookies:"session=canary",credentialSourceUrl:"https://video.invalid/file");
            await worker.ExecuteAsync(default);Assert.Equal(1,requests);
        }
        finally{File.Delete(path);}
    }
}
