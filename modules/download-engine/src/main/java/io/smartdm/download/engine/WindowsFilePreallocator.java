package io.smartdm.download.engine;

import com.sun.jna.Native;
import com.sun.jna.Pointer;
import com.sun.jna.platform.win32.WinBase;
import com.sun.jna.platform.win32.WinNT;
import com.sun.jna.ptr.LongByReference;
import com.sun.jna.win32.StdCallLibrary;
import com.sun.jna.win32.W32APIOptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;

/**
 * Native Windows Win32 fast disk pre-allocator.
 * Bypasses the JVM heap and allocates contiguous clusters on NTFS in milliseconds
 * without zero-fill disk thrashing.
 */
public final class WindowsFilePreallocator {
    private static final Logger log = LoggerFactory.getLogger(WindowsFilePreallocator.class);

    private static final int FILE_BEGIN = 0;

    public interface Kernel32Direct extends StdCallLibrary {
        Kernel32Direct INSTANCE = Native.load("kernel32", Kernel32Direct.class, W32APIOptions.DEFAULT_OPTIONS);

        WinNT.HANDLE CreateFile(
                String lpFileName,
                int dwDesiredAccess,
                int dwShareMode,
                Pointer lpSecurityAttributes,
                int dwCreationDisposition,
                int dwFlagsAndAttributes,
                WinNT.HANDLE hTemplateFile
        );

        boolean SetFilePointerEx(
                WinNT.HANDLE hFile,
                long liDistanceToMove,
                LongByReference lpNewFilePointer,
                int dwMoveMethod
        );

        boolean SetEndOfFile(WinNT.HANDLE hFile);

        boolean CloseHandle(WinNT.HANDLE hObject);
    }

    private WindowsFilePreallocator() {}

    public static boolean tryPreallocate(Path path, long totalSize) {
        if (totalSize <= 0 || path == null) return false;
        try {
            WinNT.HANDLE handle = Kernel32Direct.INSTANCE.CreateFile(
                    path.toAbsolutePath().toString(),
                    WinNT.GENERIC_READ | WinNT.GENERIC_WRITE,
                    WinNT.FILE_SHARE_READ | WinNT.FILE_SHARE_WRITE,
                    null,
                    WinNT.OPEN_ALWAYS,
                    WinNT.FILE_ATTRIBUTE_NORMAL,
                    null
            );

            if (handle == null || WinBase.INVALID_HANDLE_VALUE.equals(handle)) {
                return false;
            }

            try {
                // Set file pointer to totalSize (64-bit safe)
                boolean seekOk = Kernel32Direct.INSTANCE.SetFilePointerEx(handle, totalSize, null, FILE_BEGIN);
                if (!seekOk) {
                    return false;
                }
                boolean success = Kernel32Direct.INSTANCE.SetEndOfFile(handle);
                if (success) {
                    log.debug("Native Windows SetEndOfFile pre-allocated {} bytes for {}", totalSize, path.getFileName());
                }
                return success;
            } finally {
                Kernel32Direct.INSTANCE.CloseHandle(handle);
            }
        } catch (Throwable t) {
            log.debug("Native Windows pre-allocation skipped: {}", t.getMessage());
            return false;
        }
    }
}
