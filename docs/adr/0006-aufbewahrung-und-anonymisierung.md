# ADR-0006: Aufbewahrungsfristen und Anonymisierung statt hartem Löschen

**Status:** gültig

## Kontext

Die DSGVO verlangt Speicherbegrenzung und Löschung (Art. 5, 17). Hartes Löschen eines Mitglieds würde aber Auswertungen zerstören
(Helferstunden, Teilnehmerzahlen vergangener Veranstaltungen), Verweise brechen lassen und dem Verein die Nachvollziehbarkeit nehmen.
Das Änderungsprotokoll enthält Klartext-Namen in Beschreibungen.

## Entscheidung

- **Zweistufig:** Papierkorb (weiches Löschen, wiederherstellbar) → nach Ablauf **Anonymisierung**. Der Datensatz bleibt als leere Hülle „Gelöschtes Mitglied“ erhalten; alle
  personenbeziehbaren Felder, Einwilligungen, Zugehörigkeiten und Dokumente der Person werden entfernt. Die Namen in Protokolltexten werden **geschwärzt** (die Datenbank erlaubt dafür
  ausschließlich die Änderung von `summary` und `changes`; Akteur, Aktion und Zeitpunkt bleiben als Nachweis).
- **Fristen je Verein** in den Einstellungen, mit Voreinstellungen und Grenzen (`src/lib/club-settings.ts`):

  | Daten                   | Voreinstellung | Grenzen        |
  | ----------------------- | -------------- | -------------- |
  | Papierkorb              | 30 Tage        | 7 – 365 Tage   |
  | Ausgetretene Mitglieder | 24 Monate      | 0 (nie) – 120  |
  | Änderungsprotokoll      | 36 Monate      | 6 – 120 Monate |

  Die Voreinstellungen sind **keine Rechtsempfehlung**; der Verein entscheidet (Beitragsbelege haben eigene gesetzliche Fristen, sobald es das Finanzmodul gibt).

- **Löschantrag** einer Person: Passwort-Bestätigung, **14 Tage** Bedenkzeit, danach dieselbe Anonymisierung plus Löschen des Kontos. Der letzte Administrator eines Vereins kann sich nicht löschen.
- Jede Anonymisierung läuft in **einer Transaktion**, ist wiederholbar und hinterlässt einen Protokolleintrag ohne Namen.

## Folgen

- (+) Statistiken und Verweise bleiben intakt; die Person ist nicht mehr identifizierbar.
- (+) Die Aufbewahrungsroutine ist die **einzige** Stelle, die das Protokoll verändern oder kürzen darf (Datenbank-Trigger, `SET LOCAL vereinsflow.audit_purge`).
- (−) Datensicherungen enthalten gelöschte Daten bis zu ihrem Ablauf (siehe [OPERATIONS.md](../OPERATIONS.md#datensicherung)).
- (−) Zu kurze Namen (< 3 Zeichen) werden im Protokolltext nicht ersetzt (Gefahr, Unbeteiligtes zu treffen).
