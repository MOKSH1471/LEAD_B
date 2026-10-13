# Galileo & Duke — Client Radar Mobile Frontend & Android App

Luxury Silver & Black theme mobile interface matching the official G&D logo.

## 📱 Prebuilt Android APK
* **File:** `GalileoDukeRadar.apk` (3.82 MB)
* **Install:** Copy to your Android device or download over Wi-Fi, then tap to install.

## 🌐 Dynamic Backend Connection
The app connects to your backend dynamically:
* In the app, open **Settings ➔ SERVER 🌐** to point the app to any backend:
  * Local: `http://YOUR_LOCAL_IP:8000` (e.g. your computer's local Wi-Fi IP)
  * Hosted: `https://your-backend.onrender.com`

## 🛠️ Rebuilding the Android APK
```bash
# 1. Sync any web changes
npx cap sync android

# 2. Build Debug APK with Gradle
cd android
.\gradlew.bat assembleDebug
```
Output: `android/app/build/outputs/apk/debug/app-debug.apk`
