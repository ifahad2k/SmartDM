plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    implementation(project(":modules:domain"))
    implementation(project(":modules:application"))
    implementation(project(":modules:download-http"))
    implementation(libs.slf4j.api)
    implementation(libs.jna)
    implementation(libs.jna.platform)
    implementation(libs.jackson.databind)

    testImplementation(libs.bundles.testing)
}

tasks.test {
    testLogging {
        showStandardStreams = true
    }
}

tasks.register<JavaExec>("runEngineDaemon") {
    mainClass.set("io.smartdm.download.engine.ipc.EngineDaemonMain")
    classpath = sourceSets["main"].runtimeClasspath
}
