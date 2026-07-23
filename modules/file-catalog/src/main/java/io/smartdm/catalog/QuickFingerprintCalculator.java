package io.smartdm.catalog;

import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;

public class QuickFingerprintCalculator {

    private static final int BLOCK_SIZE = 4096;

    public static String calculateQuickHash(Path path) {
        try {
            long size = Files.size(path);
            if (size == 0) return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // Empty file hash

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(Long.toString(size).getBytes());

            try (RandomAccessFile raf = new RandomAccessFile(path.toFile(), "r")) {
                byte[] head = new byte[(int) Math.min(BLOCK_SIZE, size)];
                raf.readFully(head);
                digest.update(head);

                if (size > BLOCK_SIZE * 2) {
                    byte[] tail = new byte[BLOCK_SIZE];
                    raf.seek(size - BLOCK_SIZE);
                    raf.readFully(tail);
                    digest.update(tail);
                }
            }

            return HexFormat.of().formatHex(digest.digest());
        } catch (Exception e) {
            return null;
        }
    }

    public static String calculateFullHash(Path path) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream is = Files.newInputStream(path)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = is.read(buffer)) != -1) {
                    digest.update(buffer, 0, read);
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (Exception e) {
            return null;
        }
    }
}
