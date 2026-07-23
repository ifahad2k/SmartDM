package io.smartdm.platform.api.process;

import java.io.IOException;

public interface NativeProcessController {
    /**
     * Start a native process and return a handle to it.
     */
    NativeProcessHandle start(NativeProcessRequest request) throws IOException;
}
