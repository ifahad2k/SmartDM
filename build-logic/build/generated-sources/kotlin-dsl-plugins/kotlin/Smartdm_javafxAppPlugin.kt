/**
 * Precompiled [smartdm.javafx-app.gradle.kts][Smartdm_javafx_app_gradle] script plugin.
 *
 * @see Smartdm_javafx_app_gradle
 */
public
class Smartdm_javafxAppPlugin : org.gradle.api.Plugin<org.gradle.api.Project> {
    override fun apply(target: org.gradle.api.Project) {
        try {
            Class
                .forName("Smartdm_javafx_app_gradle")
                .getDeclaredConstructor(org.gradle.api.Project::class.java, org.gradle.api.Project::class.java)
                .newInstance(target, target)
        } catch (e: java.lang.reflect.InvocationTargetException) {
            throw e.targetException
        }
    }
}
