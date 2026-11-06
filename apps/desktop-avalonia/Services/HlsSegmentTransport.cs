using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

// Compatibility with the image wrapper used by some HLS players. This applies
// only to downloaded HLS segments, never ordinary images or arbitrary downloads.
public static class HlsSegmentTransport
{
    private static readonly byte[] Mask = { 157, 42, 241, 71, 179, 142, 92, 112, 166, 25, 228, 59, 216, 98, 15, 197 };

    public static async Task<long> NormalizeAsync(string path, CancellationToken token)
    {
        var decodedPath = path + ".decoded";
        try
        {
            await using (var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.None, 131072, true))
            {
                byte[] prefix = new byte[576];
                int count = await input.ReadAtLeastAsync(prefix, prefix.Length, throwOnEndOfStream: false, token);
                int offset = count >= 8 && prefix.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) ? 8 :
                    count >= 12 && prefix.AsSpan(0, 4).SequenceEqual("RIFF"u8) && prefix.AsSpan(8, 4).SequenceEqual("WEBP"u8) ? 12 : 0;
                if (offset == 0) return input.Length;

                bool clear = IsTransportStream(prefix, count, offset, false);
                if (!clear && !IsTransportStream(prefix, count, offset, true))
                    throw new InvalidDataException("The image-wrapped HLS segment does not contain valid MPEG-TS data.");

                input.Position = offset;
                await using var output = new FileStream(decodedPath, FileMode.Create, FileAccess.Write, FileShare.None, 131072, true);
                byte[] buffer = new byte[131072];
                long position = 0;
                int read;
                while ((read = await input.ReadAsync(buffer, token)) > 0)
                {
                    if (!clear)
                        for (int i = 0; i < read; i++) buffer[i] ^= Mask[(int)((position + i) & 15)];
                    await output.WriteAsync(buffer.AsMemory(0, read), token);
                    position += read;
                }
                await output.FlushAsync(token);
            }
            token.ThrowIfCancellationRequested();
            File.Move(decodedPath, path, overwrite: true);
            return new FileInfo(path).Length;
        }
        finally { if (File.Exists(decodedPath)) File.Delete(decodedPath); }
    }

    private static bool IsTransportStream(byte[] bytes, int count, int offset, bool masked)
    {
        if (count < offset + 377) return false;
        for (int i = 0; i <= 376; i += 188)
            if ((bytes[offset + i] ^ (masked ? Mask[i & 15] : 0)) != 0x47) return false;
        return true;
    }
}
