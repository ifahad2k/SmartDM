package io.smartdm.desktop.shell;

import javafx.scene.layout.VBox;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.control.Label;
import javafx.scene.control.Button;
import javafx.scene.control.TextField;
import javafx.scene.control.ListView;
import javafx.scene.control.ListCell;
import javafx.scene.control.ComboBox;
import javafx.scene.control.CheckBox;
import javafx.scene.control.Spinner;
import javafx.scene.control.SpinnerValueFactory;
import javafx.geometry.Pos;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import io.smartdm.domain.Schedule;
import java.time.LocalTime;
import java.util.function.Supplier;
import java.util.function.Consumer;
import io.smartdm.domain.Download;
import io.smartdm.domain.QueueItem;
import io.smartdm.desktop.shell.controls.NumberSpinner;
import io.smartdm.desktop.shell.controls.StringSpinner;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Arrays;

public final class SchedulerWorkspace extends VBox {
    
    private final Supplier<java.util.List<Download>> scheduledDownloadsSupplier;
    private final Consumer<Download> onDownloadUpdate;
    private final ObservableList<Download> scheduledDownloads;
    private final ListView<Download> scheduledDownloadsList;
    
    private final ObservableList<QueueItem> mainQueueItems;
    private final DownloadsWorkspace downloadsWorkspace;

    public SchedulerWorkspace(Supplier<java.util.List<Download>> scheduledDownloadsSupplier, Consumer<Download> onDownloadUpdate, ObservableList<QueueItem> mainQueueItems, DownloadsWorkspace downloadsWorkspace) {
        this.scheduledDownloadsSupplier = scheduledDownloadsSupplier;
        this.onDownloadUpdate = onDownloadUpdate;
        this.mainQueueItems = mainQueueItems;
        this.downloadsWorkspace = downloadsWorkspace;
        
        this.scheduledDownloads = FXCollections.observableArrayList(scheduledDownloadsSupplier != null ? scheduledDownloadsSupplier.get() : java.util.List.of());
        
        getStyleClass().add("workspace");
        setSpacing(12);
        
        // Header
        HBox wsHead = new HBox();
        wsHead.getStyleClass().add("ws-head");
        
        VBox titleBox = new VBox();
        Label wsTitle = new Label("Scheduler Management");
        wsTitle.getStyleClass().add("ws-title");
        Label wsSub = new Label("Define when queues should automatically start and stop.");
        wsSub.getStyleClass().add("ws-sub");
        titleBox.getChildren().addAll(wsTitle, wsSub);
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        // Content Box for scheduling
        VBox downloadsBox = new VBox(8);
        Label downloadsTitle = new Label("Individually Scheduled Downloads");
        downloadsTitle.getStyleClass().add("ws-sub");
        
        scheduledDownloadsList = new ListView<>();
        scheduledDownloadsList.getStyleClass().add("list");
        scheduledDownloadsList.getSelectionModel().setSelectionMode(javafx.scene.control.SelectionMode.MULTIPLE);
        scheduledDownloadsList.setOnKeyPressed(e -> {
            if (e.isControlDown() && e.getCode() == javafx.scene.input.KeyCode.A) {
                scheduledDownloadsList.getSelectionModel().selectAll();
                e.consume();
            }
        });
        javafx.scene.layout.StackPane wrappedScheduledList = RubberBandSelection.wrap(this, scheduledDownloadsList);
        VBox.setVgrow(wrappedScheduledList, Priority.ALWAYS);
        
        Label noDownloadsLabel = new Label("No individual downloads are scheduled.");
        noDownloadsLabel.setStyle("-fx-text-fill: #A6ADC4; -fx-font-size: 16px;");
        scheduledDownloadsList.setPlaceholder(noDownloadsLabel);
        
        scheduledDownloadsList.setCellFactory(param -> new ScheduledDownloadCell(d -> {
            d.updateScheduledStartTime(null);
            onDownloadUpdate.accept(d);
            scheduledDownloads.setAll(scheduledDownloadsSupplier.get());
        }));
        scheduledDownloadsList.setItems(scheduledDownloads);
        
        HBox addScheduleBox = new HBox(8);
        addScheduleBox.setAlignment(Pos.CENTER_LEFT);
        
        ComboBox<Download> queueCombo = new ComboBox<>();
        queueCombo.setPromptText("Select a queue item...");
        queueCombo.setEditable(true);
        queueCombo.setPrefWidth(300);
        
        queueCombo.setConverter(new javafx.util.StringConverter<Download>() {
            @Override
            public String toString(Download d) {
                if (d == null) return "";
                String name = d.source().value().getPath();
                if (name == null || name.isEmpty() || name.equals("/")) name = d.source().value().getHost();
                else name = name.substring(name.lastIndexOf('/') + 1);
                return name;
            }

            @Override
            public Download fromString(String string) {
                return queueCombo.getItems().stream().filter(d -> toString(d).equals(string)).findFirst().orElse(null);
            }
        });
        
        // Auto-complete functionality
        queueCombo.getEditor().textProperty().addListener((obs, oldText, newText) -> {
            if (newText == null || newText.isEmpty()) {
                queueCombo.setItems(FXCollections.observableArrayList(getEligibleDownloads()));
            } else {
                java.util.List<Download> filtered = getEligibleDownloads().stream()
                    .filter(d -> queueCombo.getConverter().toString(d).toLowerCase().contains(newText.toLowerCase()))
                    .collect(java.util.stream.Collectors.toList());
                queueCombo.setItems(FXCollections.observableArrayList(filtered));
                if (!filtered.isEmpty() && !queueCombo.isShowing()) {
                    queueCombo.show();
                }
            }
        });
        
        queueCombo.setOnShowing(e -> {
            if (queueCombo.getEditor().getText() == null || queueCombo.getEditor().getText().isEmpty()) {
                queueCombo.setItems(FXCollections.observableArrayList(getEligibleDownloads()));
            }
        });
        
        ComboBox<String> scheduleCombo = new ComboBox<>();
        scheduleCombo.getItems().addAll("Start immediately", "Start at a specific time", "Start after a timer");
        scheduleCombo.getSelectionModel().select(0);
        scheduleCombo.getStyleClass().add("text-input");

        HBox customSchedBox = new HBox(8);
        customSchedBox.setAlignment(Pos.CENTER_LEFT);

        // Alarm
        HBox alarmBox = new HBox(4);
        alarmBox.setAlignment(Pos.CENTER_LEFT);
        NumberSpinner alarmHr = new NumberSpinner(12, 1, 12, true, "%02d");
        NumberSpinner alarmMin = new NumberSpinner(0, 0, 59, true, "%02d");
        StringSpinner alarmAmPm = new StringSpinner(Arrays.asList("AM", "PM"), 0);
        alarmBox.getChildren().addAll(new Label("At: "), alarmHr, new Label(":"), alarmMin, alarmAmPm);

        // Timer
        HBox timerBox = new HBox(4);
        timerBox.setAlignment(Pos.CENTER_LEFT);
        NumberSpinner timerHr = new NumberSpinner(0, 0, 99, false, "%02d");
        NumberSpinner timerMin = new NumberSpinner(0, 0, 59, true, "%02d");
        NumberSpinner timerSec = new NumberSpinner(0, 0, 59, true, "%02d");
        timerBox.getChildren().addAll(new Label("In: "), timerHr, new Label("h"), timerMin, new Label("m"), timerSec, new Label("s"));

        scheduleCombo.getSelectionModel().selectedIndexProperty().addListener((obs, oldV, newV) -> {
            customSchedBox.getChildren().clear();
            if (newV.intValue() == 1) customSchedBox.getChildren().add(alarmBox);
            else if (newV.intValue() == 2) customSchedBox.getChildren().add(timerBox);
        });

        Button addScheduleBtn = new Button("Add Schedule");
        addScheduleBtn.getStyleClass().addAll("btn", "btn-primary");
        addScheduleBtn.setOnAction(e -> {
            Download selected = queueCombo.getValue();
            if (selected == null) {
                String text = queueCombo.getEditor().getText();
                selected = queueCombo.getConverter().fromString(text);
            }
            if (selected != null) {
                int schedType = scheduleCombo.getSelectionModel().getSelectedIndex();
                if (schedType == 1) {
                    int hr = alarmHr.getValue();
                    if (hr == 12) hr = 0;
                    if (alarmAmPm.getValue().equals("PM")) hr += 12;
                    int min = alarmMin.getValue();
                    LocalTime time = LocalTime.of(hr, min);
                    LocalDateTime now = LocalDateTime.now();
                    LocalDateTime target = now.with(time);
                    if (target.isBefore(now)) target = target.plusDays(1);
                    selected.updateScheduledStartTime(target.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli());
                } else if (schedType == 2) {
                    int h = timerHr.getValue();
                    int m = timerMin.getValue();
                    int s = timerSec.getValue();
                    long delayMs = (h * 3600L + m * 60L + s) * 1000L;
                    selected.updateScheduledStartTime(System.currentTimeMillis() + delayMs);
                } else {
                    selected.updateScheduledStartTime(null);
                }
                onDownloadUpdate.accept(selected);
                scheduledDownloads.setAll(scheduledDownloadsSupplier.get());
                queueCombo.getEditor().clear();
                queueCombo.getSelectionModel().clearSelection();
            }
        });
        
        addScheduleBox.getChildren().addAll(queueCombo, scheduleCombo, customSchedBox, addScheduleBtn);
        
        downloadsBox.getChildren().addAll(downloadsTitle, addScheduleBox, wrappedScheduledList);
        
        VBox contentBox = new VBox(12);
        VBox.setVgrow(contentBox, Priority.ALWAYS);
        
        contentBox.getChildren().add(downloadsBox);

        getChildren().addAll(wsHead, contentBox);
    }
    
    private java.util.List<Download> getEligibleDownloads() {
        return mainQueueItems.stream()
            .map(qi -> downloadsWorkspace.getDownload(qi.getDownloadId()))
            .filter(d -> d != null && d.scheduledStartTime() == null)
            .collect(java.util.stream.Collectors.toList());
    }
    
    public void refreshList() {
        if (scheduledDownloadsSupplier != null) {
            scheduledDownloads.setAll(scheduledDownloadsSupplier.get());
        }
    }

    public void deleteSelected() {
        java.util.List<Download> selected = new java.util.ArrayList<>(scheduledDownloadsList.getSelectionModel().getSelectedItems());
        if (selected.isEmpty()) return;

        javafx.stage.Stage owner = (javafx.stage.Stage) getScene().getWindow();
        DeleteConfirmDialog dialog;
        if (selected.size() == 1) {
            dialog = new DeleteConfirmDialog(owner, java.nio.file.Path.of(selected.get(0).destination().value()).getFileName().toString());
        } else {
            dialog = new DeleteConfirmDialog(owner, selected.size());
        }
        
        DeleteConfirmDialog.DeleteChoice choice = dialog.showAndGetChoice();
        if (choice == DeleteConfirmDialog.DeleteChoice.CANCEL) return;

        boolean perm = choice == DeleteConfirmDialog.DeleteChoice.PERMANENT;
        for (Download d : selected) {
            if (downloadsWorkspace.getListener() != null) {
                downloadsWorkspace.getListener().onDelete(d, perm);
            }
        }
        scheduledDownloadsList.getSelectionModel().clearSelection();
    }
}
