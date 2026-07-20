package io.smartdm.desktop.shell;

import io.smartdm.domain.Download;
import io.smartdm.desktop.shell.controls.NumberSpinner;
import io.smartdm.desktop.shell.controls.StringSpinner;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.function.Consumer;

public final class SetTimerDialog extends Stage {
    private final Download download;
    private final Consumer<Download> onSave;

    private ComboBox<String> scheduleCombo;
    private NumberSpinner alarmHr;
    private NumberSpinner alarmMin;
    private StringSpinner alarmAmPm;

    private NumberSpinner timerHr;
    private NumberSpinner timerMin;
    private NumberSpinner timerSec;

    public SetTimerDialog(Download download, Consumer<Download> onSave) {
        this.download = download;
        this.onSave = onSave;

        initStyle(StageStyle.TRANSPARENT);
        initModality(Modality.APPLICATION_MODAL);

        VBox root = new VBox(16);
        root.getStyleClass().add("dialog-root");
        root.setPadding(new Insets(20));
        
        // Header
        Label title = new Label("Set Timer for Download");
        title.getStyleClass().add("ws-title");
        
        String filename = download.source().value().getPath();
        if (filename == null || filename.isEmpty() || filename.equals("/")) {
            filename = download.source().value().getHost();
        } else {
            filename = filename.substring(filename.lastIndexOf('/') + 1);
        }
        Label subTitle = new Label(filename);
        subTitle.getStyleClass().add("ws-sub");
        VBox head = new VBox(2, title, subTitle);

        // Schedule Controls
        Label schedLabel = new Label("Schedule");
        schedLabel.getStyleClass().add("field-label");
        scheduleCombo = new ComboBox<>();
        scheduleCombo.getItems().addAll(
            "Start immediately",
            "Start at a specific time",
            "Start after a timer"
        );
        scheduleCombo.getSelectionModel().select(0);
        scheduleCombo.getStyleClass().add("text-input");
        scheduleCombo.setMaxWidth(Double.MAX_VALUE);
        
        VBox customSchedBox = new VBox();
        customSchedBox.setAlignment(Pos.CENTER);
        customSchedBox.setPadding(new Insets(10, 0, 0, 0));
        
        // Exact Time (Alarm)
        HBox alarmBox = new HBox(8);
        alarmBox.setAlignment(Pos.CENTER);
        alarmHr = new NumberSpinner(12, 1, 12, true, "%02d");
        alarmMin = new NumberSpinner(0, 0, 59, true, "%02d");
        alarmAmPm = new StringSpinner(Arrays.asList("AM", "PM"), 0);
        alarmBox.getChildren().addAll(alarmHr, new Label(":"), alarmMin, alarmAmPm);
        
        // Countdown (Timer)
        HBox timerBox = new HBox(8);
        timerBox.setAlignment(Pos.CENTER);
        timerHr = new NumberSpinner(0, 0, 99, false, "%02d");
        timerMin = new NumberSpinner(0, 0, 59, true, "%02d");
        timerSec = new NumberSpinner(0, 0, 59, true, "%02d");
        timerBox.getChildren().addAll(timerHr, new Label(":"), timerMin, new Label(":"), timerSec);

        scheduleCombo.getSelectionModel().selectedIndexProperty().addListener((obs, oldV, newV) -> {
            customSchedBox.getChildren().clear();
            if (newV.intValue() == 1) customSchedBox.getChildren().add(alarmBox);
            else if (newV.intValue() == 2) customSchedBox.getChildren().add(timerBox);
            javafx.application.Platform.runLater(this::sizeToScene);
        });

        VBox schedGroup = new VBox(6, schedLabel, scheduleCombo, customSchedBox);

        // Footer
        HBox footer = new HBox(8);
        footer.setAlignment(Pos.CENTER_RIGHT);
        
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().addAll("btn", "btn-ghost");
        cancelBtn.setOnAction(e -> close());
        
        Button saveBtn = new Button("Save Schedule");
        saveBtn.getStyleClass().addAll("btn", "btn-primary");
        saveBtn.setOnAction(e -> applyScheduleAndSave());
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        footer.getChildren().addAll(spacer, cancelBtn, saveBtn);

        root.getChildren().addAll(head, schedGroup, footer);

        Scene scene = new Scene(root, 400, -1);
        scene.setFill(javafx.scene.paint.Color.TRANSPARENT);
        scene.getStylesheets().add(getClass().getResource("/io/smartdm/desktop/theme/dialog.css").toExternalForm());
        scene.getStylesheets().add(getClass().getResource("/io/smartdm/desktop/theme/main.css").toExternalForm());
        setScene(scene);
    }
    
    private void applyScheduleAndSave() {
        int schedType = scheduleCombo.getSelectionModel().getSelectedIndex();
        if (schedType == 1) { // Start at specific time
            int hr = alarmHr.getValue();
            if (hr == 12) hr = 0;
            if (alarmAmPm.getValue().equals("PM")) hr += 12;
            int min = alarmMin.getValue();
            LocalTime time = LocalTime.of(hr, min);
            LocalDateTime now = LocalDateTime.now();
            LocalDateTime target = now.with(time);
            if (target.isBefore(now)) {
                target = target.plusDays(1);
            }
            download.updateScheduledStartTime(target.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli());
        } else if (schedType == 2) { // Start after timer
            int h = timerHr.getValue();
            int m = timerMin.getValue();
            int s = timerSec.getValue();
            long delayMs = (h * 3600L + m * 60L + s) * 1000L;
            download.updateScheduledStartTime(System.currentTimeMillis() + delayMs);
        } else {
            download.updateScheduledStartTime(null);
        }
        
        if (onSave != null) {
            onSave.accept(download);
        }
        close();
    }
}
