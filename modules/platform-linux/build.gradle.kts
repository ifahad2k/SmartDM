plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:platform-api"))
    testImplementation(testFixtures(project(":modules:platform-api")))
}
