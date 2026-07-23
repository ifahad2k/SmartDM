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

import java.util.function.Consumer;
import java.util.function.Supplier;
import javafx.scene.control.SplitPane;

public final class QueueWorkspace extends VBox {
    
    private final Supplier<java.util.List<Download>> scheduledDownloadsSupplier;
    private final Consumer<Download> onDownloadUpdate;
    private final ObservableList<Download> scheduledDownloads;
    private final ListView<io.smartdm.domain.DownloadId> listView;
    private final DownloadsWorkspace downloadsWorkspace;
    
    public QueueWorkspace(io.smartdm.domain.DownloadQueue mainQueue, ObservableList<io.smartdm.domain.QueueItem> mainQueueItems, DownloadsWorkspace downloadsWorkspace, Consumer<io.smartdm.domain.DownloadQueue.Status> onQueueStatusChange, Supplier<java.util.List<Download>> scheduledDownloadsSupplier, Consumer<Download> onDownloadUpdate) {
        this.scheduledDownloadsSupplier = scheduledDownloadsSupplier;
        this.onDownloadUpdate = onDownloadUpdate;
        this.downloadsWorkspace = downloadsWorkspace;
        this.scheduledDownloads = FXCollections.observableArrayList(scheduledDownloadsSupplier != null ? scheduledDownloadsSupplier.get() : java.util.List.of());
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
                wsSub.setText("Concurrency Limit: " + mainQueue.getConcurrencyLimit() + " | Status: ACTIVE");
            }
        });
        
        javafx.scene.control.Button stopBtn = new javafx.scene.control.Button("Stop Queue");
        stopBtn.getStyleClass().addAll("btn");
        stopBtn.setOnAction(e -> {
            if (onQueueStatusChange != null) {
                onQueueStatusChange.accept(io.smartdm.domain.DownloadQueue.Status.PAUSED);
                wsSub.setText("Concurrency Limit: " + mainQueue.getConcurrencyLimit() + " | Status: PAUSED");
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
        listView = new ListView<>();
        listView.getStyleClass().add("list");
        listView.getSelectionModel().setSelectionMode(javafx.scene.control.SelectionMode.MULTIPLE);
        listView.setOnKeyPressed(e -> {
            if (e.isControlDown() && e.getCode() == javafx.scene.input.KeyCode.A) {
                listView.getSelectionModel().selectAll();
                e.consume();
            }
        });
        javafx.scene.layout.StackPane wrappedListView = RubberBandSelection.wrap(this, listView);
        
        Label emptyLabel = new Label("There is no queue now");
        emptyLabel.setStyle("-fx-text-fill: #A6ADC4; -fx-font-size: 16px;");
        listView.setPlaceholder(emptyLabel);
        
        VBox.setVgrow(wrappedListView, Priority.ALWAYS);
        javafx.collections.transformation.FilteredList<io.smartdm.domain.DownloadId> filteredDownloadIds = new javafx.collections.transformation.FilteredList<>(downloadIds, id -> {
            Download d = downloadsWorkspace.getDownload(id);
            if (d == null) return false;
            return d.state() == io.smartdm.domain.DownloadState.QUEUED && d.scheduledStartTime() == null;
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
            public void onDelete(Download download, boolean deleteFile) {
                if (deleteFile) {
                    if (downloadsWorkspace.getListener() != null) downloadsWorkspace.getListener().onDelete(download, true);
                    return;
                }
                java.util.List<io.smartdm.domain.DownloadId> sel = listView.getSelectionModel().getSelectedItems();
                if (sel.contains(download.id()) && sel.size() > 1) {
                    deleteSelected();
                } else {
                    listView.getSelectionModel().clearSelection();
                    listView.getSelectionModel().select(download.id());
                    deleteSelected();
                }
            }
            
            @Override
            public void onAddToQueue(Download download) {
                if (downloadsWorkspace.getListener() != null) downloadsWorkspace.getListener().onAddToQueue(download);
            }
            
            @Override
            public void onSchedule(Download download) {
                if (downloadsWorkspace.getListener() != null) downloadsWorkspace.getListener().onSchedule(download);
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
            if (scheduledDownloadsSupplier != null) {
                scheduledDownloads.setAll(scheduledDownloadsSupplier.get());
            }
        };
        updateListRunnable.run();
        mainQueueItems.addListener((ListChangeListener<io.smartdm.domain.QueueItem>) c -> updateListRunnable.run());

        // --- Scheduled Downloads List ---
        VBox scheduledBox = new VBox(8);
        Label scheduledTitle = new Label("Scheduled Items");
        scheduledTitle.getStyleClass().add("ws-sub");
        
        ListView<Download> scheduledDownloadsList = new ListView<>();
        scheduledDownloadsList.getStyleClass().add("list");
        javafx.scene.layout.StackPane wrappedScheduledList = RubberBandSelection.wrap(this, scheduledDownloadsList);
        VBox.setVgrow(wrappedScheduledList, Priority.ALWAYS);
        
        Label noScheduledLabel = new Label("No individual downloads are scheduled.");
        noScheduledLabel.setStyle("-fx-text-fill: #A6ADC4; -fx-font-size: 16px;");
        scheduledDownloadsList.setPlaceholder(noScheduledLabel);
        
        scheduledDownloadsList.setCellFactory(param -> new ScheduledDownloadCell(d -> {
            d.updateScheduledStartTime(null);
            if (onDownloadUpdate != null) onDownloadUpdate.accept(d);
            updateListRunnable.run();
        }));
        scheduledDownloadsList.setItems(scheduledDownloads);
        
        scheduledBox.getChildren().addAll(scheduledTitle, wrappedScheduledList);

        VBox contentBox = new VBox(12);
        VBox.setVgrow(contentBox, Priority.ALWAYS);
        
        VBox regularBox = new VBox(8);
        Label regularTitle = new Label("Regular Queue");
        regularTitle.getStyleClass().add("ws-sub");
        VBox.setVgrow(wrappedListView, Priority.ALWAYS);
        VBox.setVgrow(regularBox, Priority.ALWAYS);
        regularBox.getChildren().addAll(regularTitle, wrappedListView);
        
        contentBox.getChildren().add(regularBox);
        
        scheduledDownloads.addListener((ListChangeListener<Download>) c -> {
            if (scheduledDownloads.isEmpty()) {
                if (contentBox.getChildren().contains(scheduledBox)) {
                    contentBox.getChildren().remove(scheduledBox);
                }
            } else {
                if (!contentBox.getChildren().contains(scheduledBox)) {
                    contentBox.getChildren().add(scheduledBox);
                }
            }
        });
        
        if (!scheduledDownloads.isEmpty()) {
            contentBox.getChildren().add(scheduledBox);
        }

        getChildren().addAll(wsHead, contentBox);
    }
    
    // Store the runnable so we can call it externally
    private Runnable updateListRunnable;
    
    public void refreshList() {
        if (updateListRunnable != null) {
            updateListRunnable.run();
        }
    }

    public void deleteSelected() {
        java.util.List<io.smartdm.domain.DownloadId> selected = new java.util.ArrayList<>(listView.getSelectionModel().getSelectedItems());
        if (selected.isEmpty()) return;

        javafx.stage.Stage owner = (javafx.stage.Stage) getScene().getWindow();
        DeleteConfirmDialog dialog;
        if (selected.size() == 1) {
            Download d = downloadsWorkspace.getDownload(selected.get(0));
            dialog = new DeleteConfirmDialog(owner, java.nio.file.Path.of(d.destination().value()).getFileName().toString());
        } else {
            dialog = new DeleteConfirmDialog(owner, selected.size());
        }
        
        DeleteConfirmDialog.DeleteChoice choice = dialog.showAndGetChoice();
        if (choice == DeleteConfirmDialog.DeleteChoice.CANCEL) return;

        boolean perm = choice == DeleteConfirmDialog.DeleteChoice.PERMANENT;
        for (io.smartdm.domain.DownloadId id : selected) {
            Download d = downloadsWorkspace.getDownload(id);
            if (d != null && downloadsWorkspace.getListener() != null) {
                downloadsWorkspace.getListener().onDelete(d, perm);
            }
        }
        listView.getSelectionModel().clearSelection();
    }
}
