using System.Diagnostics;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class MediaTransportSecurityTests
{
    [Fact]
    public async Task NestedHlsResourcesKeepCookieScopeAndSecretsOutOfArguments()
    {
        const string jar="# Netscape HTTP Cookie File\nsource.invalid\tFALSE\t/private\tTRUE\t0\tsession\tcanary-secret\ncdn.invalid\tFALSE\t/\tTRUE\t0\tcdn\tallowed\n";
        var requests = new List<(string Url,string? Cookie,string? Range)>();
        using var transport = new Handler(request => {
            Assert.Equal("https://player.invalid",request.Headers.GetValues("Origin").Single());
            requests.Add((request.RequestUri!.AbsoluteUri,request.Headers.TryGetValues("Cookie",out var values)?string.Join("; ",values):null,request.Headers.Range?.ToString()));
            return new(HttpStatusCode.PartialContent){Content=new ByteArrayContent(new byte[]{1,2,3})};
        });
        await using var proxy = new MediaTransportProxy("https://source.invalid/private/index.m3u8",jar,"https://player.invalid/watch",null,default,transport);
        string input=proxy.AddInput("https://source.invalid/private/index.m3u8","#EXTM3U\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:1,\nhttps://evil.invalid/part.ts\n#EXTINF:1,\nhttps://cdn.invalid/part.ts\n#EXT-X-ENDLIST");
        using var client = new HttpClient(new SocketsHttpHandler{UseProxy=false});
        string manifest=await client.GetStringAsync(input);
        string init=Regex.Match(manifest,"URI=\"([^\"]+)\"").Groups[1].Value;
        using var range=new HttpRequestMessage(HttpMethod.Get,init);range.Headers.Range=new(0,2);
        using var result=await client.SendAsync(range);Assert.Equal(HttpStatusCode.PartialContent,result.StatusCode);
        foreach(string resource in manifest.Split('\n').Where(x=>x.StartsWith("http")))
            using (await client.GetAsync(resource)) {}
        Assert.Equal("session=canary-secret",requests[0].Cookie);Assert.Equal("bytes=0-2",requests[0].Range);
        Assert.Null(requests[1].Cookie);Assert.Equal("cdn=allowed",requests[2].Cookie);
        var start=new ProcessStartInfo("ffmpeg");proxy.ConfigureInput(start,input);
        Assert.DoesNotContain("canary-secret",string.Join(" ",start.ArgumentList));
        Assert.DoesNotContain("source.invalid",string.Join(" ",start.ArgumentList));
        Assert.DoesNotContain("-headers",start.ArgumentList);
        string signed=proxy.AddInput("https://cdn.invalid/file.m3u8?token=signed-canary");
        proxy.ConfigureInput(start,signed);
        Assert.DoesNotContain("signed-canary",string.Join(" ",start.ArgumentList));
    }

    [Fact]
    public async Task DashTemplatesAndBaseUrlsResolveThroughTheSameTransport()
    {
        Uri? observed=null;
        using var handler=new Handler(request=> {observed=request.RequestUri;return new(HttpStatusCode.OK){Content=new ByteArrayContent(new byte[]{1})};});
        await using var proxy=new MediaTransportProxy("https://origin.invalid/movie.mpd",null,null,null,default,handler);
        string xml=proxy.RewriteManifest("<MPD><BaseURL>https://cdn.invalid/root/</BaseURL><Period><AdaptationSet><Representation id=\"v\"><BaseURL>video/</BaseURL><SegmentTemplate initialization=\"init.mp4?sig=1\" media=\"$RepresentationID$-$Number%05d$.m4s?sig=1\"/></Representation></AdaptationSet></Period></MPD>",new Uri("https://origin.invalid/movie.mpd"));
        var document=System.Xml.Linq.XDocument.Parse(xml);
        string template=document.Descendants("SegmentTemplate").Single().Attribute("media")!.Value;
        // System.Uri escapes dollar signs in some forms; the DASH placeholders must survive.
        Assert.Contains("$RepresentationID$",template);Assert.Contains("$Number%05d$",template);
        using var client=new HttpClient(new SocketsHttpHandler{UseProxy=false});
        using var response=await client.GetAsync(template.Replace("$RepresentationID$","v").Replace("$Number%05d$","00001"));
        Assert.Equal("https://cdn.invalid/root/video/v-00001.m4s?sig=1",observed!.AbsoluteUri);
        Assert.Throws<XmlException>(()=>proxy.RewriteManifest("<!DOCTYPE MPD [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><MPD>&x;</MPD>",new Uri("https://origin.invalid/movie.mpd")));
    }

    [Fact]
    public async Task ProxyRejectsAbsoluteExternalRequestsEvenWhenUsedAsAForwardProxy()
    {
        int requests=0;
        using var handler=new Handler(_=>{requests++;return new(HttpStatusCode.OK);});
        await using var proxy=new MediaTransportProxy("https://origin.invalid/file",null,null,null,default,handler);
        using var client=new HttpClient(new SocketsHttpHandler{Proxy=new WebProxy(proxy.Address),UseProxy=true});
        using var response=await client.GetAsync("http://evil.invalid/file");
        Assert.Equal(HttpStatusCode.BadGateway,response.StatusCode);Assert.Equal(0,requests);
        Assert.Throws<InvalidDataException>(()=>proxy.AddInput("file:///etc/passwd"));
    }

    [Fact]
    public async Task MediaTransportRejectsUntrustedTlsCertificates()
    {
        using var key=RSA.Create(2048);
        var request=new CertificateRequest("CN=localhost",key,HashAlgorithmName.SHA256,RSASignaturePadding.Pkcs1);
        using var certificate=request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1),DateTimeOffset.UtcNow.AddHours(1));
        var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();
        using var budget=new CancellationTokenSource(TimeSpan.FromSeconds(8));
        Task server=Task.Run(async()=>{
            using var connection=await listener.AcceptTcpClientAsync(budget.Token);
            await using var tls=new SslStream(connection.GetStream());
            try{await tls.AuthenticateAsServerAsync(new SslServerAuthenticationOptions{ServerCertificate=certificate},budget.Token);}
            catch(AuthenticationException){}
            catch(IOException){}
        });
        try
        {
            await using var proxy=new MediaTransportProxy("https://127.0.0.1/file",null,null,null,budget.Token);
            string input=proxy.AddInput($"https://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/file");
            using var client=new HttpClient(new SocketsHttpHandler{UseProxy=false});
            using var response=await client.GetAsync(input,budget.Token);
            Assert.Equal(HttpStatusCode.BadGateway,response.StatusCode);await server;
        }
        finally{listener.Stop();}
    }

    private sealed class Handler(Func<HttpRequestMessage,HttpResponseMessage> respond):HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token)=>Task.FromResult(respond(request));
    }

    [HlsPipelineTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RealFfmpegReadsDashTemplatesThroughTheControlledTransport(bool timeline)
    {
        string ffmpeg=DownloadEngine.ResolveFfmpegPath()??throw new InvalidOperationException("Verified FFmpeg required.");
        string directory=Path.Combine(Path.GetTempPath(),"smartdm-dash-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);
        using var budget=new CancellationTokenSource(TimeSpan.FromSeconds(20));
        async Task Run(ProcessStartInfo start)
        {
            start.UseShellExecute=false;start.CreateNoWindow=true;start.RedirectStandardError=true;start.WorkingDirectory=directory;
            using var process=Process.Start(start)!;Task<string> error=ProcessOutput.ReadTailAsync(process.StandardError,budget.Token);
            try{await process.WaitForExitAsync(budget.Token);Assert.True(process.ExitCode==0,await error);}
            finally{if(!process.HasExited)process.Kill(true);}
        }
        try
        {
            var generate=new ProcessStartInfo(ffmpeg);
            foreach(string argument in new[]{"-y","-f","lavfi","-i","testsrc2=size=160x90:rate=24","-f","lavfi","-i","sine=frequency=440:sample_rate=48000","-t","1","-c:v","libx264","-preset","ultrafast","-c:a","aac","-f","dash","-use_template","1","-use_timeline",timeline?"1":"0","movie.mpd"})generate.ArgumentList.Add(argument);
            await Run(generate);
            using var handler=new Handler(request=>{
                string file=Path.Combine(directory,Path.GetFileName(request.RequestUri!.AbsolutePath));
                return new(HttpStatusCode.OK){Content=new ByteArrayContent(File.ReadAllBytes(file))};
            });
            await using var proxy=new MediaTransportProxy("https://cdn.invalid/movie.mpd?token=canary",null,null,null,budget.Token,handler);
            var consume=new ProcessStartInfo(ffmpeg);consume.ArgumentList.Add("-y");
            proxy.ConfigureInput(consume,proxy.AddInput("https://cdn.invalid/movie.mpd?token=canary"));
            foreach(string argument in new[]{"-map","0:v:0","-map","0:a:0","-c","copy","result.mp4"})consume.ArgumentList.Add(argument);
            Assert.DoesNotContain("canary",string.Join(" ",consume.ArgumentList));await Run(consume);
            var decode=new ProcessStartInfo(ffmpeg);foreach(string argument in new[]{"-i","result.mp4","-f","null","-"})decode.ArgumentList.Add(argument);
            await Run(decode);
        }
        finally{Directory.Delete(directory,true);}
    }

    [Theory]
    [InlineData("URI=\"tcp://127.0.0.1:9000\"")]
    [InlineData(" URI=\"tcp://127.0.0.1:9000\"")]
    [InlineData("\tURI = \"file:///private/key\"")]
    public async Task HlsUriAttributesCannotEscapeTheTransportThroughAlternateSpacing(string attribute)
    {
        await using var proxy=new MediaTransportProxy("https://cdn.invalid/list",null,null,null,default);
        string text="#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,"+attribute+"\n#EXTINF:1,\npart.ts\n#EXT-X-ENDLIST";
        Assert.Throws<InvalidDataException>(()=>proxy.RewriteManifest(text,new Uri("https://cdn.invalid/list")));
        string control=proxy.RewriteManifest(text.Replace("tcp://127.0.0.1:9000","https://cdn.invalid/key").Replace("file:///private/key","https://cdn.invalid/key"),new Uri("https://cdn.invalid/list"));
        Assert.Contains(proxy.Address,control);
    }
}
