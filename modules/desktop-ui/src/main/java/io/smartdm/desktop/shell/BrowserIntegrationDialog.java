package io.smartdm.desktop.shell;

import io.smartdm.browser.protocol.BrowserIntegrationInstallerService;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

import java.io.File;
import java.nio.file.Path;

public class BrowserIntegrationDialog extends GlassmorphicDialog {

    private final Label statusLabel = new Label("");
    private String activeTab = "CHROME"; // "CHROME" or "FIREFOX"

    private final Button tabChromeBtn;
    private final Button tabFirefoxBtn;
    private final VBox chromeGuideCard;
    private final VBox firefoxGuideCard;

    @SuppressWarnings("this-escape")
    public BrowserIntegrationDialog(Stage owner) {
        super(owner, "Browser Integration & Extension Installation Guide");

        dialogBody.setSpacing(14);
        dialogBody.setPadding(new Insets(20));

        Label subtitle = new Label(
            "Follow the simple steps below to register SmartDM Native Messaging Host and load the extension into your browser.\n" +
            "Native Messaging Host bridges your browser directly to SmartDM for instant high-speed download interception."
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

        statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        // Bottom Action Bar
        HBox btnBox = new HBox(8);
        btnBox.setAlignment(Pos.CENTER_RIGHT);

        Button closeBtn = new Button("Done / Close");
        closeBtn.getStyleClass().addAll("btn", "btn-primary");
        closeBtn.setOnAction(e -> close());

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        btnBox.getChildren().addAll(spacer, closeBtn);

        dialogBody.getChildren().addAll(subtitle, tabBox, chromeGuideCard, firefoxGuideCard, statusLabel, btnBox);
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
        VBox card = new VBox(12);
        card.setPadding(new Insets(16));
        card.setStyle("-fx-background-color: rgba(56, 189, 248, 0.06); -fx-border-color: rgba(56, 189, 248, 0.25); -fx-border-radius: 8px; -fx-background-radius: 8px;");

        Label header = new Label("🟢 Chrome / Edge / Brave / Opera Installation Steps:");
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
        VBox card = new VBox(12);
        card.setPadding(new Insets(16));
        card.setStyle("-fx-background-color: rgba(251, 146, 60, 0.06); -fx-border-color: rgba(251, 146, 60, 0.25); -fx-border-radius: 8px; -fx-background-radius: 8px;");

        Label header = new Label("🦊 Mozilla Firefox Installation Steps:");
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
