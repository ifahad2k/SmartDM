using System.Net;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using Microsoft.Data.Sqlite;
using SmartDm.Desktop.Avalonia;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class StagingDiskUsageTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "smartdm-disk-fix-" + Guid.NewGuid().ToString("N"));
    private readonly Xunit.Abstractions.ITestOutputHelper _output;
    public StagingDiskUsageTests(Xunit.Abstractions.ITestOutputHelper output) { _output=output; Directory.CreateDirectory(_root); }

    [Fact]
    public async Task PreviewControlsAndMonitorCannotReachTheRealEngineOrHistory()
    {
        int requests = 0;
        using var client = new HttpClient(new Handler(_ => { requests++; throw new InvalidOperationException("Network must stay unused."); }));
        var repository = new InMemoryDatabaseRepository();
        var engine = new DownloadEngine(repository, new DirectCleanSafetyScanner(), client);
        var vm = DesktopComposition.CreateMainViewModel(engine: engine, repository: repository, isDemoMode: true);
        foreach (var sample in vm.Downloads)
        {
            Assert.True(sample.IsPreview);
            sample.Pause(); sample.Resume(); sample.Cancel();
            Assert.Equal(PreviewTransfers.DisabledMessage, sample.StatusDetail);
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.StartDownloadAsync(sample));
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.ResumeDownloadAsync(sample.Id, sample));
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.MoveDownloadAsync(sample, _root, "changed.bin"));
        }
        Assert.Equal(0, requests);
        Assert.Empty(await repository.GetAllDownloadsAsync());
        var added = new DownloadModel {Title="Preview add",Url="https://unused.invalid/file",SavePath=Path.Combine(_root,"added.bin")};
        vm.AddNewDownload(added);
        Assert.True(added.IsPreview);
        Assert.Empty(await repository.GetAllDownloadsAsync());
        Assert.False(File.Exists(added.SavePath));
        string realFile=Path.Combine(_root,"keep-user-data.bin");
        await File.WriteAllTextAsync(realFile,"genuine user file");
        var preview=vm.Downloads.First();preview.SavePath=realFile;
        await vm.DeleteDownloadAsync(preview,deleteFileOnDisk:true);
        Assert.Equal("genuine user file",await File.ReadAllTextAsync(realFile));
        Assert.DoesNotContain(preview,vm.Downloads);
        await Assert.ThrowsAsync<InvalidOperationException>(()=>DownloadDestinationService.DeleteConfirmedFileAsync(preview));
    }

    [Fact]
    public async Task DefaultPreviewEngineRejectsEvenAnUnmarkedRealDownload()
    {
        var vm = DesktopComposition.CreateMainViewModel(repository:new InMemoryDatabaseRepository(),isDemoMode:true);
        await Assert.ThrowsAsync<InvalidOperationException>(()=>vm.Engine.StartDownloadAsync(new DownloadModel{Url="https://cdn.invalid/file"}));
    }

    [Fact]
    public async Task PreviewCannotBePersistedEvenWhenRepositoryIsCalledDirectly()
    {
        string database=Path.Combine(_root,"must-not-exist.db");
        var repository=new SqliteDatabaseRepository(database);
        await Assert.ThrowsAsync<InvalidOperationException>(()=>repository.SaveDownloadAsync(new DownloadModel{IsPreview=true}));
        Assert.False(File.Exists(database));
    }

    [Fact]
    public async Task HistoricalMockRowsCannotResumeAndFilenameAloneDoesNotBlockRealFiles()
    {
        string database=Path.Combine(_root,"history.db");
        var repository=new SqliteDatabaseRepository(database);
        await repository.SaveDownloadAsync(new DownloadModel{Id="legacy",Title="Legacy",Url="https://cdn.invalid/file"});
        using(var connection=new SqliteConnection("Data Source="+database))
        {
            await connection.OpenAsync();using var command=connection.CreateCommand();
            command.CommandText="UPDATE downloads SET url=@url,total_bytes=41768878080,etag=@etag,status=4 WHERE id='legacy'";
            command.Parameters.AddWithValue("@url","https://huggingface.co/models/AI_LLM_Weights_70B_Q4_K_M_Instruct_v2.gguf.zip");
            command.Parameters.AddWithValue("@etag","\"5f8b2a19-9b98020\"");await command.ExecuteNonQueryAsync();
        }
        var restored=Assert.Single(await repository.GetAllDownloadsAsync());
        Assert.True(restored.IsPreview);Assert.Equal(DownloadStatus.Failed,restored.Status);
        var engine=new DownloadEngine(repository,new DirectCleanSafetyScanner());
        await Assert.ThrowsAsync<InvalidOperationException>(()=>engine.ResumeDownloadAsync(restored.Id));
        restored.ETag="real-server-validator";restored.IsPreview=false;
        Assert.False(PreviewTransfers.IsPreview(restored));
    }

    [Fact]
    public async Task StagingStartsEmptyAndOutOfOrderWritesConsumeOnlyWrittenExtents()
    {
        string path=Path.Combine(_root,"growing.bin");
        bool sparse=await StagingFile.PrepareAsync(path,1024L*1024*1024+3);
        Assert.Equal(0,new FileInfo(path).Length);
        if(OperatingSystem.IsWindows()) Assert.True(sparse,"The Windows fixture volume must support sparse files.");
        using(var file=new FileStream(path,FileMode.Open,FileAccess.Write,FileShare.ReadWrite))
        {
            file.Position=1024L*1024*1024; // one GiB logical hole, never a large byte buffer
            file.Write(new byte[]{1,2,3});file.Flush(true);
        }
        if(OperatingSystem.IsWindows())
        {
            uint low=GetCompressedFileSize(path,out uint high);
            Assert.NotEqual(uint.MaxValue,low);
            long allocated=((long)high<<32)|low;
            _output.WriteLine($"Logical file length: {new FileInfo(path).Length}; physical bytes allocated: {allocated}");
            Assert.InRange(allocated,1,1024*1024);
        }
    }

    [Fact]
    public async Task PreparationPreservesPartialsAndOnlyShrinksAnOversizedTail()
    {
        string path=Path.Combine(_root,"partial.bin");
        await File.WriteAllBytesAsync(path,new byte[]{1,2,3,4,5});
        await StagingFile.PrepareAsync(path,41768878080L);
        Assert.Equal(new byte[]{1,2,3,4,5},await File.ReadAllBytesAsync(path));
        await StagingFile.PrepareAsync(path,3);
        Assert.Equal(new byte[]{1,2,3},await File.ReadAllBytesAsync(path));
    }

    [Fact]
    public async Task NonSparseRetryCannotSkipAnUnreceivedPrefixAndAllocateAHole()
    {
        const int offset=4*1024*1024;string path=Path.Combine(_root,"no-holes.bin");
        using var client=new HttpClient(new Handler(_=>{
            var content=new ByteArrayContent(new byte[]{7});
            content.Headers.ContentRange=new ContentRangeHeaderValue(offset,offset,offset+1);
            return new(HttpStatusCode.PartialContent){Content=content};
        }));
        var worker=new SegmentWorker(client,"https://cdn.invalid/file",path,1,0,offset,expectedTotalBytes:offset+1,allowSparseWrites:false);
        var queue=new System.Collections.Concurrent.ConcurrentQueue<ChunkRange>(new[]{new ChunkRange(offset,offset)});
        await worker.ExecuteChunkQueueAsync(queue,default);
        Assert.NotNull(worker.LastError);Assert.Equal(0,new FileInfo(path).Length);
    }

    [Fact]
    public void NewBuildsShareOneRootAndLegacyPartialsAreResumedWithoutCopying()
    {
        string root=Path.Combine(_root,"profile","staging"),old=Path.Combine(_root,"Debug",".temp"),oldDirectory=Path.Combine(old,"dl_existing");
        Directory.CreateDirectory(oldDirectory);File.WriteAllText(Path.Combine(oldDirectory,"segments.journal"),"preserve me");
        Assert.Equal(oldDirectory,DownloadStaging.ResolveDirectory("existing",root,new[]{old}));
        Assert.False(Directory.Exists(root));
        string debug=DownloadStaging.ResolveDirectory("new",root,new[]{old});
        string release=DownloadStaging.ResolveDirectory("new",root,Array.Empty<string>());
        Assert.Equal(debug,release);Assert.StartsWith(root,debug);
        Assert.Equal("preserve me",File.ReadAllText(Path.Combine(oldDirectory,"segments.journal")));
    }

    [Fact]
    public async Task HugeAdvertisedLengthDoesNotReserveTheWholeFileBeforeReceivingData()
    {
        const long total=41768878080L;
        var started=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var client=new HttpClient(new Handler(request=>{
            var range=Assert.Single(request.Headers.Range!.Ranges);
            started.TrySetResult();
            var content=new StreamContent(new StalledStream());
            content.Headers.ContentLength=range.To!.Value-range.From!.Value+1;
            content.Headers.ContentRange=new ContentRangeHeaderValue(range.From.Value,range.To.Value,total);
            return new(HttpStatusCode.PartialContent){Content=content};
        }));
        var model=new DownloadModel{Url="https://large.invalid/file",Title="Real large file",SavePath=Path.Combine(_root,"large.bin"),TotalBytes=total,SupportsRanges=true,ParallelThreads=4};
        var engine=new DownloadEngine(new InMemoryDatabaseRepository(),new DirectCleanSafetyScanner(),client);
        try
        {
            await engine.StartDownloadAsync(model);await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
            string path=Path.Combine(DownloadStaging.GetDownloadStagingDirectory(model.Id),"large.bin");
            Assert.Equal(0,new FileInfo(path).Length);
        }
        finally {await engine.PauseDownloadAsync(model.Id);DownloadStaging.CleanupStagingDirectory(DownloadStaging.GetDownloadStagingDirectory(model.Id));}
    }

    [Fact]
    public async Task NonSparseFallbackUsesOneWorkerAndCompletesWithExactBytes()
    {
        byte[] payload=new byte[2*1024*1024];new Random(17).NextBytes(payload);
        await using var server=new TestHttpServer(payload);
        async Task<bool> NoSparse(string path,long expectedLength,CancellationToken token)
        { using(var file=new FileStream(path,FileMode.OpenOrCreate,FileAccess.Write)){} await Task.Yield();return false; }
        var engine=new DownloadEngine(new InMemoryDatabaseRepository(),new DirectCleanSafetyScanner(),stagingFilePreparation:NoSparse);
        var model=new DownloadModel{Url=server.BaseUrl+"/file.bin",Title="Fallback",SavePath=Path.Combine(_root,"control.bin"),TotalBytes=payload.Length,SupportsRanges=true,ParallelThreads=8};
        try
        {
            await engine.StartDownloadAsync(model);
            using var budget=new CancellationTokenSource(TimeSpan.FromSeconds(12));
            while(model.Status is not(DownloadStatus.Completed or DownloadStatus.Failed)) await Task.Delay(25,budget.Token);
            Assert.Equal(DownloadStatus.Completed,model.Status);Assert.Equal(1,model.ParallelThreads);
            Assert.Equal(payload,await File.ReadAllBytesAsync(model.SavePath));
        }
        finally{await engine.PauseDownloadAsync(model.Id);}
    }

    private sealed class Handler(Func<HttpRequestMessage,HttpResponseMessage> respond):HttpMessageHandler
    { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token)=>Task.FromResult(respond(request)); }

    private sealed class StalledStream:Stream
    {
        public override bool CanRead=>true;public override bool CanWrite=>false;public override bool CanSeek=>false;
        public override long Length=>throw new NotSupportedException();public override long Position{get=>0;set=>throw new NotSupportedException();}
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer,CancellationToken token=default){await Task.Delay(Timeout.Infinite,token);return 0;}
        public override int Read(byte[] b,int o,int c)=>throw new NotSupportedException();public override void Flush()=>throw new NotSupportedException();
        public override long Seek(long o,SeekOrigin origin)=>throw new NotSupportedException();public override void SetLength(long v)=>throw new NotSupportedException();public override void Write(byte[] b,int o,int c)=>throw new NotSupportedException();
    }

    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true,EntryPoint="GetCompressedFileSizeW")]
    private static extern uint GetCompressedFileSize(string path,out uint high);

    public void Dispose(){SqliteConnection.ClearAllPools();Directory.Delete(_root,true);}
}
