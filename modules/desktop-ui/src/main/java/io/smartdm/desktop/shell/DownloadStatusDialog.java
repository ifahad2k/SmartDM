package io.smartdm.desktop.shell;

import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

public final class DownloadStatusDialog extends GlassmorphicDialog {

    private final Label progressText;
    private final Region progressFill;
    
    public DownloadStatusDialog(Stage owner) {
        super(owner, "SmartDM — Download status");
        
        // Tabs
        HBox tabs = new HBox();
        tabs.getStyleClass().add("tabs");
        Label tab1 = new Label("Download status");
        tab1.getStyleClass().addAll("tab-label", "active");
        Label tab2 = new Label("Speed limiter");
        tab2.getStyleClass().add("tab-label");
        Label tab3 = new Label("On completion");
        tab3.getStyleClass().add("tab-label");
        tabs.getChildren().addAll(tab1, tab2, tab3);
        
        ((VBox)root.getCenter()).getChildren().add(0, tabs); // Insert above body
        
        // URL
        Label urlText = new Label("http://example.com/file.zip");
        urlText.getStyleClass().add("text-input");
        urlText.setMaxWidth(Double.MAX_VALUE);
        
        // Grid for stats
        GridPane grid = new GridPane();
        grid.setHgap(16);
        grid.setVgap(13);
        
        grid.add(createField("File size", "0 B"), 0, 0);
        grid.add(createField("Downloaded", "0 B"), 1, 0);
        grid.add(createField("Transfer rate", "0 B/s"), 0, 1);
        grid.add(createField("Time left", "Unknown"), 1, 1);
        grid.add(createField("Resume capable", "Yes"), 0, 2);
        grid.add(createField("Source host", "example.com"), 1, 2);
        
        // Progress track
        HBox progressTop = new HBox();
        Label pLabel = new Label("Progress");
        pLabel.getStyleClass().add("ds");
        Region spacer2 = new Region();
        HBox.setHgrow(spacer2, Priority.ALWAYS);
        progressText = new Label("0%");
        progressText.getStyleClass().add("dt");
        progressText.setStyle("-fx-font-size: 11px;");
        progressTop.getChildren().addAll(pLabel, spacer2, progressText);
        
        Region progressTrack = new Region();
        progressTrack.getStyleClass().add("progress-track");
        
        progressFill = new Region();
        progressFill.getStyleClass().add("progress-fill");
        progressFill.setPrefWidth(0); // Will update dynamically
        
        // Stack track and fill manually since it's custom
        javafx.scene.layout.StackPane progressWrap = new javafx.scene.layout.StackPane();
        progressWrap.setAlignment(javafx.geometry.Pos.CENTER_LEFT);
        progressWrap.getChildren().addAll(progressTrack, progressFill);
        
        VBox progContainer = new VBox(8, progressTop, progressWrap);
        
        // Actions
        HBox actions = new HBox(10);
        Button showBtn = new Button("Show details");
        showBtn.getStyleClass().addAll("btn", "btn-ghost");
        showBtn.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(showBtn, Priority.ALWAYS);
        
        Button pauseBtn = new Button("Pause");
        pauseBtn.getStyleClass().add("btn");
        pauseBtn.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(pauseBtn, Priority.ALWAYS);
        
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().addAll("btn", "btn-primary");
        cancelBtn.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(cancelBtn, Priority.ALWAYS);
        
        actions.getChildren().addAll(showBtn, pauseBtn, cancelBtn);
        
        dialogBody.getChildren().addAll(urlText, grid, progContainer, actions);
    }
    
    private VBox createField(String title, String val) {
        Label t = new Label(title);
        t.getStyleClass().add("field-label");
        Label v = new Label(val);
        v.setStyle("-fx-text-fill: #F3F5FC; -fx-font-family: 'JetBrains Mono', monospace; -fx-font-size: 12px;");
        return new VBox(4, t, v);
    }
}
