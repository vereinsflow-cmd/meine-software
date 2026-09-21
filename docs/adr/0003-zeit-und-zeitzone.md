# ADR-0003: Zeit – UTC speichern, Berlin anzeigen, Kalendertage als Datum

**Status:** gültig

## Kontext

Vereine planen in Ortszeit (Deutschland: `Europe/Berlin`, mit Sommerzeit). Zeitfehler sind bei Helferschichten besonders unangenehm
(Schicht „von 22:00 bis 02:00“, Zeitumstellung, „heute“ um 00:30). Server laufen oft in UTC, Entwickler in anderen Zeitzonen.

## Entscheidung

- **Zeitpunkte** (Beginn, Ende, Erstellung) werden als `timestamptz` in **UTC** gespeichert und in `Europe/Berlin` angezeigt (`@date-fns/tz`), Format `TT.MM.JJJJ`, 24 Stunden.
- **Reine Kalendertage** (Geburtstag, Eintritt, Fälligkeit) sind `@db.Date`, in der Anwendung als „UTC-Mitternacht“ geführt – ohne Uhrzeit, ohne Verschiebung.
- **„Heute“** ist immer der Berliner Tag (`todayCalendarDate`), nie der des Servers. Alter und Mindestalter werden am Berliner Tag gerechnet (`ageOn`).
- Tageweise Rechnung ist **sommerzeitfest** (`addBerlinDays`), Schichten über Mitternacht sind erlaubt (Ende vor Beginn = nächster Tag).
- Iterationen über Tage und Wochen (Kalender, Serientermine) laufen über dieselben Helfer (`src/lib/dates.ts`, `calendar-grid.ts`, `recurrence.ts`).

## Folgen

- (+) Ein Server in beliebiger Zeitzone verhält sich gleich; Tests laufen deterministisch (Berliner Tage in `tests/helpers/dates.ts`).
- (+) iCal-Export in UTC ist eindeutig; ganztägige Termine folgen dem Standard (exklusives Ende).
- (−) Vereine außerhalb von `Europe/Berlin` sehen Berliner Zeit. Eine Vereins-Zeitzone wäre eine spätere Erweiterung (Spalte am Verein, Helfer nehmen sie statt der Konstante).
- Tests müssen Berliner Tage verwenden, nicht `new Date()` im Zeitzonen-Dickicht (typischer Fehler: Test um 00:30 Berliner Zeit = Vortag in UTC).
