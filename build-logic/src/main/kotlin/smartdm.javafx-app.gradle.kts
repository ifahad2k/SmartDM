plugins {
    application
    id("smartdm.java-library")
    id("org.openjfx.javafxplugin")
}

javafx {
    version = "21.0.7"
    modules("javafx.controls", "javafx.fxml", "javafx.graphics", "javafx.swing")
}
