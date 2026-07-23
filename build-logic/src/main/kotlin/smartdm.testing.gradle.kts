import org.gradle.api.tasks.testing.logging.TestExceptionFormat
import org.gradle.api.tasks.testing.logging.TestLogEvent
import org.gradle.api.tasks.SourceSetContainer

plugins {
    id("smartdm.java-library")
}

val sourceSets = extensions.getByType<SourceSetContainer>()

// Integration test source set
val integrationTest by sourceSets.creating {
    compileClasspath += sourceSets.getByName("main").output
    runtimeClasspath += sourceSets.getByName("main").output
}

val integrationTestImplementation by configurations.getting {
    extendsFrom(configurations.getByName("testImplementation"))
}
val integrationTestRuntimeOnly by configurations.getting {
    extendsFrom(configurations.getByName("testRuntimeOnly"))
}

val integrationTestTask = tasks.register<Test>("integrationTest") {
    description = "Runs integration tests."
    group = "verification"

    testClassesDirs = integrationTest.output.classesDirs
    classpath = integrationTest.runtimeClasspath

    useJUnitPlatform()
    shouldRunAfter(tasks.named("test"))

    testLogging {
        events(TestLogEvent.PASSED, TestLogEvent.FAILED, TestLogEvent.SKIPPED)
        exceptionFormat = TestExceptionFormat.FULL
        showStandardStreams = true
    }

    jvmArgs("-Xmx512m")
}

// Architecture test source set
val architectureTest by sourceSets.creating {
    compileClasspath += sourceSets.getByName("main").output
    runtimeClasspath += sourceSets.getByName("main").output
}

val architectureTestImplementation by configurations.getting {
    extendsFrom(configurations.getByName("testImplementation"))
}
val architectureTestRuntimeOnly by configurations.getting {
    extendsFrom(configurations.getByName("testRuntimeOnly"))
}

val architectureTestTask = tasks.register<Test>("architectureTest") {
    description = "Runs architecture tests."
    group = "verification"

    testClassesDirs = architectureTest.output.classesDirs
    classpath = architectureTest.runtimeClasspath

    useJUnitPlatform()
    shouldRunAfter(tasks.named("test"))

    testLogging {
        events(TestLogEvent.PASSED, TestLogEvent.FAILED, TestLogEvent.SKIPPED)
        exceptionFormat = TestExceptionFormat.FULL
        showStandardStreams = true
    }

    jvmArgs("-Xmx512m")
}

tasks.named("check") {
    dependsOn(integrationTestTask)
    dependsOn(architectureTestTask)
}

dependencies {
    "architectureTestImplementation"("com.tngtech.archunit:archunit-junit5:1.3.0")
}

// UI test source set
val uiTest by sourceSets.creating {
    compileClasspath += sourceSets.getByName("main").output
    runtimeClasspath += sourceSets.getByName("main").output
}

val uiTestImplementation by configurations.getting {
    extendsFrom(configurations.getByName("testImplementation"))
}
val uiTestRuntimeOnly by configurations.getting {
    extendsFrom(configurations.getByName("testRuntimeOnly"))
}

val uiTestTask = tasks.register<Test>("uiTest") {
    description = "Runs UI tests."
    group = "verification"

    testClassesDirs = uiTest.output.classesDirs
    classpath = uiTest.runtimeClasspath

    useJUnitPlatform()
    shouldRunAfter(tasks.named("test"))

    testLogging {
        events(TestLogEvent.PASSED, TestLogEvent.FAILED, TestLogEvent.SKIPPED)
        exceptionFormat = TestExceptionFormat.FULL
        showStandardStreams = true
    }

    // Required for TestFX in headless/CI environments and Java 21 module exports
    jvmArgs(
        "-Xmx512m",
        "--add-exports", "javafx.graphics/com.sun.javafx.application=ALL-UNNAMED",
        "--add-exports", "javafx.graphics/com.sun.glass.ui=ALL-UNNAMED"
    )
}

// Removed uiTestTask from check to allow it to be run separately (e.g. via xvfb)
