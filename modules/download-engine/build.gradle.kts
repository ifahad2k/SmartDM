plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:domain"))
    implementation(project(":modules:application"))
    implementation(project(":modules:download-http"))
    implementation(libs.slf4j.api)
    implementation(libs.jna)
    implementation(libs.jna.platform)

    testImplementation(libs.bundles.testing)
}
