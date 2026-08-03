package io.smartdm.desktop.shell;

import io.smartdm.ai.api.ApprovedPayload;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextArea;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;
import javafx.stage.Window;

public class AiConsentDialog extends GlassmorphicDialog {

    private boolean approved = false;

    @SuppressWarnings("this-escape")
    public AiConsentDialog(Stage owner, ApprovedPayload payload, String providerName) {
        super(owner, "AI Data Consent Request");

        VBox content = new VBox(15);
        content.setPrefWidth(520);
        content.setAlignment(Pos.TOP_LEFT);

        Label subHeader = new Label("An AI query is required to complete this action.");
        subHeader.getStyleClass().add("text-subtle");

        Label providerLabel = new Label("Target Provider: " + providerName);
        providerLabel.setStyle("-fx-font-weight: bold; -fx-text-fill: #89B4FA;");

        Label noticeLabel = new Label("Purpose: " + payload.purposeNotice());
        noticeLabel.setWrapText(true);

        Label payloadHeader = new Label("Exact Data Payload Preview (Sanitized & Inspected):");
        payloadHeader.setStyle("-fx-font-size: 12px; -fx-font-weight: bold;");

        TextArea payloadView = new TextArea();
        payloadView.setText(payload.sanitizedPrompt());
        payloadView.setEditable(false);
        payloadView.setWrapText(true);
        payloadView.setPrefRowCount(5);
        payloadView.setStyle("-fx-font-family: monospace; -fx-background-color: rgba(0,0,0,0.3);");

        Label privacyNotice = new Label("🔒 Zero Secret Policy: No file bytes, cookies, passwords, API keys, or raw file hashes are included in this request.");
        privacyNotice.setWrapText(true);
        privacyNotice.setStyle("-fx-font-size: 11px; -fx-text-fill: #A6E3A1;");

        HBox btnBox = new HBox(12);
        btnBox.setAlignment(Pos.CENTER_RIGHT);

        Button declineBtn = new Button("Decline (Use Local Engine)");
        declineBtn.getStyleClass().addAll("btn", "btn-secondary");
        declineBtn.setOnAction(e -> {
            approved = false;
            close();
        });

        Button approveBtn = new Button("Approve & Send Request");
        approveBtn.getStyleClass().addAll("btn", "btn-primary");
        approveBtn.setOnAction(e -> {
            approved = true;
            close();
        });

        btnBox.getChildren().addAll(declineBtn, approveBtn);

        content.getChildren().addAll(subHeader, providerLabel, noticeLabel, payloadHeader, payloadView, privacyNotice, btnBox);
        dialogBody.getChildren().add(content);
    }

    public boolean isApproved() {
        return approved;
    }
}
