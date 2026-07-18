package io.smartdm.desktop.shell;

import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

public final class DeleteConfirmDialog extends GlassmorphicDialog {

    public enum DeleteChoice {
        CANCEL,
        SOFT,
        PERMANENT
    }

    private DeleteChoice choice = DeleteChoice.CANCEL;

    public DeleteConfirmDialog(Stage owner, String filename) {
        super(owner, "SmartDM — Delete Download");

        Label headerTitle = new Label("Delete Download");
        headerTitle.getStyleClass().add("dt");
        Label headerSub = new Label("How would you like to delete \"" + filename + "\"?");
        headerSub.getStyleClass().add("ds");
        VBox head = new VBox(4, headerTitle, headerSub);

        Label desc = new Label("• Soft Delete: Removes it from the list only.\n• Permanent Delete: Removes it from the list and deletes files on disk.");
        desc.getStyleClass().add("ds");
        desc.setStyle("-fx-text-fill: #E0E2EA; -fx-padding: 10 0;");

        dialogBody.getChildren().addAll(head, desc);

        // Buttons
        HBox buttonBar = new HBox(12);
        buttonBar.setAlignment(Pos.CENTER_RIGHT);
        buttonBar.setStyle("-fx-padding: 15 0 0 0;");

        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().addAll("btn", "btn-ghost");
        cancelBtn.setOnAction(e -> {
            choice = DeleteChoice.CANCEL;
            close();
        });

        Button softBtn = new Button("Soft Delete");
        softBtn.getStyleClass().addAll("btn");
        softBtn.setOnAction(e -> {
            choice = DeleteChoice.SOFT;
            close();
        });

        Button permanentBtn = new Button("Permanent Delete");
        permanentBtn.getStyleClass().addAll("btn", "btn-primary");
        permanentBtn.setStyle("-fx-background-color: #E81123; -fx-text-fill: #ffffff;");
        permanentBtn.setOnAction(e -> {
            choice = DeleteChoice.PERMANENT;
            close();
        });

        buttonBar.getChildren().addAll(cancelBtn, softBtn, permanentBtn);
        dialogBody.getChildren().add(buttonBar);
    }

    public DeleteChoice showAndGetChoice() {
        showAndWait();
        return choice;
    }
}
