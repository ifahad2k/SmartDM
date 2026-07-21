package io.smartdm.browser.protocol;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = PingRequest.class, name = "PING"),
    @JsonSubTypes.Type(value = GetCapabilitiesRequest.class, name = "GET_CAPABILITIES"),
    @JsonSubTypes.Type(value = AddDownloadRequest.class, name = "ADD_DOWNLOAD"),
    @JsonSubTypes.Type(value = AddBatchRequest.class, name = "ADD_BATCH"),
    @JsonSubTypes.Type(value = ListPageLinksRequest.class, name = "LIST_PAGE_LINKS"),
    @JsonSubTypes.Type(value = GetMediaFormatsRequest.class, name = "GET_MEDIA_FORMATS"),
    @JsonSubTypes.Type(value = StartMediaDownloadRequest.class, name = "START_MEDIA_DOWNLOAD"),
    @JsonSubTypes.Type(value = RefreshSourceRequest.class, name = "REFRESH_SOURCE")
})
public interface NativeMessage {
}
