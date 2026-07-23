package io.smartdm.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition;
import org.junit.jupiter.api.Test;

class ModuleBoundaryTest {
    @Test
    void domainModuleShouldNotDependOnInfrastructure() {
        JavaClasses importedClasses = new ClassFileImporter().importPackages("io.smartdm");

        ArchRuleDefinition.noClasses()
                .that().resideInAPackage("io.smartdm.domain..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "io.smartdm.infrastructure..",
                        "io.smartdm.securestorage..",
                        "io.smartdm.ui.."
                )
                .because("Domain must be independent of infrastructure and UI concerns.")
                .check(importedClasses);
    }
}
