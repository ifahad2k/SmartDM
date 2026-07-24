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

public final class EnterUrlDialog extends GlassmorphicDialog {
    private final TextField urlField;
    private final Button okBtn;
    private String resultUrl = null;
    private java.util.function.Consumer<String> onUrlEntered;

    public EnterUrlDialog(Stage owner, java.util.function.Consumer<String> onUrlEntered) {
        super(owner, "Enter new address to download", Modality.APPLICATION_MODAL);
        this.onUrlEntered = onUrlEntered;

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
        
        okBtn = new Button("OK");
        okBtn.getStyleClass().add("idm-button-primary");
        okBtn.setDefaultButton(true);
        okBtn.setOnAction(e -> confirmAndClose());
        
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().add("idm-button");
        cancelBtn.setCancelButton(true);
        cancelBtn.setOnAction(e -> close());
        
        footer.getChildren().addAll(okBtn, cancelBtn);
        dialogBody.getChildren().add(footer);
    }
    
    private void confirmAndClose() {
        resultUrl = urlField.getText().trim();
        close();
        if (!resultUrl.isEmpty() && onUrlEntered != null) {
            onUrlEntered.accept(resultUrl);
        }
    }
}
