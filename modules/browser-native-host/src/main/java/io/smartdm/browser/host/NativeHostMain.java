package io.smartdm.browser.host;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.smartdm.browser.protocol.NativeMessage;

import java.io.InputStream;
import java.io.OutputStream;
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

    public static void main(String[] args) {
        try {
            InputStream in = System.in;
            OutputStream out = System.out;

            while (true) {
                byte[] lengthBytes = new byte[4];
                int read = in.read(lengthBytes);
                if (read == -1) {
                    break;
                }

                int length = (lengthBytes[0] & 0xFF) |
                        ((lengthBytes[1] & 0xFF) << 8) |
                        ((lengthBytes[2] & 0xFF) << 16) |
                        ((lengthBytes[3] & 0xFF) << 24);

                if (length < 0 || length > 10 * 1024 * 1024) {
                    System.err.println("Invalid message length: " + length);
                    break;
                }

                byte[] messageBytes = new byte[length];
                int totalRead = 0;
                while (totalRead < length) {
                    int r = in.read(messageBytes, totalRead, length - totalRead);
                    if (r == -1) break;
                    totalRead += r;
                }
                if (totalRead != length) {
                    break;
                }

                String responseJson;
                try {
                    // Parse message to validate it
                    NativeMessage message = MAPPER.readValue(messageBytes, NativeMessage.class);

                    // Forward to SmartDM IPC server
                    responseJson = forwardToSmartDM(messageBytes);
                    if (responseJson == null) {
                        responseJson = "{\"status\":\"error\", \"message\": \"Could not connect to SmartDM. Ensure app is running.\"}";
                    }
                } catch (Exception ex) {
                    ex.printStackTrace(System.err);
                    responseJson = "{\"status\":\"error\", \"message\": \"" + ex.getMessage().replace("\"", "'") + "\"}";
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
            }
        } catch (Exception e) {
            e.printStackTrace(System.err);
        }
    }

    private static String forwardToSmartDM(byte[] payload) {
        try {
            // Read port and token from IPC file
            Path ipcFile = Paths.get(System.getProperty("user.home"), ".smartdm", "ipc.info");
            if (!Files.exists(ipcFile)) {
                // If SmartDM is not running, we could try to launch it here
                // For now, return error
                return null;
            }

            String[] lines = Files.readAllLines(ipcFile).toArray(new String[0]);
            if (lines.length < 2) return null;

            int port = Integer.parseInt(lines[0].trim());
            String token = lines[1].trim();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("http://127.0.0.1:" + port + "/api/browser"))
                    .header("Authorization", "Bearer " + token)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(payload))
                    .build();

            HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
            return response.body();
        } catch (Exception e) {
            e.printStackTrace(System.err);
            return null;
        }
    }
}
