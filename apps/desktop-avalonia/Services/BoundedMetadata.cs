using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public static class BoundedMetadata
{
    public const int HtmlBytes = 256 * 1024;

    public static async Task<string> ReadAsync(HttpContent content, int maximumBytes, CancellationToken token)
    {
        if (content.Headers.ContentLength > maximumBytes)
            throw new InvalidDataException("Metadata exceeds the supported size.");
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(token);
        budget.CancelAfter(TimeSpan.FromSeconds(10));
        await using var source = await content.ReadAsStreamAsync(budget.Token);
        using var output = new MemoryStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = await source.ReadAsync(buffer.AsMemory(0, Math.Min(buffer.Length, maximumBytes + 1 - (int)output.Length)), budget.Token)) > 0)
        {
            if (output.Length + count > maximumBytes)
                throw new InvalidDataException("Metadata exceeds the supported size.");
            output.Write(buffer, 0, count);
        }
        var encoding = Encoding.UTF8;
        try { if (content.Headers.ContentType?.CharSet is { } charset) encoding = Encoding.GetEncoding(charset.Trim('"')); }
        catch (ArgumentException) { }
        return encoding.GetString(output.GetBuffer(), 0, (int)output.Length);
    }
}
