package io.smartdm.desktop.shell;

import javafx.scene.layout.VBox;
import javafx.scene.layout.Region;
import javafx.scene.layout.Priority;
import javafx.scene.control.ToggleButton;
import javafx.scene.control.ToggleGroup;
import javafx.scene.control.Label;
import javafx.geometry.Pos;
import javafx.scene.shape.SVGPath;
import java.util.function.Consumer;

public final class NavigationRail extends VBox {
    
    private String currentNav = "Downloads";
    
    public NavigationRail() {
        getStyleClass().add("nav-rail");

        // Brand
        VBox brand = new VBox();
        brand.getStyleClass().add("brand");
        
        Region brandMark = new Region();
        brandMark.getStyleClass().add("brand-mark");
        
        Label brandName = new Label("SMARTDM");
        brandName.getStyleClass().add("brand-name");
        
        brand.getChildren().addAll(brandMark, brandName);
        
        ToggleGroup group = new ToggleGroup();
        
        ToggleButton btnDownloads = createNavButton("Downloads", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10 L12 15 L17 10 M12 15 L12 3", group);
        btnDownloads.setSelected(true);
        
        ToggleButton btnQueue = createNavButton("Queue", "M8 6 L21 6 M8 12 L21 12 M8 18 L21 18 M3 6 L3.01 6 M3 12 L3.01 12 M3 18 L3.01 18", group);
        ToggleButton btnScheduler = createNavButton("Scheduler", "M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 M12 7 L12 12 L15.5 14", group);
        ToggleButton btnMedia = createNavButton("Media", "M2 4 h20 v16 h-20 z M10 9 L15.5 12 L10 15", group);
        ToggleButton btnCatalog = createNavButton("Catalog", "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z", group);
        ToggleButton btnSafety = createNavButton("Safety", "M12 2 L4 5 v6 c0 5 3.4 8.4 8 11 c4.6-2.6 8-6 8-11 V5 L12 2", group);
        
        Region spacer = new Region();
        VBox.setVgrow(spacer, Priority.ALWAYS);
        
        ToggleButton btnSettings = createNavButton("Settings", "M12 9 A3 3 0 1 0 12 15 A3 3 0 1 0 12 9", group);
        
        getChildren().addAll(brand, btnDownloads, btnQueue, btnScheduler, btnMedia, btnCatalog, btnSafety, spacer, btnSettings);
        
        group.selectedToggleProperty().addListener((obs, old, newVal) -> {
            if (newVal != null) {
                currentNav = ((ToggleButton) newVal).getText();
                if (navListener != null) {
                    navListener.accept(currentNav);
                }
            }
        });
    }
    
    private Consumer<String> navListener;
    public void setOnNavigated(Consumer<String> listener) {
        this.navListener = listener;
    }
    
    public String getCurrentNav() {
        return currentNav;
    }
    
    private ToggleButton createNavButton(String text, String svgPath, ToggleGroup group) {
        ToggleButton btn = new ToggleButton(text);
        btn.getStyleClass().add("nav-item");
        btn.setToggleGroup(group);
        
        SVGPath icon = new SVGPath();
        icon.setContent(svgPath);
        icon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2; -fx-fill: transparent;");
        icon.getStyleClass().add("nav-icon");
        
        btn.setGraphic(icon);
        return btn;
    }
}
