package io.smartdm.desktop.shell;

import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadState;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

public class PropertiesDialog extends Stage {

    private static final DateTimeFormatter DATE_FORMATTER = 
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.systemDefault());

    @SuppressWarnings("this-escape")
    public PropertiesDialog(Stage owner, Download download) {
        initOwner(owner);
        initModality(Modality.APPLICATION_MODAL);
        initStyle(StageStyle.TRANSPARENT);
        setTitle("Download Properties");

        VBox root = new VBox();
        root.getStyleClass().addAll("dialog-root", "dark-theme");
        root.setStyle("-fx-background-color: #12151E; -fx-background-radius: 12; -fx-border-color: rgba(255,255,255,0.12); -fx-border-radius: 12; -fx-border-width: 1;");
        root.setPadding(new Insets(24));
        root.setSpacing(16);
        root.setPrefWidth(540);

        // Title Header
        HBox header = new HBox();
        header.setAlignment(Pos.CENTER_LEFT);

        Label titleLabel = new Label("Download Properties");
        titleLabel.setStyle("-fx-font-size: 18px; -fx-font-weight: bold; -fx-text-fill: #FFFFFF;");

        header.getChildren().add(titleLabel);

        // Property Grid
        GridPane grid = new GridPane();
        grid.setHgap(12);
        grid.setVgap(10);
        grid.setPadding(new Insets(8, 0, 8, 0));

        Path destPath = download.destination().value();
        File file = destPath.toFile();
        long size = file.exists() ? file.length() : (download.totalBytes() != null && download.totalBytes().value() > 0 ? download.totalBytes().value() : 0);

        addGridRow(grid, 0, "File Name:", destPath.getFileName().toString());
        addGridRow(grid, 1, "Save Path:", destPath.getParent() != null ? destPath.getParent().toString() : "N/A");
        addGridRow(grid, 2, "Status:", download.state().name());
        addGridRow(grid, 3, "File Size:", formatBytes(size));
        addGridRow(grid, 4, "URL:", download.source().value().toString());
        addGridRow(grid, 5, "Segments:", download.segments().size() + " parallel streams");
        addGridRow(grid, 6, "Created:", DATE_FORMATTER.format(download.createdAt()));
        addGridRow(grid, 7, "Download ID:", download.id().value());

        root.getChildren().addAll(header, grid);

        // Action Footer
        HBox footer = new HBox();
        footer.setAlignment(Pos.CENTER_RIGHT);
        footer.setSpacing(10);

        Button closeBtn = new Button("Close");
        closeBtn.setStyle("-fx-background-color: #37E9FF; -fx-text-fill: #090B10; -fx-font-weight: bold; -fx-background-radius: 6; -fx-padding: 8 20; -fx-cursor: hand;");
        closeBtn.setOnAction(e -> close());

        footer.getChildren().add(closeBtn);
        root.getChildren().add(footer);

        Scene scene = new Scene(root);
        scene.setFill(Color.TRANSPARENT);
        try {
            scene.getStylesheets().add(getClass().getResource("/styles/main.css").toExternalForm());
        } catch (Exception ignored) {}

        setScene(scene);
    }

    private void addGridRow(GridPane grid, int row, String labelText, String valText) {
        Label lbl = new Label(labelText);
        lbl.setStyle("-fx-font-weight: bold; -fx-text-fill: #A6ADC4; -fx-min-width: 100;");

        TextField valField = new TextField(valText != null ? valText : "");
        valField.setEditable(false);
        valField.setStyle("-fx-background-color: rgba(255,255,255,0.05); -fx-text-fill: #F3F5FC; -fx-border-color: rgba(255,255,255,0.08); -fx-border-radius: 4; -fx-background-radius: 4;");
        GridPane.setHgrow(valField, Priority.ALWAYS);

        grid.add(lbl, 0, row);
        grid.add(valField, 1, row);
    }

    private String formatBytes(long bytes) {
        if (bytes <= 0) return "Unknown / Stream";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.2f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024) return String.format("%.2f MB", bytes / (1024.0 * 1024.0));
        return String.format("%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0));
    }
}
