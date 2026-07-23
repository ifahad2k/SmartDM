package io.smartdm.media.api;

public final class MediaOperationException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String code;

    public MediaOperationException(
            String code,
            String message) {

        super(message);
        this.code = code;
    }

    public MediaOperationException(
            String code,
            String message,
            Throwable cause) {

        super(message, cause);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
