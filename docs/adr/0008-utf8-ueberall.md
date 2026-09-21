# ADR-0008: UTF-8 überall (Windows-Falle bei der Datenbank)

**Status:** gültig

## Kontext

Die Anwendung verarbeitet Namen aus vielen Sprachen (Ş, Ż, ø, ß) und Sonderzeichen in Texten (→, „…“, Emojis in Nachrichten). Unter Windows übernimmt `initdb` ohne Angabe die
**Systemkodierung (WIN1252)**; dann lassen sich Zeichen wie „→“, „Ş“ oder Emojis nicht speichern, und Fehler treten erst bei bestimmten Eingaben auf.

## Entscheidung

- Jede Datenbank wird mit **UTF-8** angelegt: `docker-compose.yml` setzt `POSTGRES_INITDB_ARGS=--encoding=UTF8`, die eingebettete Entwicklungsdatenbank (`scripts/dev-db.mjs`) übergibt
  `--encoding=UTF8`; die Test-Datenbanken werden mit `ENCODING 'UTF8' TEMPLATE template0` angelegt.
- Quelldateien, Markdown und SQL sind UTF-8 (`.editorconfig`). Dateien werden nie mit Standardeinstellungen von Windows-PowerShell 5.1 geschrieben (`Set-Content` ohne `-Encoding utf8` nutzt ANSI).
- Ausgeliefert wird `lang="de"`, `charset=utf-8`, Dateinamen für Downloads mit RFC-6266-Kodierung (`filename*=UTF-8''…`).

## Folgen

- (+) Beliebige Namen und Texte funktionieren; Fehler durch Zeichensatzumwandlung entfallen.
- (−) Eine vorhandene, falsch kodierte Datenbank lässt sich nicht umstellen – sie muss neu angelegt werden (Sicherung als UTF-8-Dump einspielen).
- Erkennen: `SHOW server_encoding;` muss `UTF8` liefern.
