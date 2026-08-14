package io.smartdm.download.http;

import io.smartdm.domain.AuthCredential;
import io.smartdm.domain.SourceUri;

import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Utility factory for constructing standardized HTTP requests.
 */
public class HttpRequestFactory {

    public static final String DEFAULT_USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    private HttpRequestFactory() {
        // Utility class
    }

    /**
     * Creates a pre-configured {@link HttpRequest.Builder} populated with standard headers,
     * site-specific Referer headers, user agent, basic authorization, and cookies.
     *
     * @param uri the target source URI
     * @param credential optional authentication credentials
     * @return configured HttpRequest.Builder
     */
    public static HttpRequest.Builder createBuilder(SourceUri uri, AuthCredential credential) {
        String userAgent = (credential != null && credential.userAgent() != null && !credential.userAgent().isEmpty())
                ? credential.userAgent()
                : DEFAULT_USER_AGENT;

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(uri.value())
                .header("User-Agent", userAgent)
                .header("Accept", "*/*")
                .header("Accept-Language", "en-US,en;q=0.9")
                .header("Sec-Fetch-Dest", "document")
                .header("Sec-Fetch-Mode", "navigate")
                .header("Sec-Fetch-Site", "same-origin")
                .header("Accept-Encoding", "identity");

        String urlStr = uri.value().toString().toLowerCase();
        if (urlStr.contains("tiktok.com") || urlStr.contains("tiktokcdn.com")) {
            builder.header("Referer", "https://www.tiktok.com/");
        } else if (urlStr.contains("facebook.com") || urlStr.contains("fbcdn.net")) {
            builder.header("Referer", "https://www.facebook.com/");
        } else if (urlStr.contains("instagram.com") || urlStr.contains("cdninstagram.com")) {
            builder.header("Referer", "https://www.instagram.com/");
        } else if (uri.value().getHost() != null) {
            builder.header("Referer", uri.value().getScheme() + "://" + uri.value().getHost() + "/");
        }

        if (credential != null) {
            if (credential.username() != null && !credential.username().isEmpty()) {
                String basicAuth = Base64.getEncoder().encodeToString(
                        (credential.username() + ":" + credential.password()).getBytes(StandardCharsets.UTF_8));
                builder.header("Authorization", "Basic " + basicAuth);
            }
            if (credential.cookies() != null && !credential.cookies().isEmpty()) {
                String host = uri.value().getHost();
                boolean isCdnUrl = host != null && (host.contains("githubusercontent.com") || host.contains("amazonaws.com") || host.contains("cloudfront.net"));
                if (!isCdnUrl) {
                    String cookieHeader = HttpProbeClient.parseNetscapeCookies(credential.cookies());
                    if (!cookieHeader.isEmpty()) {
                        builder.header("Cookie", cookieHeader);
                    }
                }
            }
        }

        return builder;
    }
}
