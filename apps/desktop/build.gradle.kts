plugins {
    id("smartdm.javafx-app")
    id("smartdm.testing")
}

application {
    mainClass.set("io.smartdm.desktop.SmartDmApp")
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
    runtimeOnly(project(":modules:file-catalog"))
    runtimeOnly(project(":modules:search-local"))
    runtimeOnly(project(":modules:organization-local"))
    runtimeOnly(project(":modules:ai-gemini"))
    runtimeOnly(project(":modules:safety-rules"))
    runtimeOnly(project(":modules:safety-windows-defender"))
    runtimeOnly(project(":modules:safety-clamav"))
    implementation(project(":modules:media-api"))
    implementation(project(":modules:media-ytdlp"))
    runtimeOnly(project(":modules:media-ffmpeg"))
    runtimeOnly(project(":modules:browser-native-host"))
    implementation(project(":modules:platform-windows"))
    implementation(project(":modules:platform-linux"))

    // Logging runtime
    runtimeOnly(libs.logback.classic)
}
