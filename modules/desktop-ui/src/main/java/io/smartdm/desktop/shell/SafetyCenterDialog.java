package io.smartdm.desktop.shell;

import io.smartdm.safety.api.RiskLevel;
import io.smartdm.safety.api.SafetyEvidence;
import io.smartdm.safety.api.SafetyStatus;
import io.smartdm.safety.api.QuarantineService;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Stage;

import java.io.File;
import java.util.List;
import java.util.function.Consumer;

public class SafetyCenterDialog extends GlassmorphicDialog {

    private final File targetFile;
    private final SafetyStatus status;
    private final RiskLevel riskLevel;
    private final List<SafetyEvidence> evidences;
    private final String sha256;
    private final String activeScannerName;
    private final QuarantineService quarantineService;

    private Consumer<File> onOpenRequested;
    private Consumer<File> onDeleteRequested;
    private Consumer<File> onQuarantineRequested;

    @SuppressWarnings("this-escape")
    public SafetyCenterDialog(Stage owner,
                              File targetFile,
                              SafetyStatus status,
                              RiskLevel riskLevel,
                              List<SafetyEvidence> evidences,
                              String sha256,
                              String activeScannerName,
                              QuarantineService quarantineService) {
        super(owner, "Safety & Risk Center");
        this.targetFile = targetFile;
        this.status = status != null ? status : SafetyStatus.UNSCANNED;
        this.riskLevel = riskLevel != null ? riskLevel : RiskLevel.NONE;
        this.evidences = evidences != null ? evidences : List.of();
        this.sha256 = sha256 != null ? sha256 : "N/A";
        this.activeScannerName = activeScannerName != null ? activeScannerName : "Local Evidence Engine";
        this.quarantineService = quarantineService;

        buildUI();
    }

    private void buildUI() {
        dialogBody.setSpacing(16);
        dialogBody.setPadding(new Insets(20));

        // 1. Status Banner Header
        HBox banner = new HBox(12);
        banner.setAlignment(Pos.CENTER_LEFT);
        banner.setPadding(new Insets(12, 16, 12, 16));
        banner.getStyleClass().add("status-banner");

        String badgeStyle;
        String statusText;
        switch (status) {
            case MALWARE_DETECTED -> {
                badgeStyle = "-fx-background-color: rgba(239, 68, 68, 0.2); -fx-text-fill: #f87171; -fx-border-color: #ef4444;";
                statusText = "MALWARE DETECTED — BLOCKED";
            }
            case SUSPICIOUS -> {
                badgeStyle = "-fx-background-color: rgba(245, 158, 11, 0.2); -fx-text-fill: #fbbf24; -fx-border-color: #f59e0b;";
                statusText = "SUSPICIOUS PATTERNS FOUND";
            }
            case NO_THREATS_DETECTED -> {
                badgeStyle = "-fx-background-color: rgba(34, 197, 94, 0.2); -fx-text-fill: #4ade80; -fx-border-color: #22c55e;";
                statusText = "NO THREATS DETECTED";
            }
            case SCAN_FAILED -> {
                badgeStyle = "-fx-background-color: rgba(148, 163, 184, 0.2); -fx-text-fill: #cbd5e1; -fx-border-color: #94a3b8;";
                statusText = "SCAN INCOMPLETE / UNAVAILABLE";
            }
            default -> {
                badgeStyle = "-fx-background-color: rgba(148, 163, 184, 0.2); -fx-text-fill: #94a3b8; -fx-border-color: #64748b;";
                statusText = "UNSCANNED FILE";
            }
        }

        Label badgeLabel = new Label(statusText);
        badgeLabel.setStyle("-fx-font-weight: bold; -fx-font-size: 13px; -fx-padding: 6 12 6 12; -fx-background-radius: 6; -fx-border-radius: 6; " + badgeStyle);

        Label scannerLabel = new Label("Scanner: " + activeScannerName);
        scannerLabel.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 12px;");

        Region bannerSpacer = new Region();
        HBox.setHgrow(bannerSpacer, Priority.ALWAYS);

        banner.getChildren().addAll(badgeLabel, bannerSpacer, scannerLabel);

        // 2. File Information Grid
        GridPane fileGrid = new GridPane();
        fileGrid.setHgap(12);
        fileGrid.setVgap(8);
        fileGrid.setPadding(new Insets(10));
        fileGrid.setStyle("-fx-background-color: rgba(255, 255, 255, 0.03); -fx-background-radius: 8;");

        addGridRow(fileGrid, 0, "File Name:", targetFile != null ? targetFile.getName() : "N/A");
        addGridRow(fileGrid, 1, "File Path:", targetFile != null ? targetFile.getAbsolutePath() : "N/A");
        addGridRow(fileGrid, 2, "SHA-256 Hash:", sha256);
        addGridRow(fileGrid, 3, "Overall Risk Level:", riskLevel.name());

        // 3. Evidence List Section
        Label evidenceTitle = new Label("Inspection Evidence & Safety Logs");
        evidenceTitle.setStyle("-fx-font-weight: bold; -fx-text-fill: #e2e8f0; -fx-font-size: 13px;");

        VBox evidenceBox = new VBox(8);
        evidenceBox.setPadding(new Insets(8));
        evidenceBox.setStyle("-fx-background-color: rgba(0, 0, 0, 0.2); -fx-background-radius: 8;");

        if (evidences.isEmpty()) {
            Label cleanLabel = new Label("• No safety risks or anomalies detected for this file.");
            cleanLabel.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 12px;");
            evidenceBox.getChildren().add(cleanLabel);
        } else {
            ScrollPane scroll = new ScrollPane();
            scroll.setFitToWidth(true);
            scroll.setPrefHeight(150);
            scroll.setStyle("-fx-background: transparent; -fx-background-color: transparent;");

            VBox scrollContent = new VBox(6);
            for (SafetyEvidence ev : evidences) {
                HBox evRow = new HBox(10);
                evRow.setAlignment(Pos.CENTER_LEFT);
                evRow.setPadding(new Insets(6, 10, 6, 10));
                evRow.setStyle("-fx-background-color: rgba(255, 255, 255, 0.05); -fx-background-radius: 6;");

                String colorHex = switch (ev.riskLevel()) {
                    case CRITICAL, HIGH -> "#ef4444";
                    case MEDIUM -> "#f59e0b";
                    default -> "#3b82f6";
                };

                Label tag = new Label("[" + ev.riskLevel().name() + "]");
                tag.setStyle("-fx-font-weight: bold; -fx-font-size: 11px; -fx-text-fill: " + colorHex + ";");

                Label desc = new Label(ev.description() + (ev.ruleId() != null ? " (" + ev.ruleId() + ")" : ""));
                desc.setWrapText(true);
                desc.setStyle("-fx-text-fill: #cbd5e1; -fx-font-size: 12px;");

                evRow.getChildren().addAll(tag, desc);
                scrollContent.getChildren().add(evRow);
            }
            scroll.setContent(scrollContent);
            evidenceBox.getChildren().add(scroll);
        }

        // 4. Action Buttons Footer
        HBox buttonBar = new HBox(10);
        buttonBar.setAlignment(Pos.CENTER_RIGHT);
        buttonBar.setPadding(new Insets(10, 0, 0, 0));

        Button openBtn = new Button("Open File");
        openBtn.getStyleClass().add("primary-button");
        if (status == SafetyStatus.MALWARE_DETECTED) {
            openBtn.setDisable(true);
            Tooltip.install(openBtn, new Tooltip("Cannot open file marked as MALWARE_DETECTED."));
        } else {
            openBtn.setOnAction(e -> {
                close();
                if (onOpenRequested != null) onOpenRequested.accept(targetFile);
            });
        }

        Button quarantineBtn = new Button("Quarantine");
        quarantineBtn.setStyle("-fx-background-color: rgba(245, 158, 11, 0.2); -fx-text-fill: #fbbf24; -fx-border-color: #f59e0b; -fx-background-radius: 6; -fx-border-radius: 6;");
        quarantineBtn.setOnAction(e -> {
            close();
            if (onQuarantineRequested != null) onQuarantineRequested.accept(targetFile);
        });

        Button deleteBtn = new Button("Delete");
        deleteBtn.setStyle("-fx-background-color: rgba(239, 68, 68, 0.2); -fx-text-fill: #f87171; -fx-border-color: #ef4444; -fx-background-radius: 6; -fx-border-radius: 6;");
        deleteBtn.setOnAction(e -> {
            close();
            if (onDeleteRequested != null) onDeleteRequested.accept(targetFile);
        });

        Button closeBtn = new Button("Close");
        closeBtn.setOnAction(e -> close());

        Region btnSpacer = new Region();
        HBox.setHgrow(btnSpacer, Priority.ALWAYS);

        buttonBar.getChildren().addAll(quarantineBtn, deleteBtn, btnSpacer, openBtn, closeBtn);

        dialogBody.getChildren().addAll(banner, fileGrid, evidenceTitle, evidenceBox, buttonBar);
    }

    private void addGridRow(GridPane grid, int row, String labelText, String valueText) {
        Label lbl = new Label(labelText);
        lbl.setStyle("-fx-font-weight: bold; -fx-text-fill: #94a3b8; -fx-font-size: 12px;");

        Label val = new Label(valueText);
        val.setStyle("-fx-text-fill: #f1f5f9; -fx-font-size: 12px;");
        val.setWrapText(true);

        grid.add(lbl, 0, row);
        grid.add(val, 1, row);
    }

    public void setOnOpenRequested(Consumer<File> onOpenRequested) {
        this.onOpenRequested = onOpenRequested;
    }

    public void setOnDeleteRequested(Consumer<File> onDeleteRequested) {
        this.onDeleteRequested = onDeleteRequested;
    }

    public void setOnQuarantineRequested(Consumer<File> onQuarantineRequested) {
        this.onQuarantineRequested = onQuarantineRequested;
    }
}
