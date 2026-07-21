plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
    application
}

application {
    mainClass.set("io.smartdm.browser.host.NativeHostMain")
}

dependencies {
    implementation(project(":modules:browser-protocol"))
    implementation(project(":modules:application"))
    implementation(libs.jackson.databind)
}
