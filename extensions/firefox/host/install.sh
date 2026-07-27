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
    "$HOME/.mozilla/native-messaging-hosts"
    "$HOME/snap/firefox/common/.mozilla/native-messaging-hosts"
    "$HOME/snap/firefox/current/.mozilla/native-messaging-hosts"
    "$HOME/.var/app/org.mozilla.firefox/.mozilla/native-messaging-hosts"
)

for TARGET_DIR in "${TARGET_DIRS[@]}"; do
    PARENT_DIR="$(dirname "$TARGET_DIR")"
    if [ -d "$PARENT_DIR" ] || [ "$TARGET_DIR" = "$HOME/.mozilla/native-messaging-hosts" ]; then
        mkdir -p "$TARGET_DIR"
        
        # Copy host binaries and runner directly into target directory so Snap sandbox can access it
        HOST_BUNDLE_DIR="$TARGET_DIR/smartdm-host-bin"
        mkdir -p "$HOST_BUNDLE_DIR/lib"
        cp -f "$DIR/host.sh" "$HOST_BUNDLE_DIR/host.sh"
        chmod +x "$HOST_BUNDLE_DIR/host.sh"
        if [ -d "$LIB_DIR" ]; then
            cp -rf "$LIB_DIR/"* "$HOST_BUNDLE_DIR/lib/"
        fi

        TEMP_JSON="/tmp/smartdm_firefox_host.json"
        cat <<EOF > "$TEMP_JSON"
{
  "name": "io.smartdm.host",
  "description": "SmartDM Native Messaging Host",
  "path": "$HOST_BUNDLE_DIR/host.sh",
  "type": "stdio",
  "allowed_extensions": [
    "integration@smartdm.io"
  ]
}
EOF
        cp "$TEMP_JSON" "$TARGET_DIR/io.smartdm.host.json"
        rm -f "$TEMP_JSON"
        echo "Installed Firefox Native Messaging Host manifest to: $TARGET_DIR/io.smartdm.host.json"
    fi
done

echo "Firefox Native Messaging Host installation complete!"
