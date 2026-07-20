package io.smartdm.desktop.shell.controls;

import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import javafx.beans.property.StringProperty;
import javafx.beans.property.SimpleStringProperty;
import java.util.List;

public class StringSpinner extends VBox {
    private final StringProperty value = new SimpleStringProperty();
    private final List<String> items;
    private int currentIndex;

    @SuppressWarnings("this-escape")
    public StringSpinner(List<String> items, int initialIndex) {
        this.items = items;
        this.currentIndex = initialIndex;
        this.value.set(items.get(initialIndex));

        setAlignment(Pos.CENTER);
        setSpacing(4);
        
        Button upBtn = new Button("︿");
        upBtn.getStyleClass().addAll("btn-ghost", "spinner-btn");
        upBtn.setOnAction(e -> increment());
        
        TextField field = new TextField();
        field.getStyleClass().add("spinner-field");
        field.setAlignment(Pos.CENTER);
        field.setPrefWidth(60);
        field.textProperty().bindBidirectional(value);
        field.setEditable(false);
        
        field.setOnScroll(e -> {
            if (e.getDeltaY() > 0) increment();
            else if (e.getDeltaY() < 0) decrement();
        });

        Button downBtn = new Button("﹀");
        downBtn.getStyleClass().addAll("btn-ghost", "spinner-btn");
        downBtn.setOnAction(e -> decrement());
        
        getChildren().addAll(upBtn, field, downBtn);
    }
    
    private void increment() {
        currentIndex = (currentIndex + 1) % items.size();
        value.set(items.get(currentIndex));
    }
    
    private void decrement() {
        currentIndex = (currentIndex - 1 + items.size()) % items.size();
        value.set(items.get(currentIndex));
    }

    public String getValue() {
        return value.get();
    }
    
    public void setValue(String v) {
        int idx = items.indexOf(v);
        if (idx >= 0) {
            currentIndex = idx;
            value.set(v);
        }
    }
    
    public StringProperty valueProperty() {
        return value;
    }
}
