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

TEMP_JSON="/tmp/smartdm_chrome_host.json"

cat <<EOF > "$TEMP_JSON"
{
  "name": "io.smartdm.host",
  "description": "SmartDM Native Messaging Host",
  "path": "$DIR/host.sh",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://lkbiimagmeaefiedjigomffpophipmck/"
  ]
}
EOF

TARGET_DIRS=(
    "$HOME/.config/google-chrome/NativeMessagingHosts"
    "$HOME/.config/chromium/NativeMessagingHosts"
    "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    "$HOME/.config/microsoft-edge/NativeMessagingHosts"
)

for TARGET_DIR in "${TARGET_DIRS[@]}"; do
    mkdir -p "$TARGET_DIR"
    cp "$TEMP_JSON" "$TARGET_DIR/io.smartdm.host.json"
    echo "Installed Chrome Native Messaging Host manifest to: $TARGET_DIR/io.smartdm.host.json"
done

rm -f "$TEMP_JSON"
echo "Chrome Native Messaging Host installation complete!"
