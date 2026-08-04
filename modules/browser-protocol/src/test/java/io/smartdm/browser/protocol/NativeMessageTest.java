package io.smartdm.browser.protocol;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class NativeMessageTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void parseAddDownloadRequest() throws Exception {
        String json = """
        {
            "type": "ADD_DOWNLOAD",
            "url": "https://example.com/file.zip",
            "fileName": "file.zip",
            "referer": "https://example.com",
            "userAgent": "TestUA",
            "cookies": "session=123"
        }
        """;

        NativeMessage message = mapper.readValue(json, NativeMessage.class);
        
        assertInstanceOf(AddDownloadRequest.class, message);
        AddDownloadRequest req = (AddDownloadRequest) message;
        
        assertEquals("https://example.com/file.zip", req.url());
        assertEquals("file.zip", req.fileName());
        assertEquals("https://example.com", req.referer());
        assertEquals("TestUA", req.userAgent());
        assertEquals("session=123", req.cookies());
    }
}
