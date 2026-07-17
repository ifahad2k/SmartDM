plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:ai-api"))
    implementation(libs.jackson.databind)
}
