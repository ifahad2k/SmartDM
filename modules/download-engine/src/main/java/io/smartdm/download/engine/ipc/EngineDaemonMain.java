package io.smartdm.download.engine.ipc;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.smartdm.domain.*;
import io.smartdm.domain.repository.DownloadRepository;
import io.smartdm.download.engine.SingleDownloadCoordinator;
import io.smartdm.download.engine.limit.TokenBucketRateLimiter;
import io.smartdm.download.http.HttpProbeClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.*;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class EngineDaemonMain {
    private static final Logger log = LoggerFactory.getLogger(EngineDaemonMain.class);
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private final int port;
    private final String authToken;
    private final Path enginePortFile;
    private final ServerSocket serverSocket;
    private final SingleDownloadCoordinator coordinator;
    private final TokenBucketRateLimiter rateLimiter;
    private final Map<String, Download> activeDownloads = new ConcurrentHashMap<>();
    private final List<ClientHandler> clients = new CopyOnWriteArrayList<>();
    private final AtomicBoolean running = new AtomicBoolean(true);
    private final ScheduledExecutorService telemetryScheduler = Executors.newSingleThreadScheduledExecutor();

    public static void main(String[] args) {
        try {
            EngineDaemonMain daemon = new EngineDaemonMain(0);
            daemon.start();
        } catch (Exception e) {
            log.error("Fatal error starting SmartDM Engine Daemon: ", e);
            System.exit(1);
        }
    }

    public EngineDaemonMain(int preferredPort) throws IOException {
        this.serverSocket = new ServerSocket(preferredPort, 50, InetAddress.getByName("127.0.0.1"));
        this.port = serverSocket.getLocalPort();

        // Generate 32-byte secure auth token
        byte[] tokenBytes = new byte[32];
        new SecureRandom().nextBytes(tokenBytes);
        this.authToken = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);

        Path smartDmDir = Paths.get(System.getProperty("user.home"), ".smartdm");
        Files.createDirectories(smartDmDir);
        this.enginePortFile = smartDmDir.resolve("engine.port");

        // Initialize engine dependencies
        HttpClient httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_2)
                .followRedirects(HttpClient.Redirect.ALWAYS)
                .connectTimeout(Duration.ofSeconds(15))
                .build();

        HttpProbeClient probeClient = new HttpProbeClient(httpClient);
        this.rateLimiter = new TokenBucketRateLimiter(null, null);

        DownloadRepository repo = new InMemoryDownloadRepository(activeDownloads);
        Path partsDir = smartDmDir.resolve("temp");
        Files.createDirectories(partsDir);

        this.coordinator = new SingleDownloadCoordinator(
                repo,
                null,
                probeClient,
                httpClient,
                this::handleEngineEvent,
                partsDir,
                rateLimiter
        );

        log.info("SmartDM Engine Daemon initialized on 127.0.0.1:{}", port);
    }

    public int getPort() {
        return port;
    }

    public String getAuthToken() {
        return authToken;
    }

    public void start() throws IOException {
        // Write engine.port (<port>\n<token>\n)
        Files.writeString(enginePortFile, port + "\n" + authToken + "\n", StandardCharsets.UTF_8);

        // Register shutdown hook
        Runtime.getRuntime().addShutdownHook(new Thread(this::stop));

        // Start 200ms telemetry ticker for live UI segment visualization
        telemetryScheduler.scheduleAtFixedRate(this::broadcastTelemetryTick, 200, 200, TimeUnit.MILLISECONDS);

        log.info("Engine daemon listening for Avalonia UI connections...");

        while (running.get()) {
            try {
                Socket socket = serverSocket.accept();
                ClientHandler client = new ClientHandler(socket);
                clients.add(client);
                new Thread(client, "smartdm-ipc-client-" + socket.getPort()).start();
            } catch (IOException e) {
                if (!running.get()) break;
                log.warn("Error accepting IPC connection: {}", e.getMessage());
            }
        }
    }

    public void stop() {
        if (!running.compareAndSet(true, false)) return;
        log.info("Stopping SmartDM Engine Daemon...");

        try {
            Files.deleteIfExists(enginePortFile);
        } catch (Exception ignored) {}

        telemetryScheduler.shutdownNow();

        for (ClientHandler client : clients) {
            client.close();
        }
        clients.clear();

        coordinator.shutdown();

        try {
            serverSocket.close();
        } catch (Exception ignored) {}

        log.info("SmartDM Engine Daemon stopped cleanly.");
    }

    private void handleEngineEvent(DownloadEvent event) {
        if (event instanceof DownloadEvent.StateChanged sc) {
            IpcProtocol.EventMessage msg = new IpcProtocol.EventMessage("DOWNLOAD_STATUS");
            msg.downloadId = sc.downloadId().value();
            msg.status = sc.state().name();
            broadcastEvent(msg);
        } else if (event instanceof DownloadEvent.ProgressUpdated pu) {
            IpcProtocol.EventMessage msg = new IpcProtocol.EventMessage("DOWNLOAD_PROGRESS");
            msg.downloadId = pu.downloadId().value();
            msg.downloadedBytes = pu.bytesDownloaded().value();
            msg.totalBytes = pu.totalBytes() != null ? pu.totalBytes().value() : -1L;
            msg.status = "DOWNLOADING";

            // Attach segments
            List<SingleDownloadCoordinator.WorkerSnapshot> snapshots = coordinator.getWorkerSnapshots(pu.downloadId());
            msg.activeSockets = (int) snapshots.stream().filter(s -> !s.isCompleted()).count();
            msg.segments = new ArrayList<>();
            double totalSpeedMBps = 0.0;
            for (var s : snapshots) {
                totalSpeedMBps += s.speedMBps();
                msg.segments.add(new IpcProtocol.SegmentProgressDto(
                        s.index(),
                        s.startByte(),
                        s.endByte(),
                        s.currentOffset(),
                        s.downloadedBytes(),
                        !s.isCompleted(),
                        s.isCompleted(),
                        s.speedMBps()
                ));
            }
            msg.speedBytesPerSec = totalSpeedMBps * 1024.0 * 1024.0;
            broadcastEvent(msg);
        }
    }

    private void broadcastTelemetryTick() {
        if (clients.isEmpty() || activeDownloads.isEmpty()) return;

        for (Map.Entry<String, Download> entry : activeDownloads.entrySet()) {
            Download dl = entry.getValue();
            if (dl.state() != DownloadState.DOWNLOADING) continue;

            DownloadId id = dl.id();
            List<SingleDownloadCoordinator.WorkerSnapshot> snapshots = coordinator.getWorkerSnapshots(id);
            if (snapshots.isEmpty()) continue;

            IpcProtocol.EventMessage msg = new IpcProtocol.EventMessage("DOWNLOAD_PROGRESS");
            msg.downloadId = id.value();
            msg.downloadedBytes = dl.downloadedBytes().value();
            msg.totalBytes = dl.totalBytes() != null ? dl.totalBytes().value() : -1L;
            msg.status = "DOWNLOADING";

            double totalSpeedMBps = 0.0;
            msg.segments = new ArrayList<>();
            for (var s : snapshots) {
                totalSpeedMBps += s.speedMBps();
                msg.segments.add(new IpcProtocol.SegmentProgressDto(
                        s.index(),
                        s.startByte(),
                        s.endByte(),
                        s.currentOffset(),
                        s.downloadedBytes(),
                        !s.isCompleted(),
                        s.isCompleted(),
                        s.speedMBps()
                ));
            }
            msg.activeSockets = (int) snapshots.stream().filter(s -> !s.isCompleted()).count();
            msg.speedBytesPerSec = totalSpeedMBps * 1024.0 * 1024.0;
            broadcastEvent(msg);
        }
    }

    private void broadcastEvent(IpcProtocol.EventMessage event) {
        try {
            byte[] jsonBytes = MAPPER.writeValueAsBytes(event);
            byte[] lengthHeader = new byte[4];
            lengthHeader[0] = (byte) ((jsonBytes.length >> 24) & 0xFF);
            lengthHeader[1] = (byte) ((jsonBytes.length >> 16) & 0xFF);
            lengthHeader[2] = (byte) ((jsonBytes.length >> 8) & 0xFF);
            lengthHeader[3] = (byte) (jsonBytes.length & 0xFF);

            for (ClientHandler client : clients) {
                client.sendRaw(lengthHeader, jsonBytes);
            }
        } catch (Exception e) {
            log.warn("Failed to serialize or broadcast event: {}", e.getMessage());
        }
    }

    private class ClientHandler implements Runnable {
        private final Socket socket;
        private final DataInputStream in;
        private final OutputStream out;
        private volatile boolean authenticated = false;

        ClientHandler(Socket socket) throws IOException {
            this.socket = socket;
            this.in = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
            this.out = socket.getOutputStream();
        }

        @Override
        public void run() {
            try {
                while (running.get() && !socket.isClosed()) {
                    int length = in.readInt();
                    if (length <= 0 || length > 10 * 1024 * 1024) {
                        log.warn("Invalid payload length header: {}", length);
                        break;
                    }

                    byte[] payload = in.readNBytes(length);
                    if (payload.length < length) break;

                    IpcProtocol.CommandMessage cmd = MAPPER.readValue(payload, IpcProtocol.CommandMessage.class);
                    processCommand(cmd);
                }
            } catch (EOFException ignored) {
            } catch (Exception e) {
                if (running.get()) log.debug("Client connection closed: {}", e.getMessage());
            } finally {
                close();
            }
        }

        private void processCommand(IpcProtocol.CommandMessage cmd) {
            if (cmd == null || cmd.command == null) return;

            switch (cmd.command.toUpperCase()) {
                case "PING":
                    sendEvent(new IpcProtocol.EventMessage("PONG"));
                    break;

                case "START_DOWNLOAD":
                    handleStartDownload(cmd);
                    break;

                case "PAUSE_DOWNLOAD":
                    if (cmd.downloadId != null) {
                        coordinator.pause(new DownloadId(cmd.downloadId));
                    }
                    break;

                case "RESUME_DOWNLOAD":
                    if (cmd.downloadId != null) {
                        Download dl = activeDownloads.get(cmd.downloadId);
                        if (dl != null) {
                            CompletableFuture.runAsync(() -> coordinator.execute(dl));
                        }
                    }
                    break;

                case "CANCEL_DOWNLOAD":
                    if (cmd.downloadId != null) {
                        coordinator.cancel(new DownloadId(cmd.downloadId));
                        activeDownloads.remove(cmd.downloadId);
                    }
                    break;

                case "SET_RATE_LIMIT":
                    if (cmd.rateLimitBytesPerSec != null) {
                        // Dynamically update rate limit
                    }
                    break;

                default:
                    log.warn("Unknown IPC command: {}", cmd.command);
            }
        }

        private void handleStartDownload(IpcProtocol.CommandMessage cmd) {
            if (cmd.url == null || cmd.destinationPath == null) {
                log.warn("START_DOWNLOAD missing required fields: url or destinationPath");
                return;
            }

            DownloadId downloadId = cmd.downloadId != null ? new DownloadId(cmd.downloadId) : DownloadId.generate();
            Path destFile = Paths.get(cmd.destinationPath);

            Download download = new Download(
                    downloadId,
                    SourceUri.of(cmd.url),
                    Destination.of(destFile)
            );

            activeDownloads.put(downloadId.value(), download);

            log.info("Starting download via high-speed engine: {} -> {}", cmd.url, cmd.destinationPath);

            CompletableFuture.runAsync(() -> {
                try {
                    coordinator.execute(download);
                } catch (Exception e) {
                    log.error("Execution failed for download {}: ", downloadId.value(), e);
                    IpcProtocol.EventMessage err = new IpcProtocol.EventMessage("DOWNLOAD_STATUS");
                    err.downloadId = downloadId.value();
                    err.status = "ERROR";
                    err.error = e.getMessage();
                    broadcastEvent(err);
                }
            });
        }

        private synchronized void sendEvent(IpcProtocol.EventMessage event) {
            try {
                byte[] json = MAPPER.writeValueAsBytes(event);
                byte[] lengthHeader = new byte[4];
                lengthHeader[0] = (byte) ((json.length >> 24) & 0xFF);
                lengthHeader[1] = (byte) ((json.length >> 16) & 0xFF);
                lengthHeader[2] = (byte) ((json.length >> 8) & 0xFF);
                lengthHeader[3] = (byte) (json.length & 0xFF);
                sendRaw(lengthHeader, json);
            } catch (Exception e) {
                log.warn("Failed to send event to client: {}", e.getMessage());
            }
        }

        synchronized void sendRaw(byte[] header, byte[] payload) {
            try {
                out.write(header);
                out.write(payload);
                out.flush();
            } catch (IOException e) {
                close();
            }
        }

        void close() {
            clients.remove(this);
            try { socket.close(); } catch (Exception ignored) {}
        }
    }

    private static class InMemoryDownloadRepository implements DownloadRepository {
        private final Map<String, Download> downloads;

        InMemoryDownloadRepository(Map<String, Download> downloads) {
            this.downloads = downloads;
        }

        @Override public void save(Download download) {
            downloads.put(download.id().value(), download);
        }

        @Override public Optional<Download> findById(DownloadId id) {
            return Optional.ofNullable(downloads.get(id.value()));
        }

        @Override public List<Download> findAll() {
            return new ArrayList<>(downloads.values());
        }

        @Override public void delete(DownloadId id) {
            downloads.remove(id.value());
        }

        @Override public List<Download> findScheduledDownloads() {
            return Collections.emptyList();
        }

        @Override public List<Download> findReadyScheduledDownloads(long currentTimeMs) {
            return Collections.emptyList();
        }
    }
}
