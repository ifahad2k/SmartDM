package io.smartdm.desktop.shell;

import javafx.scene.layout.HBox;
import javafx.scene.control.TextField;
import javafx.scene.control.Label;
import javafx.scene.layout.Region;
import javafx.scene.layout.Priority;
import javafx.geometry.Pos;
import javafx.geometry.Insets;

public final class TopBar extends HBox {
    public TopBar() {
        setSpacing(16);
        setAlignment(Pos.CENTER_LEFT);
        setPadding(new Insets(8, 16, 8, 16));
        getStyleClass().add("top-bar");
        setStyle("-fx-background-color: -fx-color-surface; -fx-border-color: -fx-color-border; -fx-border-width: 0 0 1 0;");

        Label logo = new Label("SmartDM");
        logo.setStyle("-fx-font-weight: bold; -fx-font-size: 16px;");

        TextField searchField = new TextField();
        searchField.setPromptText("Search downloads...");
        searchField.setPrefWidth(300);
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        getChildren().addAll(logo, spacer, searchField);
    }
}
