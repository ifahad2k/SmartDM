plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    api(project(":modules:domain"))
}
