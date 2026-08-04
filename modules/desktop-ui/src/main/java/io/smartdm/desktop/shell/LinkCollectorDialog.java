package io.smartdm.desktop.shell;

import io.smartdm.domain.Destination;
import io.smartdm.domain.Download;
import io.smartdm.domain.SourceUri;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;
import javafx.stage.Stage;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.URL;
import java.net.URLConnection;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class LinkCollectorDialog extends GlassmorphicDialog {

    private final TextField pageUrlField;
    private final TextField filterField;
    private final ComboBox<String> extFilterCombo;
    private final ListView<String> linksListView;
    private final ObservableList<String> collectedLinks = FXCollections.observableArrayList();
    private final List<String> allExtractedLinks = new ArrayList<>();
    private final TextField destFolderField;
    private final Consumer<List<Download>> onAddDownloads;
    private final Label statusLabel;

    @SuppressWarnings("this-escape")
    public LinkCollectorDialog(Stage owner, Consumer<List<Download>> onAddDownloads) {
        super(owner, "SmartDM — Site & Page Link Collector");
        this.onAddDownloads = onAddDownloads;

        VBox content = new VBox(12);

        // Page URL Input Row
        Label pageUrlLabel = new Label("Webpage URL to crawl:");
        pageUrlLabel.setStyle("-fx-text-fill: #E2E8F0; -fx-font-size: 12px;");

        pageUrlField = new TextField();
        pageUrlField.setPromptText("https://example.com/downloads.html");
        pageUrlField.getStyleClass().add("text-input");

        Button scanBtn = new Button("Extract Links");
        scanBtn.getStyleClass().addAll("btn", "btn-primary");
        scanBtn.setOnAction(e -> startExtraction());

        HBox urlRow = new HBox(8, pageUrlField, scanBtn);
        HBox.setHgrow(pageUrlField, Priority.ALWAYS);

        // Filters Row
        filterField = new TextField();
        filterField.setPromptText("Filter links by keyword...");
        filterField.getStyleClass().add("text-input");
        filterField.textProperty().addListener((obs, oldV, newV) -> applyFilters());

        extFilterCombo = new ComboBox<>();
        extFilterCombo.getItems().addAll("All Extensions", ".mp4 / .mkv", ".zip / .rar", ".pdf / .doc", ".iso / .exe");
        extFilterCombo.getSelectionModel().select(0);
        extFilterCombo.setStyle("-fx-background-color: #1E293B; -fx-text-fill: #F8FAFC;");
        extFilterCombo.setOnAction(e -> applyFilters());

        HBox filterRow = new HBox(8, filterField, extFilterCombo);
        HBox.setHgrow(filterField, Priority.ALWAYS);

        // Links ListView (Multi-select)
        linksListView = new ListView<>(collectedLinks);
        linksListView.getSelectionModel().setSelectionMode(SelectionMode.MULTIPLE);
        linksListView.setPrefHeight(200);
        linksListView.setStyle("-fx-background-color: rgba(15, 23, 42, 0.6); -fx-control-inner-background: #0F172A;");

        statusLabel = new Label("Enter a URL and click Extract Links");
        statusLabel.setStyle("-fx-text-fill: #94A3B8; -fx-font-size: 11px;");

        // Destination folder row
        Label destLabel = new Label("Save to Folder:");
        destLabel.setStyle("-fx-text-fill: #E2E8F0; -fx-font-size: 12px;");

        destFolderField = new TextField(System.getProperty("user.home") + File.separator + "Downloads");
        destFolderField.getStyleClass().add("text-input");

        Button browseBtn = new Button("Browse");
        browseBtn.getStyleClass().add("btn");
        browseBtn.setOnAction(e -> {
            DirectoryChooser dc = new DirectoryChooser();
            dc.setTitle("Select Destination Folder");
            File sel = dc.showDialog(this);
            if (sel != null) {
                destFolderField.setText(sel.getAbsolutePath());
            }
        });

        HBox destRow = new HBox(8, destFolderField, browseBtn);
        HBox.setHgrow(destFolderField, Priority.ALWAYS);

        // Action Buttons
        HBox actionRow = new HBox(10);
        Button selectAllBtn = new Button("Select All");
        selectAllBtn.getStyleClass().addAll("btn", "btn-ghost");
        selectAllBtn.setOnAction(e -> linksListView.getSelectionModel().selectAll());

        Button addSelectedBtn = new Button("Add Selected to Queue");
        addSelectedBtn.getStyleClass().addAll("btn", "btn-primary");
        HBox.setHgrow(addSelectedBtn, Priority.ALWAYS);
        addSelectedBtn.setMaxWidth(Double.MAX_VALUE);
        addSelectedBtn.setOnAction(e -> addSelectedDownloads());

        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().add("btn");
        cancelBtn.setOnAction(e -> close());

        actionRow.getChildren().addAll(selectAllBtn, addSelectedBtn, cancelBtn);

        content.getChildren().addAll(pageUrlLabel, urlRow, filterRow, statusLabel, linksListView, destLabel, destRow, actionRow);
        dialogBody.getChildren().add(content);
    }

    private void startExtraction() {
        String inputUrl = pageUrlField.getText().trim();
        if (inputUrl.isEmpty()) return;
        if (!inputUrl.startsWith("http://") && !inputUrl.startsWith("https://")) {
            inputUrl = "https://" + inputUrl;
            pageUrlField.setText(inputUrl);
        }

        statusLabel.setText("Extracting links from page...");
        allExtractedLinks.clear();
        collectedLinks.clear();

        final String targetUrl = inputUrl;
        CompletableFuture.runAsync(() -> {
            try {
                URL url = URI.create(targetUrl).toURL();
                URLConnection conn = url.openConnection();
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(6000);
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder html = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    html.append(line).append("\n");
                }
                reader.close();

                // Extract href and src links using Regex
                Pattern pattern = Pattern.compile("(?i)(href|src)=\"([^\"]+)\"");
                Matcher matcher = pattern.matcher(html.toString());

                URI baseUri = url.toURI();
                List<String> links = new ArrayList<>();

                while (matcher.find()) {
                    String rawLink = matcher.group(2);
                    if (rawLink.startsWith("javascript:") || rawLink.startsWith("#") || rawLink.startsWith("mailto:")) {
                        continue;
                    }
                    try {
                        URI resolved = baseUri.resolve(rawLink);
                        String absUrl = resolved.toString();
                        if (!links.contains(absUrl)) {
                            links.add(absUrl);
                        }
                    } catch (Exception ignored) {}
                }

                Platform.runLater(() -> {
                    allExtractedLinks.addAll(links);
                    applyFilters();
                    statusLabel.setText(String.format("Found %d total links on page", links.size()));
                });
            } catch (Exception ex) {
                Platform.runLater(() -> statusLabel.setText("Failed to extract links: " + ex.getMessage()));
            }
        });
    }

    private void applyFilters() {
        String text = filterField.getText().toLowerCase().trim();
        String extFilter = extFilterCombo.getValue();

        collectedLinks.clear();
        for (String link : allExtractedLinks) {
            if (!text.isEmpty() && !link.toLowerCase().contains(text)) {
                continue;
            }
            if (extFilter != null && !extFilter.equals("All Extensions")) {
                String lower = link.toLowerCase();
                if (extFilter.contains(".mp4") && !(lower.endsWith(".mp4") || lower.endsWith(".mkv") || lower.endsWith(".avi"))) continue;
                if (extFilter.contains(".zip") && !(lower.endsWith(".zip") || lower.endsWith(".rar") || lower.endsWith(".7z") || lower.endsWith(".tar.gz"))) continue;
                if (extFilter.contains(".pdf") && !(lower.endsWith(".pdf") || lower.endsWith(".doc") || lower.endsWith(".docx"))) continue;
                if (extFilter.contains(".iso") && !(lower.endsWith(".iso") || lower.endsWith(".exe") || lower.endsWith(".msi"))) continue;
            }
            collectedLinks.add(link);
        }
    }

    private void addSelectedDownloads() {
        List<String> selected = linksListView.getSelectionModel().getSelectedItems();
        if (selected.isEmpty()) selected = collectedLinks; // If nothing selected, add all filtered
        if (selected.isEmpty()) return;

        File targetDir = new File(destFolderField.getText().trim());
        if (!targetDir.exists()) targetDir.mkdirs();

        List<Download> created = new ArrayList<>();
        for (String urlStr : selected) {
            try {
                String fileName = extractFileName(urlStr);
                Path destPath = targetDir.toPath().resolve(fileName);
                Download d = Download.create(SourceUri.of(urlStr), Destination.of(destPath));
                created.add(d);
            } catch (Exception ignored) {}
        }

        if (onAddDownloads != null && !created.isEmpty()) {
            onAddDownloads.accept(created);
        }
        close();
    }

    private String extractFileName(String urlStr) {
        try {
            URI uri = new URI(urlStr);
            String path = uri.getPath();
            if (path != null && path.contains("/")) {
                String name = path.substring(path.lastIndexOf('/') + 1);
                if (!name.trim().isEmpty()) return name;
            }
        } catch (Exception ignored) {}
        return "download_" + System.currentTimeMillis();
    }
}
