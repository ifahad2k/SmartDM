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
    private final ComboBox<String> scheduleCombo;
    private final io.smartdm.desktop.shell.controls.NumberSpinner alarmHr;
    private final io.smartdm.desktop.shell.controls.NumberSpinner alarmMin;
    private final io.smartdm.desktop.shell.controls.StringSpinner alarmAmPm;
    private final io.smartdm.desktop.shell.controls.NumberSpinner timerHr;
    private final io.smartdm.desktop.shell.controls.NumberSpinner timerMin;
    private final io.smartdm.desktop.shell.controls.NumberSpinner timerSec;
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

        // Schedule
        Label schedLabel = new Label("START TIME");
        schedLabel.getStyleClass().add("field-label");
        scheduleCombo = new ComboBox<>();
        scheduleCombo.getItems().addAll(
            "Start immediately",
            "Start at a specific time",
            "Start after a timer"
        );
        scheduleCombo.getSelectionModel().select(0);
        scheduleCombo.getStyleClass().add("text-input");
        scheduleCombo.setMaxWidth(Double.MAX_VALUE);
        
        // Custom Spinners Box
        VBox customSchedBox = new VBox();
        customSchedBox.setAlignment(Pos.CENTER);
        customSchedBox.setPadding(new javafx.geometry.Insets(10, 0, 0, 0));
        
        // Exact Time (Alarm)
        HBox alarmBox = new HBox(8);
        alarmBox.setAlignment(Pos.CENTER);
        alarmHr = new io.smartdm.desktop.shell.controls.NumberSpinner(12, 1, 12, true, "%02d");
        alarmMin = new io.smartdm.desktop.shell.controls.NumberSpinner(0, 0, 59, true, "%02d");
        alarmAmPm = new io.smartdm.desktop.shell.controls.StringSpinner(java.util.Arrays.asList("AM", "PM"), 0);
        alarmBox.getChildren().addAll(alarmHr, new Label(":"), alarmMin, alarmAmPm);
        
        // Countdown (Timer)
        HBox timerBox = new HBox(8);
        timerBox.setAlignment(Pos.CENTER);
        timerHr = new io.smartdm.desktop.shell.controls.NumberSpinner(0, 0, 99, false, "%02d");
        timerMin = new io.smartdm.desktop.shell.controls.NumberSpinner(0, 0, 59, true, "%02d");
        timerSec = new io.smartdm.desktop.shell.controls.NumberSpinner(0, 0, 59, true, "%02d");
        timerBox.getChildren().addAll(timerHr, new Label(":"), timerMin, new Label(":"), timerSec);

        scheduleCombo.getSelectionModel().selectedIndexProperty().addListener((obs, oldV, newV) -> {
            customSchedBox.getChildren().clear();
            if (newV.intValue() == 1) customSchedBox.getChildren().add(alarmBox);
            else if (newV.intValue() == 2) customSchedBox.getChildren().add(timerBox);
            
            javafx.application.Platform.runLater(this::sizeToScene);
        });

        VBox schedGroup = new VBox(6, schedLabel, scheduleCombo, customSchedBox);
        HBox.setHgrow(schedGroup, Priority.ALWAYS);

        dialogBody.getChildren().addAll(head, urlGroup, row2, schedGroup);
        
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
                    System.err.println("Failed to add download: " + ex.getMessage());
                }
            }
        });

        // Add listener to update buttons based on schedule selection
        scheduleCombo.getSelectionModel().selectedIndexProperty().addListener((obs, oldV, newV) -> {
            if (newV.intValue() > 0) { // Schedule selected
                downloadBtn.setVisible(false);
                downloadBtn.setManaged(false);
                queueBtn.setText("Schedule Download");
                queueBtn.getStyleClass().add("btn-primary");
            } else {
                downloadBtn.setVisible(true);
                downloadBtn.setManaged(true);
                queueBtn.setText("Add to queue");
                queueBtn.getStyleClass().remove("btn-primary");
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
        io.smartdm.domain.Download d = io.smartdm.domain.Download.create(source, dest);

        int selectedIndex = scheduleCombo.getSelectionModel().getSelectedIndex();
        long delayMillis = 0;
        
        if (selectedIndex == 1) { // Alarm
            java.time.LocalDateTime now = java.time.LocalDateTime.now();
            int h = alarmHr.getValue();
            if (h == 12) h = 0;
            if (alarmAmPm.getValue().equals("PM")) h += 12;
            java.time.LocalTime time = java.time.LocalTime.of(h, alarmMin.getValue());
            java.time.LocalDateTime target = now.with(time);
            if (target.isBefore(now)) {
                target = target.plusDays(1);
            }
            delayMillis = java.time.Duration.between(now, target).toMillis();
        } else if (selectedIndex == 2) { // Timer
            delayMillis = (timerHr.getValue() * 3600L + timerMin.getValue() * 60L + timerSec.getValue()) * 1000L;
        }

        if (selectedIndex > 0) {
            d.updateScheduledStartTime(System.currentTimeMillis() + Math.max(delayMillis, 1000));
        }

        return d;
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
