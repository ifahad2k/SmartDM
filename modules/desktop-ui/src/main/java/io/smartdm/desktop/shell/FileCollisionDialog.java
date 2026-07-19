package io.smartdm.desktop.shell;

import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

public final class FileCollisionDialog extends GlassmorphicDialog {

    public enum CollisionChoice {
        CANCEL,
        RENAME,
        OVERWRITE
    }

    private CollisionChoice choice = CollisionChoice.CANCEL;

    public FileCollisionDialog(Stage owner, String filename) {
        super(owner, "SmartDM — File Collision");

        Label headerTitle = new Label("File Already Exists");
        headerTitle.getStyleClass().add("dt");
        Label headerSub = new Label("A file or active download named \"" + filename + "\" already exists in this folder.");
        headerSub.getStyleClass().add("ds");
        VBox head = new VBox(4, headerTitle, headerSub);

        Label desc = new Label("• Rename: Automatically append a number to the new file (e.g. " + filename + " (1)).\n• Overwrite: Replace the existing file on disk.");
        desc.getStyleClass().add("ds");
        desc.setStyle("-fx-text-fill: #E0E2EA; -fx-padding: 10 0;");

        dialogBody.getChildren().addAll(head, desc);

        // Buttons
        HBox buttonBar = new HBox(12);
        buttonBar.setAlignment(Pos.CENTER_RIGHT);
        buttonBar.setStyle("-fx-padding: 15 0 0 0;");

        Button cancelBtn = new Button("Skip");
        cancelBtn.getStyleClass().addAll("btn", "btn-ghost");
        cancelBtn.setOnAction(e -> {
            choice = CollisionChoice.CANCEL;
            close();
        });

        Button renameBtn = new Button("Rename");
        renameBtn.getStyleClass().addAll("btn");
        renameBtn.setOnAction(e -> {
            choice = CollisionChoice.RENAME;
            close();
        });

        Button overwriteBtn = new Button("Overwrite");
        overwriteBtn.getStyleClass().addAll("btn", "btn-primary");
        overwriteBtn.setStyle("-fx-background-color: #E81123; -fx-text-fill: #ffffff;");
        overwriteBtn.setOnAction(e -> {
            choice = CollisionChoice.OVERWRITE;
            close();
        });

        buttonBar.getChildren().addAll(cancelBtn, renameBtn, overwriteBtn);
        dialogBody.getChildren().add(buttonBar);
    }

    public CollisionChoice showAndGetChoice() {
        showAndWait();
        return choice;
    }
}
