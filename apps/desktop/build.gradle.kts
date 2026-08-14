plugins {
    id("smartdm.javafx-app")
    id("smartdm.testing")
}

application {
    mainClass.set("io.smartdm.desktop.Launcher")
    applicationDefaultJvmArgs = listOf(
        "-Xms32m",
        "-Xmx256m",
        "-XX:+UseG1GC",
        "-XX:G1HeapRegionSize=1m",
        "-XX:MaxGCPauseMillis=50",
        "-XX:+UseStringDeduplication"
    )
}

dependencies {
    implementation(project(":modules:desktop-ui"))
    implementation(project(":modules:application"))
    implementation(project(":modules:domain"))
    implementation(project(":modules:platform-api"))
    implementation(project(":modules:persistence-api"))
    implementation(project(":modules:browser-protocol"))

    // Runtime modules - wired at startup
    implementation(project(":modules:download-engine"))
    implementation(project(":modules:download-http"))
    implementation(project(":modules:persistence-sqlcipher"))
    implementation(project(":modules:secure-storage"))
    implementation(project(":modules:file-catalog"))
    implementation(project(":modules:search-local"))
    implementation(project(":modules:organization-local"))
    implementation(project(":modules:ai-api"))
    implementation(project(":modules:ai-gemini"))
    implementation(project(":modules:safety-api"))
    implementation(project(":modules:safety-rules"))
    implementation(project(":modules:safety-windows-defender"))
    implementation(project(":modules:safety-clamav"))
    implementation(project(":modules:media-api"))
    implementation(project(":modules:media-ytdlp"))
    runtimeOnly(project(":modules:media-ffmpeg"))
    runtimeOnly(project(":modules:browser-native-host"))
    implementation(project(":modules:platform-windows"))
    implementation(project(":modules:platform-linux"))

    // Logging runtime
    implementation(libs.slf4j.api)
    runtimeOnly(libs.logback.classic)
}
