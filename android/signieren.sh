#!/usr/bin/env bash
# Baut das App Bundle für den Play Store und signiert es mit dem Upload-Schlüssel.
#
#   ./signieren.sh [Zielordner]     (Standard: ~/Downloads)
#
# Schlüssel und Passwort liegen außerhalb des Repositorys, standardmäßig in ~/VereinsFlow-Schluessel
# (vereinsflow-upload.keystore und upload-keystore-passwort). Andere Orte über VF_UPLOAD_KEYSTORE,
# VF_UPLOAD_PASSWORT_DATEI und VF_UPLOAD_ALIAS. Die Version kommt aus twa-manifest.json (appVersion, appVersionCode).
set -euo pipefail
cd "$(dirname "$0")"

SCHLUESSEL_ORDNER="${VF_SCHLUESSEL_ORDNER:-$HOME/VereinsFlow-Schluessel}"
KEYSTORE="${VF_UPLOAD_KEYSTORE:-$SCHLUESSEL_ORDNER/vereinsflow-upload.keystore}"
PASSWORT_DATEI="${VF_UPLOAD_PASSWORT_DATEI:-$SCHLUESSEL_ORDNER/upload-keystore-passwort}"
ALIAS="${VF_UPLOAD_ALIAS:-vereinsflow-upload}"
ZIEL_ORDNER="${1:-$HOME/Downloads}"

# Java 21 (das Java 25 von Android Studio passt nicht zu Gradle 8.11) und das Android SDK von Android Studio
export JAVA_HOME="${JAVA_HOME:-$HOME/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

[ -f "$KEYSTORE" ] || { echo "Upload-Schlüssel fehlt: $KEYSTORE" >&2; exit 1; }
[ -f "$PASSWORT_DATEI" ] || { echo "Passwort-Datei fehlt: $PASSWORT_DATEI" >&2; exit 1; }
[ -f local.properties ] || echo "sdk.dir=$ANDROID_HOME" > local.properties

VERSION=$(node -p 'require("./twa-manifest.json").appVersion')
CODE=$(node -p 'require("./twa-manifest.json").appVersionCode')

./gradlew bundleRelease --console=plain -q
AAB=app/build/outputs/bundle/release/app-release.aab

"$JAVA_HOME/bin/jarsigner" -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore "$KEYSTORE" -storepass:file "$PASSWORT_DATEI" "$AAB" "$ALIAS" > /dev/null
"$JAVA_HOME/bin/jarsigner" -verify "$AAB" > /dev/null

mkdir -p "$ZIEL_ORDNER"
ZIEL="$ZIEL_ORDNER/vereinsflow-$VERSION-$CODE.aab"
cp "$AAB" "$ZIEL"
echo "Signiertes App Bundle (Version $VERSION, Code $CODE): $ZIEL"
