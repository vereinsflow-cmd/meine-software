# ADR-0004: Rate-Limits, Sperren und Jobs in PostgreSQL – kein Redis, kein Worker

**Status:** gültig

## Kontext

Rate-Limiting, Job-Sperren und Warteschlangen setzt man üblicherweise mit Redis und einem dauerhaft laufenden Worker (BullMQ o. Ä.) um. Für einen
Verein oder einen kleinen Anbieter bedeutet jeder Zusatzdienst mehr Betrieb, mehr Ausfallstellen und mehr Einrichtungsaufwand.

## Entscheidung

Alles in PostgreSQL, das ohnehin läuft:

- **Rate-Limit:** Tabelle `RateLimitBucket` (atomare Zählerupdates, Fenster). Gilt für alle Instanzen gemeinsam.
- **Job-Sperre:** `pg_try_advisory_xact_lock` (`withJobLock`) – zwei gleichzeitige Läufe arbeiten nicht doppelt.
- **Warteschlange für E-Mail:** Benachrichtigungen mit `emailStatus` (`PENDING` → `SENT`/`FAILED`), Wiederholung nach Fehlern.
- **Jobs:** kein Worker; **Cron** ruft alle 15 Minuten `POST /api/cron/run` (oder `npm run jobs:run`) auf. Jeder Job ist idempotent (bedingte Updates, `dedupeKey`, `reminderSentAt`).

## Folgen

- (+) Ein Dienst weniger; Backup der Datenbank sichert auch Zähler und Warteschlange.
- (+) Läuft unverändert mit mehreren Anwendungsinstanzen.
- (−) Durchsatz ist begrenzt (für Vereinsgrößen völlig ausreichend). Sehr hohe Last würde eine echte Warteschlange rechtfertigen.
- (−) Erinnerungen kommen mit bis zu 15 Minuten Verzögerung (Cron-Takt). Bleibt Cron aus, ruhen die Jobs – deshalb sollte der Aufruf überwacht werden (siehe [OPERATIONS.md](../OPERATIONS.md#hintergrundjobs-cron)).
