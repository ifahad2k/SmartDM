plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:domain"))
    implementation(libs.jna)
    implementation(libs.jna.platform)
}
