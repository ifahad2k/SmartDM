plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
    id("java-test-fixtures")
}

dependencies {
    implementation(project(":modules:domain"))
}
