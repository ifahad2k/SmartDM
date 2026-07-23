package io.smartdm.desktop.shell;

import javafx.application.Platform;
import javafx.geometry.HPos;
import javafx.geometry.Pos;
import javafx.geometry.VPos;
import javafx.scene.control.Button;
import javafx.scene.control.CheckBox;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.ColumnConstraints;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.CompletableFuture;

import io.smartdm.download.http.HttpProbeClient;
import io.smartdm.domain.SourceUri;

public final class AddDownloadDialog extends GlassmorphicDialog {
    
    private final TextField urlField;
    private final TextField nameField;
    private final TextField destinationField;
    private final ComboBox<String> categoryCombo;
    private final TextField descriptionField;
    private final CheckBox rememberPathCheck;
    private final Label fileSizeLabel;
    
    private final Button downloadBtn;
    private final java.util.List<io.smartdm.domain.Download> existingDownloads;
    private java.util.function.Consumer<io.smartdm.domain.Download> onDownloadAdded;
    private final HttpProbeClient prober;
    private final io.smartdm.organization.SmartFolderService smartFolderService;
    private FolderSuggestionPanel suggestionPanel;
    private long probedBytes = 0L;
    
    public AddDownloadDialog(Stage owner, java.util.List<io.smartdm.domain.Download> existingDownloads) {
        this(owner, existingDownloads, null);
    }

    public AddDownloadDialog(Stage owner, java.util.List<io.smartdm.domain.Download> existingDownloads, io.smartdm.organization.SmartFolderService smartFolderService) {
        super(owner, "Download File Info", Modality.NONE);
        this.existingDownloads = existingDownloads;
        this.smartFolderService = smartFolderService;
        this.prober = new HttpProbeClient();
        
        // Ensure the window pops up over everything (like IDM)
        setAlwaysOnTop(true);
        toFront();
        requestFocus();
        
        GridPane grid = new GridPane();
        grid.getStyleClass().add("idm-grid");
        
        ColumnConstraints labelCol = new ColumnConstraints();
        labelCol.setHalignment(HPos.RIGHT);
        
        ColumnConstraints inputCol = new ColumnConstraints();
        inputCol.setHgrow(Priority.ALWAYS);
        inputCol.setFillWidth(true);
        
        ColumnConstraints metaCol = new ColumnConstraints();
        metaCol.setPrefWidth(120);
        metaCol.setHalignment(HPos.CENTER);
        
        grid.getColumnConstraints().addAll(labelCol, inputCol, metaCol);
        
        // --- Row 0: URL ---
        Label urlLabel = new Label("URL");
        urlLabel.getStyleClass().add("idm-label");
        
        urlField = new TextField("");
        urlField.getStyleClass().add("text-input");
        GridPane.setColumnSpan(urlField, 2);
        grid.add(urlLabel, 0, 0);
        grid.add(urlField, 1, 0);
        
        // --- Row 1: Category ---
        Label catLabel = new Label("Category");
        catLabel.getStyleClass().add("idm-label");
        
        categoryCombo = new ComboBox<>();
        categoryCombo.getItems().addAll("General", "Compressed", "Programs", "Documents", "Video", "Music");
        categoryCombo.getSelectionModel().select(0);
        categoryCombo.getStyleClass().add("text-input");
        categoryCombo.setPrefWidth(200);
        
        Button addCatBtn = new Button("+");
        addCatBtn.getStyleClass().add("btn-icon-sq");
        HBox catBox = new HBox(8, categoryCombo, addCatBtn);
        catBox.setAlignment(Pos.CENTER_LEFT);
        
        grid.add(catLabel, 0, 1);
        grid.add(catBox, 1, 1);
        
        // File Icon (Row 1-2 right col)
        javafx.scene.image.ImageView fileIcon = new javafx.scene.image.ImageView();
        fileIcon.setFitWidth(32);
        fileIcon.setFitHeight(32);
        fileIcon.setPreserveRatio(true);
        GridPane.setRowSpan(fileIcon, 2);
        GridPane.setValignment(fileIcon, VPos.CENTER);
        GridPane.setHalignment(fileIcon, HPos.CENTER);
        grid.add(fileIcon, 2, 1);
        
        // --- Row 2: File Name ---
        Label nameLabel = new Label("File Name");
        nameLabel.getStyleClass().add("idm-label");
        
        nameField = new TextField("download.bin");
        nameField.getStyleClass().add("text-input");
        grid.add(nameLabel, 0, 2);
        grid.add(nameField, 1, 2);

        // --- Row 3: Save To (Directory) ---
        Label saveLabel = new Label("Save To");
        saveLabel.getStyleClass().add("idm-label");
        
        String defaultDir = Paths.get(System.getProperty("user.home"), "Downloads").toAbsolutePath().toString();
        destinationField = new TextField(defaultDir);
        destinationField.getStyleClass().add("text-input");
        HBox.setHgrow(destinationField, Priority.ALWAYS);
        
        Button browseBtn = new Button("...");
        browseBtn.getStyleClass().add("btn-icon-sq");
        browseBtn.setOnAction(e -> {
            javafx.stage.DirectoryChooser chooser = new javafx.stage.DirectoryChooser();
            chooser.setTitle("Choose Save Directory");
            try {
                Path currentPath = Paths.get(destinationField.getText().replace("~", System.getProperty("user.home")));
                if (Files.isDirectory(currentPath)) {
                    chooser.setInitialDirectory(currentPath.toFile());
                } else if (currentPath.getParent() != null && Files.isDirectory(currentPath.getParent())) {
                    chooser.setInitialDirectory(currentPath.getParent().toFile());
                }
            } catch (Exception ignored) {}
            
            File selected = chooser.showDialog(browseBtn.getScene().getWindow());
            if (selected != null) {
                destinationField.setText(selected.getAbsolutePath());
            }
        });
        
        HBox saveBox = new HBox(8, destinationField, browseBtn);
        grid.add(saveLabel, 0, 3);
        grid.add(saveBox, 1, 3);

        // Smart Folder Suggestion Chips
        suggestionPanel = new FolderSuggestionPanel(path -> {
            if (path != null) {
                destinationField.setText(path.toAbsolutePath().toString());
            }
        });
        grid.add(suggestionPanel, 1, 4);
        GridPane.setColumnSpan(suggestionPanel, 2);

        // --- Row 5: Remember path ---
        rememberPathCheck = new CheckBox("Remember this path for \"General\" category");
        rememberPathCheck.getStyleClass().add("idm-label");
        rememberPathCheck.setSelected(true);
        
        fileSizeLabel = new Label("Probing...");
        fileSizeLabel.getStyleClass().add("idm-label");
        fileSizeLabel.setStyle("-fx-font-weight: bold;");
        
        grid.add(rememberPathCheck, 1, 5);
        grid.add(fileSizeLabel, 2, 5);
        
        // --- Row 6: Description ---
        Label descLabel = new Label("Description");
        descLabel.getStyleClass().add("idm-label");
        
        descriptionField = new TextField("");
        descriptionField.getStyleClass().add("text-input");
        GridPane.setColumnSpan(descriptionField, 2);
        grid.add(descLabel, 0, 6);
        grid.add(descriptionField, 1, 6);
        
        dialogBody.getChildren().add(grid);
        
        // Listen to URL inputs to auto-fill the destination path and probe
        urlField.textProperty().addListener((observable, oldValue, newValue) -> {
            if (newValue != null && !newValue.isBlank()) {
                try {
                    String filename = extractFilename(newValue);
                    nameField.setText(filename);
                    probeUrl(newValue);
                    updateSmartFolderSuggestions();
                } catch (Exception ignored) {}
            }
        });
        
        nameField.textProperty().addListener((obs, oldV, newV) -> {
            if (newV != null && !newV.isBlank()) {
                io.smartdm.desktop.util.SystemIconExtractor.getFileIconAsync(newV)
                    .thenAccept(img -> Platform.runLater(() -> {
                        if (img != null) {
                            fileIcon.setImage(img);
                        }
                    }));
            }
        });
        
        categoryCombo.valueProperty().addListener((obs, oldV, newV) -> {
            rememberPathCheck.setText("Remember this path for \"" + newV + "\" category");
        });
        
        // Footer
        HBox footer = new HBox();
        footer.getStyleClass().add("dialog-foot");
        footer.setAlignment(Pos.CENTER_RIGHT);
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        Button queueBtn = new Button("Download Later");
        queueBtn.getStyleClass().add("btn");
        queueBtn.setOnAction(e -> processDownload(io.smartdm.domain.DownloadState.QUEUED));
        
        downloadBtn = new Button("Start Download");
        downloadBtn.getStyleClass().addAll("btn", "btn-primary");
        downloadBtn.setOnAction(e -> processDownload(io.smartdm.domain.DownloadState.PROBING));
        
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().addAll("btn", "btn-ghost");
        cancelBtn.setOnAction(e -> close());
        
        footer.getChildren().addAll(spacer, queueBtn, downloadBtn, cancelBtn);
        root.setBottom(footer);
    }
    
    // Removed updateDestination method
    
    private void probeUrl(String url) {
        fileSizeLabel.setText("Probing...");
        try {
            SourceUri source = SourceUri.of(url);
            prober.probeAsync(source).thenAccept(result -> {
                Platform.runLater(() -> {
                    long size = result.size().value();
                    if (size > 0) {
                        fileSizeLabel.setText(formatSize(size));
                        this.probedBytes = size;
                        updateSmartFolderSuggestions();
                    } else {
                        fileSizeLabel.setText("Unknown size");
                    }
                });
            }).exceptionally(ex -> {
                Platform.runLater(() -> fileSizeLabel.setText("Unknown size"));
                return null;
            });
        } catch (Exception ex) {
            fileSizeLabel.setText("Unknown size");
        }
    }
    
    private String formatSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        int exp = (int) (Math.log(bytes) / Math.log(1024));
        char pre = "KMGTPE".charAt(exp - 1);
        return String.format("%.2f %sB", bytes / Math.pow(1024, exp), pre);
    }
    
    private void processDownload(io.smartdm.domain.DownloadState state) {
        if (onDownloadAdded != null) {
            try {
                io.smartdm.domain.Download d = createDownloadFromFields();
                if (d != null) {
                    d.updateState(state);
                    onDownloadAdded.accept(d);
                    close();
                }
            } catch (Exception ex) {
                System.err.println("Failed to queue download: " + ex.getMessage());
            }
        }
    }
    
    private io.smartdm.domain.Download createDownloadFromFields() throws Exception {
        String urlText = urlField.getText().trim();
        io.smartdm.domain.SourceUri source = io.smartdm.domain.SourceUri.of(urlText);
        
        Path destPath = Paths.get(destinationField.getText().replace("~", System.getProperty("user.home"))).toAbsolutePath();
        if (Files.isDirectory(destPath)) {
            String filename = nameField.getText().trim();
            if (filename.isEmpty()) filename = "download.bin";
            destPath = destPath.resolve(filename);
        }
        boolean fileExists = Files.exists(destPath);
        boolean destActive = isDestinationActive(destPath);
        
        if (fileExists || destActive) {
            FileCollisionDialog dialog = new FileCollisionDialog((Stage) getScene().getWindow(), destPath.getFileName().toString());
            FileCollisionDialog.CollisionChoice choice = dialog.showAndGetChoice();
            if (choice == FileCollisionDialog.CollisionChoice.CANCEL) {
                return null;
            } else if (choice == FileCollisionDialog.CollisionChoice.RENAME) {
                destPath = generateUniquePath(destPath);
            }
        }
        
        io.smartdm.domain.Destination dest = io.smartdm.domain.Destination.of(destPath);
        return io.smartdm.domain.Download.create(source, dest);
    }

    private String extractFilename(String urlStr) {
        if (urlStr == null || urlStr.trim().isEmpty()) {
            return "download.bin";
        }
        try {
            String pathPart = java.net.URI.create(urlStr.trim()).getPath();
            if (pathPart != null) {
                int lastSlash = pathPart.lastIndexOf('/');
                if (lastSlash >= 0 && lastSlash < pathPart.length() - 1) {
                    String raw = pathPart.substring(lastSlash + 1);
                    raw = raw.replaceAll("[\\\\/:*?\"<>|\0]", "_");
                    return raw.trim().isEmpty() ? "download.bin" : raw;
                }
            }
        } catch (Exception ignored) {}
        return "download.bin";
    }
    
    private boolean isDestinationActive(Path path) {
        if (existingDownloads == null) return false;
        for (io.smartdm.domain.Download d : existingDownloads) {
            if (d.destination().value().toAbsolutePath().equals(path.toAbsolutePath())) {
                return true;
            }
        }
        return false;
    }
    
    private Path generateUniquePath(Path basePath) {
        if (!Files.exists(basePath) && !isDestinationActive(basePath)) return basePath;
        
        String filename = basePath.getFileName().toString();
        String name = filename;
        String ext = "";
        int dotIdx = filename.lastIndexOf('.');
        if (dotIdx > 0 && dotIdx < filename.length() - 1) {
            name = filename.substring(0, dotIdx);
            ext = filename.substring(dotIdx);
        }
        
        int counter = 1;
        Path parent = basePath.getParent();
        Path uniquePath = basePath;
        while (Files.exists(uniquePath) || isDestinationActive(uniquePath)) {
            uniquePath = parent.resolve(name + " (" + counter + ")" + ext);
            counter++;
        }
        return uniquePath;
    }
    
    public void setOnDownloadAdded(java.util.function.Consumer<io.smartdm.domain.Download> onDownloadAdded) {
        this.onDownloadAdded = onDownloadAdded;
    }
    
    public void setUrlText(String url) {
        if (urlField != null) {
            urlField.setText(url);
            updateSmartFolderSuggestions();
        }
    }

    private void updateSmartFolderSuggestions() {
        if (smartFolderService == null || suggestionPanel == null) return;
        String url = urlField.getText();
        String fileName = nameField.getText();
        if (url == null || url.isBlank()) return;

        javafx.application.Platform.runLater(() -> {
            try {
                java.util.List<io.smartdm.domain.organization.FolderSuggestion> suggestions = 
                    smartFolderService.suggestFolders(url, fileName, null, probedBytes > 0 ? probedBytes : 0L);
                suggestionPanel.setSuggestions(suggestions);
                sizeToScene();
            } catch (Exception ex) {
                ex.printStackTrace();
            }
        });
    }
}
