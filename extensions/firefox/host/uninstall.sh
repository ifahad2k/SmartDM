#!/usr/bin/env bash

TARGET_DIRS=(
    "$HOME/.mozilla/native-messaging-hosts"
)

for TARGET_DIR in "${TARGET_DIRS[@]}"; do
    if [ -f "$TARGET_DIR/io.smartdm.host.json" ]; then
        rm -f "$TARGET_DIR/io.smartdm.host.json"
        echo "Removed: $TARGET_DIR/io.smartdm.host.json"
    fi
done

echo "Firefox Native Messaging Host uninstalled."
