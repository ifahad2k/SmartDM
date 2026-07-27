#!/usr/bin/env bash
exec 2>> /tmp/smartdm_host.log
echo "--- Firefox Native Host Launched at $(date) ---" >> /tmp/smartdm_host.log
echo "PATH=$PATH" >> /tmp/smartdm_host.log

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$DIR/../../.." && pwd)"
LIB_DIR="$PROJECT_ROOT/modules/browser-native-host/build/install/browser-native-host/lib"

if [ ! -d "$LIB_DIR" ]; then
    LIB_DIR="$DIR/lib"
fi

JAVA_BIN="java"
if command -v java >/dev/null 2>&1; then
    JAVA_BIN="java"
elif [ -f "/usr/bin/java" ]; then
    JAVA_BIN="/usr/bin/java"
elif [ -f "/usr/local/bin/java" ]; then
    JAVA_BIN="/usr/local/bin/java"
elif [ -n "$JAVA_HOME" ] && [ -f "$JAVA_HOME/bin/java" ]; then
    JAVA_BIN="$JAVA_HOME/bin/java"
fi

echo "Using JAVA_BIN=$JAVA_BIN, LIB_DIR=$LIB_DIR" >> /tmp/smartdm_host.log

exec "$JAVA_BIN" -cp "$LIB_DIR/*" io.smartdm.browser.host.NativeHostMain "$@"
