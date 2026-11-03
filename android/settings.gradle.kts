// Bob for Android. The phone brain uses llama.cpp's own Android library (examples/llama.android/lib),
// fetched at the exact commit in llama.cpp.pin by tools/fetch-llama.sh (GitHub does this on every build).
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Bob"
include(":app")

val llamaLib = file("third_party/llama.cpp/examples/llama.android/lib")
if (!llamaLib.isDirectory) {
    throw GradleException("llama.cpp isn't here yet. Run tools/fetch-llama.sh (or tools/fetch-llama.ps1 on Windows) once, then build again.")
}
include(":llama")
project(":llama").projectDir = llamaLib
