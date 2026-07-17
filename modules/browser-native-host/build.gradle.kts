plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:browser-protocol"))
    implementation(project(":modules:application"))
}
