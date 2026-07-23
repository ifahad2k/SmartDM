package io.smartdm.platform.api.process;

public interface NativeProcessOutputListener {

    default void onStdoutLine(String line) {}

    default void onStderrLine(String line) {}
}
