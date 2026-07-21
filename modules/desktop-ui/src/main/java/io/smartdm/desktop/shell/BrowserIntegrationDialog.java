package io.smartdm.desktop.shell;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

import java.io.File;

public class BrowserIntegrationDialog extends GlassmorphicDialog {

    @SuppressWarnings("this-escape")
    public BrowserIntegrationDialog(Stage owner) {
        super(owner, "Browser Integration");

        dialogBody.setSpacing(15);
        dialogBody.setPadding(new Insets(20));

        Label instructions = new Label(
            "To connect SmartDM with your browser:\n\n" +
            "For Google Chrome:\n" +
            "1. Run 'install.bat' from extensions/chrome/host\n" +
            "2. Open Chrome -> Extensions -> Enable Developer Mode\n" +
            "3. Click 'Load unpacked' and select the 'extensions/chrome' folder\n\n" +
            "For Mozilla Firefox:\n" +
            "1. Run 'install.bat' from extensions/firefox/host\n" +
            "2. Open Firefox -> about:debugging#/runtime/this-firefox\n" +
            "3. Click 'Load Temporary Add-on' and select 'extensions/firefox/manifest.json'\n"
        );
        instructions.setWrapText(true);
        instructions.getStyleClass().add("dialog-label");

        HBox btnBox = new HBox(10);
        btnBox.setAlignment(Pos.CENTER_RIGHT);

        Button openFolderBtn = new Button("Open Extensions Folder");
        openFolderBtn.getStyleClass().addAll("btn", "btn-primary");
        openFolderBtn.setOnAction(e -> {
            try {
                File extDir = new File("../../extensions");
                if (!extDir.exists()) {
                    extDir = new File("extensions");
                }
                if (extDir.exists()) {
                    java.awt.Desktop.getDesktop().open(extDir.getAbsoluteFile());
                } else {
                    System.err.println("Could not find extensions directory: " + new File(".").getAbsolutePath());
                }
            } catch (Exception ex) {
                ex.printStackTrace();
            }
        });

        Button closeBtn = new Button("Close");
        closeBtn.getStyleClass().add("btn");
        closeBtn.setOnAction(e -> close());

        btnBox.getChildren().addAll(openFolderBtn, closeBtn);

        dialogBody.getChildren().addAll(instructions, btnBox);
    }
}

