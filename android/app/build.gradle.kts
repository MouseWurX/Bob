import groovy.json.JsonSlurper

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
}

// The phone app carries the same version as desktop Bob (package.json one folder up).
@Suppress("UNCHECKED_CAST")
val pkg = JsonSlurper().parse(rootProject.file("../package.json")) as Map<String, Any>
val bobVersion = pkg["version"] as String
val bobBuild = ((pkg["bob"] as Map<String, Any>)["build"] as Number).toInt()

android {
    namespace = "ca.mousewurx.bob"
    compileSdk = 36
    // The NDK and CMake that llama.cpp's own Android example uses (GitHub's build reads these two lines).
    ndkVersion = "29.0.13113456"

    defaultConfig {
        applicationId = "ca.mousewurx.bob"
        minSdk = 33
        targetSdk = 36
        versionCode = bobBuild
        versionName = bobVersion
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
        externalNativeBuild {
            cmake {
                arguments += "-DCMAKE_BUILD_TYPE=Release"
                arguments += "-DBUILD_SHARED_LIBS=ON"
                arguments += "-DLLAMA_BUILD_APP=OFF"
                arguments += "-DLLAMA_BUILD_COMMON=ON"
                arguments += "-DLLAMA_OPENSSL=OFF"
                arguments += "-DGGML_NATIVE=OFF"
                arguments += "-DGGML_BACKEND_DL=ON"
                arguments += "-DGGML_CPU_ALL_VARIANTS=ON"
                arguments += "-DGGML_LLAMAFILE=OFF"
            }
        }
    }
    externalNativeBuild {
        cmake {
            path("src/main/cpp/CMakeLists.txt")
            version = "3.31.6"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin { jvmToolchain(17) }

    // Shared with desktop Bob: his icons and font come straight from ../public, so they never drift apart.
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/bobShared"))
}

val copyShared by tasks.registering(Copy::class) {
    from(rootProject.file("../public")) {
        include("icons/bob-192.png", "icons/bob-512.png", "icons/bob.svg", "fonts/*.woff2", "fonts/IBM-Plex-Mono-OFL.txt")
    }
    into(layout.buildDirectory.dir("generated/bobShared/www/shared"))
}
tasks.named("preBuild") { dependsOn(copyShared) }

dependencies {
    implementation(libs.androidx.activity)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.coroutines.android)
}
