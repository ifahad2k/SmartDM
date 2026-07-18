package io.smartdm.desktop.theme;

import javafx.scene.Scene;
import java.net.URL;

public class ThemeManager {
    
    public enum Theme {
        LIGHT("theme-light.css"),
        DARK("theme-dark.css");
        
        private final String cssFile;
        
        Theme(String cssFile) {
            this.cssFile = cssFile;
        }
        
        public String getCssFile() {
            return cssFile;
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

    private Theme currentTheme = Theme.LIGHT;
    private Density currentDensity = Density.COMFORTABLE;

    public void applyTheme(Scene scene) {
        scene.getStylesheets().clear();
        
        loadStylesheet(scene, "theme-base.css");
        loadStylesheet(scene, currentTheme.getCssFile());
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
