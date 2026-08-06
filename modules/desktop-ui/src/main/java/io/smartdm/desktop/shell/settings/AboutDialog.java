package io.smartdm.desktop.shell.settings;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;

import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

public class AboutDialog extends Stage {

    @SuppressWarnings("this-escape")
    public AboutDialog(Stage owner) {
        initModality(Modality.APPLICATION_MODAL);
        if (owner != null) initOwner(owner);
        initStyle(StageStyle.TRANSPARENT);
        setTitle("About SmartDM");

        VBox root = new VBox(15);
        root.setAlignment(Pos.CENTER);
        root.setPadding(new Insets(24));
        root.setStyle(
            "-fx-background-color: rgba(15, 23, 42, 0.95); " +
            "-fx-background-radius: 12; " +
            "-fx-border-color: rgba(56, 189, 248, 0.3); " +
            "-fx-border-radius: 12; " +
            "-fx-border-width: 1;"
        );

        Label title = new Label("⚡ SmartDM Download Manager");
        title.setStyle("-fx-font-size: 18px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        Label version = new Label("Version " + VersionInfo.VERSION + " (Windows x64)");
        version.setStyle("-fx-font-size: 12px; -fx-text-fill: #94A3B8;");

        Label noticeHeader = new Label("🛡️ Unsigned Distribution Notice");
        noticeHeader.setStyle("-fx-font-size: 13px; -fx-font-weight: bold; -fx-text-fill: #F59E0B;");

        Label noticeBody = new Label(
            "SmartDM is an open-source high-performance download engine.\n" +
            "Binaries are currently unsigned per project security policy.\n" +
            "Please verify SHA-256 release checksums from official GitHub releases."
        );
        noticeBody.setStyle("-fx-font-size: 11px; -fx-text-fill: #CBD5E1; -fx-text-alignment: center;");
        noticeBody.setWrapText(true);

        Button closeBtn = new Button("Close");
        closeBtn.setStyle(
            "-fx-background-color: #38BDF8; " +
            "-fx-text-fill: #0F172A; " +
            "-fx-font-weight: bold; " +
            "-fx-background-radius: 6; " +
            "-fx-padding: 6 20;"
        );
        closeBtn.setOnAction(e -> close());

        root.getChildren().addAll(title, version, noticeHeader, noticeBody, closeBtn);

        Scene scene = new Scene(root);
        scene.setFill(Color.TRANSPARENT);
        setScene(scene);
        setWidth(420);
        setHeight(280);
    }
}
