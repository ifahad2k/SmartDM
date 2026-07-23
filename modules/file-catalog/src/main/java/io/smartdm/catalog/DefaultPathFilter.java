package io.smartdm.catalog;

import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

public class DefaultPathFilter {

    private static final List<String> FORBIDDEN_DIRS = List.of(
        "windows", "program files", "program files (x86)", "system32",
        "sys", "proc", "dev", "etc", "var/log", "usr",
        "$recycle.bin", "system volume information", ".git", ".hg", ".svn",
        "appdata/local/temp", "appdata/local/google", "appdata/roaming/mozilla",
        ".smartdm/temp", ".smartdm/data"
    );

    public static boolean isExcludedPath(Path path) {
        if (path == null) return true;
        String fullPath = path.toAbsolutePath().toString().toLowerCase(Locale.ROOT);
        for (String forbidden : FORBIDDEN_DIRS) {
            if (fullPath.contains(forbidden)) {
                return true;
            }
        }
        return false;
    }
}
