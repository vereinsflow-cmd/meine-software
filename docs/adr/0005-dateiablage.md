# ADR-0005: Dateiablage im Dateisystem hinter geprüfter Route

**Status:** gültig

## Kontext

Hochgeladene Dateien sind ein klassisches Einfallstor (Ausführbares, HTML/SVG mit Skripten, Pfadangriffe, Zugriff ohne Berechtigung). Optionen:
(a) Objektspeicher (S3) mit vorsignierten Links, (b) Ablage in der Datenbank, (c) Dateisystem hinter der Anwendung.

## Entscheidung

(c) Dateisystem (`STORAGE_DIR`, **außerhalb** von `public/`), Zugriff **ausschließlich** über `GET /api/dokumente/<id>/download`:

- Anmeldung, Verein und Zugriffsstufe werden bei jedem Abruf geprüft; Unbefugte erhalten 404.
- Zufälliger Speicherschlüssel (nicht der Dateiname), Pfadprüfung, Schreiben ohne Überschreiben.
- Positivliste und Inhaltsprüfung beim Upload; Auslieferung als Anhang mit `nosniff` und `sandbox`-CSP.
- Größenlimit je Datei und Speicherkontingent je Verein.
- Erweiterungspunkt für einen Virenscanner (`registerUploadScanner`).

## Folgen

- (+) Keine Zusatzdienste; einfache Sicherung (Verzeichnis); jede Auslieferung ist geprüft, nie eine öffentliche URL.
- (+) Der Speicherort lässt sich später hinter dieselbe Schnittstelle (`saveFile`/`openFile`/`deleteFile`) auf S3 umstellen.
- (−) Bei mehreren Anwendungsinstanzen braucht es ein **gemeinsames** Volume.
- (−) Sehr große Dateien laufen durch die Anwendung (Streaming beim Download, Upload im Speicher bis `MAX_UPLOAD_MB`). Für Vereinsunterlagen (Größenordnung Megabyte) unkritisch.
- (−) **Kein Virenscan** eingebaut; die Verantwortung dafür bleibt beim Betreiber (siehe [SECURITY.md](../SECURITY.md#uploads)).
