package io.smartdm.desktop.shell;

import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.Destination;
import io.smartdm.domain.SourceUri;
import io.smartdm.media.api.MediaFormat;
import io.smartdm.media.api.MediaMetadata;
import io.smartdm.media.ytdlp.LocalMediaToolManager;
import javafx.application.Platform;
import javafx.geometry.HPos;
import javafx.geometry.Pos;
import javafx.geometry.VPos;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.ListCell;
import javafx.scene.control.TextField;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.ColumnConstraints;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.function.Consumer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.CompletableFuture;

public final class MediaDownloadDialog extends GlassmorphicDialog {
    private static final ExecutorService IO_EXECUTOR = Executors.newSingleThreadExecutor();

    private final MediaMetadata metadata;
    private final Label titleLabel;
    private final Label durationLabel;
    private final ImageView thumbnailView;
    private final ComboBox<MediaFormat> formatCombo;
    private final TextField nameField;
    private final TextField destinationField;
    private Consumer<Download> onDownloadAdded;
    private final io.smartdm.organization.SmartFolderService smartFolderService;
    private final io.smartdm.domain.repository.DownloadRepository repository;
    private final io.smartdm.media.api.MediaDownloadRunner runner;
    private FolderSuggestionPanel suggestionPanel;

    public MediaDownloadDialog(Stage owner, MediaMetadata metadata, Consumer<Download> onDownloadAdded, io.smartdm.media.api.MediaDownloadRunner runner) {
        this(owner, metadata, null, onDownloadAdded, null, null, runner);
    }

    public MediaDownloadDialog(Stage owner, MediaMetadata metadata, Consumer<Download> onDownloadAdded, io.smartdm.organization.SmartFolderService smartFolderService, io.smartdm.media.api.MediaDownloadRunner runner) {
        this(owner, metadata, null, onDownloadAdded, smartFolderService, null, runner);
    }

    public MediaDownloadDialog(Stage owner, MediaMetadata metadata, String preferredFormatId, Consumer<Download> onDownloadAdded, io.smartdm.media.api.MediaDownloadRunner runner) {
        this(owner, metadata, preferredFormatId, onDownloadAdded, null, null, runner);
    }

    public MediaDownloadDialog(Stage owner, MediaMetadata metadata, String preferredFormatId, Consumer<Download> onDownloadAdded, io.smartdm.organization.SmartFolderService smartFolderService, io.smartdm.domain.repository.DownloadRepository repository, io.smartdm.media.api.MediaDownloadRunner runner) {
        super(owner, "Media Download - " + metadata.title(), Modality.NONE);
        this.metadata = metadata;
        this.onDownloadAdded = onDownloadAdded;
        this.smartFolderService = smartFolderService;
        this.repository = repository;
        this.runner = runner;

        setAlwaysOnTop(true);
        toFront();
        requestFocus();

        GridPane grid = new GridPane();
        grid.getStyleClass().add("idm-grid");
        grid.setPrefWidth(650);
        grid.setMinWidth(650);
        grid.setMaxWidth(650);

        ColumnConstraints labelCol = new ColumnConstraints();
        labelCol.setHalignment(HPos.RIGHT);
        labelCol.setMinWidth(110);
        labelCol.setPrefWidth(110);

        ColumnConstraints inputCol = new ColumnConstraints();
        inputCol.setHgrow(Priority.ALWAYS);
        inputCol.setFillWidth(true);

        ColumnConstraints metaCol = new ColumnConstraints();
        metaCol.setPrefWidth(120);
        metaCol.setHalignment(HPos.CENTER);

        grid.getColumnConstraints().addAll(labelCol, inputCol, metaCol);

        // --- Row 0: Title ---
        Label titleHeader = new Label("Title");
        titleHeader.getStyleClass().add("idm-label");

        titleLabel = new Label(metadata.title());
        titleLabel.getStyleClass().add("idm-label");
        titleLabel.setStyle("-fx-font-weight: bold; -fx-text-fill: #37E9FF;");
        titleLabel.setWrapText(true);

        grid.add(titleHeader, 0, 0);
        grid.add(titleLabel, 1, 0);

        // Thumbnail (Row 0-2 right col)
        thumbnailView = new ImageView();
        thumbnailView.setFitWidth(110);
        thumbnailView.setFitHeight(75);
        thumbnailView.setPreserveRatio(true);
        GridPane.setRowSpan(thumbnailView, 3);
        GridPane.setValignment(thumbnailView, VPos.CENTER);
        GridPane.setHalignment(thumbnailView, HPos.CENTER);
        grid.add(thumbnailView, 2, 0);

        if (metadata.thumbnailUrl() != null && !metadata.thumbnailUrl().isBlank()) {
            try {
                Image thumb = new Image(metadata.thumbnailUrl(), true);
                thumbnailView.setImage(thumb);
            } catch (Exception ignored) {}
        }

        // --- Row 1: Duration ---
        Label durHeader = new Label("Duration");
        durHeader.getStyleClass().add("idm-label");

        durationLabel = new Label(metadata.getFormattedDuration());
        durationLabel.getStyleClass().add("idm-label");

        grid.add(durHeader, 0, 1);
        grid.add(durationLabel, 1, 1);

        // --- Row 2: Format Choice ---
        Label formatHeader = new Label("Quality / Format");
        formatHeader.getStyleClass().add("idm-label");

        formatCombo = new ComboBox<>();
        formatCombo.getStyleClass().add("text-input");
        formatCombo.setPrefWidth(320);

        formatCombo.setCellFactory(param -> new ListCell<>() {
            @Override
            protected void updateItem(MediaFormat item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                } else {
                    setText(item.getDisplayName());
                }
            }
        });

        formatCombo.setButtonCell(new ListCell<>() {
            @Override
            protected void updateItem(MediaFormat item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                } else {
                    setText(item.getDisplayName());
                }
            }
        });

        if (metadata.formats() != null && !metadata.formats().isEmpty()) {
            java.util.List<MediaFormat> deduplicated = new java.util.ArrayList<>();
            java.util.Set<String> seenNames = new java.util.HashSet<>();
            for (MediaFormat fmt : metadata.formats()) {
                String name = fmt.getDisplayName();
                if (!seenNames.contains(name)) {
                    seenNames.add(name);
                    deduplicated.add(fmt);
                }
            }
            formatCombo.getItems().addAll(deduplicated);
            MediaFormat selectedFmt = deduplicated.get(0);
            if (preferredFormatId != null && !preferredFormatId.isBlank()) {
                String pref = preferredFormatId.toLowerCase().trim();
                for (MediaFormat fmt : deduplicated) {
                    if (fmt.formatId().equalsIgnoreCase(pref) ||
                        (fmt.resolution() != null && fmt.resolution().toLowerCase().contains(pref)) ||
                        (pref.contains("audio") && fmt.isAudioOnly()) ||
                        (fmt.ext() != null && fmt.ext().equalsIgnoreCase(pref))) {
                        selectedFmt = fmt;
                        break;
                    }
                }
            }
            formatCombo.getSelectionModel().select(selectedFmt);
        }

        grid.add(formatHeader, 0, 2);
        grid.add(formatCombo, 1, 2);

        // --- Row 3: File Name ---
        Label nameHeader = new Label("File Name");
        nameHeader.getStyleClass().add("idm-label");

        String defaultExt = formatCombo.getValue() != null ? formatCombo.getValue().ext() : "mp4";
        String sanitizedTitle = sanitizeFilename(metadata.title()) + "." + defaultExt;
        nameField = new TextField(sanitizedTitle);
        nameField.getStyleClass().add("text-input");

        grid.add(nameHeader, 0, 3);
        grid.add(nameField, 1, 3);

        formatCombo.valueProperty().addListener((obs, oldF, newF) -> {
            if (newF != null) {
                String currentName = nameField.getText();
                int dotIdx = currentName.lastIndexOf('.');
                String baseName = (dotIdx > 0) ? currentName.substring(0, dotIdx) : currentName;
                nameField.setText(baseName + "." + newF.ext());
            }
        });

        // --- Row 4: Save To ---
        Label saveHeader = new Label("Save To");
        saveHeader.getStyleClass().add("idm-label");

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

        grid.add(saveHeader, 0, 4);
        grid.add(saveBox, 1, 4);

        // Smart Folder Suggestion Chips
        suggestionPanel = new FolderSuggestionPanel(path -> {
            if (path != null) {
                destinationField.setText(path.toAbsolutePath().toString());
            }
        });
        grid.add(suggestionPanel, 1, 5);
        GridPane.setColumnSpan(suggestionPanel, 2);

        dialogBody.getChildren().add(grid);
        updateSmartFolderSuggestions();
        sizeToScene();

        // Footer
        HBox footer = new HBox();
        footer.getStyleClass().add("dialog-foot");
        footer.setAlignment(Pos.CENTER_RIGHT);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button downloadBtn = new Button("Start Download");
        downloadBtn.getStyleClass().addAll("btn", "btn-primary");
        downloadBtn.setOnAction(e -> startMediaDownload());

        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().addAll("btn", "btn-ghost");
        cancelBtn.setOnAction(e -> close());

        footer.getChildren().addAll(spacer, downloadBtn, cancelBtn);
        root.setBottom(footer);
    }

    private void startMediaDownload() {
        MediaFormat selectedFormat = formatCombo.getValue();
        String filename = nameField.getText().trim();
        if (filename.isEmpty()) filename = "download." + (selectedFormat != null ? selectedFormat.ext() : "mp4");
        String dir = destinationField.getText().trim();

        Path targetPath = Paths.get(dir, filename).toAbsolutePath();

        CompletableFuture.supplyAsync(() -> {
            boolean fileExists = Files.exists(targetPath);
            boolean isPartExists = Files.exists(Paths.get(targetPath.toString() + ".part")) || Files.exists(Paths.get(targetPath.toString() + ".ytdl"));
            boolean destActive = isDestinationActive(targetPath);
            return fileExists || isPartExists || destActive;
        }, IO_EXECUTOR).thenAccept(hasCollision -> {
            Platform.runLater(() -> {
                if (hasCollision) {
                    handleCollision(targetPath, selectedFormat);
                } else {
                    finishDownloadStart(targetPath, selectedFormat);
                }
            });
        }).exceptionally(ex -> {
            System.err.println("Failed to check file collision: " + ex.getMessage());
            return null;
        });
    }

    private void handleCollision(Path targetPath, MediaFormat selectedFormat) {
        Stage owner = (Stage) getScene().getWindow();
        FileCollisionDialog dialog = new FileCollisionDialog(owner, targetPath.getFileName().toString());
        FileCollisionDialog.CollisionChoice choice = dialog.showAndGetChoice();

        if (choice == FileCollisionDialog.CollisionChoice.CANCEL) {
            return;
        }

        CompletableFuture.runAsync(() -> {
            Path finalTargetPath = targetPath;
            if (choice == FileCollisionDialog.CollisionChoice.RENAME) {
                finalTargetPath = generateUniquePath(targetPath);
            } else if (choice == FileCollisionDialog.CollisionChoice.OVERWRITE) {
                runner.deleteMediaFiles(targetPath);
            }
            final Path p = finalTargetPath;
            Platform.runLater(() -> finishDownloadStart(p, selectedFormat));
        }, IO_EXECUTOR).exceptionally(ex -> {
            System.err.println("Failed to resolve collision: " + ex.getMessage());
            return null;
        });
    }

    private void finishDownloadStart(Path targetPath, MediaFormat selectedFormat) {
        try {
            SourceUri source = SourceUri.of(metadata.webpageUrl());
            Destination dest = Destination.of(targetPath.toAbsolutePath().toString());
            Download download = Download.create(source, dest);

            if (onDownloadAdded != null) {
                onDownloadAdded.accept(download);
            }

            String formatArg = (selectedFormat != null && selectedFormat.formatId() != null) ? selectedFormat.formatId() : "b";
            runner.startDownload(download, targetPath, metadata.webpageUrl(), formatArg);
            javafx.application.Platform.runLater(this::close);
        } catch (Exception ex) {
            System.err.println("Failed to start media download: " + ex.getMessage());
        }
    }

    private boolean isDestinationActive(Path path) {
        if (repository == null) return false;
        for (io.smartdm.domain.Download d : repository.findAll()) {
            if (d.state() != io.smartdm.domain.DownloadState.COMPLETED && 
                d.state() != io.smartdm.domain.DownloadState.CANCELED && 
                d.state() != io.smartdm.domain.DownloadState.FAILED) {
                if (d.destination().value().equals(path.toAbsolutePath().toString())) {
                    return true;
                }
            }
        }
        return false;
    }

    private Path generateUniquePath(Path targetPath) {
        if (!Files.exists(targetPath) && !isDestinationActive(targetPath)) return targetPath;

        String name = targetPath.getFileName().toString();
        String dir = (targetPath.getParent() != null) ? targetPath.getParent().toString() : ".";
        int dotIdx = name.lastIndexOf('.');
        String base = (dotIdx > 0) ? name.substring(0, dotIdx) : name;
        String ext = (dotIdx > 0) ? name.substring(dotIdx) : "";

        int count = 1;
        Path newPath;
        do {
            newPath = Paths.get(dir, base + " (" + count + ")" + ext);
            count++;
        } while (Files.exists(newPath) || Files.exists(Paths.get(newPath.toString() + ".part")) || isDestinationActive(newPath));
        return newPath;
    }

    private static String sanitizeFilename(String name) {
        if (name == null || name.isBlank()) return "video";
        return name.replaceAll("[\\\\/:*?\"<>|\0]", "_").trim();
    }

    private void updateSmartFolderSuggestions() {
        if (smartFolderService == null || suggestionPanel == null) return;
        String url = metadata != null ? metadata.webpageUrl() : "";
        String fileName = nameField.getText();
        long fileSize = (formatCombo.getValue() != null) ? formatCombo.getValue().fileSize() : 0L;

        CompletableFuture.supplyAsync(() -> {
            return smartFolderService.suggestFolders(url, fileName, "video/mp4", fileSize);
        }, IO_EXECUTOR).thenAccept(suggestions -> {
            Platform.runLater(() -> {
                suggestionPanel.setSuggestions(suggestions);
                sizeToScene();
            });
        }).exceptionally(ex -> {
            System.err.println("Failed to fetch smart folders: " + ex.getMessage());
            return null;
        });
    }
}
