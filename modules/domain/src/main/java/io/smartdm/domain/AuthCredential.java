package io.smartdm.domain;

import java.util.Objects;

public class AuthCredential {
    private final String host;
    private final String realm; // Optional
    private final String username;
    private final String password;

    public AuthCredential(String host, String realm, String username, String password) {
        this.host = Objects.requireNonNull(host);
        this.realm = realm;
        this.username = Objects.requireNonNull(username);
        this.password = Objects.requireNonNull(password);
    }

    public String host() {
        return host;
    }

    public String realm() {
        return realm;
    }

    public String username() {
        return username;
    }

    public String password() {
        return password;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AuthCredential)) return false;
        AuthCredential that = (AuthCredential) o;
        return host.equals(that.host) && 
               Objects.equals(realm, that.realm) && 
               username.equals(that.username);
    }

    @Override
    public int hashCode() {
        return Objects.hash(host, realm, username);
    }
    
    // Passwords are deliberately excluded from toString to prevent log leaks
    @Override
    public String toString() {
        return "AuthCredential{" +
               "host='" + host + '\'' +
               ", realm='" + realm + '\'' +
               ", username='" + username + '\'' +
               '}';
    }
}
