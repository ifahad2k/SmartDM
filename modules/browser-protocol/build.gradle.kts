plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:domain"))
    implementation(libs.jackson.databind)
}
