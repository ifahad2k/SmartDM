package io.smartdm.desktop.shell;

import io.smartdm.browser.protocol.BrowserIntegrationInstallerService;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.CheckBox;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;

public class UninstallDialog extends GlassmorphicDialog {

    private final CheckBox eraseDataCheckBox;
    private final Label statusLabel;

    @SuppressWarnings("this-escape")
    public UninstallDialog(Stage owner) {
        super(owner, "Uninstall SmartDM");

        dialogBody.setSpacing(16);
        dialogBody.setPadding(new Insets(20));

        Label warningHeader = new Label("⚠️ Are you sure you want to uninstall SmartDM?");
        warningHeader.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #F87171;");

        Label warningBody = new Label(
            "Uninstalling will unregister all browser Native Messaging Host bridges for Chrome, Edge, Brave, and Firefox,\n" +
            "remove application startup entries, and clean up browser integration registries."
        );
        warningBody.setWrapText(true);
        warningBody.setStyle("-fx-font-size: 13px; -fx-text-fill: #CBD5E1; -fx-line-spacing: 3px;");

        VBox eraseCard = new VBox(8);
        eraseCard.setPadding(new Insets(14));
        eraseCard.setStyle("-fx-background-color: rgba(248, 113, 113, 0.08); -fx-border-color: rgba(248, 113, 113, 0.25); -fx-border-radius: 8px; -fx-background-radius: 8px;");

        Label eraseTitle = new Label("🔥 Advanced Cleanup Option:");
        eraseTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: bold; -fx-text-fill: #F87171;");

        eraseDataCheckBox = new CheckBox("Fully erase every data of the app (Database, configuration, search index, download history)");
        eraseDataCheckBox.setSelected(false); // UNCHECKED BY DEFAULT
        eraseDataCheckBox.setStyle("-fx-text-fill: #E2E8F0; -fx-font-size: 12px; -fx-font-weight: bold;");

        Label eraseNote = new Label("Notice: By default this is unchecked. If checked, all local databases in AppData/Local/SmartDM will be deleted permanently.");
        eraseNote.setWrapText(true);
        eraseNote.setStyle("-fx-font-size: 11px; -fx-text-fill: #94A3B8;");

        eraseCard.getChildren().addAll(eraseTitle, eraseDataCheckBox, eraseNote);

        statusLabel = new Label("");
        statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        // Action Buttons
        HBox btnBox = new HBox(12);
        btnBox.setAlignment(Pos.CENTER_RIGHT);

        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().add("btn");
        cancelBtn.setOnAction(e -> close());

        Button confirmUninstallBtn = new Button("🗑️ Confirm Uninstall");
        confirmUninstallBtn.getStyleClass().addAll("btn");
        confirmUninstallBtn.setStyle("-fx-background-color: #EF4444; -fx-text-fill: white; -fx-font-weight: bold;");
        confirmUninstallBtn.setOnAction(e -> performUninstall());

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        btnBox.getChildren().addAll(cancelBtn, spacer, confirmUninstallBtn);

        dialogBody.getChildren().addAll(warningHeader, warningBody, eraseCard, statusLabel, btnBox);
    }

    private void performUninstall() {
        boolean eraseData = eraseDataCheckBox.isSelected();

        statusLabel.setText("⏳ Removing SmartDM browser integrations and registries...");
        statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        javafx.concurrent.Task<Void> uninstallTask = new javafx.concurrent.Task<>() {
            @Override
            protected Void call() throws Exception {
                // 1. Remove Browser Integrations
                BrowserIntegrationInstallerService.removeAllIntegrations();

                // 2. Erase App Data if requested
                if (eraseData) {
                    deleteAppDataDirectory();
                    deleteUserSettingsDirectory();
                }
                return null;
            }
        };

        uninstallTask.setOnSucceeded(e -> {
            Alert alert = new Alert(Alert.AlertType.INFORMATION);
            alert.setTitle("Uninstall Completed");
            alert.setHeaderText("SmartDM Uninstalled Successfully");
            alert.setContentText(
                "SmartDM browser integration and configuration registries have been removed.\n" +
                (eraseData ? "All local app data and databases have been erased.\n" : "Your download files and databases were preserved.\n") +
                "\nThe application will now close."
            );
            alert.showAndWait();

            Platform.exit();
            System.exit(0);
        });

        uninstallTask.setOnFailed(e -> {
            statusLabel.setText("❌ Error during uninstallation: " + uninstallTask.getException().getMessage());
            statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #F87171;");
        });

        new Thread(uninstallTask).start();
    }

    private void deleteAppDataDirectory() {
        try {
            Path appData = Paths.get(System.getProperty("user.home"), "AppData", "Local", "SmartDM");
            if (Files.exists(appData)) {
                Files.walk(appData)
                    .sorted(Comparator.reverseOrder())
                    .map(Path::toFile)
                    .forEach(File::delete);
            }
        } catch (Exception ignored) {}
    }

    private void deleteUserSettingsDirectory() {
        try {
            Path userHomeDir = Paths.get(System.getProperty("user.home"), ".smartdm");
            if (Files.exists(userHomeDir)) {
                Files.walk(userHomeDir)
                    .sorted(Comparator.reverseOrder())
                    .map(Path::toFile)
                    .forEach(File::delete);
            }
        } catch (Exception ignored) {}
    }
}
