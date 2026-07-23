package io.smartdm.platform.api.process;

import java.util.concurrent.CompletionStage;

public interface NativeProcessSession {

    long pid();

    boolean isAlive();

    CompletionStage<NativeProcessResult> completion();

    CompletionStage<Void> terminate();

    CompletionStage<Void> killTree();
}
