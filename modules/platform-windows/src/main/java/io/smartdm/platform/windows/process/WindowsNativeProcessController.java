package io.smartdm.platform.windows.process;

import io.smartdm.platform.api.process.*;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class WindowsNativeProcessController implements NativeProcessController, AutoCloseable {

    private final ExecutorService ioExecutor;
    private final ScheduledExecutorService scheduler;
    private final boolean ownsExecutors;

    public WindowsNativeProcessController(ExecutorService ioExecutor, ScheduledExecutorService scheduler) {
        this.ioExecutor = Objects.requireNonNull(ioExecutor);
        this.scheduler = Objects.requireNonNull(scheduler);
        this.ownsExecutors = false;
    }

    public WindowsNativeProcessController() {
        this.ioExecutor = Executors.newCachedThreadPool();
        this.scheduler = Executors.newSingleThreadScheduledExecutor();
        this.ownsExecutors = true;
    }

    @Override
    public NativeProcessSession start(NativeProcessRequest request, NativeProcessOutputListener listener) throws IOException {
        List<String> command = new ArrayList<>();
        command.add(request.executable().toString());
        command.addAll(request.arguments());

        ProcessBuilder builder = new ProcessBuilder(command);
        request.workingDirectory().ifPresent(path -> builder.directory(path.toFile()));
        builder.redirectErrorStream(false);
        builder.environment().putAll(request.environment());

        Process process = builder.start();
        return createManagedSession(process, request, listener);
    }

    private NativeProcessSession createManagedSession(Process process, NativeProcessRequest request, NativeProcessOutputListener listener) {
        long startTime = System.nanoTime();
        AtomicBoolean cancelled = new AtomicBoolean(false);
        AtomicBoolean timedOut = new AtomicBoolean(false);
        AtomicBoolean stdoutLimitExceeded = new AtomicBoolean(false);
        AtomicBoolean stderrLimitExceeded = new AtomicBoolean(false);
        java.util.List<io.smartdm.platform.api.process.NativeProcessFailure> failures = new java.util.concurrent.CopyOnWriteArrayList<>();
        CompletableFuture<NativeProcessResult> completion = new CompletableFuture<>();

        Runnable stdoutLimitAction = () -> {
            stdoutLimitExceeded.set(true);
            failures.add(io.smartdm.platform.api.process.NativeProcessFailure.LINE_LIMIT_EXCEEDED);
            killTreeInternal(process);
        };
        Runnable stderrLimitAction = () -> {
            stderrLimitExceeded.set(true);
            failures.add(io.smartdm.platform.api.process.NativeProcessFailure.LINE_LIMIT_EXCEEDED);
            killTreeInternal(process);
        };

        CompletableFuture<Void> stdoutDrainer = CompletableFuture.runAsync(() -> {
            DrainResult res = drain(process.getInputStream(), request.outputLimits().maxStdoutBytes(), request.outputLimits().maxLineCharacters(), line -> {
                try {
                    listener.onStdoutLine(line);
                } catch (Exception e) {
                    failures.add(io.smartdm.platform.api.process.NativeProcessFailure.OUTPUT_LISTENER_FAILED);
                }
            }, stdoutLimitAction);
            if (!res.completed() && !res.byteLimitExceeded() && !res.lineLimitExceeded()) {
                failures.add(io.smartdm.platform.api.process.NativeProcessFailure.STDOUT_READ_FAILED);
            }
        }, ioExecutor);

        CompletableFuture<Void> stderrDrainer = CompletableFuture.runAsync(() -> {
            DrainResult res = drain(process.getErrorStream(), request.outputLimits().maxStderrBytes(), request.outputLimits().maxLineCharacters(), line -> {
                try {
                    listener.onStderrLine(line);
                } catch (Exception e) {
                    failures.add(io.smartdm.platform.api.process.NativeProcessFailure.OUTPUT_LISTENER_FAILED);
                }
            }, stderrLimitAction);
            if (!res.completed() && !res.byteLimitExceeded() && !res.lineLimitExceeded()) {
                failures.add(io.smartdm.platform.api.process.NativeProcessFailure.STDERR_READ_FAILED);
            }
        }, ioExecutor);

        ScheduledFuture<?> timeoutTask = scheduler.schedule(() -> {
            timedOut.set(true);
            killTreeInternal(process);
        }, request.timeout().toMillis(), TimeUnit.MILLISECONDS);

        process.onExit().whenCompleteAsync((p, ex) -> {
            timeoutTask.cancel(false);
            CompletableFuture.allOf(stdoutDrainer, stderrDrainer).whenComplete((v, t) -> {
                Duration elapsed = Duration.ofNanos(System.nanoTime() - startTime);
                NativeProcessResult result = new NativeProcessResult(
                        p.exitValue(),
                        timedOut.get(),
                        cancelled.get(),
                        stdoutLimitExceeded.get(),
                        stderrLimitExceeded.get(),
                        java.util.List.copyOf(failures),
                        elapsed);
                completion.complete(result);
            });
        }, ioExecutor);

        return new NativeProcessSession() {
            @Override
            public long pid() {
                return process.pid();
            }

            @Override
            public boolean isAlive() {
                return process.isAlive();
            }

            @Override
            public CompletionStage<NativeProcessResult> completion() {
                return completion;
            }

            @Override
            public CompletionStage<Void> terminate() {
                cancelled.set(true);
                process.destroy();
                return CompletableFuture.completedFuture(null);
            }

            @Override
            public CompletionStage<Void> killTree() {
                cancelled.set(true);
                killTreeInternal(process);
                return CompletableFuture.completedFuture(null);
            }
        };
    }

    private void killTreeInternal(Process process) {
        List<ProcessHandle> descendants = process.toHandle()
                .descendants()
                .sorted(Comparator.comparingLong(ProcessHandle::pid).reversed())
                .toList();

        descendants.forEach(ProcessHandle::destroy);
        process.destroy();

        if (!waitForExit(process, Duration.ofSeconds(2))) {
            descendants.forEach(ProcessHandle::destroyForcibly);
            process.destroyForcibly();
        }

        if (process.isAlive()) {
            runTaskkillFallback(process.pid());
        }
    }

    private boolean waitForExit(Process process, Duration duration) {
        try {
            return process.waitFor(duration.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private void runTaskkillFallback(long pid) {
        try {
            new ProcessBuilder("taskkill", "/F", "/T", "/PID", String.valueOf(pid))
                    .start()
                    .waitFor(2, TimeUnit.SECONDS);
        } catch (Exception e) {
            System.err.println("NATIVE_PROCESS_KILL_ERROR: " + e.getMessage());
        }
    }

    private DrainResult drain(InputStream stream, long byteLimit, int lineLimit, java.util.function.Consumer<String> consumer, Runnable limitExceededAction) {
        long totalBytes = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                int bytes = line.getBytes(StandardCharsets.UTF_8).length + 1; // +1 for newline approximation
                totalBytes += bytes;

                if (totalBytes > byteLimit) {
                    limitExceededAction.run();
                    return new DrainResult(false, true, false, totalBytes);
                }

                if (line.length() > lineLimit) {
                    limitExceededAction.run();
                    return new DrainResult(false, false, true, totalBytes);
                }

                consumer.accept(line);
            }
            return new DrainResult(true, false, false, totalBytes);
        } catch (IOException exception) {
            return new DrainResult(false, false, false, totalBytes);
        }
    }

    private record DrainResult(boolean completed, boolean byteLimitExceeded, boolean lineLimitExceeded, long totalBytes) {}

    @Override
    public void close() {
        if (ownsExecutors) {
            ioExecutor.shutdownNow();
            scheduler.shutdownNow();
        }
    }
}
