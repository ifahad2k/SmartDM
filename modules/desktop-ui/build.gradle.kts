plugins {
    id("smartdm.javafx-app")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:application"))
    implementation(project(":modules:domain"))
    
    testImplementation(libs.bundles.testing)
    uiTestImplementation(libs.bundles.testing)
    uiTestImplementation(libs.bundles.testfx)
}
