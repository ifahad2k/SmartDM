package io.smartdm.domain;

public record ByteCount(long value) {
    public ByteCount {
        if (value < 0 && value != -1) {
            throw new IllegalArgumentException("ByteCount cannot be negative unless it is -1 (unknown)");
        }
    }
    
    public static ByteCount of(long value) {
        return new ByteCount(value);
    }
    
    public static final ByteCount UNKNOWN = new ByteCount(-1);
    public static final ByteCount ZERO = new ByteCount(0);
}
