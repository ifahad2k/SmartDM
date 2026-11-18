using System.Net;
using System.Net.Http.Headers;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class ProgressiveMetadataTests
{
    [Theory]
    [InlineData(true, true, false)]
    [InlineData(true, false, false)]
    [InlineData(false, false, false)]
    [InlineData(false, false, true)]
    public async Task BrowserCaptureProbesLengthAndUsesOnlyVerifiedParallelism(bool ranges, bool headLength, bool knownSize)
    {
        byte[] bytes = new byte[2 * 1024 * 1024]; new Random(42).NextBytes(bytes);
        int active = 0, peak = 0, workerRanges = 0;
        using var client = new HttpClient(new Handler(async (request, token) =>
        {
            if (request.Method == HttpMethod.Head)
            {
                var head = new HttpResponseMessage(HttpStatusCode.OK) {Content = new ByteArrayContent([])};
                if (headLength) head.Content.Headers.ContentLength = bytes.Length;
                return head; // Accept-Ranges deliberately omitted.
            }
            var range = request.Headers.Range?.Ranges.Single();
            bool probe = range?.From == 0 && range.To == 0;
            if (range != null && !probe)
            {
                Interlocked.Increment(ref workerRanges);
                int count = Interlocked.Increment(ref active);
                lock (bytes) peak = Math.Max(peak, count);
                await Task.Delay(25, token);
                Interlocked.Decrement(ref active);
            }
            int start = ranges && range != null ? (int)(range.From ?? 0) : 0;
            int end = ranges && range != null ? (int)(range.To ?? bytes.Length - 1) : bytes.Length - 1;
            var response = new HttpResponseMessage(ranges && range != null ? HttpStatusCode.PartialContent : HttpStatusCode.OK)
                {Content = new ByteArrayContent(bytes[start..(end + 1)])};
            if (response.StatusCode == HttpStatusCode.PartialContent)
                response.Content.Headers.ContentRange = new ContentRangeHeaderValue(start, end, bytes.Length);
            return response;
        }));
        string directory = Path.Combine(Path.GetTempPath(), "smartdm-progressive-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var engine = new DownloadEngine(new InMemoryDatabaseRepository(), new DirectCleanSafetyScanner(), client);
        var model = new DownloadModel {Url = "https://cdn.invalid/file.bin", Title = "Capture", TotalBytes = knownSize ? bytes.Length : -1,
            ParallelThreads = 8, SavePath = Path.Combine(directory, "file.bin")};
        try
        {
            await engine.StartDownloadAsync(model);
            using var budget = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            while (model.Status is not (DownloadStatus.Completed or DownloadStatus.Failed)) await Task.Delay(20, budget.Token);
            Assert.Equal(DownloadStatus.Completed, model.Status);
            Assert.Equal(bytes.Length, model.TotalBytes);
            Assert.Equal(ranges, model.SupportsRanges);
            Assert.Equal(bytes, await File.ReadAllBytesAsync(model.SavePath));
            if (ranges) { Assert.True(workerRanges > 1); Assert.True(peak > 1); }
            else { Assert.Equal(0, workerRanges); Assert.Equal(1, model.ParallelThreads); }
        }
        finally { await engine.PauseDownloadAsync(model.Id); Directory.Delete(directory, true); }
    }

    [Fact]
    public async Task SequentialFallbackLearnsResponseLengthAndRejectsTruncation()
    {
        string directory = Path.Combine(Path.GetTempPath(), "smartdm-length-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        using var client = new HttpClient(new Handler((_, _) =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK) {Content = new ByteArrayContent(new byte[50])};
            response.Content.Headers.ContentLength = 100;
            return Task.FromResult(response);
        }));
        try
        {
            var worker = new SegmentWorker(client, "https://cdn.invalid/file.bin", Path.Combine(directory, "part"), 1, 0, -1);
            await Assert.ThrowsAsync<EndOfStreamException>(() => worker.ExecuteAsync(CancellationToken.None));
            Assert.Equal(100, worker.ObservedTotalBytes);
            Assert.False(worker.Progress.IsCompleted);
            Assert.NotNull(worker.LastError);
        }
        finally { Directory.Delete(directory, true); }
    }

    private sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) => respond(request, token);
    }
}
