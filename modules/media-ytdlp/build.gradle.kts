plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:domain"))
    implementation(project(":modules:media-api"))
    implementation(project(":modules:platform-api"))
    implementation(libs.jackson.databind)
}
