# ADR-0009: Vereinslogo – Rasterbild am Verein, geprüfte Route mit Mitgliedschaftsprüfung

**Status:** gültig (ergänzt [ADR-0005](0005-dateiablage.md))

## Kontext

Jeder Verein soll neben seinem Namen ein eigenes Logo zeigen können (Kopfzeile, Vereinswechsler, Menü, Profil, gedruckter
Helferplan). Anders als Dokumente wird ein Logo **im Browser angezeigt**, nicht heruntergeladen, und der Vereinswechsler zeigt
auch Logos von Vereinen, die gerade **nicht** aktiv sind. Zu entscheiden war: wo die Angaben liegen, welche Formate erlaubt sind
und wie die Auslieferung geschützt wird.

## Entscheidung

- **Eigene Spalten am `Club`** (`logoStorageKey`, `logoMimeType`, `logoSizeBytes`, `logoSha256`, `logoUpdatedAt`) – nicht im
  JSON `settings` (wird gelesen, ergänzt und zurückgeschrieben; gleichzeitige Änderungen könnten das Logo verlieren) und nicht als
  `Document` (es erschiene in der Dokumentenliste, im Papierkorb und im Speicherkontingent). CHECK-Regeln sichern „alles oder
  nichts“, Typ, Größe und Formate in der Datenbank ab.
- **Nur Rasterbilder** (PNG, JPEG, WebP, höchstens 1 MB). SVG ist ausgeschlossen, weil es Skripte enthalten kann. Bildmaße werden aus
  dem Dateikopf gelesen und auf 16–4096 Pixel begrenzt; bewegte Bilder sind nicht erlaubt. Keine Bildbibliothek (die Kopfdaten
  genügen, siehe `src/lib/club-logo.ts`).
- **Datei wie Dokumente** über `saveFile`/`openFile`/`deleteFile` im Verzeichnis des Vereins; beim Ersetzen wird die alte Datei erst
  nach dem Abschluss gelöscht, ein gleichzeitiges Ersetzen wird als Konflikt erkannt (bedingtes Update auf den bisherigen Schlüssel).
- **Auslieferung** über `GET /api/vereine/<id>/logo`. Ausnahme vom Grundsatz „Kontext statt Parameter“: Die Vereins-ID steht in der
  Adresse, die Route baut aber einen Kontext **genau für diesen Verein** (`loadTenantContextForUser`, aktive Mitgliedschaft, aktiver
  Verein, kein Ausweichen) – alle anderen erhalten 404. Inline mit Typ aus der Positivliste, `nosniff`, `sandbox`-CSP,
  `Cross-Origin-Resource-Policy: same-origin`, Cache nur `private`; die Adresse trägt eine Version aus der Prüfsumme, deshalb darf
  der Browser das Bild lange behalten.
- **Hochladen** per `POST` auf dieselbe Adresse (Route Handler statt Server Action wegen der Größengrenze von Aktionen), nur in den
  aktiven Verein der Sitzung, nur mit `club:update`; Entfernen per Server Action. Beides im Änderungsprotokoll.
- **Anzeige** ohne `next/image` (der Optimierer ruft Bilder ohne Anmeldung ab) über eine schmückende Kachel mit Anfangsbuchstaben als
  Ersatz; ohne Logo wird gar kein Bild angefragt.

## Folgen

- (+) Keine Zusatzdienste; das Logo liegt mit den Dokumenten im gesicherten Verzeichnis und ist nie öffentlich erreichbar.
- (+) Wer kein Mitglied mehr ist oder dessen Verein deaktiviert wurde, erhält das Logo nicht mehr (bis auf eine Kopie im eigenen
  Browser-Cache – vertretbar, das Logo ist keine vertrauliche Angabe).
- (−) Metadaten im Bild (z. B. EXIF bei JPEG) bleiben erhalten, weil nicht neu kodiert wird. Hinweis in
  [SECURITY.md](../SECURITY.md#uploads).
- (−) Öffentliche Seiten (Einladung, E-Mails, Kalender-Abo) zeigen kein Logo – dort gibt es keine Anmeldung, und eine öffentliche
  Adresse ist bewusst nicht vorgesehen.
- (−) Stürzt der Server genau zwischen Abschluss und Löschen der alten Datei ab, bleibt eine unbenutzte Datei im Verzeichnis zurück
  (kein Einfluss auf die Anzeige).
