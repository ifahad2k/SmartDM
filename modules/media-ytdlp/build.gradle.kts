plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:media-api"))
    implementation(libs.jackson.databind)
}
