using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public static class ProcessOutput
{
    public static async Task<string> ReadTailAsync(StreamReader reader, CancellationToken token)
    {
        var tail = new StringBuilder();
        var buffer = new char[4096]; int read;
        while ((read = await reader.ReadAsync(buffer.AsMemory(), token)) > 0)
        {
            tail.Append(buffer, 0, read);
            if (tail.Length > 65536) tail.Remove(0, tail.Length - 65536);
        }
        return tail.ToString();
    }
}
