pluginManagement {
    includeBuild("build-logic")
}

plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "0.8.0"
}

rootProject.name = "smartdm"

dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}

// Application
include("apps:desktop")

// Core modules
include("modules:domain")
include("modules:application")

// Download engine
include("modules:download-engine")
include("modules:download-http")

// Persistence
include("modules:persistence-api")
include("modules:persistence-sqlcipher")
include("modules:secure-storage")

// File management
include("modules:file-catalog")
include("modules:search-local")
include("modules:organization-local")

// AI
include("modules:ai-api")
include("modules:ai-gemini")

// Safety
include("modules:safety-api")
include("modules:safety-rules")
include("modules:safety-windows-defender")
include("modules:safety-clamav")

// Media
include("modules:media-api")
include("modules:media-ytdlp")
include("modules:media-ffmpeg")

// Browser integration
include("modules:browser-protocol")
include("modules:browser-native-host")

// Platform
include("modules:platform-api")
include("modules:platform-windows")
include("modules:platform-linux")

// UI
include("modules:desktop-ui")

// Test tools
include("tools:test-http-server")
include("tools:test-media-fixtures")
include("tools:catalog-benchmark")
