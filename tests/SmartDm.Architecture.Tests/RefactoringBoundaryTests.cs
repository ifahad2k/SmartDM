using System.Net;
using SmartDm.Desktop.Avalonia;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.ViewModels;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class RefactoringBoundaryTests
{
    [Fact]
    public async Task PlaylistReaderCanResolveChildrenWithoutATransferEngine()
    {
        const string jar="# Netscape HTTP Cookie File\norigin.invalid\tFALSE\t/private\tTRUE\t0\tsession\tcanary\n";
        var requested=new List<string>();
        using var client=new HttpClient(new DownloadRedirectHandler(new Handler(request=>{
            requested.Add(request.RequestUri!.AbsoluteUri);
            bool master=request.RequestUri.Host=="origin.invalid";
            Assert.Equal(master,request.Headers.Contains("Cookie"));
            string text=master?"#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080\nhttps://cdn.invalid/video/list.m3u8\n":
                "#EXTM3U\n#EXTINF:6,\npart.ts\n#EXT-X-ENDLIST\n";
            return new(HttpStatusCode.OK){RequestMessage=request,Content=new StringContent(text)};
        })));
        var result=await new HlsPlaylistReader(client).ReadAsync("https://origin.invalid/private/master.m3u8",null,null,jar,default);
        Assert.NotNull(result);Assert.Null(result.ErrorMessage);
        Assert.Equal("https://cdn.invalid/video/part.ts",Assert.Single(result.SegmentUrls));
        Assert.Equal(6,result.TotalDuration);Assert.Equal(2,requested.Count);
    }

    [Fact]
    public void JournalComponentKeepsExistingFacadeAndIdentityValidation()
    {
        string directory=Path.Combine(Path.GetTempPath(),"smartdm-journal-boundary-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);
        try
        {
            DownloadJournalStore.SaveSegmentJournal(directory,new[]{new SegmentProgress{SegmentIndex=1,StartByte=0,EndByte=9}},"one","https://cdn.invalid/file",10);
            Assert.Equal(DownloadEngine.GetSegmentJournalPath(directory),DownloadJournalStore.GetSegmentJournalPath(directory));
            var loaded=DownloadEngine.LoadAndValidateJournal(directory,"one","https://cdn.invalid/file",10);
            Assert.Equal(9,Assert.Single(loaded!).EndByte);
            Assert.Null(DownloadJournalStore.LoadAndValidateJournal(directory,"different","https://cdn.invalid/file",10));
        }
        finally{Directory.Delete(directory,true);}
    }

    [Fact]
    public void CompositionPreservesSuppliedServicesAndRequiresExplicitViewModelDependencies()
    {
        var repository=new InMemoryDatabaseRepository();var scanner=new DirectCleanSafetyScanner();
        var engine=new DownloadEngine(repository,scanner);var settings=new InMemorySettingsService();var probe=new HttpProbeService();
        var vm=DesktopComposition.CreateMainViewModel(engine:engine,repository:repository,probeService:probe,safetyScanner:scanner,settingsService:settings,isDemoMode:true);
        Assert.Same(engine,vm.Engine);Assert.Same(probe,vm.ProbeService);Assert.Same(settings,vm.SettingsService);
        Assert.NotEmpty(vm.Downloads);
        var parameters=Assert.Single(typeof(MainViewModel).GetConstructors()).GetParameters();
        Assert.All(parameters.Where(p=>p.ParameterType!=typeof(bool)),parameter=>Assert.False(parameter.IsOptional));
    }

    [Fact]
    public void LookupDistinguishesDifferentStreamResourcesAndIgnoresTerminalDownloads()
    {
        var active=new DownloadModel{Url="https://cdn.invalid/stream?id=one",Status=DownloadStatus.Active};
        var completed=new DownloadModel{Url="https://cdn.invalid/file.zip",Status=DownloadStatus.Completed};
        Assert.Null(DownloadLookup.FindActiveByUrl(new[]{active,completed},"https://cdn.invalid/stream?id=two"));
        Assert.Null(DownloadLookup.FindActiveByUrl(new[]{completed},completed.Url));
        Assert.Same(active,DownloadLookup.FindActiveByUrl(new[]{active},active.Url));
    }

    private sealed class Handler(Func<HttpRequestMessage,HttpResponseMessage> respond):HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token)=>Task.FromResult(respond(request));
    }
}
