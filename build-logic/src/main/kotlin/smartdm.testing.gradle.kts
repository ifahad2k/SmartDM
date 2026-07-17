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
