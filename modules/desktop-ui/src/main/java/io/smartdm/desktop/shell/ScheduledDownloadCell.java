package io.smartdm.desktop.shell;

import io.smartdm.domain.Download;
import javafx.animation.Animation;
import javafx.animation.KeyFrame;
import javafx.animation.Timeline;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ListCell;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.util.Duration;

import java.util.function.Consumer;

public class ScheduledDownloadCell extends ListCell<Download> {

    private final HBox root;
    private final Label nameLabel;
    private final Label countdownLabel;
    private final Button removeTimerBtn;
    private final Timeline timeline;
    
    private Download currentItem;
    
    public ScheduledDownloadCell(Consumer<Download> onRemoveTimer) {
        root = new HBox(12);
        root.getStyleClass().add("list-cell");
        root.setAlignment(Pos.CENTER_LEFT);
        
        VBox texts = new VBox();
        nameLabel = new Label();
        nameLabel.setStyle("-fx-text-fill: white; -fx-font-size: 16px; -fx-font-weight: bold;");
        
        countdownLabel = new Label();
        countdownLabel.setStyle("-fx-text-fill: #00FF88; -fx-font-size: 14px;"); // green countdown
        texts.getChildren().addAll(nameLabel, countdownLabel);
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        removeTimerBtn = new Button("Clear Timer");
        removeTimerBtn.getStyleClass().add("btn");
        removeTimerBtn.setOnAction(e -> {
            if (currentItem != null) {
                onRemoveTimer.accept(currentItem);
            }
        });
        
        root.getChildren().addAll(texts, spacer, removeTimerBtn);
        
        timeline = new Timeline(new KeyFrame(Duration.seconds(1), e -> updateCountdown()));
        timeline.setCycleCount(Animation.INDEFINITE);
    }
    
    @Override
    protected void updateItem(Download item, boolean empty) {
        super.updateItem(item, empty);
        currentItem = item;
        
        if (empty || item == null) {
            setText(null);
            setGraphic(null);
            timeline.stop();
        } else {
            String filename = item.source().value().getPath();
            if (filename == null || filename.isEmpty() || filename.equals("/")) {
                filename = item.source().value().getHost();
            } else {
                filename = filename.substring(filename.lastIndexOf('/') + 1);
            }
            nameLabel.setText(filename);
            
            updateCountdown();
            setGraphic(root);
            timeline.play();
        }
    }
    
    private void updateCountdown() {
        if (currentItem == null || currentItem.scheduledStartTime() == null) {
            countdownLabel.setText("No timer set");
            return;
        }
        
        long diff = currentItem.scheduledStartTime() - System.currentTimeMillis();
        if (diff <= 0) {
            countdownLabel.setText("Starting now...");
            countdownLabel.setStyle("-fx-text-fill: #FFB86C; -fx-font-size: 14px;");
        } else {
            long totalSeconds = diff / 1000;
            long hours = totalSeconds / 3600;
            long minutes = (totalSeconds % 3600) / 60;
            long seconds = totalSeconds % 60;
            countdownLabel.setText(String.format("Starts in: %02d:%02d:%02d", hours, minutes, seconds));
            countdownLabel.setStyle("-fx-text-fill: #00FF88; -fx-font-size: 14px;");
        }
    }
}
