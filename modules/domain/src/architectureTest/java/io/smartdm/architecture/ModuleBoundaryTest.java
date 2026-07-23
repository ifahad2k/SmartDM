package io.smartdm.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class ModuleBoundaryTest {

    private void assertContainsPackage(JavaClasses classes, String packageName) {
        boolean hasClasses = classes.stream().anyMatch(c -> c.getPackageName().startsWith(packageName));
        assertThat(hasClasses).as("Classes must exist in package " + packageName).isTrue();
    }

    @Test
    void domainModuleShouldNotDependOnInfrastructure() {
        JavaClasses importedClasses = new ClassFileImporter().importPackages("io.smartdm");

        ArchRuleDefinition.noClasses()
                .that().resideInAPackage("io.smartdm.domain..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "io.smartdm.infrastructure..",
                        "io.smartdm.securestorage..",
                        "io.smartdm.desktop..",
                        "io.smartdm.catalog..",
                        "io.smartdm.media..",
                        "io.smartdm.ai..",
                        "javafx..",
                        "java.sql..",
                        "javax.sql..",
                        "java.net.http..",
                        "com.fasterxml.jackson..",
                        "java.io.File..",
                        "java.io.FileInputStream..",
                        "java.io.FileOutputStream..",
                        "java.io.FileReader..",
                        "java.io.FileWriter..",
                        "java.io.RandomAccessFile..",
                        "java.nio.file.."
                )
                .because("Domain must be completely decoupled from UI, AI SDKs, Media tools, Jackson, JDBC, JavaFX, and File IO.")
                .check(importedClasses);
    }
    
    @Test
    void uiShouldNotDependOnJDBCProcessBuilder() {
        JavaClasses importedClasses = new ClassFileImporter().importPackages("io.smartdm");
        assertContainsPackage(importedClasses, "io.smartdm.desktop");
        
        ArchRuleDefinition.noClasses()
                .that().resideInAPackage("io.smartdm.desktop..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "java.sql..",
                        "javax.sql.."
                )
                .orShould().dependOnClassesThat().haveFullyQualifiedName("java.lang.ProcessBuilder")
                .orShould().dependOnClassesThat().haveFullyQualifiedName("java.lang.Runtime")
                .because("UI should not talk to JDBC or launch processes directly.")
                .check(importedClasses);
    }

    @Test
    void browserProtocolBoundaries() {
        JavaClasses importedClasses = new ClassFileImporter().importPackages("io.smartdm");
        assertContainsPackage(importedClasses, "io.smartdm.browser");
        
        ArchRuleDefinition.noClasses()
                .that().resideInAPackage("io.smartdm.browser..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "io.smartdm.desktop..",
                        "io.smartdm.ai..",
                        "io.smartdm.media..",
                        "javafx.."
                )
                .because("Browser protocol should only rely on domain and basic infrastructure.")
                .check(importedClasses);
    }
}