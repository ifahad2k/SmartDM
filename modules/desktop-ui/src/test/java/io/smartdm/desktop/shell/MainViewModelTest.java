package io.smartdm.desktop.shell;

import io.smartdm.desktop.util.TestUiDispatcher;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

public class MainViewModelTest {

    @Test
    void canTestViewModelWithoutJavaFx() {
        // Uses TestUiDispatcher, so JavaFX toolkit is never initialized
        TestUiDispatcher dispatcher = new TestUiDispatcher();
        MainViewModel viewModel = new MainViewModel(dispatcher);

        assertThat(viewModel.getStatus()).isEqualTo("Idle");

        viewModel.simulateBackgroundWork();

        // Dispatcher immediately executes the action
        assertThat(viewModel.getStatus()).isEqualTo("Working");
    }
}
