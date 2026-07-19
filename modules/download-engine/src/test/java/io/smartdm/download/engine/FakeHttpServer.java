package io.smartdm.download.engine;

import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

/**
 * A local HTTP server for Phase 4 testing. Every endpoint is deterministic
 * and self-contained — no external network calls, no randomness.
 */
public class FakeHttpServer {
    private HttpServer server;
    private int port;

    public void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 0);
        this.port = server.getAddress().getPort();

        // ── 1. Normal known-length response ─────────────────────────────
        server.createContext("/normal", exchange -> {
            byte[] body = "Hello World! This is a known length file.".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/plain");
            if (exchange.getRequestMethod().equalsIgnoreCase("HEAD")) {
                exchange.sendResponseHeaders(200, body.length);
                exchange.close();
            } else {
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(body);
                }
            }
        });

        // ── 2. Unknown-length (chunked) response ────────────────────────
        server.createContext("/chunked", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "text/plain");
            if (exchange.getRequestMethod().equalsIgnoreCase("HEAD")) {
                // HEAD with no Content-Length → unknown length
                exchange.sendResponseHeaders(200, -1);
                exchange.close();
            } else {
                exchange.sendResponseHeaders(200, 0); // 0 → chunked
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write("Chunk 1\n".getBytes(StandardCharsets.UTF_8));
                    os.flush();
                    os.write("Chunk 2\n".getBytes(StandardCharsets.UTF_8));
                }
            }
        });

        // ── 3. Redirect loop (A→B→A) ────────────────────────────────────
        server.createContext("/redirect1", exchange -> {
            exchange.getResponseHeaders().add("Location", "http://127.0.0.1:" + port + "/redirect2");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        server.createContext("/redirect2", exchange -> {
            exchange.getResponseHeaders().add("Location", "http://127.0.0.1:" + port + "/redirect1");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });

        // ── 4. Server reports wrong Content-Length ───────────────────────
        server.createContext("/wrong-length", exchange -> {
            byte[] body = "Short.".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/plain");
            if (exchange.getRequestMethod().equalsIgnoreCase("HEAD")) {
                // Claim 50000 bytes
                exchange.getResponseHeaders().add("Content-Length", "50000");
                exchange.sendResponseHeaders(200, -1);
                exchange.close();
            } else {
                // Actually send only 6 bytes but claim 50000
                exchange.sendResponseHeaders(200, 50000);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(body);
                    os.flush();
                }
                // The server will close, client sees premature EOF
            }
        });

        // ── 5. Mid-transfer disconnect ──────────────────────────────────
        server.createContext("/disconnect", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "text/plain");
            if (exchange.getRequestMethod().equalsIgnoreCase("HEAD")) {
                exchange.getResponseHeaders().add("Content-Length", "10000");
                exchange.sendResponseHeaders(200, -1);
                exchange.close();
            } else {
                exchange.sendResponseHeaders(200, 10000);
                OutputStream os = exchange.getResponseBody();
                os.write("Partial...".getBytes(StandardCharsets.UTF_8));
                os.flush();
                // Abruptly close — simulates network drop
                exchange.close();
            }
        });

        // ── 6. Timeout (accepts but never sends headers) ────────────────
        server.createContext("/timeout", exchange -> {
            new Thread(() -> {
                try {
                    Thread.sleep(30_000); // Far beyond any reasonable test timeout
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                try {
                    exchange.sendResponseHeaders(200, -1);
                    exchange.close();
                } catch (IOException ignored) {
                    // The client may already have timed out and closed the connection.
                }
            }, "fake-http-timeout").start();
        });

        // ── 6b. Hang on GET (accepts HEAD, hangs on GET) ────────────────
        server.createContext("/hang-on-get", exchange -> {
            if (exchange.getRequestMethod().equalsIgnoreCase("HEAD")) {
                exchange.getResponseHeaders().add("Content-Type", "text/plain");
                exchange.sendResponseHeaders(200, 10000);
                exchange.close();
            } else {
                new Thread(() -> {
                    try {
                        Thread.sleep(30_000);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    try {
                        exchange.sendResponseHeaders(200, -1);
                        exchange.close();
                    } catch (IOException ignored) {}
                }, "fake-http-hang-on-get").start();
            }
        });

        // ── 7. HTTP error codes ─────────────────────────────────────────
        for (int code : new int[]{401, 403, 404, 429, 500, 503}) {
            server.createContext("/error" + code, exchange -> {
                exchange.sendResponseHeaders(code, -1);
                exchange.close();
            });
        }

        // ── 8. Malicious Content-Disposition filenames ──────────────────
        // 8a: path traversal
        server.createContext("/malicious-traversal", exchange -> {
            exchange.getResponseHeaders().add("Content-Disposition",
                    "attachment; filename=\"../../../etc/passwd\"");
            byte[] body = "traversal payload".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/octet-stream");
            if (exchange.getRequestMethod().equalsIgnoreCase("HEAD")) {
                exchange.sendResponseHeaders(200, body.length);
                exchange.close();
            } else {
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(body);
                }
            }
        });

        // 8b: null byte in filename
        server.createContext("/malicious-null", exchange -> {
            exchange.getResponseHeaders().add("Content-Disposition",
                    "attachment; filename=\"safe.txt\u0000.exe\"");
            byte[] body = "null byte payload".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/octet-stream");
            if (exchange.getRequestMethod().equalsIgnoreCase("HEAD")) {
                exchange.sendResponseHeaders(200, body.length);
                exchange.close();
            } else {
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(body);
                }
            }
        });

        // 8c: reserved Windows device name
        server.createContext("/malicious-con", exchange -> {
            exchange.getResponseHeaders().add("Content-Disposition",
                    "attachment; filename=\"CON\"");
            byte[] body = "device name payload".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/octet-stream");
            if (exchange.getRequestMethod().equalsIgnoreCase("HEAD")) {
                exchange.sendResponseHeaders(200, body.length);
                exchange.close();
            } else {
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(body);
                }
            }
        });

        // 8d: overlong filename (260+ chars)
        server.createContext("/malicious-overlong", exchange -> {
            String longName = "A".repeat(300) + ".bin";
            exchange.getResponseHeaders().add("Content-Disposition",
                    "attachment; filename=\"" + longName + "\"");
            byte[] body = "overlong payload".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/octet-stream");
            if (exchange.getRequestMethod().equalsIgnoreCase("HEAD")) {
                exchange.sendResponseHeaders(200, body.length);
                exchange.close();
            } else {
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(body);
                }
            }
        });

        server.setExecutor(null);
        server.start();
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    public int getPort() {
        return port;
    }

    public String getBaseUrl() {
        return "http://127.0.0.1:" + port;
    }
}
