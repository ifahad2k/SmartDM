package io.smartdm.desktop.shell;

import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public final class AddDownloadDialog extends GlassmorphicDialog {
    
    private final TextField urlField;
    private final TextField destinationField;
    private final ComboBox<String> categoryCombo;
    private final Button downloadBtn;
    private final java.util.List<io.smartdm.domain.Download> existingDownloads;
    
    public AddDownloadDialog(Stage owner, java.util.List<io.smartdm.domain.Download> existingDownloads) {
        super(owner, "SmartDM — New Download");
        this.existingDownloads = existingDownloads;
        
        // Header
        Label headerTitle = new Label("Add a new download");
        headerTitle.getStyleClass().add("dt");
        Label headerSub = new Label("Paste a link and SmartDM will inspect it before anything is written to disk.");
        headerSub.getStyleClass().add("ds");
        VBox head = new VBox(2, headerTitle, headerSub);
        
        // File URL field
        Label urlLabel = new Label("FILE URL");
        urlLabel.getStyleClass().add("field-label");
        
        urlField = new TextField("");
        urlField.setPromptText("Paste download link here...");
        urlField.getStyleClass().add("text-input");
        HBox.setHgrow(urlField, Priority.ALWAYS);
        
        HBox urlRow = new HBox(8, urlField);
        VBox urlGroup = new VBox(6, urlLabel, urlRow);
        
        // Save to field
        Label destLabel = new Label("SAVE TO");
        destLabel.getStyleClass().add("field-label");
        
        String defaultDir = Paths.get(System.getProperty("user.home"), "Downloads").toAbsolutePath().toString();
        destinationField = new TextField(defaultDir);
        destinationField.getStyleClass().add("text-input");
        HBox.setHgrow(destinationField, Priority.ALWAYS);
        
        Button browseBtn = new Button("Browse");
        browseBtn.getStyleClass().addAll("btn", "btn-ghost");
        browseBtn.setOnAction(e -> {
            javafx.stage.DirectoryChooser chooser = new javafx.stage.DirectoryChooser();
            chooser.setTitle("Choose Save Directory");
            // Set initial directory if valid
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
                // If we already have a filename in the field, preserve it
                String currentText = destinationField.getText().trim();
                String filename = extractFilename(urlField.getText());
                destinationField.setText(new File(selected, filename).getAbsolutePath());
            }
        });
        
        HBox destRow = new HBox(8, destinationField, browseBtn);
        VBox destGroup = new VBox(6, destLabel, destRow);
        HBox.setHgrow(destGroup, Priority.ALWAYS);
        
        // Category
        Label catLabel = new Label("CATEGORY");
        catLabel.getStyleClass().add("field-label");
        categoryCombo = new ComboBox<>();
        categoryCombo.getItems().addAll("Compressed", "Programs", "Documents", "Video", "Music");
        categoryCombo.getSelectionModel().select(0);
        categoryCombo.getStyleClass().add("text-input");
        categoryCombo.setMaxWidth(Double.MAX_VALUE);
        VBox catGroup = new VBox(6, catLabel, categoryCombo);
        HBox.setHgrow(catGroup, Priority.ALWAYS);
        
        HBox row2 = new HBox(12, destGroup, catGroup);
        
        dialogBody.getChildren().addAll(head, urlGroup, row2);
        
        // Listen to URL inputs to auto-fill the destination path with the extracted filename
        urlField.textProperty().addListener((observable, oldValue, newValue) -> {
            if (newValue != null && !newValue.isBlank()) {
                try {
                    String filename = extractFilename(newValue);
                    Path currentPath = Paths.get(destinationField.getText().replace("~", System.getProperty("user.home")));
                    if (Files.isDirectory(currentPath)) {
                        destinationField.setText(currentPath.resolve(filename).toString());
                    } else if (currentPath.getParent() != null) {
                        destinationField.setText(currentPath.getParent().resolve(filename).toString());
                    }
                } catch (Exception ignored) {}
            }
        });
        
        // Footer
        HBox footer = new HBox();
        footer.getStyleClass().add("dialog-foot");
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().addAll("btn", "btn-ghost");
        cancelBtn.setOnAction(e -> close());
        
        Button queueBtn = new Button("Add to queue");
        queueBtn.getStyleClass().add("btn");
        queueBtn.setOnAction(e -> {
            if (onDownloadAdded != null) {
                try {
                    io.smartdm.domain.Download d = createDownloadFromFields();
                    if (d != null) {
                        d.updateState(io.smartdm.domain.DownloadState.QUEUED);
                        onDownloadAdded.accept(d);
                        close();
                    }
                } catch (Exception ex) {
                    System.err.println("Failed to queue download: " + ex.getMessage());
                }
            }
        });
        
        downloadBtn = new Button("Download now");
        downloadBtn.getStyleClass().addAll("btn", "btn-primary");
        downloadBtn.setOnAction(e -> {
            if (onDownloadAdded != null) {
                try {
                    io.smartdm.domain.Download d = createDownloadFromFields();
                    if (d != null) {
                        d.updateState(io.smartdm.domain.DownloadState.PROBING);
                        onDownloadAdded.accept(d);
                        close();
                    }
                } catch (Exception ex) {
                    System.err.println("Failed to initiate download: " + ex.getMessage());
                }
            }
        });
        
        footer.getChildren().addAll(spacer, cancelBtn, queueBtn, downloadBtn);
        root.setBottom(footer);
    }
    
    private io.smartdm.domain.Download createDownloadFromFields() throws Exception {
        String urlText = urlField.getText().trim();
        io.smartdm.domain.SourceUri source = io.smartdm.domain.SourceUri.of(urlText);
        
        Path destPath = Paths.get(destinationField.getText().replace("~", System.getProperty("user.home"))).toAbsolutePath();
        if (Files.isDirectory(destPath)) {
            String filename = extractFilename(urlText);
            destPath = destPath.resolve(filename);
        }
        boolean fileExists = Files.exists(destPath);
        boolean destActive = isDestinationActive(destPath);
        System.out.println("DEBUG: Checking collision for " + destPath);
        System.out.println("DEBUG: Files.exists=" + fileExists + ", isDestinationActive=" + destActive);
        if (destActive) {
            System.out.println("DEBUG: existingDownloads size=" + existingDownloads.size());
            for (io.smartdm.domain.Download d : existingDownloads) {
                System.out.println("DEBUG: Download " + d.id() + " dest=" + d.destination().value());
            }
        }
        
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
                    // Sanitize illegal characters
                    raw = raw.replaceAll("[\\\\/:*?\"<>|\0]", "_");
                    return raw.trim().isEmpty() ? "download.bin" : raw;
                }
            }
        } catch (Exception ignored) {}
        return "download.bin";
    }
    
    private java.util.function.Consumer<io.smartdm.domain.Download> onDownloadAdded;
    
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
}
