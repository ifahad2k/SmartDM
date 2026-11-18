using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public static class DownloadJournalStore
{
    public class SegmentJournalEntry
    {
        public int SegmentIndex { get; set; }
        public long StartByte { get; set; }
        public long EndByte { get; set; }
        public long DownloadedBytes { get; set; }
        public bool IsCompleted { get; set; }
        public string? CheckpointSha256 { get; set; }
    }

    public class DownloadJournal
    {
        public string DownloadId { get; set; } = string.Empty;
        public string SourceUrl { get; set; } = string.Empty;
        public long TotalBytes { get; set; }
        public string? ETag { get; set; }
        public string? LastModified { get; set; }
        public List<SegmentJournalEntry> Segments { get; set; } = new();
    }

    public static string GetSegmentJournalPath(string stagingDirectory)
    {
        return Path.Combine(stagingDirectory, "segments.journal");
    }

    public static void SaveSegmentJournal(
        string stagingDirectory,
        IEnumerable<SegmentProgress> segments,
        string? downloadId = null,
        string? sourceUrl = null,
        long totalBytes = 0,
        string? etag = null,
        string? lastModified = null)
    {
        try
        {
            if (string.IsNullOrEmpty(stagingDirectory) || !Directory.Exists(stagingDirectory)) return;

            var journal = new DownloadJournal
            {
                DownloadId = downloadId ?? string.Empty,
                SourceUrl = sourceUrl ?? string.Empty,
                TotalBytes = totalBytes,
                ETag = etag,
                LastModified = lastModified,
                Segments = segments.Select(s => new SegmentJournalEntry
                {
                    SegmentIndex = s.SegmentIndex,
                    StartByte = s.StartByte,
                    EndByte = s.EndByte,
                    DownloadedBytes = s.DownloadedBytes,
                    IsCompleted = s.IsCompleted,
                    CheckpointSha256 = s.CheckpointSha256
                }).ToList()
            };

            string json = JsonSerializer.Serialize(journal, new JsonSerializerOptions { WriteIndented = true });
            string journalPath = GetSegmentJournalPath(stagingDirectory);
            string tmpPath = journalPath + ".tmp";
            File.WriteAllText(tmpPath, json);
            File.Move(tmpPath, journalPath, overwrite: true);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DownloadEngine] Failed to save segment journal: {ex.Message}");
        }
    }

    public static void SaveSegmentJournal(string stagingDirectory, DownloadModel download, IEnumerable<SegmentProgress> segments)
    {
        SaveSegmentJournal(
            stagingDirectory,
            segments,
            downloadId: download.Id,
            sourceUrl: download.Url,
            totalBytes: download.TotalBytes,
            etag: download.ETag,
            lastModified: download.LastModified);
    }

    public static List<SegmentProgress>? LoadAndValidateJournal(
        string stagingDirectory,
        string downloadId,
        string sourceUrl,
        long totalBytes,
        string? currentETag = null,
        string? currentLastModified = null,
        string? stagingFilePath = null,
        bool allowCompletedReuse = false)
    {
        try
        {
            string journalPath = GetSegmentJournalPath(stagingDirectory);
            if (!File.Exists(journalPath)) return null;

            string json = File.ReadAllText(journalPath);
            DownloadJournal? journal = null;

            try
            {
                journal = JsonSerializer.Deserialize<DownloadJournal>(json);
            }
            catch { }

            if (journal == null || journal.Segments == null || journal.Segments.Count == 0)
            {
                try
                {
                    var fallbackEntries = JsonSerializer.Deserialize<List<SegmentJournalEntry>>(json);
                    if (fallbackEntries != null && fallbackEntries.Count > 0)
                    {
                        journal = new DownloadJournal { Segments = fallbackEntries };
                    }
                }
                catch { }
            }

            if (journal == null || journal.Segments == null || journal.Segments.Count == 0)
            {
                return null;
            }

            // 1. Source Identity Validation
            if (!string.IsNullOrEmpty(journal.DownloadId) && !string.IsNullOrEmpty(downloadId) &&
                !string.Equals(journal.DownloadId, downloadId, StringComparison.OrdinalIgnoreCase))
            {
                Debug.WriteLine("[JournalValidation] Rejecting journal: download identity mismatch");
                return null;
            }

            if (!string.IsNullOrEmpty(journal.SourceUrl) && !string.IsNullOrEmpty(sourceUrl) &&
                !string.Equals(journal.SourceUrl, sourceUrl, StringComparison.OrdinalIgnoreCase))
            {
                Debug.WriteLine("[JournalValidation] Rejecting journal: source URL mismatch");
                return null;
            }

            if (journal.TotalBytes > 0 && totalBytes > 0 && journal.TotalBytes != totalBytes)
            {
                Debug.WriteLine($"[JournalValidation] Rejecting journal: TotalBytes mismatch (journal {journal.TotalBytes} vs expected {totalBytes})");
                return null;
            }

            // 2. HTTP Validators Validation
            if (!string.IsNullOrEmpty(journal.ETag) && !string.IsNullOrEmpty(currentETag))
            {
                string normJ = journal.ETag.Trim().Trim('"');
                string normC = currentETag.Trim().Trim('"');
                if (!string.Equals(normJ, normC, StringComparison.OrdinalIgnoreCase))
                {
                    Debug.WriteLine("[JournalValidation] Rejecting journal: ETag validator changed");
                    return null;
                }
            }

            if (!string.IsNullOrEmpty(journal.LastModified) && !string.IsNullOrEmpty(currentLastModified))
            {
                if (!string.Equals(journal.LastModified.Trim(), currentLastModified.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    Debug.WriteLine("[JournalValidation] Rejecting journal: Last-Modified validator changed");
                    return null;
                }
            }

            allowCompletedReuse = allowCompletedReuse &&
                !string.IsNullOrWhiteSpace(downloadId) &&
                string.Equals(journal.DownloadId, downloadId, StringComparison.Ordinal) &&
                !string.IsNullOrWhiteSpace(sourceUrl) &&
                string.Equals(journal.SourceUrl, sourceUrl, StringComparison.Ordinal) &&
                totalBytes > 0 && journal.TotalBytes == totalBytes &&
                !string.IsNullOrWhiteSpace(currentETag) &&
                !currentETag.StartsWith("W/", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(journal.ETag, currentETag, StringComparison.Ordinal);

            // 3. Segment Range Bounds & Monotonicity Validation
            long prevEnd = -1;
            foreach (var seg in journal.Segments)
            {
                if (seg.StartByte < 0) return null;
                if (seg.EndByte >= 0 && seg.EndByte < seg.StartByte) return null;
                if (seg.StartByte <= prevEnd) return null; // Overlapping or non-monotonic
                if (totalBytes > 0 && seg.EndByte >= totalBytes) return null;
                prevEnd = seg.EndByte;
            }

            // A preallocated file length proves no bytes were written. Reuse only fully
            // flushed ranges whose saved digest still matches the bytes on disk.
            foreach (var seg in journal.Segments)
            {
                long length = seg.EndByte >= seg.StartByte ? seg.EndByte - seg.StartByte + 1 : 0;
                bool verified = false;
                if (allowCompletedReuse && length > 0 && seg.IsCompleted && seg.DownloadedBytes == length &&
                    seg.CheckpointSha256?.Length == 64 && !string.IsNullOrEmpty(stagingFilePath))
                {
                    try
                    {
                        string actual = SegmentCheckpointHash.Compute(stagingFilePath, seg.StartByte, length);
                        verified = string.Equals(actual, seg.CheckpointSha256, StringComparison.OrdinalIgnoreCase);
                    }
                    catch (IOException) { }
                    catch (UnauthorizedAccessException) { }
                }
                if (!verified)
                {
                    seg.DownloadedBytes = 0;
                    seg.IsCompleted = false;
                    seg.CheckpointSha256 = null;
                }
            }

            return journal.Segments.Select(e => new SegmentProgress
            {
                SegmentIndex = e.SegmentIndex,
                StartByte = e.StartByte,
                EndByte = e.EndByte,
                DownloadedBytes = e.DownloadedBytes,
                IsCompleted = e.IsCompleted,
                CheckpointSha256 = e.CheckpointSha256
            }).ToList();
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DownloadEngine] Failed to load and validate journal: {ex.Message}");
            return null;
        }
    }

    public static List<SegmentProgress>? LoadSegmentJournal(string stagingDirectory)
    {
        return LoadAndValidateJournal(stagingDirectory, string.Empty, string.Empty, 0);
    }

}
