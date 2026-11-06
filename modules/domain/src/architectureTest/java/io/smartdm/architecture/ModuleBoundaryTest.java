package io.smartdm.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ModuleBoundaryTest {

    @Test
    void domainModuleShouldNotDependOnInfrastructureOrExternalFrameworks() {
        JavaClasses domainClasses = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("io.smartdm.domain");

        ArchRule rule = noClasses().that().resideInAPackage("io.smartdm.domain..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "javafx..",
                        "java.sql..",
                        "javax.sql..",
                        "java.net.http..",
                        "com.fasterxml.jackson..",
                        "org.sqlite..",
                        "io.smartdm.persistence..",
                        "io.smartdm.download..",
                        "io.smartdm.desktop.."
                );

        rule.check(domainClasses);
    }

    @Test
    void architectureEnforcementMustFailWhenForbiddenDependencyExists() {
        // Negative test: verify that a class with a forbidden dependency triggers an AssertionError
        JavaClasses sampleViolatingClasses = new ClassFileImporter()
                .importClasses(ForbiddenSampleClass.class);

        ArchRule rule = noClasses().should().dependOnClassesThat().resideInAnyPackage(
                "java.net.http.."
        );

        assertThrows(AssertionError.class, () -> rule.check(sampleViolatingClasses),
                "Architecture boundary check must actively fail when a class depends on forbidden package java.net.http");
    }

    static class ForbiddenSampleClass {
        @SuppressWarnings("unused")
        private java.net.http.HttpClient httpClient;
    }
}
