package io.smartdm.platform.api.process;

import java.io.IOException;

public interface NativeProcessController {

    NativeProcessSession start(
            NativeProcessRequest request,
            NativeProcessOutputListener outputListener) throws IOException;
}
