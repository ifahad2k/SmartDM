package io.smartdm.desktop.shell;

import javafx.scene.Scene;
import javafx.stage.Stage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.testfx.api.FxRobot;
import org.testfx.framework.junit5.ApplicationExtension;
import org.testfx.framework.junit5.Start;

import io.smartdm.desktop.theme.ThemeManager;

import static org.assertj.core.api.Assertions.assertThat;
import javafx.scene.input.KeyCode;

@ExtendWith(ApplicationExtension.class)
public class MainShellTest {

    private MainShell shell;

    @Start
    private void start(Stage stage) {
        shell = new MainShell(
            stage,
            download -> { },
            new DownloadsWorkspace(),
            new io.smartdm.domain.DownloadQueue("test-q", "Test", 1, null, io.smartdm.domain.DownloadQueue.Status.ACTIVE),
            javafx.collections.FXCollections.observableArrayList(),
            new SchedulerWorkspace.ScheduleManager() {
                @Override public java.util.Collection<io.smartdm.domain.Schedule> getSchedules() { return java.util.Collections.emptyList(); }
                @Override public void updateSchedule(io.smartdm.domain.Schedule schedule) {}
                @Override public void removeSchedule(String id) {}
            },
            status -> {}
        );
        Scene scene = new Scene(shell, 800, 600);
        
        ThemeManager themeManager = new ThemeManager();
        themeManager.applyTheme(scene);
        
        stage.setScene(scene);
        stage.show();
    }

    @Test
    void shouldNavigateWithKeyboard(FxRobot robot) {
        // Simple test to ensure components exist and we can navigate
        assertThat(shell.getNavigationRail()).isNotNull();
        assertThat(shell.getTopBar()).isNotNull();
        
        // Push Tab to focus through the Navigation Rail
        robot.type(KeyCode.TAB);
        robot.type(KeyCode.TAB);
        robot.type(KeyCode.TAB);
        robot.type(KeyCode.TAB);
        
        // If we reach here without exceptions, TestFX is working and the shell is rendering.
        // We'll expand this as actual view switching is implemented.
    }
}
