package io.smartdm.desktop;

import javafx.application.Application;
import javafx.scene.Scene;
import javafx.scene.control.Label;
import javafx.scene.layout.StackPane;
import javafx.stage.Stage;

public class TestWindowApp extends Application {
    @Override
    public void start(Stage primaryStage) {
        System.out.println(">>> TestWindowApp STARTING <<<");
        Label label = new Label("SMARTDM TEST WINDOW");
        label.setStyle("-fx-font-size: 24px; -fx-text-fill: red;");
        StackPane root = new StackPane(label);
        root.setStyle("-fx-background-color: yellow;");
        Scene scene = new Scene(root, 600, 400);
        primaryStage.setTitle("SMARTDM TEST WINDOW");
        primaryStage.setScene(scene);
        primaryStage.setAlwaysOnTop(true);
        primaryStage.show();
        primaryStage.toFront();
        primaryStage.requestFocus();
        System.out.println(">>> TestWindowApp SHOWN SUCCESSFULLY <<<");
    }

    public static void main(String[] args) {
        launch(args);
    }
}
