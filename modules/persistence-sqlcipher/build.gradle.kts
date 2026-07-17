plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:persistence-api"))
    implementation(libs.sqlite.jdbc)
    implementation(libs.flyway.core)
}
