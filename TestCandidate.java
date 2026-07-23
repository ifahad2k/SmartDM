import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.Files;
import java.util.HashSet;
import java.util.Set;
import java.util.List;
import java.util.Locale;

public class TestCandidate {
    private static final List<String> FORBIDDEN_DIRS = List.of(
        "windows", "program files", "program files (x86)", "system32",
        "sys", "proc", "dev", "etc", "var/log", "usr",
        "$recycle.bin", "system volume information", ".git", ".hg", ".svn",
        "appdata/local/temp", "appdata/local/google", "appdata/roaming/mozilla",
        ".smartdm/temp", ".smartdm/data"
    );

    public static void main(String[] args) {
        Set<Path> candidates = new HashSet<>();
        String userHome = System.getProperty("user.home");
        if (userHome != null) {
            Path home = Paths.get(userHome);
            Path downloads = home.resolve("Downloads");
            addIfValid(candidates, downloads);
            addIfValid(candidates, downloads.resolve("Compressed"));
            addIfValid(candidates, downloads.resolve("Programs"));
        }
        System.out.println("Candidates size: " + candidates.size());
        for (Path p : candidates) {
            System.out.println(" - " + p.toString());
        }
    }
    
    private static void addIfValid(Set<Path> candidates, Path path) {
        if (path == null) return;
        try {
            Path abs = path.toAbsolutePath().normalize();
            System.out.println("Checking: " + abs.toString());
            boolean exists = Files.exists(abs);
            boolean isDir = Files.isDirectory(abs);
            boolean isWritable = Files.isWritable(abs);
            System.out.println(" exists=" + exists + " isDir=" + isDir + " isWritable=" + isWritable);
            if (exists && isDir && isWritable) {
                if (!isExcludedPath(abs)) {
                    candidates.add(abs);
                } else {
                    System.out.println(" EXCLUDED by DefaultPathFilter!");
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static boolean isExcludedPath(Path path) {
        if (path == null) return true;
        String fullPath = path.toAbsolutePath().toString().toLowerCase(Locale.ROOT);
        for (String forbidden : FORBIDDEN_DIRS) {
            if (fullPath.contains(forbidden)) {
                System.out.println("  => Matched forbidden: " + forbidden);
                return true;
            }
        }
        return false;
    }
}
