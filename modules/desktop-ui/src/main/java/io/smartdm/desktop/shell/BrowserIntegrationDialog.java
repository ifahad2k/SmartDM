package io.smartdm.desktop.shell;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

import java.io.File;

public class BrowserIntegrationDialog extends GlassmorphicDialog {

    @SuppressWarnings("this-escape")
    public BrowserIntegrationDialog(Stage owner) {
        super(owner, "Browser Integration & Extension Setup");

        dialogBody.setSpacing(15);
        dialogBody.setPadding(new Insets(20));

        boolean isLinux = System.getProperty("os.name", "").toLowerCase().contains("linux");
        String scriptExt = isLinux ? "install.sh" : "install.bat";

        Label instructions = new Label(
            "SmartDM comes with pre-packaged browser extensions ready to install:\n\n" +
            "📌 For Google Chrome / Edge / Brave / Vivaldi:\n" +
            "1. Open chrome://extensions (or edge://extensions) in your browser.\n" +
            "2. Enable 'Developer mode' in the top right corner.\n" +
            "3. Click 'Open Chrome Extension Folder' below (the path will also be copied to clipboard).\n" +
            "4. Click 'Load unpacked' in your browser and select that folder!\n\n" +
            "📌 For Mozilla Firefox:\n" +
            "1. Open about:debugging#/runtime/this-firefox in Firefox.\n" +
            "2. Click 'Load Temporary Add-on...'\n" +
            "3. Select the 'manifest.json' file inside the Firefox extension folder."
        );
        instructions.setWrapText(true);
        instructions.getStyleClass().add("dialog-label");
        instructions.setStyle("-fx-font-size: 13px; -fx-text-fill: #CBD5E1; -fx-line-spacing: 4px;");

        Label statusLabel = new Label("");
        statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        HBox btnBox = new HBox(10);
        btnBox.setAlignment(Pos.CENTER_LEFT);

        Button openChromeFolderBtn = new Button("📁 Open Chrome Extension Folder");
        openChromeFolderBtn.getStyleClass().addAll("btn", "btn-primary");
        openChromeFolderBtn.setOnAction(e -> {
            File chromeDir = findExtensionDir("chrome");
            if (chromeDir != null && chromeDir.exists()) {
                // Copy path to clipboard
                ClipboardContent content = new ClipboardContent();
                content.putString(chromeDir.getAbsolutePath());
                Clipboard.getSystemClipboard().setContent(content);

                // Open folder in File Explorer
                openFolderInExplorer(chromeDir);
                statusLabel.setText("📋 Copied path & opened Chrome extension folder!");
                statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #34D399;");
            } else {
                statusLabel.setText("❌ Could not locate Chrome extension folder.");
                statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #F87171;");
            }
        });

        Button openFirefoxFolderBtn = new Button("🦊 Open Firefox Extension Folder");
        openFirefoxFolderBtn.getStyleClass().add("btn");
        openFirefoxFolderBtn.setOnAction(e -> {
            File firefoxDir = findExtensionDir("firefox");
            if (firefoxDir != null && firefoxDir.exists()) {
                openFolderInExplorer(firefoxDir);
                statusLabel.setText("📂 Opened Firefox extension folder!");
                statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #34D399;");
            } else {
                statusLabel.setText("❌ Could not locate Firefox extension folder.");
                statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #F87171;");
            }
        });

        Button installHostsBtn = new Button("⚡ Re-Register Native Host");
        installHostsBtn.getStyleClass().add("btn");
        installHostsBtn.setOnAction(e -> {
            java.util.concurrent.CompletableFuture.runAsync(() -> {
                try {
                    File chromeInstall = new File("extensions/chrome/host/" + scriptExt);
                    File firefoxInstall = new File("extensions/firefox/host/" + scriptExt);
                    if (!chromeInstall.exists()) chromeInstall = new File("../../extensions/chrome/host/" + scriptExt);
                    if (!firefoxInstall.exists()) firefoxInstall = new File("../../extensions/firefox/host/" + scriptExt);

                    if (isLinux) {
                        String userHome = System.getProperty("user.home");
                        java.nio.file.Path[] chromeDirs = new java.nio.file.Path[]{
                            java.nio.file.Paths.get(userHome, ".config", "google-chrome", "NativeMessagingHosts"),
                            java.nio.file.Paths.get(userHome, ".config", "chromium", "NativeMessagingHosts"),
                            java.nio.file.Paths.get(userHome, ".config", "BraveSoftware", "Brave-Browser", "NativeMessagingHosts")
                        };
                        java.nio.file.Path firefoxDir = java.nio.file.Paths.get(userHome, ".mozilla", "native-messaging-hosts");
                        
                        String chromeJson = "{\n  \"name\": \"io.smartdm.host\",\n  \"description\": \"SmartDM Native Messaging Host\",\n  \"path\": \"" + chromeInstall.getAbsolutePath() + "\",\n  \"type\": \"stdio\",\n  \"allowed_origins\": [\"chrome-extension://lkbiimagmeaefiedjigomffpophipmck/\", \"chrome-extension://knldjnnmkkebefogdbmggjijknmjeaoh/\"]\n}";
                        for (java.nio.file.Path targetDir : chromeDirs) {
                            try {
                                java.nio.file.Files.createDirectories(targetDir);
                                java.nio.file.Files.writeString(targetDir.resolve("io.smartdm.host.json"), chromeJson);
                            } catch (Exception ignored) {}
                        }
                        
                        String firefoxJson = "{\n  \"name\": \"io.smartdm.host\",\n  \"description\": \"SmartDM Native Messaging Host\",\n  \"path\": \"" + firefoxInstall.getAbsolutePath() + "\",\n  \"type\": \"stdio\",\n  \"allowed_extensions\": [\"smartdm@smartdm.io\"]\n}";
                        try {
                            java.nio.file.Files.createDirectories(firefoxDir);
                            java.nio.file.Files.writeString(firefoxDir.resolve("io.smartdm.host.json"), firefoxJson);
                        } catch (Exception ignored) {}
                    }
                    javafx.application.Platform.runLater(() -> {
                        statusLabel.setText("✅ Native messaging hosts successfully registered!");
                        statusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #34D399;");
                    });
                } catch (Exception ex) {
                    ex.printStackTrace();
                }
            });
        });

        Button closeBtn = new Button("Close");
        closeBtn.getStyleClass().add("btn");
        closeBtn.setOnAction(e -> close());

        btnBox.getChildren().addAll(openChromeFolderBtn, openFirefoxFolderBtn, installHostsBtn, closeBtn);

        dialogBody.getChildren().addAll(instructions, statusLabel, btnBox);
    }

    private File findExtensionDir(String browser) {
        String[] candidatePaths = new String[]{
            "extensions/" + browser,
            "../extensions/" + browser,
            "../../extensions/" + browser,
            System.getProperty("user.dir") + "/extensions/" + browser
        };
        for (String p : candidatePaths) {
            File f = new File(p);
            if (f.exists() && f.isDirectory()) {
                return f.getAbsoluteFile();
            }
        }
        return null;
    }

    private void openFolderInExplorer(File target) {
        java.util.concurrent.CompletableFuture.runAsync(() -> {
            try {
                String os = System.getProperty("os.name", "").toLowerCase();
                if (os.contains("win")) {
                    new ProcessBuilder("explorer.exe", target.getAbsolutePath()).start();
                } else {
                    new ProcessBuilder("xdg-open", target.getAbsolutePath()).start();
                }
            } catch (Exception ex) {
                ex.printStackTrace();
            }
        });
    }
}


