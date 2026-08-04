plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:safety-api"))
    implementation(libs.jackson.databind)
    implementation(libs.slf4j.api)
}
