#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$DIR/../../.." && pwd)"
LIB_DIR="$PROJECT_ROOT/modules/browser-native-host/build/install/browser-native-host/lib"

if [ ! -d "$LIB_DIR" ]; then
    LIB_DIR="$DIR/lib"
fi

exec java -cp "$LIB_DIR/*" io.smartdm.browser.host.NativeHostMain "$@"
