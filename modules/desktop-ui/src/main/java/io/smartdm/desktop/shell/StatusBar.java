package io.smartdm.desktop.shell;

import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.control.Label;

public class StatusBar extends HBox {
    
    private final Region dot;
    private final Label onlineLbl;

    @SuppressWarnings("this-escape")
    public StatusBar() {
        getStyleClass().add("statusbar");
        
        // Online status
        HBox onlineBox = new HBox();
        onlineBox.getStyleClass().add("sb-item");
        dot = new Region();
        dot.getStyleClass().add("sb-dot");
        onlineLbl = new Label("Checking...");
        onlineLbl.getStyleClass().add("sb-item-strong");
        onlineBox.getChildren().addAll(dot, onlineLbl);

        // Download Speed
        HBox dlBox = new HBox();
        dlBox.getStyleClass().add("sb-item");
        Label dlIcon = new Label("↓");
        dlIcon.setStyle("-fx-text-fill: #A6ADC4;");
        Label dlSpeed = new Label("- MB/s");
        dlSpeed.getStyleClass().add("sb-item-strong");
        dlBox.getChildren().addAll(dlIcon, dlSpeed);
        
        // Upload Speed
        HBox ulBox = new HBox();
        ulBox.getStyleClass().add("sb-item");
        Label ulIcon = new Label("↑");
        ulIcon.setStyle("-fx-text-fill: #A6ADC4;");
        Label ulSpeed = new Label("- MB/s");
        ulSpeed.getStyleClass().add("sb-item-strong");
        ulBox.getChildren().addAll(ulIcon, ulSpeed);
        
        // Active / Queued
        HBox activeBox = new HBox();
        activeBox.getStyleClass().add("sb-item");
        Label activeCount = new Label("0");
        activeCount.getStyleClass().add("sb-item-strong");
        Label activeText = new Label("active ·");
        Label queuedCount = new Label("0");
        queuedCount.getStyleClass().add("sb-item-strong");
        Label queuedText = new Label("queued");
        activeBox.getChildren().addAll(activeCount, activeText, queuedCount, queuedText);
        
        // Total Today
        HBox totalTodayBox = new HBox();
        totalTodayBox.getStyleClass().add("sb-item");
        Label totalText = new Label("Total today:");
        Label totalCount = new Label("0 MB");
        totalCount.getStyleClass().add("sb-item-strong");
        totalTodayBox.getChildren().addAll(totalText, totalCount);
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        // Potato mode
        Label potatoLbl = new Label("Potato mode: off");
        potatoLbl.getStyleClass().add("sb-item");
        
        // Gemini
        Label geminiLbl = new Label("Gemini: disabled");
        geminiLbl.getStyleClass().add("sb-item");
        
        getChildren().addAll(onlineBox, dlBox, ulBox, activeBox, totalTodayBox, spacer, potatoLbl, geminiLbl);
        
        startNetworkCheck();
    }
    
    private void startNetworkCheck() {
        Thread thread = new Thread(() -> {
            while (true) {
                boolean isOnline = checkInternetConnectivity();
                javafx.application.Platform.runLater(() -> {
                    if (isOnline) {
                        onlineLbl.setText("Online");
                        dot.setStyle("-fx-background-color: #3CFFC4;");
                    } else {
                        onlineLbl.setText("Offline");
                        dot.setStyle("-fx-background-color: #FF4D6A;");
                    }
                });
                try {
                    Thread.sleep(5000); // Check every 5 seconds
                } catch (InterruptedException e) {
                    break;
                }
            }
        });
        thread.setDaemon(true);
        thread.start();
    }

    private boolean checkInternetConnectivity() {
        try {
            java.net.HttpURLConnection connection = (java.net.HttpURLConnection) java.net.URI.create("https://clients3.google.com/generate_204").toURL().openConnection();
            connection.setConnectTimeout(1500);
            connection.setReadTimeout(1500);
            connection.setRequestMethod("HEAD");
            int responseCode = connection.getResponseCode();
            return (200 <= responseCode && responseCode <= 399);
        } catch (java.io.IOException e) {
            return false;
        }
    }
}
