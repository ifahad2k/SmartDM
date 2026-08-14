package io.smartdm.browser.host;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.smartdm.browser.protocol.NativeMessage;

import java.io.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class NativeHostMain {
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private static final HttpClient HTTP_CLIENT = HttpClient.newHttpClient();
    /**
     * Process-lifetime log writer. Kept open intentionally for the duration of the native host process
     * to record diagnostic output, auto-flushing entries to disk and closing upon JVM termination.
     */
    private static PrintWriter log;

    static {
        try {
            log = new PrintWriter(new FileWriter(Paths.get(System.getProperty("user.home"), ".smartdm", "native_host.log").toFile(), true), true);
            log.println("NativeHostMain started.");
        } catch (Exception e) {}
    }

    public static void main(String[] args) {
        try {
            InputStream in = System.in;
            OutputStream out = System.out;

            while (true) {
                byte[] lengthBytes = in.readNBytes(4);
                if (lengthBytes.length < 4) {
                    log.println("EOF or insufficient data reading length header (read " + lengthBytes.length + " bytes).");
                    break;
                }

                int length = (lengthBytes[0] & 0xFF) |
                        ((lengthBytes[1] & 0xFF) << 8) |
                        ((lengthBytes[2] & 0xFF) << 16) |
                        ((lengthBytes[3] & 0xFF) << 24);

                log.println("Received message length: " + length);

                if (length < 0 || length > 1024 * 1024) {
                    log.println("Invalid message length: " + length + " (max allowed is " + (1024 * 1024) + " bytes)");
                    break;
                }

                byte[] messageBytes = in.readNBytes(length);
                if (messageBytes.length < length) {
                    log.println("EOF or insufficient data reading message payload (read " + messageBytes.length + " of " + length + " bytes).");
                    break;
                }

                String responseJson;
                try {
                    NativeMessage message = MAPPER.readValue(messageBytes, NativeMessage.class);
                    log.println("Forwarding message: " + message.getClass().getSimpleName());
                    responseJson = forwardToSmartDM(messageBytes);
                    if (responseJson == null) {
                        responseJson = "{\"status\":\"error\", \"message\": \"Could not connect to SmartDM.\"}";
                    }
                    log.println("Got response from SmartDM, length: " + responseJson.length());
                } catch (Exception ex) {
                    log.println("Error processing message: " + ex);
                    try {
                        responseJson = MAPPER.writeValueAsString(
                                java.util.Map.of("status", "error", "message",
                                        ex.getMessage() != null ? ex.getMessage() : "Unknown error"));
                    } catch (Exception jsonEx) {
                        responseJson = "{\"status\":\"error\",\"message\":\"Internal error\"}";
                    }
                }

                byte[] responseBytes = responseJson.getBytes(StandardCharsets.UTF_8);
                byte[] outLengthBytes = new byte[4];
                outLengthBytes[0] = (byte) (responseBytes.length & 0xFF);
                outLengthBytes[1] = (byte) ((responseBytes.length >> 8) & 0xFF);
                outLengthBytes[2] = (byte) ((responseBytes.length >> 16) & 0xFF);
                outLengthBytes[3] = (byte) ((responseBytes.length >> 24) & 0xFF);

                out.write(outLengthBytes);
                out.write(responseBytes);
                out.flush();
                log.println("Wrote response to STDOUT.");
            }
        } catch (Exception e) {
            log.println("Fatal error: " + e);
        }
        log.println("NativeHostMain exiting.");
    }

    private static String forwardToSmartDM(byte[] payload) {
        try {
            Path ipcFile = Paths.get(System.getProperty("user.home"), ".smartdm", "ipc.info");
            if (!Files.exists(ipcFile)) return null;

            String[] lines = Files.readAllLines(ipcFile).toArray(new String[0]);
            if (lines.length < 2) return null;

            int port = Integer.parseInt(lines[0].trim());
            String token = lines[1].trim();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("http://127.0.0.1:" + port + "/api/browser"))
                    .header("Authorization", "Bearer " + token)
                    .header("Content-Type", "application/json")
                    .timeout(java.time.Duration.ofSeconds(15))
                    .POST(HttpRequest.BodyPublishers.ofByteArray(payload))
                    .build();

            log.println("Sending HTTP request to 127.0.0.1:" + port);
            HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
            log.println("HTTP request completed with status: " + response.statusCode());
            return response.body();
        } catch (Exception e) {
            log.println("HTTP request failed: " + e);
            return null;
        }
    }
}
