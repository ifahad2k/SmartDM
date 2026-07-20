package io.smartdm.desktop.shell.controls;

import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import javafx.beans.property.IntegerProperty;
import javafx.beans.property.SimpleIntegerProperty;

public class NumberSpinner extends VBox {
    private final IntegerProperty value = new SimpleIntegerProperty(0);
    private final int min;
    private final int max;
    private final boolean wrap;
    private final String format;

    @SuppressWarnings("this-escape")
    public NumberSpinner(int initial, int min, int max, boolean wrap, String format) {
        this.min = min;
        this.max = max;
        this.wrap = wrap;
        this.format = format;
        this.value.set(initial);

        setAlignment(Pos.CENTER);
        setSpacing(4);
        
        Button upBtn = new Button("︿");
        upBtn.getStyleClass().addAll("btn-ghost", "spinner-btn");
        upBtn.setOnAction(e -> increment());
        
        TextField field = new TextField();
        field.getStyleClass().add("spinner-field");
        field.setAlignment(Pos.CENTER);
        field.setPrefWidth(60);
        field.textProperty().bindBidirectional(value, new javafx.util.StringConverter<Number>() {
            @Override
            public String toString(Number object) {
                return String.format(format, object.intValue());
            }

            @Override
            public Number fromString(String string) {
                try {
                    int val = Integer.parseInt(string);
                    if (val < min) return wrap ? max : min;
                    if (val > max) return wrap ? min : max;
                    return val;
                } catch (NumberFormatException e) {
                    return value.get();
                }
            }
        });
        
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
        int v = value.get() + 1;
        if (v > max) v = wrap ? min : max;
        value.set(v);
    }
    
    private void decrement() {
        int v = value.get() - 1;
        if (v < min) v = wrap ? max : min;
        value.set(v);
    }

    public int getValue() {
        return value.get();
    }
    
    public void setValue(int v) {
        value.set(v);
    }
    
    public IntegerProperty valueProperty() {
        return value;
    }
}
