package io.smartdm.desktop.shell;

import io.smartdm.browser.protocol.BrowserIntegrationInstallerService;
import io.smartdm.browser.protocol.BrowserProfile;
import io.smartdm.browser.protocol.BrowserScannerService;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.CheckBox;
import javafx.scene.control.Label;
import javafx.scene.control.ScrollPane;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

import java.io.File;
import java.nio.file.Path;
import java.util.*;

public class BrowserIntegrationDialog extends GlassmorphicDialog {

    private final VBox profileListContainer = new VBox(15);
    private final Label statusLabel = new Label("");
    private final Map<BrowserProfile, CheckBox> profileCheckBoxMap = new LinkedHashMap<>();

    @SuppressWarnings("this-escape")
    public BrowserIntegrationDialog(Stage owner) {
        super(owner, "Browser Integration & Profile Manager");

        dialogBody.setSpacing(15);
        dialogBody.setPadding(new Insets(20));

        Label subtitle = new Label(
            "Select specific browsers and profiles to enable SmartDM integration.\n" +
            "Native Messaging Host bridges are registered automatically for your selections."
        );
        subtitle.setWrapText(true);
        subtitle.setStyle("-fx-font-size: 13px; -fx-text-fill: #94A3B8; -fx-line-spacing: 3px;");

        VBox guideCard = new VBox(6);
        guideCard.setPadding(new Insets(10));
        guideCard.setStyle("-fx-background-color: rgba(56, 189, 248, 0.08); -fx-border-color: rgba(56, 189, 248, 0.25); -fx-border-radius: 6px; -fx-background-radius: 6px;");
        Label guideHeader = new Label("💡 How to activate extension in Google Chrome / Edge / Brave:");
        guideHeader.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");
        Label guideStep1 = new Label("1️⃣ Click 'Open Chrome Extensions' button below to open browser extensions page.");
        guideStep1.setStyle("-fx-font-size: 11px; -fx-text-fill: #CBD5E1;");
        Label guideStep2 = new Label("2️⃣ Toggle 'Developer mode' ON in top-right corner & click 'Load unpacked'.");
        guideStep2.setStyle("-fx-font-size: 11px; -fx-text-fill: #CBD5E1;");
        Label guideStep3 = new Label("3️⃣ Select the SmartDM extension folder (click 'Extension Folder' button below to view).");
        guideStep3.setStyle("-fx-font-size: 11px; -fx-text-fill: #CBD5E1;");
        guideCard.getChildren().addAll(guideHeader, guideStep1, guideStep2, guideStep3);

        statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        profileListContainer.setPadding(new Insets(10));

        ScrollPane scrollPane = new ScrollPane(profileListContainer);
        scrollPane.setFitToWidth(true);
        scrollPane.setPrefHeight(260);
        scrollPane.setStyle("-fx-background: transparent; -fx-background-color: transparent; -fx-border-color: rgba(255,255,255,0.08); -fx-border-radius: 8px;");

        // Action Buttons
        HBox btnBox = new HBox(8);
        btnBox.setAlignment(Pos.CENTER_RIGHT);

        Button launchBtn = new Button("🚀 Launch Browser");
        launchBtn.getStyleClass().addAll("btn");
        launchBtn.setStyle("-fx-background-color: rgba(52, 211, 153, 0.2); -fx-text-fill: #34D399; -fx-border-color: #34D399;");
        launchBtn.setOnAction(e -> launchBrowserWithExtension());

        Button createShortcutBtn = new Button("📌 Create Shortcut");
        createShortcutBtn.getStyleClass().add("btn");
        createShortcutBtn.setOnAction(e -> createSelectedShortcut());

        Button rescanBtn = new Button("🔄 Rescan");
        rescanBtn.getStyleClass().add("btn");
        rescanBtn.setOnAction(e -> populateProfiles());

        Button openExtFolderBtn = new Button("📁 Extension Folder");
        openExtFolderBtn.getStyleClass().add("btn");
        openExtFolderBtn.setOnAction(e -> openExtensionFolder());

        Button applyBtn = new Button("⚡ Apply Selected Integration");
        applyBtn.getStyleClass().addAll("btn", "btn-primary");
        applyBtn.setOnAction(e -> applySelectedIntegration());

        Button closeBtn = new Button("Close");
        closeBtn.getStyleClass().add("btn");
        closeBtn.setOnAction(e -> close());

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        btnBox.getChildren().addAll(launchBtn, createShortcutBtn, rescanBtn, openExtFolderBtn, spacer, applyBtn, closeBtn);

        dialogBody.getChildren().addAll(subtitle, guideCard, scrollPane, statusLabel, btnBox);

        // Initial Scanning
        populateProfiles();
    }

    private void populateProfiles() {
        profileListContainer.getChildren().clear();
        profileCheckBoxMap.clear();

        statusLabel.setText("🔍 Scanning installed browsers & profiles...");
        statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        javafx.concurrent.Task<List<BrowserProfile>> scanTask = new javafx.concurrent.Task<>() {
            @Override
            protected List<BrowserProfile> call() {
                return BrowserScannerService.scanAllProfiles();
            }
        };

        scanTask.setOnSucceeded(e -> {
            List<BrowserProfile> detectedProfiles = scanTask.getValue();
            if (detectedProfiles.isEmpty()) {
                Label emptyLabel = new Label("No compatible browsers or profiles detected.");
                emptyLabel.setStyle("-fx-text-fill: #F87171; -fx-font-size: 13px;");
                profileListContainer.getChildren().add(emptyLabel);
                statusLabel.setText("⚠️ No active browser profiles found.");
                return;
            }

            // Group profiles by Browser Name
            Map<String, List<BrowserProfile>> grouped = new LinkedHashMap<>();
            for (BrowserProfile p : detectedProfiles) {
                grouped.computeIfAbsent(p.browserName(), k -> new ArrayList<>()).add(p);
            }

            for (Map.Entry<String, List<BrowserProfile>> entry : grouped.entrySet()) {
                String browserName = entry.getKey();
                List<BrowserProfile> pList = entry.getValue();

                VBox browserCard = new VBox(10);
                browserCard.setPadding(new Insets(12));
                browserCard.setStyle(
                    "-fx-background-color: rgba(255, 255, 255, 0.03);" +
                    "-fx-border-color: rgba(255, 255, 255, 0.1);" +
                    "-fx-border-radius: 8px;" +
                    "-fx-background-radius: 8px;"
                );

                // Card Header
                HBox cardHeader = new HBox(10);
                cardHeader.setAlignment(Pos.CENTER_LEFT);

                String icon = getBrowserIcon(browserName);
                Label browserTitle = new Label(icon + " " + browserName + " (" + pList.size() + " Profile" + (pList.size() > 1 ? "s" : "") + ")");
                browserTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: bold; -fx-text-fill: #F8FAFC;");

                Region cardSpacer = new Region();
                HBox.setHgrow(cardSpacer, Priority.ALWAYS);

                Button selectAllBtn = new Button("Select All");
                selectAllBtn.setStyle("-fx-font-size: 11px; -fx-padding: 3 8; -fx-background-color: rgba(56, 189, 248, 0.15); -fx-text-fill: #38BDF8; -fx-border-color: #38BDF8; -fx-border-radius: 4px;");
                selectAllBtn.setOnAction(ev -> pList.forEach(p -> {
                    CheckBox cb = profileCheckBoxMap.get(p);
                    if (cb != null) cb.setSelected(true);
                }));

                Button deselectAllBtn = new Button("Deselect");
                deselectAllBtn.setStyle("-fx-font-size: 11px; -fx-padding: 3 8; -fx-background-color: rgba(248, 113, 113, 0.15); -fx-text-fill: #F87171; -fx-border-color: #F87171; -fx-border-radius: 4px;");
                deselectAllBtn.setOnAction(ev -> pList.forEach(p -> {
                    CheckBox cb = profileCheckBoxMap.get(p);
                    if (cb != null) cb.setSelected(false);
                }));

                cardHeader.getChildren().addAll(browserTitle, cardSpacer, selectAllBtn, deselectAllBtn);
                browserCard.getChildren().add(cardHeader);

                // Profile Rows
                VBox profileBox = new VBox(6);
                profileBox.setPadding(new Insets(4, 0, 0, 10));

                for (BrowserProfile p : pList) {
                    HBox pRow = new HBox(10);
                    pRow.setAlignment(Pos.CENTER_LEFT);

                    CheckBox cb = new CheckBox(p.profileName());
                    cb.setSelected(p.isIntegrated());
                    cb.setStyle("-fx-text-fill: #E2E8F0; -fx-font-size: 12px;");

                    Label badge = new Label(p.isIntegrated() ? "🟢 Integrated" : "⚪ Ready");
                    badge.setStyle("-fx-font-size: 10px; -fx-padding: 2 6; -fx-border-radius: 4px; -fx-background-radius: 4px; " +
                        (p.isIntegrated() ? "-fx-background-color: rgba(52, 211, 153, 0.15); -fx-text-fill: #34D399;" : "-fx-background-color: rgba(148, 163, 184, 0.15); -fx-text-fill: #94A3B8;"));

                    profileCheckBoxMap.put(p, cb);
                    pRow.getChildren().addAll(cb, badge);
                    profileBox.getChildren().add(pRow);
                }

                browserCard.getChildren().add(profileBox);
                profileListContainer.getChildren().add(browserCard);
            }

            statusLabel.setText("✅ Found " + detectedProfiles.size() + " profile(s) across " + grouped.size() + " browser(s).");
            statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #34D399;");
        });

        new Thread(scanTask).start();
    }

    private void applySelectedIntegration() {
        List<BrowserProfile> selectedProfiles = new ArrayList<>();
        profileCheckBoxMap.forEach((profile, cb) -> {
            if (cb.isSelected()) {
                selectedProfiles.add(profile);
            }
        });

        if (selectedProfiles.isEmpty()) {
            statusLabel.setText("⚠️ Please select at least one browser profile to integrate.");
            statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #FBBF24;");
            return;
        }

        statusLabel.setText("⏳ Applying SmartDM integration to " + selectedProfiles.size() + " profile(s)...");
        statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        Path extBaseDir = findExtensionBaseDir();

        javafx.concurrent.Task<Boolean> applyTask = new javafx.concurrent.Task<>() {
            @Override
            protected Boolean call() {
                return BrowserIntegrationInstallerService.applyIntegration(selectedProfiles, extBaseDir);
            }
        };

        applyTask.setOnSucceeded(e -> {
            boolean ok = applyTask.getValue();
            if (ok) {
                // Copy profile extension path to Clipboard for quick pasting
                try {
                    Path extBase = findExtensionBaseDir();
                    Path chromeExtDir = extBase.resolve("chrome");
                    ClipboardContent content = new ClipboardContent();
                    content.putString(chromeExtDir.toAbsolutePath().toString());
                    Clipboard.getSystemClipboard().setContent(content);
                } catch (Exception ignored) {}

                statusLabel.setText("🎉 Applied! Path copied to clipboard. In Chrome (chrome://extensions), turn ON Developer mode & click 'Load unpacked'.");
                statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #34D399;");
                populateProfiles();
            } else {
                statusLabel.setText("❌ Failed to apply integration to some profiles.");
                statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #F87171;");
            }
        });

        new Thread(applyTask).start();
    }

    private Path findExtensionBaseDir() {
        String[] candidatePaths = new String[]{
            "extensions",
            "../extensions",
            "../../extensions",
            System.getProperty("user.dir") + "/extensions"
        };
        for (String p : candidatePaths) {
            File f = new File(p);
            if (f.exists() && f.isDirectory()) {
                return f.toPath().toAbsolutePath();
            }
        }
        return java.nio.file.Paths.get("extensions").toAbsolutePath();
    }

    private String getBrowserIcon(String browserName) {
        String name = browserName.toLowerCase();
        if (name.contains("chrome")) return "🟢";
        if (name.contains("firefox")) return "🦊";
        if (name.contains("edge")) return "🔵";
        if (name.contains("brave")) return "🦁";
        if (name.contains("opera")) return "🔴";
        if (name.contains("vivaldi")) return "🔴";
        return "🌐";
    }

    private void launchBrowserWithExtension() {
        List<BrowserProfile> selectedProfiles = getSelectedProfiles();
        if (selectedProfiles.isEmpty()) {
            statusLabel.setText("⚠️ Please select a profile to launch.");
            statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #FBBF24;");
            return;
        }

        BrowserProfile target = selectedProfiles.get(0);
        Path extBase = findExtensionBaseDir();
        Path chromeExtDir = extBase.resolve("chrome");

        BrowserIntegrationInstallerService.applyIntegration(Collections.singletonList(target), extBase);

        statusLabel.setText("🚀 Launching " + target.browserName() + " (" + target.profileName() + ") with SmartDM...");
        statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #34D399;");

        java.util.concurrent.CompletableFuture.runAsync(() -> {
            try {
                String exe = switch (target.browserType().toLowerCase()) {
                    case "edge" -> "msedge.exe";
                    case "brave" -> "brave.exe";
                    default -> "chrome.exe";
                };
                new ProcessBuilder("cmd", "/c", "start", exe, "--profile-directory=\"" + target.profileId() + "\"", "--load-extension=\"" + chromeExtDir.toAbsolutePath().toString() + "\"").start();
            } catch (Exception ex) {
                ex.printStackTrace();
            }
        });
    }

    private void createSelectedShortcut() {
        List<BrowserProfile> selectedProfiles = getSelectedProfiles();
        if (selectedProfiles.isEmpty()) {
            statusLabel.setText("⚠️ Please select a profile to create desktop shortcut.");
            statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #FBBF24;");
            return;
        }

        BrowserProfile target = selectedProfiles.get(0);
        Path extBase = findExtensionBaseDir();
        Path chromeExtDir = extBase.resolve("chrome");

        boolean ok = BrowserIntegrationInstallerService.createDesktopShortcut(target, chromeExtDir);
        if (ok) {
            statusLabel.setText("📌 Shortcut created on Desktop for " + target.browserName() + " (" + target.profileName() + ")!");
            statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #34D399;");
        } else {
            statusLabel.setText("❌ Failed to create shortcut.");
            statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #F87171;");
        }
    }

    private List<BrowserProfile> getSelectedProfiles() {
        List<BrowserProfile> list = new ArrayList<>();
        profileCheckBoxMap.forEach((p, cb) -> {
            if (cb.isSelected()) list.add(p);
        });
        return list;
    }

    private void openExtensionFolder() {
        Path base = findExtensionBaseDir().resolve("chrome");
        if (!java.nio.file.Files.exists(base)) {
            base = findExtensionBaseDir();
        }
        final Path targetDir = base;
        java.util.concurrent.CompletableFuture.runAsync(() -> {
            try {
                String os = System.getProperty("os.name", "").toLowerCase();
                if (os.contains("win")) {
                    new ProcessBuilder("explorer.exe", targetDir.toString()).start();
                } else {
                    new ProcessBuilder("xdg-open", targetDir.toString()).start();
                }
            } catch (Exception ex) {
                ex.printStackTrace();
            }
        });
    }
}
