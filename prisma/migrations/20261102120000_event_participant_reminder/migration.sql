-- =============================================================================
-- Veranstaltungs-Erinnerungen: „erledigt“ je Zusage, wie `reminderSentAt` an der Schicht-Eintragung.
--
-- Bisher hatte die Zusage kein solches Kennzeichen. Der Job lud deshalb bei jedem Lauf (alle 15 Minuten) alle
-- Veranstaltungen der nächsten 24 Stunden erneut – über alle Vereine höchstens 200 – und verließ sich allein auf den
-- eindeutigen Schlüssel der Benachrichtigung. Lagen mehr als 200 im Fenster, kamen die späteren verspätet dran.
-- Jetzt wählt er nur Zusagen ohne Erinnerung und vermerkt sie danach.
--
-- Nur hinzufügend: leere Spalte ohne Standardwert, PostgreSQL schreibt die Tabelle nicht um, alte Programmstände laufen
-- weiter. Bestehende Zusagen bleiben leer; der erste Lauf danach prüft sie einmal (der Schlüssel der Benachrichtigung
-- verhindert eine zweite Erinnerung).
--
-- Rückgängig: ALTER TABLE "EventParticipant" DROP COLUMN "reminderSentAt";
-- =============================================================================

ALTER TABLE "EventParticipant" ADD COLUMN "reminderSentAt" TIMESTAMPTZ(3);
