using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public class SegmentWorker
{
    private readonly HttpClient _httpClient;
    private readonly string _url;
    private readonly string _targetFilePath;
    private string? _referer;
    private readonly string? _userAgent;
    private readonly string? _cookies;
    private readonly long _expectedTotalBytes;
    private readonly string? _expectedETag;
    public SegmentProgress Progress { get; }
    public string? LastError { get; private set; }
    public ISpeedLimiter? SpeedLimiter { get; set; }

    private long _bytesSinceLastCheck;
    private Stopwatch _speedStopwatch = new();

    public SegmentWorker(
        HttpClient httpClient,
        string url,
        string targetFilePath,
        int index,
        long startByte,
        long endByte,
        long initialDownloaded = 0,
        string? referer = null,
        string? userAgent = null,
        string? cookies = null,
        ISpeedLimiter? speedLimiter = null,
        long expectedTotalBytes = 0,
        string? expectedETag = null)
    {
        _httpClient = httpClient;
        _url = url;
        _targetFilePath = targetFilePath;
        _referer = referer;
        _userAgent = userAgent;
        _cookies = cookies;
        _expectedTotalBytes = expectedTotalBytes;
        _expectedETag = expectedETag;
        SpeedLimiter = speedLimiter;

        bool completed = (endByte >= 0 && startByte + initialDownloaded > endByte);
        Progress = new SegmentProgress
        {
            SegmentIndex = index,
            StartByte = startByte,
            EndByte = endByte,
            DownloadedBytes = initialDownloaded,
            IsActive = false,
            IsCompleted = completed
        };
    }

    public async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        long currentStart = Progress.StartByte + Progress.DownloadedBytes;
        if (Progress.EndByte >= 0 && currentStart > Progress.EndByte)
        {
            Progress.IsActive = false;
            Progress.IsCompleted = true;
            return;
        }

        Progress.IsActive = true;
        _speedStopwatch.Restart();
        _bytesSinceLastCheck = 0;

        try
        {
            using var req = HttpTransferRequest.Create(HttpMethod.Get, _url);
            req.Headers.AcceptEncoding.ParseAdd("identity");

            if (!string.IsNullOrEmpty(_referer))
            {
                req.Headers.TryAddWithoutValidation("Referer", _referer);
                try { req.Headers.TryAddWithoutValidation("Origin", new Uri(_referer).GetLeftPart(UriPartial.Authority)); } catch { }
            }
            if (!string.IsNullOrEmpty(_userAgent))
            {
                req.Headers.TryAddWithoutValidation("User-Agent", _userAgent);
            }
            if (!string.IsNullOrEmpty(_cookies))
            {
                req.Headers.TryAddWithoutValidation("Cookie", _cookies);
            }

            if (Progress.EndByte >= 0)
            {
                req.Headers.Range = new RangeHeaderValue(currentStart, Progress.EndByte);
            }
            else if (currentStart > 0)
            {
                req.Headers.Range = new RangeHeaderValue(currentStart, null);
            }
            if (req.Headers.Range != null &&
                EntityTagHeaderValue.TryParse(_expectedETag, out var entityTag) && !entityTag.IsWeak)
            {
                req.Headers.IfRange = new RangeConditionHeaderValue(entityTag);
            }

            var resp = await _httpClient.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!resp.IsSuccessStatusCode &&
                (resp.StatusCode == System.Net.HttpStatusCode.Forbidden || resp.StatusCode == System.Net.HttpStatusCode.Unauthorized))
            {
                resp.Dispose();
                var candidates = DownloadEngine.GetCandidateReferers(_url, _referer);
                foreach (var cand in candidates)
                {
                    if (string.Equals(cand, _referer, StringComparison.OrdinalIgnoreCase)) continue;
                    using var candReq = HttpTransferRequest.Create(HttpMethod.Get, _url);

                    if (req.Headers.Range != null) candReq.Headers.Range = req.Headers.Range;
                    if (req.Headers.IfRange != null) candReq.Headers.IfRange = req.Headers.IfRange;
                    if (!string.IsNullOrEmpty(cand))
                    {
                        candReq.Headers.TryAddWithoutValidation("Referer", cand);
                        try { candReq.Headers.TryAddWithoutValidation("Origin", new Uri(cand).GetLeftPart(UriPartial.Authority)); } catch { }
                    }
                    if (!string.IsNullOrEmpty(_userAgent)) candReq.Headers.TryAddWithoutValidation("User-Agent", _userAgent);
                    if (!string.IsNullOrEmpty(_cookies)) candReq.Headers.TryAddWithoutValidation("Cookie", _cookies);
                    candReq.Headers.TryAddWithoutValidation("Accept", "*/*");

                    var candResp = await _httpClient.SendAsync(candReq, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                    if (candResp.IsSuccessStatusCode)
                    {
                        resp = candResp;
                        _referer = cand;
                        break;
                    }
                    candResp.Dispose();
                }
            }
            using var _respScope = resp;
            resp.EnsureSuccessStatusCode();

            foreach (string encoding in resp.Content.Headers.ContentEncoding)
            {
                if (!string.Equals(encoding, "identity", StringComparison.OrdinalIgnoreCase))
                    throw new HttpRequestException("Server ignored identity encoding for the transfer.");
            }
            if (EntityTagHeaderValue.TryParse(_expectedETag, out var expectedTag) && !expectedTag.IsWeak &&
                resp.Headers.ETag is { } actualTag && !actualTag.Equals(expectedTag))
                throw new HttpRequestException("Server resource validator changed before transfer.");

            bool isFullBodyTransfer = req.Headers.Range == null;
            if (isFullBodyTransfer)
            {
                if (resp.StatusCode != System.Net.HttpStatusCode.OK)
                    throw new HttpRequestException("Full-body transfer requires HTTP 200 OK.");
                if (_expectedTotalBytes > 0 && resp.Content.Headers.ContentLength is long length && length != _expectedTotalBytes)
                    throw new HttpRequestException("Server resource length changed before sequential transfer.");
            }

            // Strict Validation: Range responses MUST return 206 Partial Content with matching Content-Range bounds
            if (Progress.EndByte >= 0 || currentStart > 0)
            {
                if (resp.StatusCode != System.Net.HttpStatusCode.PartialContent)
                {
                    throw new HttpRequestException($"Server returned HTTP {(int)resp.StatusCode} {resp.StatusCode} instead of 206 Partial Content for range request (bytes {currentStart}-{Progress.EndByte}).");
                }

                var cr = resp.Content.Headers.ContentRange;
                if (cr == null)
                {
                    throw new HttpRequestException("Server returned 206 Partial Content without Content-Range header.");
                }
                if (!string.Equals(cr.Unit, "bytes", StringComparison.OrdinalIgnoreCase))
                {
                    throw new HttpRequestException($"Server returned unsupported range unit '{cr.Unit}', expected 'bytes'.");
                }
                if (!cr.HasRange || !cr.From.HasValue || !cr.To.HasValue)
                {
                    throw new HttpRequestException("Server returned Content-Range without explicit start/end byte bounds.");
                }
                if (_expectedTotalBytes > 0 && cr.Length != _expectedTotalBytes)
                {
                    throw new HttpRequestException("Server resource length changed during segmented transfer.");
                }
                if (cr.From.Value != currentStart)
                {
                    throw new HttpRequestException($"Server Content-Range start mismatch: returned {cr.From.Value}, requested {currentStart}.");
                }
                if (Progress.EndByte >= 0 && cr.To.Value != Progress.EndByte)
                {
                    throw new HttpRequestException($"Server Content-Range end mismatch: returned {cr.To.Value}, requested {Progress.EndByte}.");
                }
            }

            // Strict Validation: If target file is supposed to be media, reject API JSON responses, HTML error pages, and plain text
            string targetExt = Path.GetExtension(_targetFilePath);
            var mediaExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                ".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".ts", ".m4v", ".mp3", ".m4a", ".aac", ".wav", ".ogg", ".opus"
            };
            if (!string.IsNullOrEmpty(targetExt) && mediaExts.Contains(targetExt))
            {
                var mediaType = resp.Content.Headers.ContentType?.MediaType?.ToLowerInvariant() ?? "";
                if (mediaType.Contains("json") || mediaType.Contains("html") || mediaType.Contains("text/plain"))
                {
                    throw new HttpRequestException($"Server returned non-media content type '{mediaType}' instead of video/audio stream. Target URL may be an API endpoint or expired session.");
                }
            }

            await using var contentStream = await resp.Content.ReadAsStreamAsync(cancellationToken);
            await using var fileStream = new FileStream(_targetFilePath, isFullBodyTransfer ? FileMode.Create : FileMode.OpenOrCreate, FileAccess.Write, FileShare.ReadWrite, 131072, useAsync: true);
            fileStream.Seek(currentStart, SeekOrigin.Begin);

            byte[] buffer = new byte[131072];
            int read;

            while (true)
            {
                int toRead = buffer.Length;
                if (Progress.EndByte >= 0)
                {
                    long bytesNeeded = (Progress.EndByte - Progress.StartByte + 1) - Progress.DownloadedBytes;
                    if (bytesNeeded <= 0) break;
                    toRead = (int)Math.Min((long)buffer.Length, bytesNeeded);
                }

                read = await contentStream.ReadAsync(buffer.AsMemory(0, toRead), cancellationToken);
                if (read <= 0) break;

                if (isFullBodyTransfer && _expectedTotalBytes > 0 && read > _expectedTotalBytes - Progress.DownloadedBytes)
                    throw new HttpRequestException("Sequential response exceeded its expected length.");

                if (SpeedLimiter != null)
                {
                    await SpeedLimiter.ThrottleAsync(read, cancellationToken);
                }

                await fileStream.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                Progress.DownloadedBytes += read;
                _bytesSinceLastCheck += read;

                if (_speedStopwatch.ElapsedMilliseconds >= 400)
                {
                    double seconds = _speedStopwatch.Elapsed.TotalSeconds;
                    if (seconds > 0)
                    {
                        double mbps = (_bytesSinceLastCheck / (1024.0 * 1024.0)) / seconds;
                        Progress.SpeedMbps = Progress.SpeedMbps <= 0.05
                            ? mbps
                            : (Progress.SpeedMbps * 0.72) + (mbps * 0.28);
                    }
                    _bytesSinceLastCheck = 0;
                    _speedStopwatch.Restart();
                }
            }

            if (Progress.EndByte >= 0)
            {
                long totalExpected = Progress.EndByte - Progress.StartByte + 1;
                if (Progress.DownloadedBytes < totalExpected)
                {
                    Progress.IsCompleted = false;
                    throw new EndOfStreamException($"Premature end of stream: expected {totalExpected} bytes for segment #{Progress.SegmentIndex}, but connection closed after {Progress.DownloadedBytes} bytes.");
                }
                await fileStream.FlushAsync(cancellationToken);
                Progress.CheckpointSha256 = await Task.Run(() =>
                {
                    fileStream.Flush(flushToDisk: true);
                    return SegmentCheckpointHash.Compute(_targetFilePath, Progress.StartByte, totalExpected);
                }, cancellationToken);
                Progress.IsCompleted = true;
            }
            else
            {
                if (_expectedTotalBytes > 0 && Progress.DownloadedBytes != _expectedTotalBytes)
                    throw new EndOfStreamException("Sequential response ended before its expected length.");
                if (Progress.DownloadedBytes <= 0)
                {
                    Progress.IsCompleted = false;
                    throw new EndOfStreamException("Server closed connection without sending any data for stream transfer.");
                }
                Progress.IsCompleted = true;
            }
        }
        catch (OperationCanceledException)
        {
            // Paused or canceled
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            Debug.WriteLine($"Segment {Progress.SegmentIndex} worker error: {ex.Message}");
            Progress.IsActive = false;
            Progress.IsCompleted = false;
            throw;
        }
        finally
        {
            Progress.IsActive = false;
            Progress.SpeedMbps = 0;
        }
    }

    public async Task ExecuteChunkQueueAsync(
        System.Collections.Concurrent.ConcurrentQueue<ChunkRange> queue,
        CancellationToken cancellationToken,
        Action<ChunkRange>? onChunkCompleted = null)
    {
        Progress.IsActive = true;
        Progress.IsCompleted = false;
        _speedStopwatch.Restart();
        _bytesSinceLastCheck = 0;

        try
        {
            await using var fileStream = new FileStream(
                _targetFilePath,
                FileMode.OpenOrCreate,
                FileAccess.Write,
                FileShare.ReadWrite,
                131072,
                useAsync: true);

            byte[] buffer = new byte[131072];

            while (queue.TryDequeue(out var chunk))
            {
                if (cancellationToken.IsCancellationRequested) break;

                long chunkLength = chunk.EndByte - chunk.StartByte + 1;
                long chunkDownloaded = 0;
                bool success = false;

                try
                {
                    using var req = HttpTransferRequest.Create(HttpMethod.Get, _url);

                    if (!string.IsNullOrEmpty(_referer))
                    {
                        req.Headers.TryAddWithoutValidation("Referer", _referer);
                        try { req.Headers.TryAddWithoutValidation("Origin", new Uri(_referer).GetLeftPart(UriPartial.Authority)); } catch { }
                    }
                    if (!string.IsNullOrEmpty(_userAgent)) req.Headers.TryAddWithoutValidation("User-Agent", _userAgent);
                    if (!string.IsNullOrEmpty(_cookies)) req.Headers.TryAddWithoutValidation("Cookie", _cookies);
                    req.Headers.Range = new RangeHeaderValue(chunk.StartByte, chunk.EndByte);

                    var resp = await _httpClient.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                    if (!resp.IsSuccessStatusCode &&
                        (resp.StatusCode == System.Net.HttpStatusCode.Forbidden || resp.StatusCode == System.Net.HttpStatusCode.Unauthorized))
                    {
                        resp.Dispose();
                        var candidates = DownloadEngine.GetCandidateReferers(_url, _referer);
                        foreach (var cand in candidates)
                        {
                            if (string.Equals(cand, _referer, StringComparison.OrdinalIgnoreCase)) continue;
                            using var candReq = HttpTransferRequest.Create(HttpMethod.Get, _url);

                            candReq.Headers.Range = new RangeHeaderValue(chunk.StartByte, chunk.EndByte);
                            if (!string.IsNullOrEmpty(cand))
                            {
                                candReq.Headers.TryAddWithoutValidation("Referer", cand);
                                try { candReq.Headers.TryAddWithoutValidation("Origin", new Uri(cand).GetLeftPart(UriPartial.Authority)); } catch { }
                            }
                            if (!string.IsNullOrEmpty(_userAgent)) candReq.Headers.TryAddWithoutValidation("User-Agent", _userAgent);
                            if (!string.IsNullOrEmpty(_cookies)) candReq.Headers.TryAddWithoutValidation("Cookie", _cookies);
                            candReq.Headers.TryAddWithoutValidation("Accept", "*/*");

                            var candResp = await _httpClient.SendAsync(candReq, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                            if (candResp.IsSuccessStatusCode)
                            {
                                resp = candResp;
                                _referer = cand;
                                break;
                            }
                            candResp.Dispose();
                        }
                    }
                    using var _sliceRespScope = resp;
                    resp.EnsureSuccessStatusCode();

                    if (resp.StatusCode != System.Net.HttpStatusCode.PartialContent)
                    {
                        throw new HttpRequestException($"Server returned HTTP {(int)resp.StatusCode} instead of 206 Partial Content for chunk range {chunk.StartByte}-{chunk.EndByte}.");
                    }
                    var cr = resp.Content.Headers.ContentRange;
                    if (cr?.From != chunk.StartByte || cr.To != chunk.EndByte ||
                        cr.Length != fileStream.Length || fileStream.Length <= chunk.EndByte ||
                        !string.Equals(cr.Unit, "bytes", StringComparison.OrdinalIgnoreCase))
                        throw new HttpRequestException("The media byte-range response does not match the selected resource and requested bounds.");

                    await using var contentStream = await resp.Content.ReadAsStreamAsync(cancellationToken);
                    fileStream.Seek(chunk.StartByte, SeekOrigin.Begin);

                    while (chunkDownloaded < chunkLength)
                    {
                        int toRead = (int)Math.Min((long)buffer.Length, chunkLength - chunkDownloaded);
                        int read = await contentStream.ReadAsync(buffer.AsMemory(0, toRead), cancellationToken);
                        if (read <= 0) break;

                        if (SpeedLimiter != null)
                        {
                            await SpeedLimiter.ThrottleAsync(read, cancellationToken);
                        }

                        await fileStream.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                        chunkDownloaded += read;
                        Progress.DownloadedBytes += read;
                        _bytesSinceLastCheck += read;

                        if (_speedStopwatch.ElapsedMilliseconds >= 400)
                        {
                            double seconds = _speedStopwatch.Elapsed.TotalSeconds;
                            if (seconds > 0)
                            {
                                double mbps = (_bytesSinceLastCheck / (1024.0 * 1024.0)) / seconds;
                                Progress.SpeedMbps = Progress.SpeedMbps <= 0.05
                                    ? mbps
                                    : (Progress.SpeedMbps * 0.72) + (mbps * 0.28);
                            }
                            _bytesSinceLastCheck = 0;
                            _speedStopwatch.Restart();
                        }
                    }

                    if (chunkDownloaded >= chunkLength)
                    {
                        success = true;
                        LastError = null;
                        onChunkCompleted?.Invoke(chunk);
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[SegmentWorker #{Progress.SegmentIndex}] Chunk error {chunk.StartByte}-{chunk.EndByte}: {ex.Message}");
                }

                if (!success && !cancellationToken.IsCancellationRequested)
                {
                    if (chunk.Retries < 3)
                    {
                        chunk.Retries++;
                        queue.Enqueue(chunk);
                    }
                    else
                    {
                        LastError = $"Chunk {chunk.StartByte}-{chunk.EndByte} failed after 3 retries.";
                        break;
                    }
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Paused or canceled
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            Debug.WriteLine($"[SegmentWorker #{Progress.SegmentIndex}] Queue worker fatal error: {ex.Message}");
            throw;
        }
        finally
        {
            Progress.IsActive = false;
            Progress.IsCompleted = !cancellationToken.IsCancellationRequested && string.IsNullOrEmpty(LastError);
            Progress.SpeedMbps = 0;
        }
    }

    public async Task ExecuteHlsChunkQueueAsync(
        System.Collections.Concurrent.ConcurrentQueue<HlsSegmentTask> queue,
        Func<bool> isCompletedCheck,
        CancellationToken cancellationToken,
        Action<HlsSegmentTask, long>? onChunkCompleted = null,
        Action<string>? onFatalError = null,
        Func<string, HlsSegmentEncryption, CancellationToken, Task>? decryptSegment = null)
    {
        Progress.IsActive = true;
        Progress.IsCompleted = false;
        _speedStopwatch.Restart();
        _bytesSinceLastCheck = 0;

        byte[] buffer = new byte[131072];

        try
        {
            while (!cancellationToken.IsCancellationRequested && !isCompletedCheck())
            {
                if (!queue.TryDequeue(out var chunk))
                {
                    if (isCompletedCheck()) break;
                    await Task.Delay(50, cancellationToken);
                    continue;
                }

                string tmpFile = chunk.TargetPath + ".tmp";
                bool chunkSuccess = false;
                long chunkBytes = 0;

                try
                {
                    using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    timeoutCts.CancelAfter(TimeSpan.FromSeconds(35));

                    using var req = HttpTransferRequest.Create(HttpMethod.Get, chunk.Url);

                    if (!string.IsNullOrEmpty(_referer))
                    {
                        req.Headers.TryAddWithoutValidation("Referer", _referer);
                        try { req.Headers.TryAddWithoutValidation("Origin", new Uri(_referer).GetLeftPart(UriPartial.Authority)); } catch { }
                    }
                    if (!string.IsNullOrEmpty(_userAgent)) req.Headers.TryAddWithoutValidation("User-Agent", _userAgent);
                    if (!string.IsNullOrEmpty(_cookies)) req.Headers.TryAddWithoutValidation("Cookie", _cookies);
                    req.Headers.TryAddWithoutValidation("Accept", "*/*");

                    var resp = await _httpClient.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, timeoutCts.Token);

                    // Adaptive anti-hotlink fallback: If server returns 403 or 401, test candidate referers
                    if (!resp.IsSuccessStatusCode &&
                        (resp.StatusCode == System.Net.HttpStatusCode.Forbidden || resp.StatusCode == System.Net.HttpStatusCode.Unauthorized))
                    {
                        resp.Dispose();
                        var workerCandidates = new List<string?>();
                        if (!string.IsNullOrEmpty(_referer))
                        {
                            try
                            {
                                var rUri = new Uri(_referer);
                                workerCandidates.Add(rUri.GetLeftPart(UriPartial.Authority) + "/");
                                workerCandidates.Add(rUri.GetLeftPart(UriPartial.Authority));
                            }
                            catch { }
                        }
                        try
                        {
                            var cUri = new Uri(chunk.Url);
                            workerCandidates.Add(cUri.GetLeftPart(UriPartial.Authority) + "/");
                        }
                        catch { }
                        workerCandidates.Add(null); // No referer (anti-hotlink bypass)

                        foreach (var cand in workerCandidates)
                        {
                            using var candReq = HttpTransferRequest.Create(HttpMethod.Get, chunk.Url);

                            if (!string.IsNullOrEmpty(cand))
                            {
                                candReq.Headers.TryAddWithoutValidation("Referer", cand);
                                try { candReq.Headers.TryAddWithoutValidation("Origin", new Uri(cand).GetLeftPart(UriPartial.Authority)); } catch { }
                            }
                            if (!string.IsNullOrEmpty(_userAgent)) candReq.Headers.TryAddWithoutValidation("User-Agent", _userAgent);
                            if (!string.IsNullOrEmpty(_cookies)) candReq.Headers.TryAddWithoutValidation("Cookie", _cookies);
                            candReq.Headers.TryAddWithoutValidation("Accept", "*/*");

                            var candResp = await _httpClient.SendAsync(candReq, HttpCompletionOption.ResponseHeadersRead, timeoutCts.Token);
                            if (candResp.IsSuccessStatusCode)
                            {
                                resp = candResp;
                                _referer = cand; // Update working referer for remaining chunks
                                break;
                            }
                            else
                            {
                                candResp.Dispose();
                            }
                        }
                    }

                    using (resp)
                    {
                        resp.EnsureSuccessStatusCode();

                        long expectedLength = resp.Content.Headers.ContentLength ?? 4_500_000;
                        Progress.StartByte = 0;
                        Progress.EndByte = expectedLength;
                        Progress.DownloadedBytes = 0;

                        await using (var fs = new FileStream(tmpFile, FileMode.Create, FileAccess.Write, FileShare.None, 131072, useAsync: true))
                        await using (var contentStream = await resp.Content.ReadAsStreamAsync(timeoutCts.Token))
                        {
                            while (true)
                            {
                                int read = await contentStream.ReadAsync(buffer.AsMemory(0, buffer.Length), timeoutCts.Token);
                                if (read <= 0) break;

                                if (SpeedLimiter != null)
                                {
                                    await SpeedLimiter.ThrottleAsync(read, timeoutCts.Token);
                                }

                                await fs.WriteAsync(buffer.AsMemory(0, read), timeoutCts.Token);
                                chunkBytes += read;
                                Progress.DownloadedBytes += read;
                                _bytesSinceLastCheck += read;

                                if (_speedStopwatch.ElapsedMilliseconds >= 350)
                                {
                                    double seconds = _speedStopwatch.Elapsed.TotalSeconds;
                                    if (seconds > 0)
                                    {
                                        double mbps = (_bytesSinceLastCheck / (1024.0 * 1024.0)) / seconds;
                                        Progress.SpeedMbps = Progress.SpeedMbps <= 0.05
                                            ? mbps
                                            : (Progress.SpeedMbps * 0.72) + (mbps * 0.28);
                                    }
                                    _bytesSinceLastCheck = 0;
                                    _speedStopwatch.Restart();
                                }
                            }
                        }

                        if (chunkBytes <= 0) throw new IOException("The media server returned an empty segment.");
                        if (resp.Content.Headers.ContentLength is long declaredLength && chunkBytes != declaredLength)
                            throw new IOException("HLS segment length did not match the server response.");
                        if (chunk.Encryption != null)
                        {
                            if (decryptSegment == null) throw new InvalidDataException("No HLS AES-128 decryptor is available.");
                            await decryptSegment(tmpFile, chunk.Encryption, timeoutCts.Token);
                        }
                        chunkBytes = await HlsSegmentTransport.NormalizeAsync(tmpFile, timeoutCts.Token);
                        if (File.Exists(chunk.TargetPath)) File.Delete(chunk.TargetPath);
                        File.Move(tmpFile, chunk.TargetPath, overwrite: true);
                        await MediaCheckpoint.SaveAsync(chunk.TargetPath, chunk.Identity + chunk.Url, resp.Headers.ETag is { IsWeak: false } tag ? tag.Tag : null, resp.Content.Headers.ContentLength, timeoutCts.Token);
                        chunkSuccess = true;
                        LastError = null;
                        onChunkCompleted?.Invoke(chunk, chunkBytes);
                    }
                }
                catch (OperationCanceledException)
                {
                    if (cancellationToken.IsCancellationRequested) break;
                    // Stalled socket timed out, proceed to retry with backoff
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[SegmentWorker #{Progress.SegmentIndex}] HLS chunk error (chunk {chunk.Index}): {ex.Message}");
                    try { if (File.Exists(tmpFile)) File.Delete(tmpFile); } catch { }
                }

                if (!chunkSuccess && !cancellationToken.IsCancellationRequested)
                {
                    if (chunk.Retries < 2)
                    {
                        chunk.Retries++;
                        int backoffMs = Math.Min(1000, 100 * (1 << chunk.Retries));
                        await Task.Delay(backoffMs, cancellationToken);
                        queue.Enqueue(chunk);
                    }
                    else
                    {
                        LastError = $"Media segment {chunk.Index} failed after bounded retries. Refresh the original page and select the same format.";
                        onFatalError?.Invoke(LastError);
                        break;
                    }
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Paused or canceled
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            onFatalError?.Invoke("Media segment transfer failed.");
        }
        finally
        {
            Progress.IsActive = false;
            Progress.IsCompleted = !cancellationToken.IsCancellationRequested && string.IsNullOrEmpty(LastError) && queue.IsEmpty;
            Progress.SpeedMbps = 0;
        }
    }
}

public class ChunkRange
{
    public long StartByte { get; }
    public long EndByte { get; }
    public int Retries { get; set; }

    public ChunkRange(long startByte, long endByte)
    {
        StartByte = startByte;
        EndByte = endByte;
    }
}

public class HlsSegmentTask
{
    public HlsSegmentEncryption? Encryption { get; set; }
    public int Index { get; set; }
    public string Identity { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string TargetPath { get; set; } = string.Empty;
    public int Retries { get; set; }
}
