package io.smartdm.desktop.theme;

import javafx.scene.Scene;
import java.net.URL;

public class ThemeManager {
    
    public enum Theme {
        DARK("theme-dark.css", "Dark Glassmorphism"),
        LIGHT("theme-light.css", "Light Theme"),
        HIGH_CONTRAST("theme-high-contrast.css", "High Contrast Dark");
        
        private final String cssFile;
        private final String displayName;
        
        Theme(String cssFile, String displayName) {
            this.cssFile = cssFile;
            this.displayName = displayName;
        }
        
        public String getCssFile() {
            return cssFile;
        }

        public String getDisplayName() {
            return displayName;
        }

        public static Theme fromDisplayName(String name) {
            if (name == null) return DARK;
            for (Theme t : values()) {
                if (t.getDisplayName().equalsIgnoreCase(name) || t.name().equalsIgnoreCase(name)) {
                    return t;
                }
            }
            return DARK;
        }
    }
    
    public enum Density {
        COMFORTABLE("density-comfortable.css"),
        COMPACT("density-compact.css");
        
        private final String cssFile;
        
        Density(String cssFile) {
            this.cssFile = cssFile;
        }
        
        public String getCssFile() {
            return cssFile;
        }
    }

    private static final ThemeManager INSTANCE = new ThemeManager();

    public static ThemeManager getInstance() {
        return INSTANCE;
    }

    private Theme currentTheme = Theme.DARK;
    private Density currentDensity = Density.COMFORTABLE;

    public Theme getCurrentTheme() {
        return currentTheme;
    }

    public void applyTheme(Scene scene) {
        if (scene == null) return;
        scene.getStylesheets().clear();
        
        loadStylesheet(scene, "theme-base.css");
        loadStylesheet(scene, "main.css");
        if (currentTheme != Theme.DARK) {
            loadStylesheet(scene, currentTheme.getCssFile());
        }
        loadStylesheet(scene, currentDensity.getCssFile());
    }

    public void setTheme(Scene scene, Theme theme) {
        this.currentTheme = theme;
        applyTheme(scene);
    }
    
    public void setDensity(Scene scene, Density density) {
        this.currentDensity = density;
        applyTheme(scene);
    }
    
    private void loadStylesheet(Scene scene, String filename) {
        URL resource = getClass().getResource("/io/smartdm/desktop/theme/" + filename);
        if (resource != null) {
            scene.getStylesheets().add(resource.toExternalForm());
        } else {
            System.err.println("Could not find stylesheet: " + filename);
        }
    }
}
