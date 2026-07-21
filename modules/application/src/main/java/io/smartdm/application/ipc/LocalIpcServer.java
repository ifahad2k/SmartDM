package io.smartdm.application.ipc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import io.smartdm.browser.protocol.NativeMessage;

import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.concurrent.ExecutorService;
import java.util.function.Function;

public class LocalIpcServer {
    private HttpServer server;
    private final String token;
    private final Function<NativeMessage, String> messageHandler;
    private final ObjectMapper mapper = new ObjectMapper();

    public LocalIpcServer(Function<NativeMessage, String> messageHandler) {
        this.messageHandler = messageHandler;
        byte[] tokenBytes = new byte[32];
        new SecureRandom().nextBytes(tokenBytes);
        this.token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
    }

    public void start(ExecutorService executor) throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(executor);
        
        server.createContext("/api/browser", exchange -> {
            try {
                if (!"POST".equals(exchange.getRequestMethod())) {
                    exchange.sendResponseHeaders(405, -1);
                    return;
                }
                
                String auth = exchange.getRequestHeaders().getFirst("Authorization");
                if (auth == null || !auth.equals("Bearer " + token)) {
                    exchange.sendResponseHeaders(401, -1);
                    return;
                }
                
                byte[] requestBody = exchange.getRequestBody().readAllBytes();
                NativeMessage message = mapper.readValue(requestBody, NativeMessage.class);
                
                String responseJson = messageHandler.apply(message);
                if (responseJson == null || responseJson.isBlank()) {
                    responseJson = "{\"status\":\"ok\",\"version\":\"1.0\"}";
                }

                byte[] responseBytes = responseJson.getBytes();
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, responseBytes.length);
                exchange.getResponseBody().write(responseBytes);
                
            } catch (Exception e) {
                e.printStackTrace();
                exchange.sendResponseHeaders(500, -1);
            } finally {
                exchange.close();
            }
        });
        
        server.start();
        int port = server.getAddress().getPort();
        
        Path ipcFile = Paths.get(System.getProperty("user.home"), ".smartdm", "ipc.info");
        Files.createDirectories(ipcFile.getParent());
        Files.writeString(ipcFile, port + "\n" + token + "\n");
        ipcFile.toFile().deleteOnExit();
    }
    
    public void stop() {
        if (server != null) {
            server.stop(0);
        }
        try {
            Path ipcFile = Paths.get(System.getProperty("user.home"), ".smartdm", "ipc.info");
            Files.deleteIfExists(ipcFile);
        } catch (Exception ignored) {}
    }
}
