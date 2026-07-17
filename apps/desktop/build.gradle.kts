plugins {
    application
    id("smartdm.testing")
}

application {
    mainClass.set("io.smartdm.desktop.SmartDmApp")
}

dependencies {
    implementation(project(":modules:desktop-ui"))
    implementation(project(":modules:application"))
    implementation(project(":modules:domain"))

    // Runtime modules - wired at startup
    runtimeOnly(project(":modules:download-engine"))
    runtimeOnly(project(":modules:download-http"))
    runtimeOnly(project(":modules:persistence-sqlcipher"))
    runtimeOnly(project(":modules:secure-storage"))
    runtimeOnly(project(":modules:file-catalog"))
    runtimeOnly(project(":modules:search-local"))
    runtimeOnly(project(":modules:organization-local"))
    runtimeOnly(project(":modules:ai-gemini"))
    runtimeOnly(project(":modules:safety-rules"))
    runtimeOnly(project(":modules:safety-windows-defender"))
    runtimeOnly(project(":modules:safety-clamav"))
    runtimeOnly(project(":modules:media-ytdlp"))
    runtimeOnly(project(":modules:media-ffmpeg"))
    runtimeOnly(project(":modules:browser-native-host"))
    runtimeOnly(project(":modules:platform-windows"))
    runtimeOnly(project(":modules:platform-linux"))

    // Logging runtime
    runtimeOnly(libs.logback.classic)
}
