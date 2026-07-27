#!/usr/bin/env bash

TARGET_FILE="$HOME/.mozilla/native-messaging-hosts/io.smartdm.host.json"
if [ -f "$TARGET_FILE" ]; then
    rm -f "$TARGET_FILE"
    echo "Removed: $TARGET_FILE"
fi

echo "Firefox Native Messaging Host uninstalled."
