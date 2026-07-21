package io.smartdm.desktop.util;

import javafx.embed.swing.SwingFXUtils;
import javafx.scene.image.Image;

import javax.swing.Icon;
import javax.swing.filechooser.FileSystemView;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public class SystemIconExtractor {

    private static final Map<String, Image> iconCache = new HashMap<>();

    public static Image getFileIcon(String filename) {
        String ext = getExtension(filename);
        if (iconCache.containsKey(ext)) {
            return iconCache.get(ext);
        }

        try {
            File tempFile = File.createTempFile("icon_probe_", ext.isEmpty() ? ".bin" : ext);
            tempFile.deleteOnExit();

            Icon icon = FileSystemView.getFileSystemView().getSystemIcon(tempFile);
            if (icon != null) {
                BufferedImage bImg = new BufferedImage(icon.getIconWidth(), icon.getIconHeight(), BufferedImage.TYPE_INT_ARGB);
                icon.paintIcon(null, bImg.getGraphics(), 0, 0);
                Image fxImage = SwingFXUtils.toFXImage(bImg, null);
                iconCache.put(ext, fxImage);
                tempFile.delete();
                return fxImage;
            }
            tempFile.delete();
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }
    
    public static CompletableFuture<Image> getFileIconAsync(String filename) {
        return CompletableFuture.supplyAsync(() -> getFileIcon(filename));
    }

    private static String getExtension(String filename) {
        if (filename == null) return "";
        int dotIdx = filename.lastIndexOf('.');
        if (dotIdx > 0 && dotIdx < filename.length() - 1) {
            return filename.substring(dotIdx);
        }
        return "";
    }
}
