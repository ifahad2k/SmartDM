package io.smartdm.download.engine.ipc;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.smartdm.download.engine.LocalTestHttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.*;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;

public class EngineDaemonIpcTest {
    private EngineDaemonMain daemon;
    private Thread daemonThread;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @BeforeEach
    void setUp() throws Exception {
        daemon = new EngineDaemonMain(0);
        daemonThread = new Thread(() -> {
            try {
                daemon.start();
            } catch (Exception ignored) {}
        });
        daemonThread.setDaemon(true);
        daemonThread.start();
        Thread.sleep(200); // Allow server socket to bind
    }

    @AfterEach
    void tearDown() {
        if (daemon != null) {
            daemon.stop();
        }
    }

    @Test
    void testPingPongFraming() throws Exception {
        try (Socket client = new Socket("127.0.0.1", daemon.getPort())) {
            DataOutputStream out = new DataOutputStream(new BufferedOutputStream(client.getOutputStream()));
            DataInputStream in = new DataInputStream(new BufferedInputStream(client.getInputStream()));

            // Send PING command
            IpcProtocol.CommandMessage cmd = new IpcProtocol.CommandMessage();
            cmd.command = "PING";
            byte[] payload = MAPPER.writeValueAsBytes(cmd);

            out.writeInt(payload.length);
            out.write(payload);
            out.flush();

            // Read PONG event
            int respLength = in.readInt();
            assertThat(respLength).isGreaterThan(0);

            byte[] respPayload = in.readNBytes(respLength);
            IpcProtocol.EventMessage resp = MAPPER.readValue(respPayload, IpcProtocol.EventMessage.class);

            assertThat(resp.event).isEqualTo("PONG");
        }
    }

    @Test
    void testDownloadViaIpc(@TempDir Path tempDir) throws Exception {
        int testSizeBytes = 8 * 1024 * 1024; // 8 MB bounded synthetic payload
        try (LocalTestHttpServer testServer = LocalTestHttpServer.createSynthetic(testSizeBytes, "/ipc-test.bin");
             Socket client = new Socket("127.0.0.1", daemon.getPort())) {
            DataOutputStream out = new DataOutputStream(new BufferedOutputStream(client.getOutputStream()));
            DataInputStream in = new DataInputStream(new BufferedInputStream(client.getInputStream()));

            Path tempDest = tempDir.resolve("test_ipc_download.bin");

            // Send START_DOWNLOAD command
            IpcProtocol.CommandMessage cmd = new IpcProtocol.CommandMessage();
            cmd.command = "START_DOWNLOAD";
            cmd.downloadId = "test-ipc-dl-01";
            cmd.url = testServer.getUrl();
            cmd.destinationPath = tempDest.toAbsolutePath().toString();
            byte[] payload = MAPPER.writeValueAsBytes(cmd);

            out.writeInt(payload.length);
            out.write(payload);
            out.flush();

            // Read events until we get DOWNLOAD_PROGRESS with active sockets
            boolean gotProgress = false;
            long deadline = System.currentTimeMillis() + 15000;

            while (System.currentTimeMillis() < deadline) {
                if (in.available() >= 4) {
                    int length = in.readInt();
                    byte[] eventBytes = in.readNBytes(length);
                    IpcProtocol.EventMessage event = MAPPER.readValue(eventBytes, IpcProtocol.EventMessage.class);

                    if ("DOWNLOAD_PROGRESS".equals(event.event)) {
                        assertThat(event.downloadId).isEqualTo("test-ipc-dl-01");
                        if (event.downloadedBytes != null && event.downloadedBytes > 0) {
                            gotProgress = true;
                            // Verify segments telemetry is populated
                            assertThat(event.segments).isNotNull();
                            break;
                        }
                    }
                }
                Thread.sleep(100);
            }

            assertThat(gotProgress).as("Should receive progress with downloaded bytes and segment telemetry").isTrue();

            // Send PAUSE_DOWNLOAD command
            IpcProtocol.CommandMessage pauseCmd = new IpcProtocol.CommandMessage();
            pauseCmd.command = "PAUSE_DOWNLOAD";
            pauseCmd.downloadId = "test-ipc-dl-01";
            byte[] pausePayload = MAPPER.writeValueAsBytes(pauseCmd);
            out.writeInt(pausePayload.length);
            out.write(pausePayload);
            out.flush();

            Thread.sleep(300);

            // Send CANCEL_DOWNLOAD command
            IpcProtocol.CommandMessage cancelCmd = new IpcProtocol.CommandMessage();
            cancelCmd.command = "CANCEL_DOWNLOAD";
            cancelCmd.downloadId = "test-ipc-dl-01";
            byte[] cancelPayload = MAPPER.writeValueAsBytes(cancelCmd);
            out.writeInt(cancelPayload.length);
            out.write(cancelPayload);
            out.flush();

            Thread.sleep(300);
        }
    }
}
