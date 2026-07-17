/**
 * Precompiled [smartdm.java-library.gradle.kts][Smartdm_java_library_gradle] script plugin.
 *
 * @see Smartdm_java_library_gradle
 */
public
class Smartdm_javaLibraryPlugin : org.gradle.api.Plugin<org.gradle.api.Project> {
    override fun apply(target: org.gradle.api.Project) {
        try {
            Class
                .forName("Smartdm_java_library_gradle")
                .getDeclaredConstructor(org.gradle.api.Project::class.java, org.gradle.api.Project::class.java)
                .newInstance(target, target)
        } catch (e: java.lang.reflect.InvocationTargetException) {
            throw e.targetException
        }
    }
}
