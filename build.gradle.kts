plugins {
    base
}

allprojects {
    group = property("smartdm.group").toString()
    version = property("smartdm.version").toString()
}
