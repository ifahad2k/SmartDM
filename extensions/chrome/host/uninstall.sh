#!/usr/bin/env bash

TARGET_DIRS=(
    "$HOME/.config/google-chrome/NativeMessagingHosts"
    "$HOME/.config/chromium/NativeMessagingHosts"
    "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    "$HOME/.config/microsoft-edge/NativeMessagingHosts"
)

for TARGET_DIR in "${TARGET_DIRS[@]}"; do
    if [ -f "$TARGET_DIR/io.smartdm.host.json" ]; then
        rm -f "$TARGET_DIR/io.smartdm.host.json"
        echo "Removed: $TARGET_DIR/io.smartdm.host.json"
    fi
done

echo "Chrome Native Messaging Host uninstalled."
