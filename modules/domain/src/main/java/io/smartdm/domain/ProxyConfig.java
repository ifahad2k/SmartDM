package io.smartdm.domain;

import java.util.Objects;

public class ProxyConfig {
    
    public enum Type {
        SYSTEM,
        HTTP,
        SOCKS,
        NONE
    }
    
    private final Type type;
    private final String host;
    private final int port;
    private final AuthCredential credential;
    
    public ProxyConfig(Type type, String host, int port, AuthCredential credential) {
        this.type = Objects.requireNonNull(type);
        this.host = host;
        this.port = port;
        this.credential = credential;
    }
    
    public static ProxyConfig system() {
        return new ProxyConfig(Type.SYSTEM, null, 0, null);
    }
    
    public static ProxyConfig none() {
        return new ProxyConfig(Type.NONE, null, 0, null);
    }
    
    public static ProxyConfig http(String host, int port, AuthCredential credential) {
        return new ProxyConfig(Type.HTTP, host, port, credential);
    }
    
    public static ProxyConfig socks(String host, int port, AuthCredential credential) {
        return new ProxyConfig(Type.SOCKS, host, port, credential);
    }
    
    public Type type() { return type; }
    public String host() { return host; }
    public int port() { return port; }
    public AuthCredential credential() { return credential; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ProxyConfig)) return false;
        ProxyConfig that = (ProxyConfig) o;
        return port == that.port && 
               type == that.type && 
               Objects.equals(host, that.host) && 
               Objects.equals(credential, that.credential);
    }

    @Override
    public int hashCode() {
        return Objects.hash(type, host, port, credential);
    }
}
