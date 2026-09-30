# Android-App (Trusted Web Activity)

Die Android-App ist eine **Trusted Web Activity**: Sie öffnet `https://app.vereins-flow.com` in Chrome im Vollbild, ohne
Adresszeile. Die App enthält VereinsFlow nicht selbst – Updates der Web-Anwendung sind sofort in der App, ohne neue Store-Version.
Push-Nachrichten kommen per Web Push; Chrome leitet sie an die App weiter (Notification Delegation), sie erscheinen unter dem
Namen und Symbol der App.

| Wert                | Stand                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| Paketname           | `com.vereinsflow.app` (in der Play Console später nicht mehr änderbar) |
| Zielversion         | Android 16 (API 36), wie Google Play es seit 31.08.2026 verlangt       |
| Mindestversion      | Android 7 (API 24)                                                     |
| Erzeugt mit         | Bubblewrap 1.25.0 aus [`twa-manifest.json`](twa-manifest.json)         |
| Symbol Statusleiste | `public/app-icon-monochrome-512.png` (weiß auf transparent)            |

Die Freigabe zwischen App und Website (Digital Asset Links) liefert der Server unter `/.well-known/assetlinks.json`; Einstellung
siehe [docs/OPERATIONS.md](../docs/OPERATIONS.md#app-ansicht-android-app-und-iphone). Ohne passenden Fingerabdruck zeigt die App
oben eine Adresszeile.

## Voraussetzungen

- **Java 21** (z. B. Eclipse Temurin). Das Java von Android Studio (25) passt nicht zu den Build-Werkzeugen des Projekts
  (Gradle 8.11, Android Gradle Plugin 8.9).
- **Android SDK** (über Android Studio), Plattform 36.
- Für neue Projektdateien: **Bubblewrap** `@bubblewrap/cli@1.25.0` (per `npx`).

## Bauen

```bash
cd android
export JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
./gradlew assembleDebug    # Test-App: app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease    # Play Store: app/build/outputs/bundle/release/app-release.aab (noch unsigniert)
```

`local.properties` (mit `sdk.dir=…`) legt Gradle bzw. Android Studio lokal an; sie gehört nicht ins Repository.

## Signieren für den Play Store

Google signiert die App über **Play App Signing** selbst; hochgeladen wird ein mit dem eigenen **Upload-Schlüssel** signiertes
App Bundle. Der Schlüssel liegt **außerhalb des Repositorys**, standardmäßig in `~/VereinsFlow-Schluessel` (Datei und Passwort
zusätzlich im Passwortmanager). Bauen und Signieren in einem Schritt:

```bash
./signieren.sh    # legt vereinsflow-<Version>-<Code>.aab in ~/Downloads ab (anderer Ordner als Argument)
```

Nur falls noch kein Upload-Schlüssel existiert – einmal anlegen:

```bash
keytool -genkeypair -v -keystore vereinsflow-upload.keystore -alias vereinsflow-upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

Geht der Upload-Schlüssel verloren, lässt er sich in der Play Console zurücksetzen – der Signaturschlüssel von Google bleibt.
Nach dem ersten Hochladen den SHA-256-Fingerabdruck des **App-Signaturschlüssels** aus der Play Console („App-Integrität“)
**zusätzlich** in `ANDROID_APP_CERT_SHA256` eintragen (kommagetrennt) – auf den Handys läuft die von Google signierte App.

## Projekt neu erzeugen oder Version erhöhen

Werte (Farben, Name, Version, Symbole) stehen in `twa-manifest.json`. Danach die Projektdateien neu erzeugen – Bubblewrap lädt dafür
die Symbole und das Web-Manifest von der Website, der Server muss also laufen:

```bash
npx @bubblewrap/cli@1.25.0 update --skipVersionUpgrade   # oder ohne --skipVersionUpgrade: Version automatisch erhöhen
```

Das überschreibt die erzeugten Dateien unter `app/`. Für jede neue Store-Version muss `appVersionCode` steigen.

## Testen

- **Emulator:** In Android Studio ein Gerät mit einem Systemabbild **mit Google Play** anlegen (bringt Chrome und die Google-Dienste
  mit, beides braucht die App bzw. Push).
- **Nur gegen HTTPS testen.** Lokal über `http://localhost` lehnt Chrome auf Android das Sitzungs-Cookie mit dem Präfix `__Host-`
  ab (Anmeldung hält nicht), und Safari folgt dem HSTS-Header und lädt Stylesheets über HTTPS nach. Der vollständige Test
  (Anmeldung, Push, Vollbild ohne Adresszeile) gehört deshalb auf den Server mit HTTPS und eingetragenem Fingerabdruck.
