plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    api(project(":modules:domain"))
    implementation(project(":modules:platform-api"))
    api(project(":modules:browser-protocol"))
    implementation(libs.jackson.databind)
    implementation(libs.slf4j.api)
    implementation(libs.logback.classic)
}
