using System;
using System.IO;
using System.Security.Cryptography;

namespace SmartDm.Desktop.Avalonia.Services;

internal static class SegmentCheckpointHash
{
    public static string Compute(string path, long offset, long length)
    {
        if (offset < 0 || length <= 0) throw new ArgumentOutOfRangeException(nameof(length));
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 131072);
        if (offset > stream.Length || length > stream.Length - offset)
            throw new EndOfStreamException("Checkpoint range exceeds the staging file.");

        stream.Position = offset;
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        byte[] buffer = new byte[131072];
        long remaining = length;
        while (remaining > 0)
        {
            int count = stream.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
            if (count == 0) throw new EndOfStreamException("Checkpoint range ended early.");
            hash.AppendData(buffer, 0, count);
            remaining -= count;
        }
        return Convert.ToHexString(hash.GetHashAndReset());
    }
}
