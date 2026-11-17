#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
for APP in "$ROOT/SmartDm.Desktop.Avalonia" "$ROOT/apps/desktop-avalonia/bin/Debug/net9.0/SmartDm.Desktop.Avalonia" "$ROOT/apps/desktop-avalonia/bin/Release/net9.0/SmartDm.Desktop.Avalonia"; do
  if [ -x "$APP" ]; then exec "$APP" --browser-native-host "$@"; fi
done
printf '%s\n' 'Build or install SmartDM 2.0 before registering the native host.' >&2
exit 1
