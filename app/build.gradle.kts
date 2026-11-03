plugins {
    id("com.android.application")
}

android {
    namespace = "com.symptomtracker.draft"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.symptomtracker.draft"
        minSdk = 33
        targetSdk = 36
        versionCode = 1
        versionName = "0.1-draft"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    androidResources {
        // Frames are already compressed PNGs.
        noCompress += "png"
    }
}
