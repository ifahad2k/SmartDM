using System.Buffers.Binary;
using System.Diagnostics;
using System.IO.Pipes;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class BrowserBoundaryTests
{
    [Fact]
    public async Task FrameAndBodyBudgetsRejectBeforeAcceptingPartialMessages()
    {
        var prefix = new byte[4]; BinaryPrimitives.WriteUInt32LittleEndian(prefix, uint.MaxValue);
        await Assert.ThrowsAsync<InvalidDataException>(() => BrowserProtocol.ReadFrameAsync(new MemoryStream(prefix),1024,default));
        await Assert.ThrowsAsync<EndOfStreamException>(() => BrowserProtocol.ReadFrameAsync(new MemoryStream(new byte[]{4,0,0,0,1}),1024,default));
        using var body = new MemoryStream(new byte[BrowserProtocol.MaximumRequestBytes+1]);
        await Assert.ThrowsAsync<InvalidDataException>(() => BrowserProtocol.ReadBodyAsync(body,-1,default));
        using var malformed = JsonDocument.Parse("{\"protocolVersion\":1,\"type\":\"EXECUTE\"}");
        Assert.Throws<InvalidDataException>(() => BrowserProtocol.Validate(malformed.RootElement));
    }

    [Theory]
    [InlineData("invalid", "chrome-extension://knldjnnmkkebefogdbmggjijknmjeaoh/",false)]
    [InlineData("token", "https://evil.invalid/",false)]
    [InlineData("token", "chrome-extension://knldjnnmkkebefogdbmggjijknmjeaoh/",true)]
    public async Task NativeBridgeRequiresBothPinnedOriginAndPrivateToken(string token,string origin,bool accepted)
    {
        string name="smartdm-test-"+Guid.NewGuid().ToString("N"); int dispatched=0;
        await using var bridge = new NativeMessagingBridge(name,"token", (_,_) => {dispatched++;return Task.FromResult(Encoding.UTF8.GetBytes("{\"status\":\"ok\"}"));});
        using var pipe = new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous|PipeOptions.CurrentUserOnly);
        using var budget = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await pipe.ConnectAsync(budget.Token);
        byte[] envelope = JsonSerializer.SerializeToUtf8Bytes(new {origin,token,payload=new{protocolVersion=1,type="SHOW_WINDOW"}});
        await BrowserProtocol.WriteFrameAsync(pipe,envelope,BrowserProtocol.MaximumRequestBytes,budget.Token);
        byte[] reply = await BrowserProtocol.ReadFrameAsync(pipe,BrowserProtocol.MaximumResponseBytes,budget.Token);
        Assert.Equal(accepted?1:0,dispatched);
        Assert.Contains(accepted?"ok":"error",Encoding.UTF8.GetString(reply));
    }

    [Fact]
    public async Task HttpBridgeRejectsLocalhostWithoutTokenAndForeignOrigins()
    {
        var ipc = new LocalIpcService(); await ipc.StartAsync();
        try
        {
            string[] descriptor=await File.ReadAllLinesAsync(Path.Combine(AppProfile.DirectoryPath,"ipc.info"));
            using var client=new HttpClient(); string address=$"http://127.0.0.1:{descriptor[0]}/api/browser";
            using var unauthorized=await client.PostAsync(address,new StringContent("{}"));
            Assert.Equal(HttpStatusCode.Unauthorized,unauthorized.StatusCode);
            using var foreign=new HttpRequestMessage(HttpMethod.Post,address){Content=new StringContent("{}")};
            foreign.Headers.Authorization=new AuthenticationHeaderValue("Bearer",descriptor[1]);foreign.Headers.Add("Origin","https://evil.invalid");
            using var rejected=await client.SendAsync(foreign); Assert.Equal(HttpStatusCode.Forbidden,rejected.StatusCode);
            bool restored=false;ipc.WindowRestoreRequested+=()=>restored=true;
            using var control=new HttpRequestMessage(HttpMethod.Post,address){Content=new StringContent("{\"protocolVersion\":1,\"type\":\"SHOW_WINDOW\"}")};
            control.Headers.Authorization=new AuthenticationHeaderValue("Bearer",descriptor[1]);control.Headers.Add("X-SmartDM-Protocol","1");
            using var result=await client.SendAsync(control); Assert.Equal(HttpStatusCode.OK,result.StatusCode);Assert.True(restored);
            Assert.False(result.Headers.Contains("Access-Control-Allow-Origin"));
        }
        finally {ipc.Stop();}
    }

    [Fact]
    public async Task NativeHostProcessUsesCleanFramedStdoutAndThePrivateBridge()
    {
        var ipc=new LocalIpcService();await ipc.StartAsync();
        try
        {
            bool restored=false;ipc.WindowRestoreRequested+=()=>restored=true;
            string app=Path.Combine(AppContext.BaseDirectory,OperatingSystem.IsWindows()?"SmartDm.Desktop.Avalonia.exe":"SmartDm.Desktop.Avalonia");
            var start=new ProcessStartInfo(app){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
            start.ArgumentList.Add("--browser-native-host");start.ArgumentList.Add("chrome-extension://knldjnnmkkebefogdbmggjijknmjeaoh/");
            using var process=Process.Start(start)!;using var budget=new CancellationTokenSource(TimeSpan.FromSeconds(8));
            await BrowserProtocol.WriteFrameAsync(process.StandardInput.BaseStream,Encoding.UTF8.GetBytes("{\"protocolVersion\":1,\"type\":\"SHOW_WINDOW\"}"),1024,budget.Token);
            process.StandardInput.Close();
            byte[] reply=await BrowserProtocol.ReadFrameAsync(process.StandardOutput.BaseStream,BrowserProtocol.MaximumResponseBytes,budget.Token);
            Assert.Contains("ok",Encoding.UTF8.GetString(reply));await process.WaitForExitAsync(budget.Token);
            Assert.Equal(0,process.ExitCode);Assert.True(restored);Assert.Equal("",await process.StandardOutput.ReadToEndAsync(budget.Token));
        }
        finally{ipc.Stop();}
    }

    [Fact]
    public async Task NativeBridgeBoundsSlowClientsAndJoinsThemAtShutdown()
    {
        string name="smartdm-budget-"+Guid.NewGuid().ToString("N");
        var bridge=new NativeMessagingBridge(name,"token",(_,_)=>throw new InvalidOperationException());
        var clients=new List<NamedPipeClientStream>();using var budget=new CancellationTokenSource(TimeSpan.FromSeconds(8));
        try
        {
            for(int i=0;i<9;i++)
            {
                var pipe=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous|PipeOptions.CurrentUserOnly);
                clients.Add(pipe);await pipe.ConnectAsync(budget.Token);
            }
            byte[] value=new byte[1];Assert.Equal(0,await clients[^1].ReadAsync(value,budget.Token));
            await bridge.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(2));
        }
        finally{foreach(var client in clients)client.Dispose();}
    }
}
