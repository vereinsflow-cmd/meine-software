-- =============================================================================
-- Prüfregeln für interne Pfade korrigiert (Benachrichtigungs-Links und Seitenadresse von Support-Meldungen).
--
-- Fehler: `"linkUrl" NOT LIKE '/\%'` (Migration 20260920191000_integrity_guards) sollte Pfade wie "/\example.com"
-- sperren. In LIKE maskiert der Backslash aber das folgende Zeichen – gesperrt war nur der wörtliche Text "/%".
-- Browser lesen "/\example.com" wie "//example.com" und öffnen eine FREMDE Seite (Open Redirect / Phishing-Link).
-- Derselbe Fehler steckt in `SupportTicket_path_chk` (Migration 20260921120000_support_tickets).
--
-- Neue Regel (gleich für beide Spalten), ohne LIKE und ohne Maskierung:
--   * beginnt mit "/",
--   * das zweite Zeichen ist weder "/" noch "\" (chr(92) – so hängt nichts an der Schreibweise des Backslashs),
--   * keine Steuerzeichen: Browser entfernen Tabulator und Zeilenumbruch aus Adressen, "/<Tab>/host" würde sonst
--     ebenfalls zu "//host".
-- Eine Längengrenze gab es in der Datenbank bisher nicht und gibt es weiterhin nicht (der Code begrenzt die Länge).
--
-- Bestehende Zeilen: Der Code baut seit jeher nur interne Pfade; Zeilen, die die neue Regel verletzen, kann es
-- praktisch nicht geben. Falls doch (eingeschleust), verlieren sie nur ihren Link bzw. die Seitenangabe – die
-- Benachrichtigung bzw. Meldung selbst bleibt. So kann die Migration an Altbeständen nie scheitern.
-- Abbauen und neu Anlegen geschieht je Tabelle in EINER Anweisung: Es gibt keinen Moment ohne Prüfregel.
--
-- Rückgängig (nicht empfohlen – die alte Regel ist fehlerhaft): beide Prüfregeln mit dem Ausdruck aus den genannten
-- Migrationen neu anlegen.
-- =============================================================================

-- Benachrichtigungen ----------------------------------------------------------

UPDATE "Notification"
SET "linkUrl" = NULL
WHERE "linkUrl" IS NOT NULL
  AND NOT (
    left("linkUrl", 1) = '/'
    AND substr("linkUrl", 2, 1) NOT IN ('/', chr(92))
    AND "linkUrl" !~ '[[:cntrl:]]'
  );

ALTER TABLE "Notification"
  DROP CONSTRAINT "Notification_link_chk",
  ADD CONSTRAINT "Notification_link_chk"
    CHECK (
      "linkUrl" IS NULL
      OR (
        left("linkUrl", 1) = '/'
        AND substr("linkUrl", 2, 1) NOT IN ('/', chr(92))
        AND "linkUrl" !~ '[[:cntrl:]]'
      )
    );

-- Support-Meldungen -----------------------------------------------------------

UPDATE "SupportTicket"
SET "pagePath" = NULL
WHERE "pagePath" IS NOT NULL
  AND NOT (
    left("pagePath", 1) = '/'
    AND substr("pagePath", 2, 1) NOT IN ('/', chr(92))
    AND "pagePath" !~ '[[:cntrl:]]'
  );

ALTER TABLE "SupportTicket"
  DROP CONSTRAINT "SupportTicket_path_chk",
  ADD CONSTRAINT "SupportTicket_path_chk"
    CHECK (
      "pagePath" IS NULL
      OR (
        left("pagePath", 1) = '/'
        AND substr("pagePath", 2, 1) NOT IN ('/', chr(92))
        AND "pagePath" !~ '[[:cntrl:]]'
      )
    );
