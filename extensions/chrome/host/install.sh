#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$DIR/host.sh"
# Keep the wrapper beside the app; never build or invoke the Java product.
for TARGET in "$HOME/.config/google-chrome/NativeMessagingHosts" "$HOME/.config/chromium/NativeMessagingHosts" "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts" "$HOME/.config/microsoft-edge/NativeMessagingHosts"; do
  mkdir -p "$TARGET"
  TEMP="$(mktemp "$TARGET/.smartdm.XXXXXX")"
  trap 'rm -f "$TEMP"' EXIT
  python3 - "$DIR/host.sh" > "$TEMP" <<'PY'
import json,sys
manifest={"name":"io.smartdm.host","description":"SmartDM 2.0 C# native host","path":sys.argv[1],"type":"stdio","allowed_origins": ["chrome-extension://knldjnnmkkebefogdbmggjijknmjeaoh/", "chrome-extension://lkbiimagmeaefiedjigomffpophipmck/"]}
print(json.dumps(manifest))
PY
  chmod 600 "$TEMP"
  mv -f "$TEMP" "$TARGET/io.smartdm.host.json"
done
