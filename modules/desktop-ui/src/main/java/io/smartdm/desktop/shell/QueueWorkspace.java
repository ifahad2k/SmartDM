package io.smartdm.desktop.shell;

import javafx.scene.layout.VBox;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Region;
import javafx.scene.layout.Priority;
import javafx.scene.control.Label;
import javafx.scene.control.ListView;
import javafx.scene.control.ListCell;
import javafx.collections.ObservableList;
import javafx.collections.FXCollections;
import io.smartdm.domain.Download;
import javafx.collections.ListChangeListener;

public final class QueueWorkspace extends VBox {
    
    public QueueWorkspace(io.smartdm.domain.DownloadQueue mainQueue, ObservableList<io.smartdm.domain.QueueItem> mainQueueItems, DownloadsWorkspace downloadsWorkspace, java.util.function.Consumer<io.smartdm.domain.DownloadQueue.Status> onQueueStatusChange) {
        getStyleClass().add("workspace");
        setSpacing(12);

        // Header
        HBox wsHead = new HBox(12);
        wsHead.getStyleClass().add("ws-head");
        wsHead.setAlignment(javafx.geometry.Pos.CENTER_LEFT);
        
        VBox titleBox = new VBox();
        String qName = mainQueue != null ? mainQueue.getName() : "Unknown Queue";
        Label wsTitle = new Label("Queue Management: " + qName);
        wsTitle.getStyleClass().add("ws-title");
        String subtext = mainQueue != null ? "Concurrency Limit: " + mainQueue.getConcurrencyLimit() + " | Status: " + mainQueue.getStatus() : "";
        Label wsSub = new Label(subtext);
        wsSub.getStyleClass().add("ws-sub");
        titleBox.getChildren().addAll(wsTitle, wsSub);
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        javafx.scene.control.Button startBtn = new javafx.scene.control.Button("Start Queue");
        startBtn.getStyleClass().addAll("btn", "btn-primary");
        startBtn.setOnAction(e -> {
            if (onQueueStatusChange != null) {
                onQueueStatusChange.accept(io.smartdm.domain.DownloadQueue.Status.ACTIVE);
            }
        });
        
        javafx.scene.control.Button stopBtn = new javafx.scene.control.Button("Stop Queue");
        stopBtn.getStyleClass().addAll("btn");
        stopBtn.setOnAction(e -> {
            if (onQueueStatusChange != null) {
                onQueueStatusChange.accept(io.smartdm.domain.DownloadQueue.Status.PAUSED);
            }
        });
        
        wsHead.getChildren().addAll(titleBox, spacer, startBtn, stopBtn);

        // Map QueueItems to DownloadIds
        ObservableList<io.smartdm.domain.DownloadId> downloadIds = FXCollections.observableArrayList();
        Runnable updateList = () -> {
            java.util.List<io.smartdm.domain.DownloadId> newIds = new java.util.ArrayList<>();
            for (io.smartdm.domain.QueueItem qi : mainQueueItems) {
                newIds.add(qi.getDownloadId());
            }
            if (!downloadIds.equals(newIds)) {
                downloadIds.setAll(newIds);
            }
        };

        // Content Area
        ListView<io.smartdm.domain.DownloadId> listView = new ListView<>();
        listView.getStyleClass().add("list");
        
        Label emptyLabel = new Label("There is no queue now");
        emptyLabel.setStyle("-fx-text-fill: #A6ADC4; -fx-font-size: 16px;");
        listView.setPlaceholder(emptyLabel);
        
        VBox.setVgrow(listView, Priority.ALWAYS);
        javafx.collections.transformation.FilteredList<io.smartdm.domain.DownloadId> filteredDownloadIds = new javafx.collections.transformation.FilteredList<>(downloadIds, id -> {
            Download d = downloadsWorkspace.getDownload(id);
            if (d == null) return false;
            io.smartdm.domain.DownloadState state = d.state();
            return state != io.smartdm.domain.DownloadState.DOWNLOADING && state != io.smartdm.domain.DownloadState.PROBING && state != io.smartdm.domain.DownloadState.COMPLETED;
        });
        
        listView.setCellFactory(param -> new DownloadListCell(new DownloadListCell.Listener() {
            @Override
            public void onPause(Download download) {
                if (downloadsWorkspace.getListener() != null) downloadsWorkspace.getListener().onPause(download);
            }
            @Override
            public void onResume(Download download) {
                if (downloadsWorkspace.getListener() != null) downloadsWorkspace.getListener().onResume(download);
            }
            @Override
            public void onCancel(Download download) {
                if (downloadsWorkspace.getListener() != null) downloadsWorkspace.getListener().onCancel(download);
            }
            @Override
            public void onDelete(Download download) {
                if (downloadsWorkspace.getListener() != null) downloadsWorkspace.getListener().onDelete(download, false);
            }
        }, downloadsWorkspace));
        listView.setItems(filteredDownloadIds);

        this.updateListRunnable = () -> {
            // we must reset the predicate to force the FilteredList to re-evaluate
            @SuppressWarnings("unchecked")
            javafx.collections.transformation.FilteredList<io.smartdm.domain.DownloadId> fl = (javafx.collections.transformation.FilteredList<io.smartdm.domain.DownloadId>) listView.getItems();
            if (fl != null) {
                java.util.function.Predicate<? super io.smartdm.domain.DownloadId> p = fl.getPredicate();
                fl.setPredicate(null);
                fl.setPredicate(p);
            }
            updateList.run();
        };
        updateListRunnable.run();
        mainQueueItems.addListener((ListChangeListener<io.smartdm.domain.QueueItem>) c -> updateListRunnable.run());

        getChildren().addAll(wsHead, listView);
    }
    
    // Store the runnable so we can call it externally
    private Runnable updateListRunnable;
    
    public void refreshList() {
        if (updateListRunnable != null) {
            updateListRunnable.run();
        }
    }
}
