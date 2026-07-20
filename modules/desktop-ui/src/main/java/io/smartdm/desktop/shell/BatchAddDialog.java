package io.smartdm.desktop.shell;

import io.smartdm.application.batch.BatchInputParser;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ListView;
import javafx.scene.control.TextArea;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

import java.util.List;

public final class BatchAddDialog extends GlassmorphicDialog {

    private final TextArea inputArea;
    private final ListView<String> parsedUrlsList;
    private final Button addBtn;
    private final Label countLabel;
    private List<String> currentBatchUrls;
    
    private boolean resultConfirmed = false;

    public BatchAddDialog(Stage owner) {
        super(owner, "SmartDM — Batch Add");

        // Header
        Label headerTitle = new Label("Add multiple links");
        headerTitle.getStyleClass().add("dt");
        Label headerSub = new Label("Paste URLs (one per line, or CSV) or numeric patterns like image_[01-10].jpg.");
        headerSub.getStyleClass().add("ds");
        VBox head = new VBox(2, headerTitle, headerSub);

        // Input area
        Label inputLabel = new Label("PASTE LINKS OR PATTERNS");
        inputLabel.getStyleClass().add("field-label");

        inputArea = new TextArea();
        inputArea.setPromptText("http://example.com/file1.zip\nhttp://example.com/file2.zip\nhttp://example.com/image_[01-50].jpg");
        inputArea.getStyleClass().add("text-input");
        inputArea.setPrefRowCount(6);
        VBox.setVgrow(inputArea, Priority.ALWAYS);

        VBox inputGroup = new VBox(6, inputLabel, inputArea);
        VBox.setVgrow(inputGroup, Priority.ALWAYS);

        // Parse button
        Button parseBtn = new Button("Parse & Preview");
        parseBtn.getStyleClass().addAll("btn", "btn-secondary");

        // Preview list
        Label previewLabel = new Label("PREVIEW");
        previewLabel.getStyleClass().add("field-label");
        
        parsedUrlsList = new ListView<>();
        parsedUrlsList.getStyleClass().add("queue-list");
        parsedUrlsList.setPrefHeight(150);
        VBox.setVgrow(parsedUrlsList, Priority.ALWAYS);

        countLabel = new Label("0 URLs found");
        countLabel.setStyle("-fx-text-fill: #A6ADC4; -fx-font-size: 12px;");
        
        HBox previewHeadRow = new HBox(previewLabel, createSpacer(), countLabel);
        previewHeadRow.setAlignment(Pos.CENTER_LEFT);
        
        VBox previewGroup = new VBox(6, previewHeadRow, parsedUrlsList);
        VBox.setVgrow(previewGroup, Priority.ALWAYS);

        // Actions
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().addAll("btn", "btn-ghost");
        cancelBtn.setOnAction(e -> close());

        addBtn = new Button("Add to Queue");
        addBtn.getStyleClass().addAll("btn", "btn-primary");
        addBtn.setDisable(true);
        addBtn.setOnAction(e -> {
            resultConfirmed = true;
            close();
        });

        HBox actions = new HBox(8, cancelBtn, addBtn);
        actions.setAlignment(Pos.CENTER_RIGHT);

        parseBtn.setOnAction(e -> {
            List<String> parsed = BatchInputParser.parse(inputArea.getText());
            currentBatchUrls = parsed;
            parsedUrlsList.getItems().setAll(parsed);
            countLabel.setText(parsed.size() + " URLs found");
            addBtn.setDisable(parsed.isEmpty());
        });

        VBox content = new VBox(20, head, inputGroup, parseBtn, previewGroup, actions);
        content.setPrefWidth(600);
        content.setPrefHeight(600);
        dialogBody.getChildren().add(content);
    }

    private javafx.scene.layout.Region createSpacer() {
        javafx.scene.layout.Region r = new javafx.scene.layout.Region();
        HBox.setHgrow(r, Priority.ALWAYS);
        return r;
    }

    public boolean isResultConfirmed() {
        return resultConfirmed;
    }

    public List<String> getBatchUrls() {
        return currentBatchUrls;
    }

    public void setInputText(String text) {
        inputArea.setText(text);
        // Auto parse when pre-filled
        List<String> parsed = BatchInputParser.parse(text);
        currentBatchUrls = parsed;
        parsedUrlsList.getItems().setAll(parsed);
        countLabel.setText(parsed.size() + " URLs found");
        addBtn.setDisable(parsed.isEmpty());
    }
}
