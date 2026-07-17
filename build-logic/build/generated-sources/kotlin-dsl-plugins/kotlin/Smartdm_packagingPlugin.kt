/**
 * Precompiled [smartdm.packaging.gradle.kts][Smartdm_packaging_gradle] script plugin.
 *
 * @see Smartdm_packaging_gradle
 */
public
class Smartdm_packagingPlugin : org.gradle.api.Plugin<org.gradle.api.Project> {
    override fun apply(target: org.gradle.api.Project) {
        try {
            Class
                .forName("Smartdm_packaging_gradle")
                .getDeclaredConstructor(org.gradle.api.Project::class.java, org.gradle.api.Project::class.java)
                .newInstance(target, target)
        } catch (e: java.lang.reflect.InvocationTargetException) {
            throw e.targetException
        }
    }
}
