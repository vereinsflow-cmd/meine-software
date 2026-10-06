-- Konto archivieren vs. gleichzeitige Buchung: Der Buchungs-Trigger liest die Kontozeile jetzt FOR SHARE (sonst nur wie
-- aus finance_ledger). Archivieren ändert die Zeile zuerst (Zeilensperre) und prüft danach den Kontostand – so kann keine
-- Buchung auf ein Konto rutschen, das gerade mit Kontostand 0 archiviert wird. Funktionskörper sonst unverändert.

CREATE OR REPLACE FUNCTION "ledger_entry_before_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  settings record;
  account record;
  original record;
  berlin_today date := (now() AT TIME ZONE 'Europe/Berlin')::date;
BEGIN
  NEW."recordedAt" := now();

  -- FOR SHARE: Ein gleichzeitiger Monatsabschluss (FOR UPDATE) wartet bzw. wird abgewartet – nichts rutscht dazwischen.
  SELECT "ledgerStartDate", "closedThrough" INTO settings
    FROM "FinanceSettings" WHERE "clubId" = NEW."clubId" FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FINANCE_NOT_SET_UP: Das Kassenbuch ist noch nicht eingerichtet.' USING ERRCODE = 'check_violation';
  END IF;
  IF settings."closedThrough" IS NOT NULL AND NEW."bookingDate" <= settings."closedThrough" THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: Bis zum % ist das Kassenbuch abgeschlossen – bitte ein späteres Datum wählen.',
      to_char(settings."closedThrough", 'DD.MM.YYYY') USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."bookingDate" < settings."ledgerStartDate" THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: Das Kassenbuch beginnt am % – frühere Buchungen gehören in die alten Unterlagen.',
      to_char(settings."ledgerStartDate", 'DD.MM.YYYY') USING ERRCODE = 'check_violation';
  END IF;

  -- FOR SHARE: Ein gleichzeitiges Archivieren des Kontos (UPDATE) wartet bzw. wird abgewartet – danach sieht die Buchung
  -- das Archiv-Datum, oder das Archivieren sieht den Kontostand mit dieser Buchung.
  SELECT "kind", "archivedAt", "name" INTO account
    FROM "FinanceAccount" WHERE "clubId" = NEW."clubId" AND "id" = NEW."accountId" FOR SHARE;
  IF account."archivedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'ACCOUNT_ARCHIVED: Das Konto „%“ ist archiviert.', account."name" USING ERRCODE = 'check_violation';
  END IF;
  -- Das Kassenbuch hält fest, was geflossen ist: kein Datum in der Zukunft (Bank wie Barkasse).
  IF NEW."bookingDate" > berlin_today THEN
    RAISE EXCEPTION 'FUTURE_DATE: Buchungen gehen nur bis heute – das Geld muss schon geflossen sein.' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."kind" = 'OPENING' THEN
    IF NEW."bookingDate" <> settings."ledgerStartDate"
       OR (account."kind" = 'CASH' AND NEW."amountCents" < 0)
       OR EXISTS (
         SELECT 1 FROM "LedgerEntry" e
         WHERE e."clubId" = NEW."clubId" AND e."accountId" = NEW."accountId" AND e."kind" = 'OPENING'
           AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" r WHERE r."clubId" = e."clubId" AND r."reversalOfId" = e."id")
       ) THEN
      RAISE EXCEPTION 'OPENING_INVALID: Ein Konto hat genau einen Anfangsbestand am Beginn des Kassenbuchs (Barkasse nicht im Minus).'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW."kind" = 'REVERSAL' THEN
    SELECT "kind", "accountId", "amountCents", "bookingDate" INTO original
      FROM "LedgerEntry" WHERE "clubId" = NEW."clubId" AND "id" = NEW."reversalOfId";
    IF NOT FOUND OR original."kind" = 'REVERSAL' OR original."accountId" <> NEW."accountId"
       OR original."amountCents" <> -NEW."amountCents" OR NEW."bookingDate" < original."bookingDate" THEN
      RAISE EXCEPTION 'REVERSAL_INVALID: Ein Storno hebt genau eine Buchung auf (gleiches Konto, Gegenbetrag, nicht vor dem Original).'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
