package io.smartdm.desktop.shell;

import javafx.scene.layout.HBox;
import javafx.scene.control.TextField;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.Region;
import javafx.scene.layout.Priority;
import javafx.geometry.Pos;
import javafx.scene.shape.SVGPath;

import java.util.function.Consumer;
import io.smartdm.domain.Download;
import io.smartdm.domain.SourceUri;
import io.smartdm.domain.Destination;
import java.nio.file.Paths;

import java.util.function.Supplier;

public final class TopBar extends HBox {
    public TopBar(Supplier<java.util.List<Download>> existingDownloadsProvider, Consumer<Download> onDownloadAdded) {
        getStyleClass().add("topbar");

        // Search Field
        HBox searchWrap = new HBox();
        searchWrap.getStyleClass().add("search-wrap");
        searchWrap.setMaxWidth(480);
        HBox.setHgrow(searchWrap, Priority.ALWAYS);

        SVGPath searchIcon = new SVGPath();
        searchIcon.setContent("M11,4 A7,7 0 1,0 11,18 A7,7 0 1,0 11,4 M16.65,16.65 L21,21");
        searchIcon.setStyle("-fx-stroke: #767E96; -fx-stroke-width: 2; -fx-fill: transparent; -fx-stroke-linecap: round;");
        
        TextField searchField = new TextField();
        searchField.setPromptText("Search downloads — “video from last week under 200 MB”");
        searchField.getStyleClass().add("search-field");
        HBox.setHgrow(searchField, Priority.ALWAYS);
        
        Label searchHint = new Label("Ctrl K");
        searchHint.getStyleClass().add("search-hint");
        
        searchWrap.getChildren().addAll(searchIcon, searchField, searchHint);
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // Buttons
        Button addBtn = new Button("Add URL");
        addBtn.getStyleClass().add("btn");
        
        // Add URL SVG
        SVGPath addIcon = new SVGPath();
        addIcon.setContent("M12 5 L12 19 M5 12 L19 12");
        addIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2; -fx-fill: transparent;");
        addBtn.setGraphic(addIcon);
        
        addBtn.setOnAction(e -> {
            AddDownloadDialog d = new AddDownloadDialog((javafx.stage.Stage) getScene().getWindow(), existingDownloadsProvider.get());
            d.setOnDownloadAdded(onDownloadAdded);
            d.show();
        });

        Button importBtn = new Button("Import batch");
        importBtn.getStyleClass().addAll("btn", "btn-primary");
        
        importBtn.setOnAction(e -> {
            BatchAddDialog d = new BatchAddDialog((javafx.stage.Stage) getScene().getWindow());
            d.showAndWait();
            if (d.isResultConfirmed() && d.getBatchUrls() != null) {
                for (String url : d.getBatchUrls()) {
                    try {
                        String filename = java.nio.file.Paths.get(new java.net.URI(url).getPath()).getFileName().toString();
                        if (filename == null || filename.isEmpty()) {
                            filename = "download_" + System.currentTimeMillis();
                        }
                        String defaultDir = Paths.get(System.getProperty("user.home"), "Downloads").toAbsolutePath().toString();
                        Destination dest = Destination.of(Paths.get(defaultDir, filename));
                        Download dl = Download.create(SourceUri.of(url), dest);
                        onDownloadAdded.accept(dl);
                    } catch (Exception ex) {
                        // Skip malformed URIs at this stage
                    }
                }
            }
        });
        // Theme Toggle
        Button themeBtn = new Button();
        themeBtn.getStyleClass().add("icon-btn");
        SVGPath themeIcon = new SVGPath();
        themeIcon.setContent("M12 7 A5 5 0 1 0 12 17 A5 5 0 1 0 12 7"); // Simplified circle
        themeIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2; -fx-fill: transparent;");
        themeBtn.setGraphic(themeIcon);

        getChildren().addAll(searchWrap, spacer, addBtn, importBtn, themeBtn);
    }
}
