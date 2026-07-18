package io.smartdm.desktop.shell;

import javafx.scene.layout.BorderPane;
import javafx.scene.layout.StackPane;
import javafx.scene.control.Label;

public final class MainShell extends BorderPane {
    
    private final NavigationRail navigationRail;
    private final TopBar topBar;
    private final BottomStatusBar bottomStatusBar;
    private final StackPane workspaceArea;

    public MainShell() {
        this.navigationRail = new NavigationRail();
        this.topBar = new TopBar();
        this.bottomStatusBar = new BottomStatusBar();
        
        this.workspaceArea = new StackPane();
        this.workspaceArea.getStyleClass().add("workspace-area");
        this.workspaceArea.getChildren().add(new Label("Workspace Area"));

        setLeft(navigationRail);
        setTop(topBar);
        setCenter(workspaceArea);
        setBottom(bottomStatusBar);
        
        getStyleClass().add("main-shell");
    }

    public NavigationRail getNavigationRail() {
        return navigationRail;
    }

    public TopBar getTopBar() {
        return topBar;
    }

    public BottomStatusBar getBottomStatusBar() {
        return bottomStatusBar;
    }

    public StackPane getWorkspaceArea() {
        return workspaceArea;
    }
}
