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
    private String activeTab = "CHROME"; // "CHROME" or "FIREFOX"

    private final Button tabChromeBtn;
    private final Button tabFirefoxBtn;
    private final VBox chromeGuideCard;
    private final VBox firefoxGuideCard;

    @SuppressWarnings("this-escape")
    public BrowserIntegrationDialog(Stage owner) {
        super(owner, "Browser Integration & Extension Installation Guide");

        dialogBody.setSpacing(12);
        dialogBody.setPadding(new Insets(18));

        Label subtitle = new Label(
            "Follow the guided manual steps below to install the SmartDM extension into Chrome, Edge, Brave, or Firefox.\n" +
            "Native Messaging Host bridges link your browser directly to SmartDM for instant download interception."
        );
        subtitle.setWrapText(true);
        subtitle.setStyle("-fx-font-size: 13px; -fx-text-fill: #94A3B8; -fx-line-spacing: 3px;");

        // ── Tab Switcher ──────────────────────────────────────────────────
        HBox tabBox = new HBox(10);
        tabBox.setAlignment(Pos.CENTER_LEFT);

        tabChromeBtn = new Button("🟢 Google Chrome / Edge / Brave Guide");
        tabChromeBtn.getStyleClass().add("btn");
        tabChromeBtn.setStyle("-fx-background-color: rgba(56, 189, 248, 0.2); -fx-text-fill: #38BDF8; -fx-border-color: #38BDF8; -fx-font-weight: bold; -fx-font-size: 13px;");

        tabFirefoxBtn = new Button("🦊 Mozilla Firefox Guide");
        tabFirefoxBtn.getStyleClass().add("btn");
        tabFirefoxBtn.setStyle("-fx-background-color: rgba(255, 255, 255, 0.05); -fx-text-fill: #94A3B8; -fx-border-color: rgba(255,255,255,0.1); -fx-font-size: 13px;");

        tabBox.getChildren().addAll(tabChromeBtn, tabFirefoxBtn);

        // ── 1. Chrome / Chromium Guide Card ──────────────────────────────
        chromeGuideCard = buildChromeGuideCard();

        // ── 2. Firefox Guide Card ─────────────────────────────────────────
        firefoxGuideCard = buildFirefoxGuideCard();
        firefoxGuideCard.setManaged(false);
        firefoxGuideCard.setVisible(false);

        tabChromeBtn.setOnAction(e -> switchTab("CHROME"));
        tabFirefoxBtn.setOnAction(e -> switchTab("FIREFOX"));

        // ── Profile Scanner Title ─────────────────────────────────────────
        Label profileSectionTitle = new Label("🔍 Detected System Browser Profiles:");
        profileSectionTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: bold; -fx-text-fill: #E2E8F0; -fx-padding: 6 0 0 0;");

        statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        profileListContainer.setPadding(new Insets(10));

        ScrollPane scrollPane = new ScrollPane(profileListContainer);
        scrollPane.setFitToWidth(true);
        scrollPane.setPrefHeight(200);
        scrollPane.setStyle("-fx-background: transparent; -fx-background-color: transparent; -fx-border-color: rgba(255,255,255,0.08); -fx-border-radius: 8px;");

        // Bottom Action Bar
        HBox btnBox = new HBox(8);
        btnBox.setAlignment(Pos.CENTER_RIGHT);

        Button rescanBtn = new Button("🔄 Rescan Profiles");
        rescanBtn.getStyleClass().add("btn");
        rescanBtn.setOnAction(e -> populateProfiles());

        Button applyBtn = new Button("⚡ Apply Host Registration");
        applyBtn.getStyleClass().addAll("btn", "btn-primary");
        applyBtn.setOnAction(e -> applySelectedIntegration());

        Button closeBtn = new Button("Done / Close");
        closeBtn.getStyleClass().add("btn");
        closeBtn.setOnAction(e -> close());

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        btnBox.getChildren().addAll(rescanBtn, spacer, applyBtn, closeBtn);

        dialogBody.getChildren().addAll(subtitle, tabBox, chromeGuideCard, firefoxGuideCard, profileSectionTitle, scrollPane, statusLabel, btnBox);

        // Initial Scanning
        populateProfiles();
    }

    private void switchTab(String tab) {
        this.activeTab = tab;
        if ("CHROME".equals(tab)) {
            tabChromeBtn.setStyle("-fx-background-color: rgba(56, 189, 248, 0.2); -fx-text-fill: #38BDF8; -fx-border-color: #38BDF8; -fx-font-weight: bold; -fx-font-size: 13px;");
            tabFirefoxBtn.setStyle("-fx-background-color: rgba(255, 255, 255, 0.05); -fx-text-fill: #94A3B8; -fx-border-color: rgba(255,255,255,0.1); -fx-font-size: 13px;");
            chromeGuideCard.setManaged(true);
            chromeGuideCard.setVisible(true);
            firefoxGuideCard.setManaged(false);
            firefoxGuideCard.setVisible(false);
        } else {
            tabFirefoxBtn.setStyle("-fx-background-color: rgba(251, 146, 60, 0.2); -fx-text-fill: #FB923C; -fx-border-color: #FB923C; -fx-font-weight: bold; -fx-font-size: 13px;");
            tabChromeBtn.setStyle("-fx-background-color: rgba(255, 255, 255, 0.05); -fx-text-fill: #94A3B8; -fx-border-color: rgba(255,255,255,0.1); -fx-font-size: 13px;");
            firefoxGuideCard.setManaged(true);
            firefoxGuideCard.setVisible(true);
            chromeGuideCard.setManaged(false);
            chromeGuideCard.setVisible(false);
        }
    }

    private VBox buildChromeGuideCard() {
        VBox card = new VBox(10);
        card.setPadding(new Insets(14));
        card.setStyle("-fx-background-color: rgba(56, 189, 248, 0.06); -fx-border-color: rgba(56, 189, 248, 0.25); -fx-border-radius: 8px; -fx-background-radius: 8px;");

        Label header = new Label("🟢 Chrome / Edge / Brave / Opera Manual Installation Steps:");
        header.setStyle("-fx-font-size: 13px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        HBox stepsBox = new HBox(8);
        stepsBox.setAlignment(Pos.CENTER_LEFT);

        Button step1Btn = new Button("⚡ 1. Register Native Host");
        step1Btn.getStyleClass().add("btn");
        step1Btn.setStyle("-fx-background-color: rgba(56, 189, 248, 0.2); -fx-text-fill: #38BDF8; -fx-border-color: #38BDF8;");
        step1Btn.setOnAction(e -> {
            Path chromeExtDir = findExtensionBaseDir().resolve("chrome");
            boolean ok = BrowserIntegrationInstallerService.registerChromiumHost(chromeExtDir);
            if (ok) {
                statusLabel.setText("✅ Native Messaging Host registered in Registry for Chrome/Edge/Brave!");
                statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #34D399;");
            } else {
                statusLabel.setText("❌ Failed to register Native Host.");
                statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #F87171;");
            }
        });

        Button step2Btn = new Button("📁 2. Copy Path & Open Folder");
        step2Btn.getStyleClass().add("btn");
        step2Btn.setStyle("-fx-background-color: rgba(52, 211, 153, 0.2); -fx-text-fill: #34D399; -fx-border-color: #34D399;");
        step2Btn.setOnAction(e -> openExtensionFolder("chrome"));

        Button step3Btn = new Button("🌐 3. Open chrome://extensions");
        step3Btn.getStyleClass().add("btn");
        step3Btn.setStyle("-fx-background-color: rgba(168, 85, 247, 0.2); -fx-text-fill: #C084FC; -fx-border-color: #C084FC;");
        step3Btn.setOnAction(e -> openChromeExtensionsPage());

        stepsBox.getChildren().addAll(step1Btn, step2Btn, step3Btn);

        VBox instructions = new VBox(4);
        Label i1 = new Label("① In top-right corner of chrome://extensions, toggle 'Developer mode' ON.");
        i1.setStyle("-fx-font-size: 11px; -fx-text-fill: #CBD5E1;");
        Label i2 = new Label("② Click 'Load unpacked' button at top-left.");
        i2.setStyle("-fx-font-size: 11px; -fx-text-fill: #CBD5E1;");
        Label i3 = new Label("③ Paste the copied path or select the opened 'extensions/chrome' folder.");
        i3.setStyle("-fx-font-size: 11px; -fx-text-fill: #CBD5E1;");
        instructions.getChildren().addAll(i1, i2, i3);

        card.getChildren().addAll(header, stepsBox, instructions);
        return card;
    }

    private VBox buildFirefoxGuideCard() {
        VBox card = new VBox(10);
        card.setPadding(new Insets(14));
        card.setStyle("-fx-background-color: rgba(251, 146, 60, 0.06); -fx-border-color: rgba(251, 146, 60, 0.25); -fx-border-radius: 8px; -fx-background-radius: 8px;");

        Label header = new Label("🦊 Mozilla Firefox Manual Installation Steps:");
        header.setStyle("-fx-font-size: 13px; -fx-font-weight: bold; -fx-text-fill: #FB923C;");

        HBox stepsBox = new HBox(8);
        stepsBox.setAlignment(Pos.CENTER_LEFT);

        Button step1Btn = new Button("⚡ 1. Register Firefox Native Host");
        step1Btn.getStyleClass().add("btn");
        step1Btn.setStyle("-fx-background-color: rgba(251, 146, 60, 0.2); -fx-text-fill: #FB923C; -fx-border-color: #FB923C;");
        step1Btn.setOnAction(e -> {
            Path firefoxExtDir = findExtensionBaseDir().resolve("firefox");
            boolean ok = BrowserIntegrationInstallerService.registerFirefoxHost(firefoxExtDir);
            if (ok) {
                statusLabel.setText("✅ Firefox Native Host & Extension Policy registered successfully!");
                statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #34D399;");
            } else {
                statusLabel.setText("❌ Failed to register Firefox Native Host.");
                statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #F87171;");
            }
        });

        Button step2Btn = new Button("📂 2. Copy Path & Open Folder");
        step2Btn.getStyleClass().add("btn");
        step2Btn.setStyle("-fx-background-color: rgba(52, 211, 153, 0.2); -fx-text-fill: #34D399; -fx-border-color: #34D399;");
        step2Btn.setOnAction(e -> openExtensionFolder("firefox"));

        Button step3Btn = new Button("🦊 3. Open about:debugging");
        step3Btn.getStyleClass().add("btn");
        step3Btn.setStyle("-fx-background-color: rgba(168, 85, 247, 0.2); -fx-text-fill: #C084FC; -fx-border-color: #C084FC;");
        step3Btn.setOnAction(e -> openFirefoxDebuggingPage());

        stepsBox.getChildren().addAll(step1Btn, step2Btn, step3Btn);

        VBox instructions = new VBox(4);
        Label i1 = new Label("① In Firefox address bar, navigate to about:debugging#/runtime/this-firefox");
        i1.setStyle("-fx-font-size: 11px; -fx-text-fill: #CBD5E1;");
        Label i2 = new Label("② Click 'Load Temporary Add-on...' button.");
        i2.setStyle("-fx-font-size: 11px; -fx-text-fill: #CBD5E1;");
        Label i3 = new Label("③ Select the 'manifest.json' file inside the opened 'extensions/firefox' folder.");
        i3.setStyle("-fx-font-size: 11px; -fx-text-fill: #CBD5E1;");
        instructions.getChildren().addAll(i1, i2, i3);

        card.getChildren().addAll(header, stepsBox, instructions);
        return card;
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

            Map<String, List<BrowserProfile>> grouped = new LinkedHashMap<>();
            for (BrowserProfile p : detectedProfiles) {
                grouped.computeIfAbsent(p.browserName(), k -> new ArrayList<>()).add(p);
            }

            for (Map.Entry<String, List<BrowserProfile>> entry : grouped.entrySet()) {
                String browserName = entry.getKey();
                List<BrowserProfile> pList = entry.getValue();

                VBox browserCard = new VBox(10);
                browserCard.setPadding(new Insets(10));
                browserCard.setStyle(
                    "-fx-background-color: rgba(255, 255, 255, 0.03);" +
                    "-fx-border-color: rgba(255, 255, 255, 0.1);" +
                    "-fx-border-radius: 8px;" +
                    "-fx-background-radius: 8px;"
                );

                HBox cardHeader = new HBox(10);
                cardHeader.setAlignment(Pos.CENTER_LEFT);

                String icon = getBrowserIcon(browserName);
                Label browserTitle = new Label(icon + " " + browserName + " (" + pList.size() + " Profile" + (pList.size() > 1 ? "s" : "") + ")");
                browserTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: bold; -fx-text-fill: #F8FAFC;");

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

                VBox profileBox = new VBox(6);
                profileBox.setPadding(new Insets(4, 0, 0, 10));

                for (BrowserProfile p : pList) {
                    HBox pRow = new HBox(10);
                    pRow.setAlignment(Pos.CENTER_LEFT);

                    CheckBox cb = new CheckBox(p.profileName());
                    cb.setSelected(false);
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
        List<BrowserProfile> selectedProfiles = getSelectedProfiles();

        if (selectedProfiles.isEmpty()) {
            statusLabel.setText("⚠️ Please select at least one browser profile below to register host bridge.");
            statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #FBBF24;");
            return;
        }

        statusLabel.setText("⏳ Applying SmartDM Native Host bridge to " + selectedProfiles.size() + " profile(s)...");
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
                statusLabel.setText("🎉 Applied Native Host registration for " + selectedProfiles.size() + " profile(s)!");
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

    private void openChromeExtensionsPage() {
        java.util.concurrent.CompletableFuture.runAsync(() -> {
            try {
                new ProcessBuilder("cmd", "/c", "start", "chrome", "chrome://extensions").start();
            } catch (Exception ex) {
                ex.printStackTrace();
            }
        });
        statusLabel.setText("📋 Opening chrome://extensions... (Turn ON Developer Mode in top-right, then click Load unpacked).");
        statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");
    }

    private void openFirefoxDebuggingPage() {
        try {
            ClipboardContent content = new ClipboardContent();
            content.putString("about:debugging#/runtime/this-firefox");
            Clipboard.getSystemClipboard().setContent(content);
        } catch (Exception ignored) {}

        java.util.concurrent.CompletableFuture.runAsync(() -> {
            try {
                new ProcessBuilder("cmd", "/c", "start", "firefox", "about:debugging#/runtime/this-firefox").start();
            } catch (Exception ex) {
                ex.printStackTrace();
            }
        });
        statusLabel.setText("📋 Copied 'about:debugging#/runtime/this-firefox' & opened Firefox!");
        statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #FB923C;");
    }

    private List<BrowserProfile> getSelectedProfiles() {
        List<BrowserProfile> list = new ArrayList<>();
        profileCheckBoxMap.forEach((p, cb) -> {
            if (cb.isSelected()) list.add(p);
        });
        return list;
    }

    private void openExtensionFolder(String subfolder) {
        Path base = findExtensionBaseDir().resolve(subfolder);
        if (!java.nio.file.Files.exists(base)) {
            base = findExtensionBaseDir();
        }
        final Path targetDir = base;

        try {
            ClipboardContent content = new ClipboardContent();
            content.putString(targetDir.toAbsolutePath().toString());
            Clipboard.getSystemClipboard().setContent(content);
            statusLabel.setText("📋 Copied extension path (" + targetDir.getFileName() + ") & opened Explorer!");
            statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #34D399;");
        } catch (Exception ignored) {}

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
