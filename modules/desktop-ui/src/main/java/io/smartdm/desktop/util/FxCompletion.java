package io.smartdm.desktop.util;

import javafx.application.Platform;

import java.util.Objects;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.function.Consumer;

public final class FxCompletion {

    private FxCompletion() {}

    public static <T> void observe(
            CompletionStage<T> stage,
            Consumer<T> onSuccess,
            Consumer<Throwable> onFailure) {

        Objects.requireNonNull(stage);
        Objects.requireNonNull(onSuccess);
        Objects.requireNonNull(onFailure);

        stage.whenComplete((value, failure) ->
                Platform.runLater(() -> {
                    if (failure == null) {
                        onSuccess.accept(value);
                    } else {
                        onFailure.accept(unwrap(failure));
                    }
                }));
    }

    private static Throwable unwrap(Throwable failure) {
        Throwable current = failure;

        while ((current instanceof CompletionException
                || current instanceof ExecutionException)
                && current.getCause() != null) {

            current = current.getCause();
        }

        return current;
    }
}
