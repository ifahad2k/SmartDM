using System;
using System.Collections.Generic;
using System.Linq;

namespace SmartDm.Desktop.Avalonia.Services;

public static class MediaRepresentation
{
    public static MediaFormatDto? SelectExact(IEnumerable<MediaFormatDto> formats, string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        var matches = formats.Where(f => f.FormatId == id).Take(2).ToArray();
        return matches.Length == 1 ? matches[0] : null;
    }

    public static bool IsExpired(string address, DateTimeOffset now)
    {
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri)) return false;
        string? value = System.Web.HttpUtility.ParseQueryString(uri.Query)["expire"];
        return long.TryParse(value, out var seconds) && seconds <= now.ToUnixTimeSeconds() + 30;
    }
}

public sealed class MediaRecoveryException(string message) : Exception(message) { }
