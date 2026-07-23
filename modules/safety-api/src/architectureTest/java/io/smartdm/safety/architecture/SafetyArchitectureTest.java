package io.smartdm.safety.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition;
import org.junit.jupiter.api.Test;

class SafetyArchitectureTest {

    @Test
    void safetyVerdictBoundaries() {
        JavaClasses importedClasses = new ClassFileImporter().importPackages("io.smartdm.safety");
        
        ArchRuleDefinition.noClasses()
                .that().resideInAPackage("io.smartdm.safety..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "io.smartdm.desktop..",
                        "io.smartdm.media..",
                        "javafx.."
                )
                .because("Safety component must not depend on UI or Media libraries.")
                .check(importedClasses);
    }
}
