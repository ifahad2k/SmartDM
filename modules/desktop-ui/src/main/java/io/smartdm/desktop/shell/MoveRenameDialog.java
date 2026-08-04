package io.smartdm.desktop.shell;

import io.smartdm.domain.Download;
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
import javafx.stage.DirectoryChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class MoveRenameDialog extends Stage {

    public interface Callback {
        void onMoveRename(Download download, Path newPath);
    }

    private Path selectedPath = null;

    @SuppressWarnings("this-escape")
    public MoveRenameDialog(Stage owner, Download download, Callback callback) {
        initOwner(owner);
        initModality(Modality.APPLICATION_MODAL);
        initStyle(StageStyle.TRANSPARENT);
        setTitle("Move / Rename Download");

        VBox root = new VBox();
        root.getStyleClass().addAll("dialog-root", "dark-theme");
        root.setStyle("-fx-background-color: #12151E; -fx-background-radius: 12; -fx-border-color: rgba(255,255,255,0.12); -fx-border-radius: 12; -fx-border-width: 1;");
        root.setPadding(new Insets(24));
        root.setSpacing(16);
        root.setPrefWidth(500);

        Label titleLabel = new Label("Move or Rename Download");
        titleLabel.setStyle("-fx-font-size: 18px; -fx-font-weight: bold; -fx-text-fill: #FFFFFF;");

        GridPane grid = new GridPane();
        grid.setHgap(12);
        grid.setVgap(12);

        Path currentPath = download.destination().value();
        String currentName = currentPath.getFileName().toString();
        String currentDir = currentPath.getParent() != null ? currentPath.getParent().toString() : "";

        Label nameLbl = new Label("New File Name:");
        nameLbl.setStyle("-fx-text-fill: #A6ADC4; -fx-font-weight: bold;");
        TextField nameField = new TextField(currentName);
        nameField.setStyle("-fx-background-color: rgba(255,255,255,0.05); -fx-text-fill: #F3F5FC; -fx-border-color: rgba(255,255,255,0.1); -fx-border-radius: 6; -fx-background-radius: 6;");
        GridPane.setHgrow(nameField, Priority.ALWAYS);

        Label dirLbl = new Label("Save Directory:");
        dirLbl.setStyle("-fx-text-fill: #A6ADC4; -fx-font-weight: bold;");
        TextField dirField = new TextField(currentDir);
        dirField.setStyle("-fx-background-color: rgba(255,255,255,0.05); -fx-text-fill: #F3F5FC; -fx-border-color: rgba(255,255,255,0.1); -fx-border-radius: 6; -fx-background-radius: 6;");
        GridPane.setHgrow(dirField, Priority.ALWAYS);

        Button browseBtn = new Button("Browse...");
        browseBtn.setStyle("-fx-background-color: rgba(255,255,255,0.1); -fx-text-fill: #F3F5FC; -fx-background-radius: 6; -fx-cursor: hand;");
        browseBtn.setOnAction(e -> {
            DirectoryChooser chooser = new DirectoryChooser();
            chooser.setTitle("Select Destination Directory");
            if (!dirField.getText().isBlank() && Files.isDirectory(Paths.get(dirField.getText()))) {
                chooser.setInitialDirectory(new File(dirField.getText()));
            }
            File chosen = chooser.showDialog(this);
            if (chosen != null) {
                dirField.setText(chosen.getAbsolutePath());
            }
        });

        HBox dirBox = new HBox(8, dirField, browseBtn);
        HBox.setHgrow(dirField, Priority.ALWAYS);

        grid.add(nameLbl, 0, 0);
        grid.add(nameField, 1, 0);
        grid.add(dirLbl, 0, 1);
        grid.add(dirBox, 1, 1);

        Label errorLbl = new Label();
        errorLbl.setStyle("-fx-text-fill: #FF5252; -fx-font-size: 12px;");

        HBox footer = new HBox();
        footer.setAlignment(Pos.CENTER_RIGHT);
        footer.setSpacing(10);

        Button saveBtn = new Button("Apply Changes");
        saveBtn.setStyle("-fx-background-color: #37E9FF; -fx-text-fill: #090B10; -fx-font-weight: bold; -fx-background-radius: 6; -fx-padding: 8 20; -fx-cursor: hand;");
        saveBtn.setOnAction(e -> {
            String newName = nameField.getText().trim();
            String newDir = dirField.getText().trim();
            if (newName.isEmpty() || newDir.isEmpty()) {
                errorLbl.setText("File name and directory must not be empty.");
                return;
            }

            Path target = Paths.get(newDir, newName).toAbsolutePath();
            if (target.equals(currentPath)) {
                close();
                return;
            }

            try {
                if (Files.exists(currentPath)) {
                    Files.move(currentPath, target);
                }
                selectedPath = target;
                if (callback != null) {
                    callback.onMoveRename(download, target);
                }
                close();
            } catch (Exception ex) {
                errorLbl.setText("Failed to move/rename file: " + ex.getMessage());
            }
        });

        Button cancelBtn = new Button("Cancel");
        cancelBtn.setStyle("-fx-background-color: transparent; -fx-text-fill: #A6ADC4; -fx-cursor: hand;");
        cancelBtn.setOnAction(e -> close());

        footer.getChildren().addAll(errorLbl, cancelBtn, saveBtn);

        root.getChildren().addAll(titleLabel, grid, footer);

        Scene scene = new Scene(root);
        scene.setFill(Color.TRANSPARENT);
        try {
            scene.getStylesheets().add(getClass().getResource("/styles/main.css").toExternalForm());
        } catch (Exception ignored) {}

        setScene(scene);
    }

    public Path getSelectedPath() {
        return selectedPath;
    }
}
