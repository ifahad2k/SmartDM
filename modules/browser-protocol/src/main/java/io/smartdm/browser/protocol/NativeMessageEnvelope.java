package io.smartdm.browser.protocol;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class NativeMessageEnvelope {
    @JsonProperty("protocolVersion")
    private int protocolVersion = 1;
    
    @JsonProperty("requestId")
    private String requestId;
    
    @JsonProperty("pairingToken")
    private String pairingToken;
    
    @JsonProperty("payload")
    private NativeMessage payload;

    public NativeMessageEnvelope() {}

    public NativeMessageEnvelope(int protocolVersion, String requestId, String pairingToken, NativeMessage payload) {
        this.protocolVersion = protocolVersion;
        this.requestId = requestId;
        this.pairingToken = pairingToken;
        this.payload = payload;
    }

    public int getProtocolVersion() { return protocolVersion; }
    public void setProtocolVersion(int protocolVersion) { this.protocolVersion = protocolVersion; }

    public String getRequestId() { return requestId; }
    public void setRequestId(String requestId) { this.requestId = requestId; }

    public String getPairingToken() { return pairingToken; }
    public void setPairingToken(String pairingToken) { this.pairingToken = pairingToken; }

    public NativeMessage getPayload() { return payload; }
    public void setPayload(NativeMessage payload) { this.payload = payload; }
}
