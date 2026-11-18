using System;
using System.Buffers.Binary;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public static class BrowserProtocol
{
    public const int Version = 1;
    public const int MaximumRequestBytes = 16 * 1024 * 1024;
    public const int MaximumResponseBytes = 1024 * 1024;
    public static bool IsAllowedOrigin(string? origin) => origin is
        "chrome-extension://knldjnnmkkebefogdbmggjijknmjeaoh/" or
        "chrome-extension://lkbiimagmeaefiedjigomffpophipmck/" or
        "smartdm-extension@smartdm.io";

    public static async Task<byte[]> ReadFrameAsync(Stream stream, int maximum, CancellationToken token)
    {
        byte[] prefix = new byte[4];
        await stream.ReadExactlyAsync(prefix, token);
        uint size = BinaryPrimitives.ReadUInt32LittleEndian(prefix);
        if (size == 0 || size > maximum) throw new InvalidDataException("Browser message size is invalid.");
        byte[] body = new byte[(int)size];
        await stream.ReadExactlyAsync(body, token);
        return body;
    }

    public static async Task WriteFrameAsync(Stream stream, byte[] body, int maximum, CancellationToken token)
    {
        if (body.Length == 0 || body.Length > maximum) throw new InvalidDataException("Browser response size is invalid.");
        byte[] prefix = new byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(prefix, (uint)body.Length);
        await stream.WriteAsync(prefix, token);
        await stream.WriteAsync(body, token);
        await stream.FlushAsync(token);
    }

    public static async Task<string> ReadBodyAsync(Stream stream, long declaredLength, CancellationToken token)
    {
        if (declaredLength > MaximumRequestBytes) throw new InvalidDataException("Browser message is too large.");
        using var output = new MemoryStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = await stream.ReadAsync(buffer.AsMemory(0, Math.Min(buffer.Length, MaximumRequestBytes + 1 - (int)output.Length)), token)) > 0)
        {
            if (output.Length + count > MaximumRequestBytes) throw new InvalidDataException("Browser message is too large.");
            output.Write(buffer, 0, count);
        }
        return new UTF8Encoding(false, true).GetString(output.GetBuffer(), 0, (int)output.Length);
    }

    public static void Validate(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("protocolVersion", out var version) ||
            !version.TryGetInt32(out int number) || number != Version)
            throw new InvalidDataException("Unsupported browser protocol. Reload SmartDM Integration.");
        string? type = root.TryGetProperty("type", out var operation) ? operation.GetString() :
            root.TryGetProperty("action", out operation) ? operation.GetString() : null;
        if (type?.ToUpperInvariant() is not ("SHOW_WINDOW" or "RESTORE_WINDOW" or "ACTIVATE_WINDOW" or
            "GET_MEDIA_FORMATS" or "EXTRACTMEDIAINFO" or "RESOLVE_M3U8_VARIANTS" or
            "ADD_MEDIA_BATCH" or "ADD_BATCH" or "ADD_DOWNLOAD" or "START_MEDIA_DOWNLOAD"))
            throw new InvalidDataException("Unsupported browser operation.");
        foreach (string name in new[] {"formats", "items", "urls"})
            if (root.TryGetProperty(name, out var array) && (array.ValueKind != JsonValueKind.Array || array.GetArrayLength() > 128))
                throw new InvalidDataException("Browser message has too many items.");
    }
}
