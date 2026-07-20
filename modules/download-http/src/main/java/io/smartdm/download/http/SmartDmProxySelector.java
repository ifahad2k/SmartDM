package io.smartdm.download.http;

import io.smartdm.domain.ProxyConfig;
import java.io.IOException;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

public class SmartDmProxySelector extends ProxySelector {
    
    private final ProxySelector defaultSelector;
    private final AtomicReference<ProxyConfig> currentConfig = new AtomicReference<>(ProxyConfig.system());
    
    public SmartDmProxySelector() {
        this.defaultSelector = ProxySelector.getDefault();
    }
    
    public void setConfig(ProxyConfig config) {
        if (config != null) {
            currentConfig.set(config);
        }
    }
    
    @Override
    public List<Proxy> select(URI uri) {
        ProxyConfig config = currentConfig.get();
        if (config.type() == ProxyConfig.Type.NONE) {
            return Collections.singletonList(Proxy.NO_PROXY);
        } else if (config.type() == ProxyConfig.Type.HTTP) {
            return Collections.singletonList(new Proxy(Proxy.Type.HTTP, new java.net.InetSocketAddress(config.host(), config.port())));
        } else if (config.type() == ProxyConfig.Type.SOCKS) {
            return Collections.singletonList(new Proxy(Proxy.Type.SOCKS, new java.net.InetSocketAddress(config.host(), config.port())));
        }
        
        // Fallback to SYSTEM
        if (defaultSelector != null) {
            return defaultSelector.select(uri);
        }
        return Collections.singletonList(Proxy.NO_PROXY);
    }
    
    @Override
    public void connectFailed(URI uri, SocketAddress sa, IOException ioe) {
        if (defaultSelector != null && currentConfig.get().type() == ProxyConfig.Type.SYSTEM) {
            defaultSelector.connectFailed(uri, sa, ioe);
        }
    }
}
