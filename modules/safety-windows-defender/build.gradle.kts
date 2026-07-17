plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:safety-api"))
    implementation(project(":modules:platform-api"))
}
