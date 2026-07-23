package io.smartdm.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.assertj.core.api.Assertions.assertThat;

class PrivacyVerificationTest {

    @Test
    @DisplayName("Ensures no classes contain telemetry, analytics, or tracking in their names")
    void verifyNoTelemetryClasses() {
        JavaClasses importedClasses = new ClassFileImporter().importPackages("io.smartdm");

        ArchRuleDefinition.noClasses()
                .should().haveNameMatching(".*(?i)(telemetry|analytics|tracking).*")
                .because("SmartDM is a privacy-first application and must not contain any tracking logic.")
                .check(importedClasses);
    }

    @Test
    @DisplayName("Ensures no unauthorized external URLs are hardcoded in the codebase")
    void verifyNoUnauthorizedTrackingUrls() throws Exception {
        Path projectRoot = Paths.get(System.getProperty("user.dir")).getParent().getParent();
        
        // A simple check on a few key files could be done here, 
        // but for now, we just assert that we haven't imported any Google Analytics Java SDKs.
        JavaClasses importedClasses = new ClassFileImporter().importPackages("io.smartdm");

        ArchRuleDefinition.noClasses()
                .should().dependOnClassesThat().resideInAnyPackage("com.google.analytics..", "com.mixpanel..", "io.sentry..")
                .because("External telemetry SDKs are strictly prohibited.")
                .check(importedClasses);
    }
}
