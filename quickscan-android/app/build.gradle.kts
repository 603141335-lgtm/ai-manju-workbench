plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "com.kuaidi.quickscan"
    compileSdk = 35
    buildToolsVersion = "35.0.0"
    defaultConfig {
        val sideBySide = providers.gradleProperty("quickScanSideBySide").orNull == "true"
        applicationId = if (sideBySide) "com.kuaidi.quickscan.ui" else "com.kuaidi.quickscan.v0141"
        minSdk = 26
        targetSdk = 35
        versionCode = 170
        versionName = "0.17.0"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.camera:camera-core:1.4.1")
    implementation("androidx.camera:camera-camera2:1.4.1")
    implementation("androidx.camera:camera-lifecycle:1.4.1")
    implementation("androidx.camera:camera-view:1.4.1")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
}
