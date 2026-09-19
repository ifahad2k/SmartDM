using System;

namespace SmartDm.Desktop.Avalonia.Models;

public class ProbeResult
{
    public string Url { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long TotalBytes { get; set; } = -1;
    public bool AcceptsRanges { get; set; }
    public string HttpVersion { get; set; } = "HTTP/1.1";
    public string MimeType { get; set; } = "application/octet-stream";
    public string SuggestedCategory { get; set; } = "Other";
    public string ETag { get; set; } = string.Empty;
    public long LatencyMs { get; set; }
    public int StatusCode { get; set; }
    public bool IsSuccess { get; set; }
    public string ErrorMessage { get; set; } = string.Empty;

    public string FormattedSize
    {
        get
        {
            if (TotalBytes <= 0) return "Unknown size";
            if (TotalBytes >= 1024L * 1024 * 1024)
                return $"{(double)TotalBytes / (1024 * 1024 * 1024):F2} GB";
            if (TotalBytes >= 1024L * 1024)
                return $"{(double)TotalBytes / (1024 * 1024):F2} MB";
            if (TotalBytes >= 1024)
                return $"{(double)TotalBytes / 1024:F2} KB";
            return $"{TotalBytes} Bytes";
        }
    }
}
