/**
 * Precompiled [smartdm.testing.gradle.kts][Smartdm_testing_gradle] script plugin.
 *
 * @see Smartdm_testing_gradle
 */
public
class Smartdm_testingPlugin : org.gradle.api.Plugin<org.gradle.api.Project> {
    override fun apply(target: org.gradle.api.Project) {
        try {
            Class
                .forName("Smartdm_testing_gradle")
                .getDeclaredConstructor(org.gradle.api.Project::class.java, org.gradle.api.Project::class.java)
                .newInstance(target, target)
        } catch (e: java.lang.reflect.InvocationTargetException) {
            throw e.targetException
        }
    }
}
