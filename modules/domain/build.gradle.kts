plugins {
    id("smartdm.java-library")
    id("smartdm.testing")
}

dependencies {
    architectureTestImplementation(project(":modules:desktop-ui"))
    architectureTestImplementation(project(":modules:ai-gemini"))
    architectureTestImplementation(project(":modules:safety-api"))
    architectureTestImplementation(project(":modules:browser-protocol"))
    architectureTestImplementation(project(":modules:media-api"))
    architectureTestImplementation(project(":modules:file-catalog"))
}
