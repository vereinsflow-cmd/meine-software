-- =============================================================================
-- Veranstaltungs-Erinnerungen: „erledigt“ je Zusage, wie `reminderSentAt` an der Schicht-Eintragung.
--
-- Bisher hatte die Zusage kein solches Kennzeichen. Der Job lud deshalb bei jedem Lauf (alle 15 Minuten) alle
-- Veranstaltungen der nächsten 24 Stunden erneut – über alle Vereine höchstens 200 – und verließ sich allein auf den
-- eindeutigen Schlüssel der Benachrichtigung. Lagen mehr als 200 im Fenster, kamen die späteren verspätet dran.
-- Jetzt wählt er nur Zusagen ohne Erinnerung und vermerkt sie danach.
--
-- Neue, leere Spalte ohne Standardwert: PostgreSQL schreibt die Tabelle nicht um, alte Programmstände laufen weiter.
--
-- Bestehende Zusagen: Der Schlüssel der Benachrichtigung schützt hier NICHT vor einer zweiten Erinnerung. Er hieß bisher
-- „event-reminder:<Veranstaltung>:24h“ und enthält jetzt den Beginn („…:<Beginn>:24h“). Ohne Vermerk bekämen alle, die
-- das alte Programm für eine Veranstaltung der nächsten 24 Stunden schon erinnert hat, im ersten Lauf eine zweite
-- Erinnerung samt E-Mail. Deshalb wird jede Zusage vermerkt, deren Benutzer eine Erinnerung mit dem alten Schlüssel
-- innerhalb der 24 Stunden vor dem jetzigen Beginn bekommen hat – mit deren Zeitpunkt. Nicht vermerkt (und damit wie
-- vorgesehen erinnert) werden: wer noch keine Erinnerung hat, etwa weil die Zusage nach dem letzten Lauf kam, und eine
-- Erinnerung an einen früheren Termin, wenn die Veranstaltung danach verschoben wurde. Nicht abgedeckt: Erinnerungen,
-- die ein alter Programmstand noch zwischen dieser Migration und dem Start des neuen verschickt.
--
-- Rückgängig: ALTER TABLE "EventParticipant" DROP COLUMN "reminderSentAt";
-- =============================================================================

ALTER TABLE "EventParticipant" ADD COLUMN "reminderSentAt" TIMESTAMPTZ(3);

UPDATE "EventParticipant" AS ep
SET "reminderSentAt" = n."createdAt"
FROM "Event" AS e, "Member" AS m, "Notification" AS n
WHERE e.id = ep."eventId"
  AND m.id = ep."memberId"
  AND n."clubId" = ep."clubId"
  AND n."userId" = m."userId"
  AND n."dedupeKey" = 'event-reminder:' || ep."eventId" || ':24h'
  AND n."createdAt" >= e."startsAt" - interval '24 hours';
