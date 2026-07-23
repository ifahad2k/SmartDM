package io.smartdm.desktop.shell;

import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.stage.Modality;
import javafx.stage.Stage;
import java.util.List;
import io.smartdm.domain.Download;

public final class EnterUrlDialog extends GlassmorphicDialog {
    private final TextField urlField;
    private final Button okBtn;
    private String resultUrl = null;
    private final java.util.List<Download> existingDownloads;
    private java.util.function.Consumer<Download> onDownloadAdded;

    private final io.smartdm.organization.SmartFolderService smartFolderService;

    public EnterUrlDialog(Stage owner, java.util.List<Download> existingDownloads, java.util.function.Consumer<Download> onDownloadAdded) {
        this(owner, existingDownloads, onDownloadAdded, null);
    }

    public EnterUrlDialog(Stage owner, java.util.List<Download> existingDownloads, java.util.function.Consumer<Download> onDownloadAdded, io.smartdm.organization.SmartFolderService smartFolderService) {
        super(owner, "Enter new address to download", Modality.APPLICATION_MODAL);
        this.existingDownloads = existingDownloads;
        this.onDownloadAdded = onDownloadAdded;
        this.smartFolderService = smartFolderService;

        VBox content = new VBox(10);
        
        Label prompt = new Label("Address:");
        prompt.getStyleClass().add("idm-label");
        
        urlField = new TextField();
        urlField.getStyleClass().add("text-input");
        urlField.setPromptText("http://...");
        
        content.getChildren().addAll(prompt, urlField);
        dialogBody.getChildren().add(content);

        // Pre-fill from clipboard
        ClipboardMonitor clipboardMonitor = new ClipboardMonitor();
        List<String> urls = clipboardMonitor.checkClipboardOnFocus();
        if (!urls.isEmpty()) {
            urlField.setText(urls.get(0));
        }

        // Footer
        HBox footer = new HBox();
        footer.getStyleClass().add("dialog-foot");
        footer.setAlignment(Pos.CENTER_RIGHT);
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        okBtn = new Button("OK");
        okBtn.getStyleClass().addAll("btn", "btn-primary");
        okBtn.setOnAction(e -> confirmAndClose());
        
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().addAll("btn", "btn-ghost");
        cancelBtn.setOnAction(e -> close());
        
        footer.getChildren().addAll(spacer, okBtn, cancelBtn);
        root.setBottom(footer);
    }
    
    private void confirmAndClose() {
        resultUrl = urlField.getText().trim();
        close();
        if (!resultUrl.isEmpty()) {
            String lower = resultUrl.toLowerCase();
            boolean isDirectFile = lower.endsWith(".zip") || lower.endsWith(".iso") ||
                                   lower.endsWith(".exe") || lower.endsWith(".pdf") ||
                                   lower.endsWith(".rar") || lower.endsWith(".7z") ||
                                   lower.endsWith(".tar") || lower.endsWith(".gz") ||
                                   lower.endsWith(".dmg") || lower.endsWith(".msi");

            io.smartdm.media.ytdlp.LocalMediaToolManager toolMgr = new io.smartdm.media.ytdlp.LocalMediaToolManager();
            if (!isDirectFile && toolMgr.isAvailable()) {
                io.smartdm.media.ytdlp.YtDlpExtractor extractor = new io.smartdm.media.ytdlp.YtDlpExtractor(toolMgr);
                extractor.extractMetadataAsync(resultUrl)
                    .thenAccept(meta -> javafx.application.Platform.runLater(() -> {
                        if (meta != null && meta.formats() != null && !meta.formats().isEmpty()) {
                            MediaDownloadDialog dlg = new MediaDownloadDialog(null, meta, onDownloadAdded);
                            dlg.show();
                        } else {
                            AddDownloadDialog d = new AddDownloadDialog(null, existingDownloads, smartFolderService);
                            d.setOnDownloadAdded(onDownloadAdded);
                            d.setUrlText(resultUrl);
                            d.show();
                        }
                    }))
                    .exceptionally(ex -> {
                        javafx.application.Platform.runLater(() -> {
                            AddDownloadDialog d = new AddDownloadDialog(null, existingDownloads, smartFolderService);
                            d.setOnDownloadAdded(onDownloadAdded);
                            d.setUrlText(resultUrl);
                            d.show();
                        });
                        return null;
                    });
            } else {
                AddDownloadDialog d = new AddDownloadDialog(null, existingDownloads, smartFolderService);
                d.setOnDownloadAdded(onDownloadAdded);
                d.setUrlText(resultUrl);
                d.show();
            }
        }
    }
}
