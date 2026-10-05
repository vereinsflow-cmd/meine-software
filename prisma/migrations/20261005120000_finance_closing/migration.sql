-- Etappe 4: Monatsabschluss, Kassensturz (ADR-0010, Abschnitte „Abschluss“ und „Kassensturz“).
--
-- Monatsabschluss: Monat für Monat der Reihe nach, nur abgelaufene Monate. Die Datenbank berechnet Kontostände, Zahl der
-- Buchungen und eine Prüfsumme (SHA-256 über alle Buchungen und Zeilen des Monats, verkettet mit der Prüfsumme des
-- Vormonats) und setzt danach FinanceSettings.closedThrough – nur sie darf das (Trigger-Tiefe ≥ 2, siehe finance_ledger).
-- Abschlüsse sind unveränderlich. Kassensturz: gezählter Bestand der Barkasse; eine Differenz wird als Buchung
-- „Kassendifferenz“ festgehalten.

-- CreateEnum
CREATE TYPE "PeriodCloseKind" AS ENUM ('MONTH', 'YEAR');

-- CreateTable
CREATE TABLE "FinancePeriodClose" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "closedThrough" DATE NOT NULL,
    "kind" "PeriodCloseKind" NOT NULL,
    "balances" JSONB NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "lastNumber" TEXT,
    "contentHash" TEXT NOT NULL,
    "previousHash" TEXT,
    "note" TEXT,
    "closedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,

    CONSTRAINT "FinancePeriodClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashCount" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "countedOn" DATE NOT NULL,
    "countedCents" INTEGER NOT NULL,
    "bookCents" INTEGER NOT NULL,
    "differenceCents" INTEGER NOT NULL,
    "denominations" JSONB,
    "note" TEXT,
    "entryId" TEXT,
    "countedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countedById" TEXT,

    CONSTRAINT "CashCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancePeriodClose_clubId_id_key" ON "FinancePeriodClose"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePeriodClose_clubId_closedThrough_key" ON "FinancePeriodClose"("clubId", "closedThrough");

-- CreateIndex
CREATE INDEX "CashCount_clubId_accountId_countedOn_idx" ON "CashCount"("clubId", "accountId", "countedOn");

-- CreateIndex
CREATE UNIQUE INDEX "CashCount_clubId_id_key" ON "CashCount"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CashCount_clubId_entryId_key" ON "CashCount"("clubId", "entryId");

-- AddForeignKey
ALTER TABLE "FinancePeriodClose" ADD CONSTRAINT "FinancePeriodClose_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_clubId_accountId_fkey" FOREIGN KEY ("clubId", "accountId") REFERENCES "FinanceAccount"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_clubId_entryId_fkey" FOREIGN KEY ("clubId", "entryId") REFERENCES "LedgerEntry"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Prüfungen
-- -----------------------------------------------------------------------------

ALTER TABLE "FinancePeriodClose" ADD CONSTRAINT "FinancePeriodClose_note_chk"
  CHECK ("note" IS NULL OR char_length("note") <= 500);
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_amounts_chk"
  CHECK ("countedCents" >= 0 AND "countedCents" <= 100000000 AND "differenceCents" = "countedCents" - "bookCents");
-- Eine Differenz ist immer gebucht und begründet; ohne Differenz gibt es keine Buchung.
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_difference_chk"
  CHECK (("differenceCents" = 0) = ("entryId" IS NULL)
         AND ("differenceCents" = 0 OR char_length(btrim(coalesce("note", ''))) >= 3));
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_note_chk"
  CHECK ("note" IS NULL OR char_length("note") <= 500);

-- -----------------------------------------------------------------------------
-- Inhalt eines Abschlusszeitraums (für die Prüfsumme): jede Buchung mit Zeilen in fester Reihenfolge. Auch zum
-- Nachrechnen – stimmt sie nicht mehr mit der gespeicherten überein, wurde nachträglich etwas verändert.
-- -----------------------------------------------------------------------------

-- Datumsangaben immer als „JJJJ-MM-TT“ (unabhängig von der DateStyle-Einstellung der Sitzung oder des Servers).
CREATE FUNCTION "finance_close_content"(club text, after_day date, through_day date) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(
    concat_ws(';', e."id", e."year", e."number", e."kind", e."accountId", to_char(e."bookingDate", 'YYYY-MM-DD'),
      coalesce(to_char(e."documentDate", 'YYYY-MM-DD'), ''), e."amountCents",
      e."description", coalesce(e."counterpartyName", ''), coalesce(e."counterpartyMemberId", ''),
      coalesce(e."reversalOfId", ''), coalesce(e."transferGroupId", ''),
      (SELECT string_agg(concat_ws(',', l."position", l."categoryId", l."sphere", l."categoryName", l."amountCents",
                                   coalesce(l."departmentId", ''), coalesce(l."eventId", ''), coalesce(l."invoiceId", '')),
                         '/' ORDER BY l."position")
         FROM "LedgerLine" l WHERE l."clubId" = e."clubId" AND l."entryId" = e."id")),
    E'\n' ORDER BY e."year", e."number"), '')
  FROM "LedgerEntry" e
  WHERE e."clubId" = club
    AND (after_day IS NULL OR e."bookingDate" > after_day)
    AND e."bookingDate" <= through_day;
$$;

CREATE FUNCTION "finance_close_hash"(previous text, through_day date, balances jsonb, content text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(
    coalesce(previous, '') || '|' || to_char(through_day, 'YYYY-MM-DD') || '|' || balances::text || '|' || content,
    'UTF8')), 'hex');
$$;

-- Kontostände je Konto bis zu einem Tag (alle Konten des Vereins, auch archivierte) – beim Abschluss und zum Nachrechnen.
CREATE FUNCTION "finance_close_balances"(club text, through_day date) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_object_agg(a."id", coalesce(b.total, 0)), '{}'::jsonb)
    FROM "FinanceAccount" a
    LEFT JOIN (
      SELECT "accountId", sum("amountCents")::bigint AS total FROM "LedgerEntry"
        WHERE "clubId" = club AND "bookingDate" <= through_day GROUP BY "accountId"
    ) b ON b."accountId" = a."id"
    WHERE a."clubId" = club;
$$;

-- -----------------------------------------------------------------------------
-- Abschluss anlegen
-- -----------------------------------------------------------------------------

CREATE FUNCTION "finance_period_close_before_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  settings record;
  expected date;
  berlin_today date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  last_entry record;
BEGIN
  -- FOR UPDATE: Neue Buchungen (FOR SHARE) warten bzw. werden abgewartet – nichts rutscht in den Monat, während er schließt.
  SELECT "ledgerStartDate", "closedThrough" INTO settings
    FROM "FinanceSettings" WHERE "clubId" = NEW."clubId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FINANCE_NOT_SET_UP: Das Kassenbuch ist noch nicht eingerichtet.' USING ERRCODE = 'check_violation';
  END IF;
  -- Der Reihe nach: immer der nächste noch offene Monat.
  expected := (date_trunc('month', coalesce(settings."closedThrough" + 1, settings."ledgerStartDate"))
               + interval '1 month - 1 day')::date;
  IF NEW."closedThrough" <> expected THEN
    RAISE EXCEPTION 'CLOSE_INVALID: Als Nächstes ist der Monat bis % dran – Monate werden der Reihe nach abgeschlossen.',
      to_char(expected, 'DD.MM.YYYY') USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."closedThrough" >= berlin_today THEN
    RAISE EXCEPTION 'CLOSE_INVALID: Dieser Monat ist noch nicht vorbei – abschließen geht ab dem %.',
      to_char(NEW."closedThrough" + 1, 'DD.MM.YYYY') USING ERRCODE = 'check_violation';
  END IF;

  NEW."kind" := CASE WHEN extract(month FROM NEW."closedThrough") = 12
    THEN 'YEAR'::"PeriodCloseKind" ELSE 'MONTH'::"PeriodCloseKind" END;
  NEW."closedAt" := now();
  SELECT "contentHash" INTO NEW."previousHash" FROM "FinancePeriodClose"
    WHERE "clubId" = NEW."clubId" ORDER BY "closedThrough" DESC LIMIT 1;
  SELECT count(*) AS n INTO last_entry FROM "LedgerEntry"
    WHERE "clubId" = NEW."clubId" AND "bookingDate" <= NEW."closedThrough"
      AND (settings."closedThrough" IS NULL OR "bookingDate" > settings."closedThrough");
  NEW."entryCount" := last_entry.n;
  -- Höchste Nummer unter den Buchungen dieses Zeitraums (Nummern folgen der Erfassung, nicht dem Buchungsdatum).
  SELECT "year" || '-' || CASE WHEN "number" < 10000 THEN lpad("number"::text, 4, '0') ELSE "number"::text END
    INTO NEW."lastNumber" FROM "LedgerEntry"
    WHERE "clubId" = NEW."clubId" AND "bookingDate" <= NEW."closedThrough"
      AND (settings."closedThrough" IS NULL OR "bookingDate" > settings."closedThrough")
    ORDER BY "year" DESC, "number" DESC LIMIT 1;
  NEW."balances" := "finance_close_balances"(NEW."clubId", NEW."closedThrough");
  NEW."contentHash" := "finance_close_hash"(NEW."previousHash", NEW."closedThrough", NEW."balances",
    "finance_close_content"(NEW."clubId", settings."closedThrough", NEW."closedThrough"));
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinancePeriodClose_before_insert" BEFORE INSERT ON "FinancePeriodClose"
  FOR EACH ROW EXECUTE FUNCTION "finance_period_close_before_insert"();

-- Danach gilt der Abschluss: Einstellungen nachziehen (nur aus diesem Trigger erlaubt, siehe finance_settings_guard).
CREATE FUNCTION "finance_period_close_after_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "FinanceSettings" SET "closedThrough" = NEW."closedThrough", "updatedAt" = now()
    WHERE "clubId" = NEW."clubId";
  RETURN NULL;
END;
$$;

CREATE TRIGGER "FinancePeriodClose_after_insert" AFTER INSERT ON "FinancePeriodClose"
  FOR EACH ROW EXECUTE FUNCTION "finance_period_close_after_insert"();

-- Abschlüsse und Kassenstürze sind unveränderlich (die Aufbewahrungsroutine darf nach Ablauf der Frist löschen).
-- TG_ARGV[0] = Datumsspalte des Zeitraums, TG_ARGV[1] = Zeitpunkt der Erfassung. Die Frist (10 Jahre) läuft ab Ende des
-- späteren der beiden Jahre – der Dezember-Abschluss vom Januar zählt zum neuen Jahr (wie ledger_book_expired).
CREATE FUNCTION "finance_record_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  record_year int;
BEGIN
  IF TG_OP = 'DELETE' AND coalesce(current_setting('vereinsflow.finance_purge', true), '') = 'on' THEN
    record_year := greatest(
      extract(year FROM (to_jsonb(OLD) ->> TG_ARGV[0])::date)::int,
      extract(year FROM ((to_jsonb(OLD) ->> TG_ARGV[1])::timestamptz AT TIME ZONE 'Europe/Berlin'))::int);
    IF record_year + 10 < extract(year FROM (now() AT TIME ZONE 'Europe/Berlin'))::int THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'FINANCE_IMMUTABLE: Abschlüsse und Kassenstürze lassen sich nicht ändern oder löschen (%).', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "FinancePeriodClose_immutable" BEFORE UPDATE OR DELETE ON "FinancePeriodClose"
  FOR EACH ROW EXECUTE FUNCTION "finance_record_guard"('closedThrough', 'closedAt');
CREATE TRIGGER "CashCount_immutable" BEFORE UPDATE OR DELETE ON "CashCount"
  FOR EACH ROW EXECUTE FUNCTION "finance_record_guard"('countedOn', 'countedAt');

-- Kassensturz: nur Barkassen, nur heute bzw. in der Vergangenheit, nicht in einem abgeschlossenen Zeitraum.
CREATE FUNCTION "cash_count_before_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  account_kind "FinanceAccountKind";
  closed date;
BEGIN
  SELECT "kind" INTO account_kind FROM "FinanceAccount" WHERE "clubId" = NEW."clubId" AND "id" = NEW."accountId";
  IF account_kind IS DISTINCT FROM 'CASH' THEN
    RAISE EXCEPTION 'CLOSE_INVALID: Einen Kassensturz gibt es nur für Barkassen.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT "closedThrough" INTO closed FROM "FinanceSettings" WHERE "clubId" = NEW."clubId" FOR SHARE;
  IF NEW."countedOn" > (now() AT TIME ZONE 'Europe/Berlin')::date
     OR (closed IS NOT NULL AND NEW."countedOn" <= closed) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: Ein Kassensturz gilt für heute.' USING ERRCODE = 'check_violation';
  END IF;
  NEW."countedAt" := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "CashCount_before_insert" BEFORE INSERT ON "CashCount"
  FOR EACH ROW EXECUTE FUNCTION "cash_count_before_insert"();
