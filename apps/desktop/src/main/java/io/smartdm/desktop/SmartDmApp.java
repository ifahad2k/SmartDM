package io.smartdm.desktop;

import javafx.application.Application;
import javafx.scene.Scene;
import javafx.stage.Stage;
import io.smartdm.desktop.shell.MainShell;
import io.smartdm.desktop.theme.ThemeManager;

public class SmartDmApp extends Application {

    @Override
    public void start(Stage primaryStage) {
        MainShell shell = new MainShell();
        Scene scene = new Scene(shell, 1024, 768);
        
        ThemeManager themeManager = new ThemeManager();
        themeManager.applyTheme(scene);

        primaryStage.setTitle("SmartDM");
        primaryStage.setScene(scene);
        primaryStage.setMinWidth(800);
        primaryStage.setMinHeight(600);
        primaryStage.show();
    }

    public static void main(String[] args) {
        launch(args);
    }
}
