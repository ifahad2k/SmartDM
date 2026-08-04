package io.smartdm.desktop.shell;

import javafx.application.Platform;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;

public class StatusBar extends HBox {
    
    private final Region dot;
    private final Label onlineLbl;
    private final Label geminiLbl;
    private final Label dlSpeedLbl;
    private final Label ulSpeedLbl;
    private final Label activeCountLbl;
    private final Label queuedCountLbl;
    private final Label totalTodayLbl;

    public void setAiStatus(String status) {
        if (geminiLbl != null) {
            Platform.runLater(() -> geminiLbl.setText(status));
        }
    }

    public void updateMetrics(double totalDlSpeedBytesPerSec, double totalUlSpeedBytesPerSec, int activeCount, int queuedCount, long totalBytesToday) {
        Platform.runLater(() -> {
            if (dlSpeedLbl != null) {
                if (totalDlSpeedBytesPerSec <= 10) {
                    dlSpeedLbl.setText("- MB/s");
                } else if (totalDlSpeedBytesPerSec < 1024 * 1024) {
                    dlSpeedLbl.setText(String.format("%.1f KB/s", totalDlSpeedBytesPerSec / 1024.0));
                } else {
                    dlSpeedLbl.setText(String.format("%.2f MB/s", totalDlSpeedBytesPerSec / (1024.0 * 1024.0)));
                }
            }
            if (ulSpeedLbl != null) {
                if (totalUlSpeedBytesPerSec <= 10) {
                    ulSpeedLbl.setText("- MB/s");
                } else {
                    ulSpeedLbl.setText(String.format("%.1f KB/s", totalUlSpeedBytesPerSec / 1024.0));
                }
            }
            if (activeCountLbl != null) activeCountLbl.setText(String.valueOf(activeCount));
            if (queuedCountLbl != null) queuedCountLbl.setText(String.valueOf(queuedCount));
            if (totalTodayLbl != null) {
                if (totalBytesToday >= 1024 * 1024 * 1024) {
                    totalTodayLbl.setText(String.format("%.2f GB", (double) totalBytesToday / (1024 * 1024 * 1024)));
                } else if (totalBytesToday >= 1024 * 1024) {
                    totalTodayLbl.setText(String.format("%.1f MB", (double) totalBytesToday / (1024 * 1024)));
                } else {
                    totalTodayLbl.setText(String.format("%d KB", totalBytesToday / 1024));
                }
            }
        });
    }

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
        dlSpeedLbl = new Label("- MB/s");
        dlSpeedLbl.getStyleClass().add("sb-item-strong");
        dlBox.getChildren().addAll(dlIcon, dlSpeedLbl);
        
        // Upload Speed
        HBox ulBox = new HBox();
        ulBox.getStyleClass().add("sb-item");
        Label ulIcon = new Label("↑");
        ulIcon.setStyle("-fx-text-fill: #A6ADC4;");
        ulSpeedLbl = new Label("- MB/s");
        ulSpeedLbl.getStyleClass().add("sb-item-strong");
        ulBox.getChildren().addAll(ulIcon, ulSpeedLbl);
        
        // Active / Queued
        HBox activeBox = new HBox();
        activeBox.getStyleClass().add("sb-item");
        activeCountLbl = new Label("0");
        activeCountLbl.getStyleClass().add("sb-item-strong");
        Label activeText = new Label("active ·");
        queuedCountLbl = new Label("0");
        queuedCountLbl.getStyleClass().add("sb-item-strong");
        Label queuedText = new Label("queued");
        activeBox.getChildren().addAll(activeCountLbl, activeText, queuedCountLbl, queuedText);
        
        // Total Today
        HBox totalTodayBox = new HBox();
        totalTodayBox.getStyleClass().add("sb-item");
        Label totalText = new Label("Total today:");
        totalTodayLbl = new Label("0 MB");
        totalTodayLbl.getStyleClass().add("sb-item-strong");
        totalTodayBox.getChildren().addAll(totalText, totalTodayLbl);
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        // Potato mode
        Label potatoLbl = new Label("Potato mode: off");
        potatoLbl.getStyleClass().add("sb-item");
        
        // Gemini / AI
        geminiLbl = new Label("AI: disabled");
        geminiLbl.getStyleClass().add("sb-item");
        
        getChildren().addAll(onlineBox, dlBox, ulBox, activeBox, totalTodayBox, spacer, potatoLbl, geminiLbl);
        
        startNetworkCheck();
    }
    
    private void startNetworkCheck() {
        Thread thread = new Thread(() -> {
            while (true) {
                boolean isOnline = checkInternetConnectivity();
                Platform.runLater(() -> {
                    if (isOnline) {
                        onlineLbl.setText("Online");
                        dot.setStyle("-fx-background-color: #3CFFC4;");
                    } else {
                        onlineLbl.setText("Offline");
                        dot.setStyle("-fx-background-color: #FF4D6A;");
                    }
                });
                try {
                    Thread.sleep(5000);
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
