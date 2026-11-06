package io.smartdm.download.engine;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;

/**
 * Bounded local HTTP server supporting HEAD, GET, and HTTP Range (206 Partial Content)
 * requests on loopback (127.0.0.1) for deterministic, offline testing.
 */
public class LocalTestHttpServer implements AutoCloseable {
    private final HttpServer server;
    private final byte[] content;
    private final String path;

    public LocalTestHttpServer(byte[] content, String path) throws IOException {
        this.content = content;
        this.path = path.startsWith("/") ? path : "/" + path;
        this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        this.server.createContext(this.path, new RangeHandler());
        this.server.start();
    }

    public static LocalTestHttpServer createSynthetic(int sizeBytes, String path) throws IOException {
        byte[] data = new byte[sizeBytes];
        for (int i = 0; i < sizeBytes; i++) {
            data[i] = (byte) (i & 0xFF);
        }
        return new LocalTestHttpServer(data, path);
    }

    public String getUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + path;
    }

    public int getPort() {
        return server.getAddress().getPort();
    }

    @Override
    public void close() {
        server.stop(0);
    }

    private class RangeHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String method = exchange.getRequestMethod();
            if ("HEAD".equalsIgnoreCase(method)) {
                exchange.getResponseHeaders().set("Content-Type", "application/octet-stream");
                exchange.getResponseHeaders().set("Content-Length", String.valueOf(content.length));
                exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
                exchange.sendResponseHeaders(200, -1);
                exchange.close();
                return;
            }

            if ("GET".equalsIgnoreCase(method)) {
                String rangeHeader = exchange.getRequestHeaders().getFirst("Range");
                if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
                    String spec = rangeHeader.substring(6).trim();
                    long start = 0;
                    long end = content.length - 1;
                    int dash = spec.indexOf('-');
                    if (dash >= 0) {
                        String sStr = spec.substring(0, dash).trim();
                        String eStr = spec.substring(dash + 1).trim();
                        if (!sStr.isEmpty()) start = Long.parseLong(sStr);
                        if (!eStr.isEmpty()) end = Long.parseLong(eStr);
                    }
                    if (start > end || start >= content.length) {
                        exchange.sendResponseHeaders(416, -1);
                        exchange.close();
                        return;
                    }
                    end = Math.min(end, content.length - 1);
                    int length = (int) (end - start + 1);

                    exchange.getResponseHeaders().set("Content-Type", "application/octet-stream");
                    exchange.getResponseHeaders().set("Content-Range", "bytes " + start + "-" + end + "/" + content.length);
                    exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
                    exchange.sendResponseHeaders(206, length);
                    try (OutputStream os = exchange.getResponseBody()) {
                        os.write(content, (int) start, length);
                        os.flush();
                    }
                    exchange.close();
                    return;
                }

                // Full content
                exchange.getResponseHeaders().set("Content-Type", "application/octet-stream");
                exchange.getResponseHeaders().set("Content-Length", String.valueOf(content.length));
                exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
                exchange.sendResponseHeaders(200, content.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(content);
                    os.flush();
                }
                exchange.close();
                return;
            }

            exchange.sendResponseHeaders(405, -1);
            exchange.close();
        }
    }
}
