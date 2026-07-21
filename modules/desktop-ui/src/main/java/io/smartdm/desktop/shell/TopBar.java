package io.smartdm.desktop.shell;

import javafx.scene.layout.HBox;
import javafx.scene.control.TextField;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.Region;
import javafx.scene.layout.Priority;
import javafx.geometry.Pos;
import javafx.scene.shape.SVGPath;

import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;

import io.smartdm.desktop.shell.ClipboardMonitor;
import io.smartdm.domain.Download;
import io.smartdm.domain.SourceUri;
import io.smartdm.domain.Destination;
import java.nio.file.Paths;

public final class TopBar extends HBox {
    public TopBar(Supplier<java.util.List<Download>> existingDownloadsProvider, Consumer<Download> onDownloadAdded, Runnable onStartQueueRequested, Runnable onDeleteSelected) {
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
            ClipboardMonitor clipboardMonitor = new ClipboardMonitor();
            List<String> newUrls = clipboardMonitor.checkClipboardOnFocus();
            if (newUrls.size() > 1) {
                BatchAddDialog bd = new BatchAddDialog((javafx.stage.Stage) getScene().getWindow());
                bd.setInputText(String.join("\n", newUrls));
                bd.showAndWait();
                if (bd.isResultConfirmed() && bd.getBatchUrls() != null) {
                    for (String url : bd.getBatchUrls()) {
                        try {
                            String filename = java.nio.file.Paths.get(new java.net.URI(url).getPath()).getFileName().toString();
                            if (filename == null || filename.isEmpty()) filename = "download_" + System.currentTimeMillis();
                            String defaultDir = java.nio.file.Paths.get(System.getProperty("user.home"), "Downloads").toAbsolutePath().toString();
                            io.smartdm.domain.Destination dest = io.smartdm.domain.Destination.of(java.nio.file.Paths.get(defaultDir, filename));
                            io.smartdm.domain.Download dl = io.smartdm.domain.Download.create(io.smartdm.domain.SourceUri.of(url), dest);
                            onDownloadAdded.accept(dl);
                        } catch (Exception ex) {}
                    }
                    if (bd.isDownloadNowRequested() && onStartQueueRequested != null) {
                        onStartQueueRequested.run();
                    }
                }
            } else {
                EnterUrlDialog d = new EnterUrlDialog((javafx.stage.Stage) getScene().getWindow(), existingDownloadsProvider.get(), onDownloadAdded);
                d.show();
            }
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
                if (d.isDownloadNowRequested() && onStartQueueRequested != null) {
                    onStartQueueRequested.run();
                }
            }
        });

        // Delete Button
        Button deleteBtn = new Button();
        deleteBtn.getStyleClass().add("icon-btn");
        SVGPath deleteTopIcon = new SVGPath();
        deleteTopIcon.setContent("M3 6 h18 M19 6 v14 a2 2 0 0 1-2 2 H7 a2 2 0 0 1-2-2 V6 m3 0 V4 a2 2 0 0 1 2-2 h4 a2 2 0 0 1 2 2 v2");
        deleteTopIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2; -fx-fill: transparent;");
        deleteBtn.setGraphic(deleteTopIcon);
        deleteBtn.setOnAction(e -> {
            if (onDeleteSelected != null) {
                onDeleteSelected.run();
            }
        });

        // Theme Toggle
        Button themeBtn = new Button();
        themeBtn.getStyleClass().add("icon-btn");
        SVGPath themeIcon = new SVGPath();
        themeIcon.setContent("M12 7 A5 5 0 1 0 12 17 A5 5 0 1 0 12 7"); // Simplified circle
        themeIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2; -fx-fill: transparent;");
        themeBtn.setGraphic(themeIcon);

        // Browser Integration Toggle
        Button browserBtn = new Button();
        browserBtn.getStyleClass().add("icon-btn");
        SVGPath browserIcon = new SVGPath();
        browserIcon.setContent("M2,12 A10,10 0 1,1 22,12 A10,10 0 1,1 2,12 M2,12 H22 M12,2 V22 M8,2 C10,6 10,18 8,22 M16,2 C14,6 14,18 16,22"); // Web/globe icon
        browserIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2; -fx-fill: transparent;");
        browserBtn.setGraphic(browserIcon);
        browserBtn.setOnAction(e -> {
            new BrowserIntegrationDialog((javafx.stage.Stage) getScene().getWindow()).showAndWait();
        });

        getChildren().addAll(searchWrap, spacer, addBtn, importBtn, deleteBtn, themeBtn, browserBtn);
    }
}
