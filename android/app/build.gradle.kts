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

    defaultConfig {
        applicationId = "ca.mousewurx.bob"
        minSdk = 33
        targetSdk = 36
        versionCode = bobBuild
        versionName = bobVersion
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
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
    implementation(project(":llama"))
    implementation(libs.androidx.activity)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.coroutines.android)
}
