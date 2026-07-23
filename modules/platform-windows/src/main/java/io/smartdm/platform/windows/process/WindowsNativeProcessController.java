package io.smartdm.platform.windows.process;

import io.smartdm.platform.api.process.NativeProcessController;
import io.smartdm.platform.api.process.NativeProcessHandle;
import io.smartdm.platform.api.process.NativeProcessRequest;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class WindowsNativeProcessController implements NativeProcessController {

    @Override
    public NativeProcessHandle start(NativeProcessRequest request) throws IOException {
        List<String> command = new ArrayList<>();
        command.add(request.executable().toString());
        if (request.arguments() != null) {
            command.addAll(request.arguments());
        }

        ProcessBuilder pb = new ProcessBuilder(command);
        request.workingDirectory().ifPresent(p -> pb.directory(p.toFile()));
        
        Process process = pb.start();
        return new WindowsProcessHandle(process);
    }

    private static class WindowsProcessHandle implements NativeProcessHandle {
        private final Process process;

        WindowsProcessHandle(Process process) {
            this.process = process;
        }

        @Override
        public long pid() {
            return process.pid();
        }

        @Override
        public InputStream getInputStream() {
            return process.getInputStream();
        }

        @Override
        public InputStream getErrorStream() {
            return process.getErrorStream();
        }

        @Override
        public void terminate() {
            process.destroy();
        }

        @Override
        public void terminateForcibly() {
            process.destroyForcibly();
        }

        @Override
        public void killTree() {
            try {
                // Windows-specific process tree kill
                new ProcessBuilder("taskkill", "/F", "/T", "/PID", String.valueOf(process.pid()))
                        .start()
                        .waitFor();
            } catch (Exception e) {
                process.destroyForcibly();
            }
        }

        @Override
        public int waitFor() throws InterruptedException {
            return process.waitFor();
        }

        @Override
        public boolean isAlive() {
            return process.isAlive();
        }
    }
}
