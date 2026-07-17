plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:domain"))
    implementation(libs.jna)
    implementation(libs.jna.platform)
    implementation(libs.bouncycastle)
    implementation(libs.slf4j.api)
}
