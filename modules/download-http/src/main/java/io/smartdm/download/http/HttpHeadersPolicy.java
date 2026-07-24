package io.smartdm.download.http;

import java.util.Set;

public class HttpHeadersPolicy {
    public static final Set<String> ALLOWED_USER_HEADERS = Set.of(
        "Accept", "Accept-Language", "User-Agent", "Cache-Control"
    );
}
