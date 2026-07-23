package io.smartdm.persistence;

public final class MediaJobPersistenceException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public MediaJobPersistenceException(
            String message,
            Throwable cause) {

        super(message, cause);
    }
}
