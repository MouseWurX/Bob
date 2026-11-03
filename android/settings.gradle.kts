// Bob for Android. The phone brain is llama.cpp (built from source by app/src/main/cpp/CMakeLists.txt),
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

if (!file("third_party/llama.cpp/CMakeLists.txt").isFile) {
    throw GradleException("llama.cpp isn't here yet. Run tools/fetch-llama.sh (or tools/fetch-llama.ps1 on Windows) once, then build again.")
}
