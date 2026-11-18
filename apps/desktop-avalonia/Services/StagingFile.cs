using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

namespace SmartDm.Desktop.Avalonia.Services;

public static class StagingFile
{
    // Return whether out-of-order writes can leave holes without allocating them.
    // Never extend the file to the advertised remote length.
    public static Task<bool> PrepareAsync(string path, long expectedLength, CancellationToken token = default) => Task.Run(() =>
    {
        token.ThrowIfCancellationRequested();
        if (expectedLength < 0) throw new ArgumentOutOfRangeException(nameof(expectedLength));
        using var file = new FileStream(path, FileMode.OpenOrCreate, FileAccess.Write, FileShare.ReadWrite);
        // Only shrink stale tails; expected length must never allocate unwritten bytes.
        if (file.Length > expectedLength) file.SetLength(expectedLength);
        return !OperatingSystem.IsWindows() || DeviceIoControl(file.SafeFileHandle, 0x000900C4,
            IntPtr.Zero, 0, IntPtr.Zero, 0, out _, IntPtr.Zero); // FSCTL_SET_SPARSE
    }, token);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeviceIoControl(SafeFileHandle handle, uint controlCode,
        IntPtr input, uint inputSize, IntPtr output, uint outputSize, out uint returned, IntPtr overlapped);
}
