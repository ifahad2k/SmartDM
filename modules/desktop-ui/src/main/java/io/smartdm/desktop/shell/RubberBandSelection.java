package io.smartdm.desktop.shell;

import javafx.geometry.Bounds;
import javafx.geometry.Point2D;
import javafx.scene.Node;
import javafx.scene.control.ListCell;
import javafx.scene.control.ListView;
import javafx.scene.input.MouseEvent;
import javafx.scene.layout.Pane;
import javafx.scene.layout.StackPane;
import javafx.scene.paint.Color;
import javafx.scene.shape.Rectangle;

import javafx.scene.control.ScrollBar;
import javafx.animation.Timeline;
import javafx.animation.KeyFrame;
import javafx.animation.Animation;
import javafx.util.Duration;
import java.util.HashSet;
import java.util.Set;

public class RubberBandSelection {

    public static StackPane wrap(javafx.scene.layout.Region eventTarget, ListView<?> listView) {
        StackPane stackPane = new StackPane();

        Pane glassPane = new Pane();
        glassPane.setMouseTransparent(true);

        Rectangle rect = new Rectangle(0, 0, 0, 0);
        rect.setFill(Color.rgb(0, 120, 215, 0.4));
        rect.setStroke(Color.rgb(0, 120, 215, 0.8));
        rect.setStrokeWidth(1);
        rect.setVisible(false);

        glassPane.getChildren().add(rect);
        stackPane.getChildren().addAll(listView, glassPane);

        final Point2D[] dragStart = new Point2D[1];
        final int[] startIndex = new int[] {-1};
        final Set<Integer> initialSelection = new HashSet<>();
        final double[] lastMouseY = new double[] {-1};
        final double[] lastMouseX = new double[] {-1};

        Timeline scrollTimeline = new Timeline(new KeyFrame(Duration.millis(50), e -> {
            if (rect.isVisible() && lastMouseY[0] != -1) {
                double y = lastMouseY[0];
                double x = lastMouseX[0];
                double threshold = 40;
                ScrollBar vbar = getVerticalScrollBar(listView);
                boolean scrolled = false;
                if (vbar != null) {
                    if (y < threshold) {
                        vbar.decrement();
                        scrolled = true;
                    } else if (y > stackPane.getHeight() - threshold) {
                        vbar.increment();
                        scrolled = true;
                    }
                }
                if (scrolled) {
                    updateSelection(listView, stackPane, x, y, startIndex[0], initialSelection);
                }
            }
        }));
        scrollTimeline.setCycleCount(Animation.INDEFINITE);

        eventTarget.addEventFilter(MouseEvent.MOUSE_PRESSED, e -> {
            if (e.getButton() == javafx.scene.input.MouseButton.PRIMARY) {
                if (isScrollBar((Node) e.getTarget())) return;
                if (isInteractiveElement((Node) e.getTarget())) return;

                Point2D localPt = stackPane.sceneToLocal(eventTarget.localToScene(e.getX(), e.getY()));
                dragStart[0] = new Point2D(localPt.getX(), localPt.getY());
                startIndex[0] = getIndexUnderPoint(listView, stackPane, localPt.getY());
                
                boolean clickedItem = false;
                Node targetNode = (Node) e.getTarget();
                while (targetNode != null) {
                    if (targetNode instanceof ListCell) {
                        clickedItem = true;
                        break;
                    }
                    targetNode = targetNode.getParent();
                }

                if (!clickedItem && !e.isControlDown() && !e.isShiftDown()) {
                    listView.getSelectionModel().clearSelection();
                }

                if (!e.isControlDown() && !e.isShiftDown()) {
                    initialSelection.clear();
                } else {
                    initialSelection.addAll(listView.getSelectionModel().getSelectedIndices());
                }
            }
        });

        eventTarget.addEventFilter(MouseEvent.MOUSE_DRAGGED, e -> {
            if (dragStart[0] != null) {
                Point2D localPt = stackPane.sceneToLocal(eventTarget.localToScene(e.getX(), e.getY()));
                double localX = localPt.getX();
                double localY = localPt.getY();

                if (!rect.isVisible()) {
                    if (dragStart[0].distance(localX, localY) > 5) {
                        rect.setVisible(true);
                        scrollTimeline.play();
                    }
                }
                
                if (rect.isVisible()) {
                    lastMouseX[0] = localX;
                    lastMouseY[0] = localY;
                    
                    double x = Math.min(localX, dragStart[0].getX());
                    double y = Math.min(localY, dragStart[0].getY());
                    double width = Math.abs(localX - dragStart[0].getX());
                    double height = Math.abs(localY - dragStart[0].getY());

                    if (x < 0) x = 0;
                    if (y < 0) y = 0;
                    if (x + width > stackPane.getWidth()) width = stackPane.getWidth() - x;
                    if (y + height > stackPane.getHeight()) height = stackPane.getHeight() - y;

                    rect.setX(x);
                    rect.setY(y);
                    rect.setWidth(width);
                    rect.setHeight(height);

                    updateSelection(listView, stackPane, localX, localY, startIndex[0], initialSelection);
                    e.consume();
                }
            }
        });

        eventTarget.addEventFilter(MouseEvent.MOUSE_RELEASED, e -> {
            if (rect.isVisible()) {
                rect.setVisible(false);
                scrollTimeline.stop();
                e.consume();
            }
            dragStart[0] = null;
            lastMouseY[0] = -1;
            lastMouseX[0] = -1;
        });

        return stackPane;
    }

    private static void updateSelection(ListView<?> listView, StackPane stackPane, double mouseX, double mouseY, int startIndex, Set<Integer> initialSelection) {
        if (startIndex == -1) return;
        int currentIndex = getIndexUnderPoint(listView, stackPane, mouseY);
        if (currentIndex == -1) return;

        int min = Math.min(startIndex, currentIndex);
        int max = Math.max(startIndex, currentIndex);

        Set<Integer> newSelection = new HashSet<>(initialSelection);
        for (int i = min; i <= max; i++) {
            newSelection.add(i);
        }

        Set<Integer> currentSel = new HashSet<>(listView.getSelectionModel().getSelectedIndices());

        for (int idx : newSelection) {
            if (!currentSel.contains(idx)) {
                listView.getSelectionModel().select(idx);
            }
        }
        for (int idx : currentSel) {
            if (!newSelection.contains(idx)) {
                listView.getSelectionModel().clearSelection(idx);
            }
        }
    }

    private static int getIndexUnderPoint(ListView<?> listView, StackPane stackPane, double y) {
        if (listView.getItems().isEmpty()) return -1;
        
        int maxVisibleIndex = -1;
        double maxVisibleY = -1;
        int nearestIndex = -1;
        double minDistance = Double.MAX_VALUE;
        
        for (Node n : listView.lookupAll(".list-cell")) {
            if (n instanceof ListCell) {
                ListCell<?> cell = (ListCell<?>) n;
                if (cell.getItem() != null && cell.isVisible()) {
                    Bounds cellBounds = stackPane.sceneToLocal(cell.localToScene(cell.getBoundsInLocal()));
                    if (y >= cellBounds.getMinY() && y <= cellBounds.getMaxY()) {
                        return cell.getIndex();
                    }
                    
                    double dist = 0;
                    if (y < cellBounds.getMinY()) dist = cellBounds.getMinY() - y;
                    else if (y > cellBounds.getMaxY()) dist = y - cellBounds.getMaxY();
                    
                    if (dist < minDistance) {
                        minDistance = dist;
                        nearestIndex = cell.getIndex();
                    }
                    
                    if (cellBounds.getMaxY() > maxVisibleY) {
                        maxVisibleY = cellBounds.getMaxY();
                        maxVisibleIndex = cell.getIndex();
                    }
                }
            }
        }
        
        if (y > maxVisibleY && maxVisibleIndex != -1) {
            return listView.getItems().size() - 1;
        }
        if (y < 0) {
            return 0;
        }
        return nearestIndex != -1 ? nearestIndex : 0;
    }

    private static boolean isScrollBar(Node n) {
        while (n != null) {
            if (n.getStyleClass().contains("scroll-bar")) return true;
            n = n.getParent();
        }
        return false;
    }
    
    private static boolean isInteractiveElement(Node n) {
        while (n != null) {
            if (n instanceof javafx.scene.control.ButtonBase || 
                n instanceof javafx.scene.control.ComboBox || 
                n instanceof javafx.scene.control.TextField) {
                return true;
            }
            if (n instanceof ListCell) return false;
            n = n.getParent();
        }
        return false;
    }

    private static ScrollBar getVerticalScrollBar(ListView<?> listView) {
        for (Node n : listView.lookupAll(".scroll-bar")) {
            if (n instanceof ScrollBar) {
                ScrollBar bar = (ScrollBar) n;
                if (bar.getOrientation() == javafx.geometry.Orientation.VERTICAL) {
                    return bar;
                }
            }
        }
        return null;
    }
}
