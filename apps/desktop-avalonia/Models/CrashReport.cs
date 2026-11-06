using System;

namespace SmartDm.Desktop.Avalonia.Models;

public class CrashReport
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string ExceptionType { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? StackTrace { get; set; }
    public string? Source { get; set; }
    public string? Context { get; set; }
    public string? OsVersion { get; set; } = Environment.OSVersion.ToString();
    public string? AppVersion { get; set; } = "2.0.0";
}
