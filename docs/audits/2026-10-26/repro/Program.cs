using System.Net;
using System.Net.Http.Headers;
using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.Models;

var root = Path.Combine(Path.GetTempPath(), "smartdm-audit-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
Console.WriteLine("Synthetic audit fixtures only; no user profile reads.");
var repoPath = Path.Combine(root, "synthetic.db");
var repo = new SqliteDatabaseRepository(repoPath);
await repo.InitializeAsync();
await repo.SaveDownloadAsync(new DownloadModel { Id="audit", Title="AUDIT_NAME_CANARY", Url="https://audit.invalid/AUDIT_URL_CANARY", Cookies="AUDIT_COOKIE_CANARY", SavePath=Path.Combine(root,"test.bin") });
using var dbRead=new FileStream(repoPath,FileMode.Open,FileAccess.Read,FileShare.ReadWrite);
using var dbMemory=new MemoryStream(); await dbRead.CopyToAsync(dbMemory);
var dbText=System.Text.Encoding.UTF8.GetString(dbMemory.ToArray());
Console.WriteLine($"DB plaintext canaries: name={dbText.Contains("AUDIT_NAME_CANARY")}, url={dbText.Contains("AUDIT_URL_CANARY")}, cookie={dbText.Contains("AUDIT_COOKIE_CANARY")}");
var settings = new SettingsService(root);
await settings.SaveAiConfigAsync(new AiConfigModel{ApiKey="AUDIT_FAKE_KEY_CANARY"});
Console.WriteLine("AI key plaintext="+File.ReadAllText(Path.Combine(root,"ai_config.json")).Contains("AUDIT_FAKE_KEY_CANARY"));

var scanner = new SafetyScannerService();
var missing = await scanner.ScanFileAsync(Path.Combine(root,"absent.bin"));
Console.WriteLine($"Missing file scanner: clean={missing.IsClean}, threat={missing.HasThreat}, detail={missing.ThreatDetails}");
var suspicious=Path.Combine(root,"audit.pdf.exe");
await File.WriteAllTextAsync(suspicious,"Harmless audit text. Not executable.");
var suspiciousResult=await scanner.ScanFileAsync(suspicious);
Console.WriteLine($"Heuristic quarantine: claimed={suspiciousResult.IsQuarantined}, originalStillExists={File.Exists(suspicious)}");

var catalog=new FileCatalogService(repoPath);
var original=Path.Combine(root,"same-name.bin"); await File.WriteAllTextAsync(original,"AAA");
await catalog.IndexFileAsync(original,"https://audit.invalid/first");
var match=await catalog.FindDuplicateAsync("https://audit.invalid/different","same-name.bin");
Console.WriteLine("Unverified filename duplicate claim="+match?.MatchReason);

using(var client=new HttpClient(new WrongRangeHandler())) {
 var target=Path.Combine(root,"range.bin");
 var worker=new SegmentWorker(client,"https://audit.invalid/file",target,1,4,7);
 await worker.ExecuteAsync(CancellationToken.None);
 Console.WriteLine($"Wrong Content-Range accepted={worker.Progress.IsCompleted && worker.LastError == null}, bytes={worker.Progress.DownloadedBytes}, actualFileHex={Convert.ToHexString(File.ReadAllBytes(target))}");
}

var socket=new System.Net.Sockets.TcpListener(IPAddress.Loopback,0); socket.Start();
var port=((IPEndPoint)socket.LocalEndpoint).Port; socket.Stop();
using var server=new HttpListener(); server.Prefixes.Add($"http://127.0.0.1:{port}/"); server.Start();
var serve=Task.Run(async()=>{
 while(server.IsListening){
  HttpListenerContext c; try{c=await server.GetContextAsync();}catch{break;}
  _=Task.Run(async()=>{try{
   if(c.Request.Url!.AbsolutePath=="/unknown-truncated.bin") {
    c.Response.SendChunked=true; c.Response.ContentType="application/octet-stream";
    await c.Response.OutputStream.WriteAsync(new byte[]{1,2,3,4});
    await c.Response.OutputStream.FlushAsync(); c.Response.Abort();
   } else {
    c.Response.ContentType="application/octet-stream"; c.Response.ContentLength64=4;
    if(c.Request.HttpMethod!="HEAD") await c.Response.OutputStream.WriteAsync(new byte[]{1,2,3,4});
    c.Response.Close();
   }
  }catch{}});
 }
});
var probe=await new HttpProbeService().ProbeUrlAsync($"http://127.0.0.1:{port}/actual-document.pdf");
Console.WriteLine($"Direct PDF URL probe filename={probe.FileName}, success={probe.IsSuccess}");
var engine=new DownloadEngine(repo,new AuditScanner());
var done=new TaskCompletionSource();
var dl=new DownloadModel{Id="audit-truncated-"+Guid.NewGuid().ToString("N"),Url=$"http://127.0.0.1:{port}/unknown-truncated.bin",Title="audit-truncated.bin",SavePath=Path.Combine(root,"truncated.bin"),TotalBytes=-1,ParallelThreads=1};
engine.DownloadCompleted+=(d,s)=>done.TrySetResult();
engine.DownloadStatusChanged+=d=>{if(d.Status==DownloadStatus.Failed)done.TrySetResult();};
await engine.StartDownloadAsync(dl);
await Task.WhenAny(done.Task,Task.Delay(15000));
Console.WriteLine($"Unknown-length aborted HTTP body: status={dl.Status}, bytes={dl.DownloadedBytes}, finalExists={File.Exists(dl.SavePath)}, detail={dl.StatusDetail}");
server.Stop(); await serve;
Console.WriteLine("Audit fixture run finished.");

class WrongRangeHandler:HttpMessageHandler {
 protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r,CancellationToken ct){
  var response=new HttpResponseMessage(HttpStatusCode.PartialContent){Content=new ByteArrayContent(new byte[]{0,1,2,3})};
  response.Content.Headers.ContentRange=new ContentRangeHeaderValue(0,3,8);
  return Task.FromResult(response);
 }
}
class AuditScanner:ISafetyScanner {
 public bool CheckRtloExploit(string s)=>false;
 public Task<string> ComputeSha256Async(string p,CancellationToken ct=default)=>Task.FromResult("audit-fixture");
 public Task<SafetyScanResult> ScanFileAsync(string p,CancellationToken ct=default)=>Task.FromResult(new SafetyScanResult{ScannerName="AUDIT FAKE SCANNER",IsClean=true});
}
