package io.smartdm.ai.gemini.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition;
import org.junit.jupiter.api.Test;

class GeminiArchitectureTest {

    @Test
    void geminiShouldNotDependOnFilesystemCatalog() {
        JavaClasses importedClasses = new ClassFileImporter().importPackages("io.smartdm.ai.gemini");
        
        ArchRuleDefinition.noClasses()
                .that().resideInAPackage("io.smartdm.ai.gemini..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "java.io.File..",
                        "java.io.FileInputStream..",
                        "java.io.FileOutputStream..",
                        "java.io.FileReader..",
                        "java.io.FileWriter..",
                        "java.io.RandomAccessFile..",
                        "java.nio.file..",
                        "io.smartdm.catalog.."
                )
                .because("Gemini module should not directly access filesystem or local catalog.")
                .check(importedClasses);
    }
}
