plugins {
    id("smartdm.javafx-app")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:application"))
    implementation(project(":modules:domain"))
    implementation(project(":modules:download-http"))
    implementation(project(":modules:media-api"))
    implementation(project(":modules:media-ytdlp"))
    implementation(project(":modules:media-ffmpeg"))
    
    testImplementation(libs.bundles.testing)
    uiTestImplementation(libs.bundles.testing)
    uiTestImplementation(libs.bundles.testfx)
}
