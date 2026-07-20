package io.smartdm.download.http;

public class UnauthorizedException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    private final String realm;

    public UnauthorizedException(String realm) {
        super("HTTP 401 Unauthorized" + (realm != null ? " for realm: " + realm : ""));
        this.realm = realm;
    }

    public String getRealm() {
        return realm;
    }
}
