plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    api(project(":modules:domain"))
    implementation(project(":modules:platform-api"))
    implementation(libs.slf4j.api)
    implementation(libs.logback.classic)
}
