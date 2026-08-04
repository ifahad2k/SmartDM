package io.smartdm.desktop.shell.settings;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ScrollPane;

import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

public class PrivacyPolicyDialog extends Stage {

    @SuppressWarnings("this-escape")
    public PrivacyPolicyDialog(Stage owner) {
        initModality(Modality.APPLICATION_MODAL);
        if (owner != null) initOwner(owner);
        initStyle(StageStyle.TRANSPARENT);
        setTitle("SmartDM Privacy Policy");

        VBox root = new VBox(15);
        root.setAlignment(Pos.TOP_LEFT);
        root.setPadding(new Insets(24));
        root.setStyle(
            "-fx-background-color: rgba(15, 23, 42, 0.96); " +
            "-fx-background-radius: 12; " +
            "-fx-border-color: rgba(56, 189, 248, 0.3); " +
            "-fx-border-radius: 12; " +
            "-fx-border-width: 1;"
        );

        Label title = new Label("🔒 SmartDM Privacy Policy & Data Guarantees");
        title.setStyle("-fx-font-size: 18px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        VBox contentBox = new VBox(12);
        contentBox.setStyle("-fx-background-color: rgba(255,255,255,0.03); -fx-background-radius: 8; -fx-padding: 16;");

        addPrivacyItem(contentBox, "1. Zero Telemetry & User Tracking", 
            "SmartDM collects ZERO analytics, tracking telemetry, or usage metrics. We do not track your downloads, search queries, or browsing habits.");

        addPrivacyItem(contentBox, "2. 100% Local Encrypted Storage", 
            "All configuration settings, catalog indexes, download history, and AI preferences remain on your local computer in your user profile directory (~/.smartdm).");

        addPrivacyItem(contentBox, "3. Network Communication Notice", 
            "Network requests are strictly limited to user-initiated file downloads, optional update checks (via GitHub API), and optional user-configured AI APIs (Ollama/Gemini). No data is sent to third parties.");

        addPrivacyItem(contentBox, "4. Session Cookies & Credentials", 
            "Authentication credentials and cookies captured by the browser extension are used solely to authenticate file downloads with target hosts and are stored securely on your local system.");

        ScrollPane scrollPane = new ScrollPane(contentBox);
        scrollPane.setFitToWidth(true);
        scrollPane.setPrefHeight(260);
        scrollPane.setStyle("-fx-background-color: transparent; -fx-background: transparent;");

        Button closeBtn = new Button("I Understand");
        closeBtn.setStyle(
            "-fx-background-color: #38BDF8; " +
            "-fx-text-fill: #0F172A; " +
            "-fx-font-weight: bold; " +
            "-fx-background-radius: 6; " +
            "-fx-padding: 8 24; " +
            "-fx-cursor: hand;"
        );
        closeBtn.setOnAction(e -> close());

        HBox btnRow = new HBox(closeBtn);
        btnRow.setAlignment(Pos.CENTER_RIGHT);

        root.getChildren().addAll(title, scrollPane, btnRow);

        Scene scene = new Scene(root);
        scene.setFill(Color.TRANSPARENT);
        setScene(scene);
        setWidth(500);
        setHeight(400);
    }

    private void addPrivacyItem(VBox parent, String heading, String bodyText) {
        VBox item = new VBox(4);
        Label h = new Label(heading);
        h.setStyle("-fx-font-size: 13px; -fx-font-weight: bold; -fx-text-fill: #A6E3A1;");
        Label b = new Label(bodyText);
        b.setStyle("-fx-font-size: 11px; -fx-text-fill: #CBD5E1;");
        b.setWrapText(true);
        item.getChildren().addAll(h, b);
        parent.getChildren().add(item);
    }
}
