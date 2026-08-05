#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$DIR/../../.." && pwd)"

chmod +x "$DIR/host.sh"

LIB_DIR="$PROJECT_ROOT/modules/browser-native-host/build/install/browser-native-host/lib"
if [ ! -d "$LIB_DIR" ] && [ -f "$PROJECT_ROOT/gradlew" ]; then
    echo "Building browser-native-host distribution..."
    (cd "$PROJECT_ROOT" && ./gradlew :modules:browser-native-host:installDist)
fi

TARGET_DIRS=(
    "$HOME/.config/google-chrome/NativeMessagingHosts"
    "$HOME/.config/chromium/NativeMessagingHosts"
    "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    "$HOME/.config/microsoft-edge/NativeMessagingHosts"
    "$HOME/snap/chromium/common/.config/chromium/NativeMessagingHosts"
    "$HOME/snap/chromium/current/.config/chromium/NativeMessagingHosts"
    "$HOME/snap/google-chrome/common/.config/google-chrome/NativeMessagingHosts"
    "$HOME/.var/app/com.google.Chrome/config/google-chrome/NativeMessagingHosts"
    "$HOME/.var/app/org.chromium.Chromium/config/chromium/NativeMessagingHosts"
)

for TARGET_DIR in "${TARGET_DIRS[@]}"; do
    PARENT_DIR="$(dirname "$TARGET_DIR")"
    if [ -d "$PARENT_DIR" ] || [[ "$TARGET_DIR" == *".config"* ]]; then
        mkdir -p "$TARGET_DIR"
        
        HOST_BUNDLE_DIR="$TARGET_DIR/smartdm-host-bin"
        mkdir -p "$HOST_BUNDLE_DIR/lib"
        cp -f "$DIR/host.sh" "$HOST_BUNDLE_DIR/host.sh"
        chmod +x "$HOST_BUNDLE_DIR/host.sh"
        if [ -d "$LIB_DIR" ]; then
            cp -rf "$LIB_DIR/"* "$HOST_BUNDLE_DIR/lib/"
        fi

        TEMP_JSON="/tmp/smartdm_chrome_host.json"
        cat <<EOF > "$TEMP_JSON"
{
  "name": "io.smartdm.host",
  "description": "SmartDM Native Messaging Host",
  "path": "$HOST_BUNDLE_DIR/host.sh",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://lkbiimagmeaefiedjigomffpophipmck/"
  ]
}
EOF
        cp "$TEMP_JSON" "$TARGET_DIR/io.smartdm.host.json"
        rm -f "$TEMP_JSON"
        echo "Installed Chrome Native Messaging Host manifest to: $TARGET_DIR/io.smartdm.host.json"
    fi
done

echo "Chrome Native Messaging Host installation complete!"
