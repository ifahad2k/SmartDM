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

public final class SchedulerWorkspace extends VBox {
    
    public interface ScheduleManager {
        java.util.Collection<Schedule> getSchedules();
        void updateSchedule(Schedule schedule);
        void removeSchedule(String id);
    }

    private final ScheduleManager scheduleManager;
    private final ObservableList<Schedule> schedules;
    private final ListView<Schedule> listView;

    public SchedulerWorkspace(ScheduleManager scheduleManager) {
        this.scheduleManager = scheduleManager;
        this.schedules = FXCollections.observableArrayList(scheduleManager.getSchedules());
        
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
        
        wsHead.getChildren().addAll(titleBox, spacer);
        
        // Editor
        // Editor
        HBox editorBox = new HBox(8);
        editorBox.setAlignment(Pos.CENTER_LEFT);
        
        TextField nameField = new TextField();
        nameField.setPromptText("Schedule Name");
        nameField.getStyleClass().add("text-field");
        
        CheckBox startCheck = new CheckBox("Start At:");
        startCheck.setStyle("-fx-text-fill: white;");
        Spinner<Integer> startHour = new Spinner<>();
        Spinner<Integer> startMin = new Spinner<>();
        ComboBox<String> startAmPm = new ComboBox<>();
        HBox startPicker = createTimePicker(startCheck, startHour, startMin, startAmPm);
        
        CheckBox endCheck = new CheckBox("Stop At:");
        endCheck.setStyle("-fx-text-fill: white;");
        Spinner<Integer> endHour = new Spinner<>();
        Spinner<Integer> endMin = new Spinner<>();
        ComboBox<String> endAmPm = new ComboBox<>();
        HBox endPicker = createTimePicker(endCheck, endHour, endMin, endAmPm);
        
        Button addBtn = new Button("Add Schedule");
        addBtn.getStyleClass().addAll("btn", "btn-primary");
        addBtn.setOnAction(e -> {
            if (!startCheck.isSelected() && !endCheck.isSelected()) {
                return;
            }
            try {
                String name = nameField.getText().isEmpty() ? "New Schedule" : nameField.getText();
                LocalTime start = startCheck.isSelected() ? parseTime(startHour, startMin, startAmPm) : null;
                LocalTime end = endCheck.isSelected() ? parseTime(endHour, endMin, endAmPm) : null;
                Schedule s = Schedule.createNew(name, start, end, java.util.List.of(), Schedule.MissedTriggerPolicy.IGNORE);
                scheduleManager.updateSchedule(s);
                schedules.setAll(scheduleManager.getSchedules());
                nameField.clear(); startCheck.setSelected(false); endCheck.setSelected(false);
            } catch (Exception ex) {
                System.out.println("Error adding schedule: " + ex.getMessage());
            }
        });
        
        editorBox.getChildren().addAll(nameField, startCheck, startPicker, endCheck, endPicker, addBtn);
        
        // List
        listView = new ListView<>();
        listView.getStyleClass().add("list");
        VBox.setVgrow(listView, Priority.ALWAYS);
        
        Label emptyLabel = new Label("No schedules defined yet.");
        emptyLabel.setStyle("-fx-text-fill: #A6ADC4; -fx-font-size: 16px;");
        listView.setPlaceholder(emptyLabel);
        
        listView.setCellFactory(param -> new ListCell<>() {
            @Override
            protected void updateItem(Schedule item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    HBox box = new HBox(12);
                    box.getStyleClass().add("list-cell");
                    box.setAlignment(Pos.CENTER_LEFT);
                    
                    VBox texts = new VBox();
                    Label nameLbl = new Label(item.getName());
                    nameLbl.setStyle("-fx-text-fill: white; -fx-font-size: 16px; -fx-font-weight: bold;");
                    
                    String st = item.getStartTime().map(LocalTime::toString).orElse("None");
                    String et = item.getEndTime().map(LocalTime::toString).orElse("None");
                    Label metaLbl = new Label("Active from: " + st + " to " + et);
                    metaLbl.setStyle("-fx-text-fill: #A6ADC4;");
                    texts.getChildren().addAll(nameLbl, metaLbl);
                    
                    Region sp = new Region();
                    HBox.setHgrow(sp, Priority.ALWAYS);
                    
                    Button delBtn = new Button("Delete");
                    delBtn.getStyleClass().add("btn");
                    delBtn.setOnAction(e -> {
                        scheduleManager.removeSchedule(item.getId());
                        schedules.setAll(scheduleManager.getSchedules());
                    });
                    
                    box.getChildren().addAll(texts, sp, delBtn);
                    setGraphic(box);
                }
            }
        });
        listView.setItems(schedules);
        
        getChildren().addAll(wsHead, editorBox, listView);
    }
    
    private HBox createTimePicker(CheckBox toggle, Spinner<Integer> hourSpinner, Spinner<Integer> minSpinner, ComboBox<String> amPmCombo) {
        HBox box = new HBox(4);
        box.setAlignment(Pos.CENTER);
        
        hourSpinner.setValueFactory(new SpinnerValueFactory.IntegerSpinnerValueFactory(1, 12, 12));
        hourSpinner.getStyleClass().add(Spinner.STYLE_CLASS_SPLIT_ARROWS_VERTICAL);
        hourSpinner.setPrefWidth(60);
        hourSpinner.setEditable(true);
        
        minSpinner.setValueFactory(new SpinnerValueFactory.IntegerSpinnerValueFactory(0, 59, 0));
        minSpinner.getStyleClass().add(Spinner.STYLE_CLASS_SPLIT_ARROWS_VERTICAL);
        minSpinner.setPrefWidth(60);
        minSpinner.setEditable(true);
        
        amPmCombo.getItems().addAll("AM", "PM");
        amPmCombo.getSelectionModel().select("AM");
        amPmCombo.getStyleClass().add("text-field");
        
        Label colon = new Label(":");
        colon.setStyle("-fx-text-fill: white; -fx-font-weight: bold;");
        
        box.getChildren().addAll(hourSpinner, colon, minSpinner, amPmCombo);
        box.disableProperty().bind(toggle.selectedProperty().not());
        return box;
    }
    
    private LocalTime parseTime(Spinner<Integer> hour, Spinner<Integer> min, ComboBox<String> amPm) {
        int h = hour.getValue();
        if (h == 12) h = 0;
        if ("PM".equals(amPm.getValue())) h += 12;
        return LocalTime.of(h, min.getValue());
    }
}
