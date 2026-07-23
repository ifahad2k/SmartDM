package io.smartdm.platform.linux.process;

import io.smartdm.platform.api.process.*;
import io.smartdm.platform.testkit.ProcessFixtureMain;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;

@EnabledOnOs(OS.LINUX)
class LinuxNativeProcessControllerTest {

    private ExecutorService ioExecutor;
    private ScheduledExecutorService scheduler;
    private LinuxNativeProcessController controller;
    private Path javaBin;
    private String classpath;
    private String fixtureClassName;

    @BeforeEach
    void setUp() {
        ioExecutor = Executors.newCachedThreadPool();
        scheduler = Executors.newSingleThreadScheduledExecutor();
        controller = new LinuxNativeProcessController(ioExecutor, scheduler);
        
        String javaHome = System.getProperty("java.home");
        javaBin = Paths.get(javaHome, "bin", "java");
        classpath = System.getProperty("java.class.path");
        fixtureClassName = ProcessFixtureMain.class.getName();
    }

    @AfterEach
    void tearDown() throws Exception {
        controller.close();
        ioExecutor.shutdownNow();
        scheduler.shutdownNow();
    }

    private NativeProcessRequest createRequest(List<String> fixtureArgs, Duration timeout, OutputLimits limits) {
        List<String> allArgs = new java.util.ArrayList<>();
        allArgs.add("-cp");
        allArgs.add(classpath);
        allArgs.add(fixtureClassName);
        allArgs.addAll(fixtureArgs);
        
        return new NativeProcessRequest(
                javaBin,
                allArgs,
                Optional.empty(),
                Map.of(),
                timeout,
                limits
        );
    }

    @Test
    void testExitCodeAndGracefulTermination() throws Exception {
        NativeProcessRequest request = createRequest(List.of("exit", "42"), Duration.ofSeconds(5), OutputLimits.mediaDefaults());
        
        NativeProcessSession session = controller.start(request, new NativeProcessOutputListener() {});
        NativeProcessResult result = session.completion().toCompletableFuture().get(5, TimeUnit.SECONDS);
        
        assertEquals(42, result.exitCode());
        assertFalse(result.timedOut());
        assertFalse(result.cancelled());
        assertFalse(result.stdoutLimitExceeded());
    }

    @Test
    void testStdoutDelivery() throws Exception {
        NativeProcessRequest request = createRequest(List.of("echo-args", "hello", "world"), Duration.ofSeconds(5), OutputLimits.mediaDefaults());
        
        List<String> stdoutLines = new CopyOnWriteArrayList<>();
        NativeProcessSession session = controller.start(request, new NativeProcessOutputListener() {
            @Override
            public void onStdoutLine(String line) {
                stdoutLines.add(line);
            }
        });
        
        NativeProcessResult result = session.completion().toCompletableFuture().get(5, TimeUnit.SECONDS);
        
        assertEquals(0, result.exitCode());
        assertEquals(List.of("hello", "world"), stdoutLines);
    }

    @Test
    void testTimeoutEnforcement() throws Exception {
        NativeProcessRequest request = createRequest(List.of("sleep", "10000"), Duration.ofMillis(500), OutputLimits.mediaDefaults());
        
        NativeProcessSession session = controller.start(request, new NativeProcessOutputListener() {});
        NativeProcessResult result = session.completion().toCompletableFuture().get(5, TimeUnit.SECONDS);
        
        assertTrue(result.timedOut());
        assertFalse(result.succeeded());
    }

    @Test
    void testStdoutLimit() throws Exception {
        OutputLimits limits = new OutputLimits(1000, 1000, 1000); 
        NativeProcessRequest request = createRequest(List.of("stdout", "100", "100"), Duration.ofSeconds(5), limits);
        
        NativeProcessSession session = controller.start(request, new NativeProcessOutputListener() {});
        NativeProcessResult result = session.completion().toCompletableFuture().get(5, TimeUnit.SECONDS);
        
        assertTrue(result.stdoutLimitExceeded());
        assertFalse(result.succeeded());
    }
}
