package io.smartdm.platform.linux.process;

import io.smartdm.platform.api.process.NativeProcessController;
import io.smartdm.platform.api.process.NativeProcessHandle;
import io.smartdm.platform.api.process.NativeProcessRequest;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class LinuxNativeProcessController implements NativeProcessController {

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
        return new LinuxProcessHandle(process);
    }

    private static class LinuxProcessHandle implements NativeProcessHandle {
        private final Process process;

        LinuxProcessHandle(Process process) {
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
                // Kill descendants gracefully then forcefully
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
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
