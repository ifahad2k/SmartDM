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

        boolean isLinux = System.getProperty("os.name", "").toLowerCase().contains("linux");
        String scriptExt = isLinux ? "install.sh" : "install.bat";

        Label instructions = new Label(
            "To connect SmartDM with your browser:\n\n" +
            "For Google Chrome / Chromium:\n" +
            "1. Run '" + scriptExt + "' from extensions/chrome/host\n" +
            "2. Open Chrome -> Extensions -> Enable Developer Mode\n" +
            "3. Click 'Load unpacked' and select the 'extensions/chrome' folder\n\n" +
            "For Mozilla Firefox:\n" +
            "1. Run '" + scriptExt + "' from extensions/firefox/host\n" +
            "2. Open Firefox -> about:debugging#/runtime/this-firefox\n" +
            "3. Click 'Load Temporary Add-on' and select 'extensions/firefox/manifest.json'\n"
        );
        instructions.setWrapText(true);
        instructions.getStyleClass().add("dialog-label");

        HBox btnBox = new HBox(10);
        btnBox.setAlignment(Pos.CENTER_RIGHT);

        Button installHostsBtn = new Button("Auto-Install Host Scripts");
        installHostsBtn.getStyleClass().addAll("btn", "btn-primary");
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
                        
                        String chromeJson = "{\n  \"name\": \"io.smartdm.host\",\n  \"description\": \"SmartDM Native Messaging Host\",\n  \"path\": \"" + chromeInstall.getAbsolutePath() + "\",\n  \"type\": \"stdio\",\n  \"allowed_origins\": [\"chrome-extension://lkbiimagmeaefiedjigomffpophipmck/\"]\n}";
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
                        instructions.setText("Native messaging hosts successfully installed for Chrome and Firefox!");
                    });
                } catch (Exception ex) {
                    ex.printStackTrace();
                }
            });
        });

        Button openFolderBtn = new Button("Open Extensions Folder");
        openFolderBtn.getStyleClass().add("btn");
        openFolderBtn.setOnAction(e -> {
            try {
                File extDir = new File("../../extensions");
                if (!extDir.exists()) {
                    extDir = new File("extensions");
                }
                if (extDir.exists()) {
                    File target = extDir.getAbsoluteFile();
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

        btnBox.getChildren().addAll(installHostsBtn, openFolderBtn, closeBtn);

        dialogBody.getChildren().addAll(instructions, btnBox);
    }
}

