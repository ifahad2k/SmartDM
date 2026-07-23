package io.smartdm.desktop.shell;

import io.smartdm.domain.Destination;
import io.smartdm.domain.Download;
import io.smartdm.domain.SourceUri;
import io.smartdm.media.api.MediaFormat;
import io.smartdm.media.api.MediaMetadata;
import io.smartdm.media.ytdlp.LocalMediaToolManager;
import io.smartdm.media.ytdlp.YtDlpExtractor;
import javafx.application.Platform;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.scene.layout.Region;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

public final class MediaBatchAddDialog extends GlassmorphicDialog {

    public static class MediaBatchItem {
        private final String url;
        private final SimpleStringProperty title = new SimpleStringProperty("Fetching...");
        private final SimpleStringProperty duration = new SimpleStringProperty("");
        private final SimpleStringProperty status = new SimpleStringProperty("Pending");
        private final javafx.beans.property.SimpleBooleanProperty selected = new javafx.beans.property.SimpleBooleanProperty(true);
        private MediaMetadata metadata;
        private MediaFormat selectedFormat;

        public MediaBatchItem(String url) {
            this.url = url;
        }

        public String getUrl() { return url; }
        public String getTitle() { return title.get(); }
        public SimpleStringProperty titleProperty() { return title; }
        public String getDuration() { return duration.get(); }
        public SimpleStringProperty durationProperty() { return duration; }
        public String getStatus() { return status.get(); }
        public SimpleStringProperty statusProperty() { return status; }
        public boolean isSelected() { return selected.get(); }
        public void setSelected(boolean sel) { selected.set(sel); }
        public javafx.beans.property.SimpleBooleanProperty selectedProperty() { return selected; }
        public MediaMetadata getMetadata() { return metadata; }
        public MediaFormat getSelectedFormat() { return selectedFormat; }

        public void setMetadata(MediaMetadata meta) {
            this.metadata = meta;
            Platform.runLater(() -> {
                if (meta != null && meta.title() != null) {
                    title.set(meta.title());
                    duration.set(meta.getFormattedDuration());
                    status.set("Ready");

                    if (meta.formats() != null && !meta.formats().isEmpty()) {
                        // Pick best audio format
                        for (MediaFormat fmt : meta.formats()) {
                            if (fmt.isAudioOnly() && (fmt.ext() == null || !fmt.ext().equals("webm"))) {
                                selectedFormat = fmt;
                            }
                        }
                        if (selectedFormat == null) selectedFormat = meta.formats().get(0);
                    }
                } else {
                    title.set("Failed to fetch");
                    status.set("Error");
                    selected.set(false); // Deselect errored items automatically
                }
            });
        }
    }

    private final ObservableList<MediaBatchItem> items = FXCollections.observableArrayList();
    private final TableView<MediaBatchItem> table;
    private final TextField destinationField;
    private final Consumer<Download> onDownloadAdded;
    private final ExecutorService executorService;
    private final Button downloadBtn;
    private int processedCount = 0;

    public MediaBatchAddDialog(Stage owner, List<String> urls, ExecutorService executorService, Consumer<Download> onDownloadAdded) {
        // Use null owner to make the window completely independent of the main app
        super(null, "SmartDM — Media Batch Download", Modality.NONE);
        this.executorService = executorService;
        this.onDownloadAdded = onDownloadAdded;

        setAlwaysOnTop(true);
        toFront();
        requestFocus();

        // Header
        Label headerTitle = new Label("Batch Media Download");
        headerTitle.getStyleClass().add("dt");
        Label headerSub = new Label("Extracting metadata for " + urls.size() + " items...");
        headerSub.getStyleClass().add("ds");
        VBox head = new VBox(2, headerTitle, headerSub);

        // Table
        table = new TableView<>();
        table.setItems(items);
        table.setEditable(true);
        table.getStyleClass().add("queue-list");
        
        // Apply inline CSS to fix the bright white header background and borders
        table.setStyle("-fx-control-inner-background: #1C1E26; -fx-text-fill: white; -fx-border-color: #2D313E; -fx-border-radius: 6; -fx-background-radius: 6; -fx-table-cell-border-color: transparent; -fx-base: #1C1E26;");
        
        table.setPrefHeight(250);
        VBox.setVgrow(table, Priority.ALWAYS);

        TableColumn<MediaBatchItem, Boolean> selectCol = new TableColumn<>();
        CheckBox selectAllCb = new CheckBox();
        selectAllCb.setSelected(true);
        selectAllCb.setOnAction(e -> {
            boolean sel = selectAllCb.isSelected();
            for (MediaBatchItem item : items) {
                if (!"Error".equals(item.getStatus())) {
                    item.setSelected(sel);
                }
            }
        });
        selectCol.setGraphic(selectAllCb);
        selectCol.setCellValueFactory(cellData -> cellData.getValue().selectedProperty());
        selectCol.setCellFactory(javafx.scene.control.cell.CheckBoxTableCell.forTableColumn(selectCol));
        selectCol.setPrefWidth(40);
        selectCol.setEditable(true);

        TableColumn<MediaBatchItem, String> titleCol = new TableColumn<>("Title");
        titleCol.setCellValueFactory(cellData -> cellData.getValue().titleProperty());
        titleCol.setPrefWidth(260);

        TableColumn<MediaBatchItem, String> durCol = new TableColumn<>("Duration");
        durCol.setCellValueFactory(cellData -> cellData.getValue().durationProperty());
        durCol.setPrefWidth(80);

        TableColumn<MediaBatchItem, String> statCol = new TableColumn<>("Status");
        statCol.setCellValueFactory(cellData -> cellData.getValue().statusProperty());
        statCol.setPrefWidth(80);

        table.getColumns().add(selectCol);
        table.getColumns().add(titleCol);
        table.getColumns().add(durCol);
        table.getColumns().add(statCol);

        // Save To
        Label saveHeader = new Label("Save To Directory");
        saveHeader.getStyleClass().add("field-label");

        String defaultDir = Paths.get(System.getProperty("user.home"), "Downloads").toAbsolutePath().toString();
        destinationField = new TextField(defaultDir);
        destinationField.getStyleClass().add("text-input");

        Button browseBtn = new Button("...");
        browseBtn.getStyleClass().add("btn-icon-sq");
        browseBtn.setOnAction(e -> {
            javafx.stage.DirectoryChooser chooser = new javafx.stage.DirectoryChooser();
            chooser.setTitle("Choose Save Directory");
            File selected = chooser.showDialog(browseBtn.getScene().getWindow());
            if (selected != null) {
                destinationField.setText(selected.getAbsolutePath());
            }
        });

        HBox saveBox = new HBox(8, destinationField, browseBtn);
        HBox.setHgrow(destinationField, Priority.ALWAYS);

        VBox content = new VBox(16, head, table, saveHeader, saveBox);
        content.setPrefWidth(650);
        content.setPrefHeight(500);
        dialogBody.getChildren().add(content);

        // Footer
        HBox footer = new HBox(8);
        footer.getStyleClass().add("dialog-foot");
        footer.setAlignment(Pos.CENTER_RIGHT);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        downloadBtn = new Button("Download All");
        downloadBtn.getStyleClass().addAll("btn", "btn-primary");
        downloadBtn.setDisable(true);
        downloadBtn.setOnAction(e -> startBatchDownload());

        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().addAll("btn", "btn-ghost");
        cancelBtn.setOnAction(e -> close());

        footer.getChildren().addAll(spacer, downloadBtn, cancelBtn);
        root.setBottom(footer);

        // Start Fetching
        System.out.println("[MediaBatchAddDialog] Received URLs: " + (urls == null ? "null" : urls.size()));
        if (urls != null) {
            for (String url : urls) {
                MediaBatchItem item = new MediaBatchItem(url);
                items.add(item);
            }
            startMetadataFetch(urls, headerSub);
        } else {
            headerSub.setText("Error: No URLs received.");
        }
    }

    private void startMetadataFetch(List<String> urls, Label headerSub) {
        LocalMediaToolManager toolMgr = new LocalMediaToolManager();
        if (!toolMgr.isAvailable()) {
            headerSub.setText("Error: yt-dlp is not available on this system.");
            return;
        }

        YtDlpExtractor extractor = new YtDlpExtractor(toolMgr);
        java.util.concurrent.Semaphore concurrencyLimit = new java.util.concurrent.Semaphore(1);
        java.util.concurrent.atomic.AtomicBoolean isRateLimited = new java.util.concurrent.atomic.AtomicBoolean(false);

        for (MediaBatchItem item : items) {
            executorService.submit(() -> {
                if (isRateLimited.get()) {
                    item.setMetadata(null);
                    Platform.runLater(() -> {
                        processedCount++;
                        if (processedCount == items.size()) {
                            headerSub.setText("Aborted due to YouTube Bot Protection (IP Rate Limit).");
                            downloadBtn.setDisable(false);
                        }
                    });
                    return;
                }

                try {
                    concurrencyLimit.acquire();
                    MediaMetadata meta = extractor.extractMetadataAsync(item.getUrl()).get(90, TimeUnit.SECONDS);
                    item.setMetadata(meta);
                    Thread.sleep(1500); // 1.5s delay to prevent YouTube HTTP 429 rate limit
                } catch (Exception e) {
                    item.setMetadata(null);
                    if (e.getMessage() != null && e.getMessage().contains("HTTP Error 429")) {
                        isRateLimited.set(true);
                    } else if (e.getCause() != null && e.getCause().getMessage() != null && e.getCause().getMessage().contains("HTTP Error 429")) {
                        isRateLimited.set(true);
                    }
                } finally {
                    concurrencyLimit.release();
                    Platform.runLater(() -> {
                        if (!isRateLimited.get()) {
                            processedCount++;
                            headerSub.setText("Processed " + processedCount + " of " + items.size() + " items...");
                            if (processedCount == items.size()) {
                                headerSub.setText("Ready to download " + items.size() + " items.");
                                downloadBtn.setDisable(false);
                            }
                        } else {
                            processedCount++;
                            if (processedCount == items.size()) {
                                headerSub.setText("Aborted due to YouTube Bot Protection (IP Rate Limit).");
                                downloadBtn.setDisable(false);
                            }
                        }
                    });
                }
            });
        }
    }

    private void startBatchDownload() {
        String dir = destinationField.getText().trim();
        for (MediaBatchItem item : items) {
            if (item.isSelected() && item.getMetadata() != null && item.getMetadata().title() != null) {
                MediaFormat fmt = item.getSelectedFormat();
                String ext = (fmt != null && fmt.ext() != null) ? fmt.ext() : "m4a";
                String filename = sanitizeFilename(item.getMetadata().title()) + "." + ext;
                Path targetPath = Paths.get(dir, filename).toAbsolutePath();
                
                targetPath = generateUniquePath(targetPath);

                try {
                    SourceUri source = SourceUri.of(item.getMetadata().webpageUrl());
                    Destination dest = Destination.of(targetPath);
                    Download download = Download.create(source, dest);

                    if (onDownloadAdded != null) {
                        onDownloadAdded.accept(download);
                    }

                    String formatArg = (fmt != null && fmt.formatId() != null) ? fmt.formatId() : "bestaudio";
                    MediaDownloadTracker.startDownload(download, targetPath, item.getMetadata().webpageUrl(), formatArg);
                } catch (Exception ex) {
                    System.err.println("Failed to queue batch item: " + ex.getMessage());
                }
            }
        }
        close();
    }

    private Path generateUniquePath(Path targetPath) {
        String name = targetPath.getFileName().toString();
        String dir = (targetPath.getParent() != null) ? targetPath.getParent().toString() : ".";
        int dotIdx = name.lastIndexOf('.');
        String base = (dotIdx > 0) ? name.substring(0, dotIdx) : name;
        String ext = (dotIdx > 0) ? name.substring(dotIdx) : "";

        int count = 1;
        Path newPath = targetPath;
        while (Files.exists(newPath) || Files.exists(Paths.get(newPath.toString() + ".part"))) {
            newPath = Paths.get(dir, base + " (" + count + ")" + ext);
            count++;
        }
        return newPath;
    }

    private static String sanitizeFilename(String name) {
        if (name == null || name.isBlank()) return "track";
        return name.replaceAll("[\\\\/:*?\"<>|\0]", "_").trim();
    }
}
