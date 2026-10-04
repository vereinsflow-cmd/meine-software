-- =============================================================================
-- Finanzen: Kassenbuch
--
-- Konten (Girokonto, Barkasse), Kategorien in Alltagssprache mit steuerlichem Bereich, lückenlose Nummernkreise und das
-- Kassenbuch selbst (Buchung = Kopf + Zeilen). Grundregeln (GoBD), unabhängig vom Anwendungscode durch die Datenbank
-- gesichert:
--   * Buchungen sind unveränderlich – Korrektur nur durch Storno (Gegenbuchung mit Verweis auf das Original).
--   * Abgeschlossene Zeiträume (FinanceSettings.closedThrough) nehmen keine Buchungen mehr an.
--   * Die Barkasse ist am Ende keines Tages im Minus und kennt keine Buchungen in der Zukunft.
--   * Jede Buchung hat mindestens eine Zeile, und die Zeilen ergeben zusammen genau den Betrag.
-- Fehler melden sich mit einem Kürzel und einem deutschen Satz ('CODE: …'); src/server/action.ts übersetzt sie.
-- =============================================================================

-- CreateEnum
CREATE TYPE "FinanceAccountKind" AS ENUM ('BANK', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "Sphere" AS ENUM ('NEUTRAL', 'NON_PROFIT', 'ASSET_MANAGEMENT', 'PURPOSE_OPERATION', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "CategoryDirection" AS ENUM ('INCOME', 'EXPENSE', 'BOTH');

-- CreateEnum
CREATE TYPE "LedgerEntryKind" AS ENUM ('STANDARD', 'REVERSAL', 'OPENING', 'TRANSFER');

-- CreateEnum
CREATE TYPE "CounterKind" AS ENUM ('LEDGER', 'CHARGE', 'FEE_RUN', 'SEPA_BATCH', 'RECEIPT', 'MANDATE');

-- CreateTable
CREATE TABLE "FinanceSettings" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "ledgerStartDate" DATE NOT NULL,
    "closedThrough" DATE,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FinanceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "kind" "FinanceAccountKind" NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "CategoryDirection" NOT NULL,
    "sphere" "Sphere" NOT NULL,
    "systemKey" TEXT,
    "hint" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCounter" (
    "clubId" TEXT NOT NULL,
    "kind" "CounterKind" NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FinanceCounter_pkey" PRIMARY KEY ("clubId","kind","year")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "bookingDate" DATE NOT NULL,
    "documentDate" DATE,
    "kind" "LedgerEntryKind" NOT NULL DEFAULT 'STANDARD',
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "counterpartyName" TEXT,
    "counterpartyMemberId" TEXT,
    "reversalOfId" TEXT,
    "transferGroupId" TEXT,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerLine" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sphere" "Sphere" NOT NULL,
    "categoryName" TEXT NOT NULL,
    "departmentId" TEXT,
    "eventId" TEXT,
    "note" TEXT,
    "bookingDate" DATE NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "LedgerLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSettings_clubId_key" ON "FinanceSettings"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSettings_clubId_id_key" ON "FinanceSettings"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_clubId_id_key" ON "FinanceAccount"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_clubId_name_key" ON "FinanceAccount"("clubId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_clubId_id_key" ON "FinanceCategory"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_clubId_name_key" ON "FinanceCategory"("clubId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_clubId_systemKey_key" ON "FinanceCategory"("clubId", "systemKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_clubId_accountId_bookingDate_idx" ON "LedgerEntry"("clubId", "accountId", "bookingDate");

-- CreateIndex
CREATE INDEX "LedgerEntry_clubId_bookingDate_idx" ON "LedgerEntry"("clubId", "bookingDate");

-- CreateIndex
CREATE INDEX "LedgerEntry_clubId_counterpartyMemberId_idx" ON "LedgerEntry"("clubId", "counterpartyMemberId");

-- CreateIndex
CREATE INDEX "LedgerEntry_clubId_transferGroupId_idx" ON "LedgerEntry"("clubId", "transferGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_clubId_id_key" ON "LedgerEntry"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_clubId_year_number_key" ON "LedgerEntry"("clubId", "year", "number");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_clubId_reversalOfId_key" ON "LedgerEntry"("clubId", "reversalOfId");

-- CreateIndex
CREATE INDEX "LedgerLine_clubId_bookingDate_idx" ON "LedgerLine"("clubId", "bookingDate");

-- CreateIndex
CREATE INDEX "LedgerLine_clubId_categoryId_bookingDate_idx" ON "LedgerLine"("clubId", "categoryId", "bookingDate");

-- CreateIndex
CREATE INDEX "LedgerLine_clubId_departmentId_bookingDate_idx" ON "LedgerLine"("clubId", "departmentId", "bookingDate");

-- CreateIndex
CREATE INDEX "LedgerLine_clubId_eventId_idx" ON "LedgerLine"("clubId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerLine_clubId_id_key" ON "LedgerLine"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerLine_clubId_entryId_position_key" ON "LedgerLine"("clubId", "entryId", "position");

-- AddForeignKey
ALTER TABLE "FinanceSettings" ADD CONSTRAINT "FinanceSettings_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCounter" ADD CONSTRAINT "FinanceCounter_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_clubId_accountId_fkey" FOREIGN KEY ("clubId", "accountId") REFERENCES "FinanceAccount"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_clubId_counterpartyMemberId_fkey" FOREIGN KEY ("clubId", "counterpartyMemberId") REFERENCES "Member"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_clubId_reversalOfId_fkey" FOREIGN KEY ("clubId", "reversalOfId") REFERENCES "LedgerEntry"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_clubId_entryId_fkey" FOREIGN KEY ("clubId", "entryId") REFERENCES "LedgerEntry"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_clubId_categoryId_fkey" FOREIGN KEY ("clubId", "categoryId") REFERENCES "FinanceCategory"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_clubId_departmentId_fkey" FOREIGN KEY ("clubId", "departmentId") REFERENCES "Department"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_clubId_eventId_fkey" FOREIGN KEY ("clubId", "eventId") REFERENCES "Event"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- -----------------------------------------------------------------------------
-- Prüfregeln
-- -----------------------------------------------------------------------------

ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_name_chk"
  CHECK (char_length(btrim("name")) BETWEEN 1 AND 60);
-- Höchstens ein Standard-Bankkonto je Verein (für Beiträge und Lastschrift).
CREATE UNIQUE INDEX "FinanceAccount_one_default_bank" ON "FinanceAccount" ("clubId")
  WHERE "isDefault" AND "kind" = 'BANK' AND "archivedAt" IS NULL;

ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_name_chk"
  CHECK (char_length(btrim("name")) BETWEEN 1 AND 60);

ALTER TABLE "FinanceCounter" ADD CONSTRAINT "FinanceCounter_value_chk" CHECK ("lastValue" >= 0 AND "year" >= 0);

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_amount_chk"
  CHECK ("amountCents" <> 0 AND abs("amountCents") <= 1000000000);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_year_chk"
  CHECK ("year" = extract(year FROM "bookingDate")::int AND "number" > 0);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_reversal_chk"
  CHECK (("kind" = 'REVERSAL') = ("reversalOfId" IS NOT NULL));
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transfer_chk"
  CHECK (("kind" = 'TRANSFER') = ("transferGroupId" IS NOT NULL));
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_text_chk"
  CHECK (char_length(btrim("description")) BETWEEN 1 AND 200
    AND ("counterpartyName" IS NULL OR char_length("counterpartyName") <= 140));

ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_amount_chk"
  CHECK ("amountCents" <> 0 AND abs("amountCents") <= 1000000000 AND "position" >= 1);
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_note_chk"
  CHECK ("note" IS NULL OR char_length("note") <= 200);
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_target_chk"
  CHECK (num_nonnulls("departmentId", "eventId") <= 1);

-- -----------------------------------------------------------------------------
-- Unveränderlichkeit
--
-- Buchungen und Zeilen lassen sich weder ändern noch löschen. Einzige Ausnahme: die Aufbewahrungsroutine
-- (SET LOCAL vereinsflow.finance_purge = 'on') nach Ablauf der Frist. Die Frist gilt für das ganze Buch eines Jahres
-- (§ 147 Abs. 3/4 AO: 10 Jahre ab Ende des Kalenderjahres der letzten Eintragung) – wurde für 2026 noch im Januar 2027
-- gebucht, läuft sie für alle Buchungen des Jahres 2026 erst Ende 2037 ab. TG_ARGV[0] = Spalten, die die Routine leeren
-- darf (kommagetrennt).
-- -----------------------------------------------------------------------------

CREATE FUNCTION "ledger_book_expired"(club text, book_year int) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT greatest(book_year, coalesce(max(extract(year FROM ("recordedAt" AT TIME ZONE 'Europe/Berlin'))::int), book_year)) + 10
         < extract(year FROM (now() AT TIME ZONE 'Europe/Berlin'))::int
  FROM "LedgerEntry" WHERE "clubId" = club AND "year" = book_year;
$$;

CREATE FUNCTION "ledger_immutable_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  purge_mode boolean := coalesce(current_setting('vereinsflow.finance_purge', true), '') = 'on';
  purge_columns text[] := CASE WHEN TG_NARGS > 0 AND TG_ARGV[0] <> '' THEN string_to_array(TG_ARGV[0], ',') ELSE '{}' END;
  book_year int;
BEGIN
  IF purge_mode THEN
    IF TG_TABLE_NAME = 'LedgerEntry' THEN
      book_year := OLD."year";
    ELSE
      book_year := extract(year FROM OLD."bookingDate")::int;
    END IF;
    IF "ledger_book_expired"(OLD."clubId", book_year) THEN
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      IF (to_jsonb(NEW) - purge_columns) = (to_jsonb(OLD) - purge_columns) THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'FINANCE_IMMUTABLE: Einträge im Kassenbuch lassen sich nicht ändern oder löschen (%). Korrekturen gehen nur per Storno.', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "LedgerEntry_immutable" BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION "ledger_immutable_guard"('counterpartyName,description');
CREATE TRIGGER "LedgerLine_immutable" BEFORE UPDATE OR DELETE ON "LedgerLine"
  FOR EACH ROW EXECUTE FUNCTION "ledger_immutable_guard"('note');

-- Konten: Die Art (Bank, Barkasse) steht fest, sobald gebucht wurde – sonst gälten die Regeln der Barkasse rückwirkend anders.
CREATE FUNCTION "finance_account_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" <> OLD."kind"
     AND EXISTS (SELECT 1 FROM "LedgerEntry" WHERE "clubId" = OLD."clubId" AND "accountId" = OLD."id") THEN
    RAISE EXCEPTION 'FINANCE_IMMUTABLE: Die Art eines Kontos steht fest, sobald darauf gebucht wurde.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceAccount_guard" BEFORE UPDATE ON "FinanceAccount"
  FOR EACH ROW EXECUTE FUNCTION "finance_account_guard"();

-- -----------------------------------------------------------------------------
-- Nummernkreise: nur aufwärts, nie löschen
-- -----------------------------------------------------------------------------

CREATE FUNCTION "finance_counter_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Nur die Aufbewahrungsroutine, nur Jahres-Nummernkreise und erst, wenn ihr Jahr lange vorbei ist.
    IF coalesce(current_setting('vereinsflow.finance_purge', true), '') = 'on'
       AND OLD."year" > 0 AND OLD."year" + 10 < extract(year FROM (now() AT TIME ZONE 'Europe/Berlin'))::int THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'FINANCE_IMMUTABLE: Nummernkreise lassen sich nicht löschen.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."clubId" <> OLD."clubId" OR NEW."kind" <> OLD."kind" OR NEW."year" <> OLD."year"
     OR NEW."lastValue" < OLD."lastValue" THEN
    RAISE EXCEPTION 'FINANCE_IMMUTABLE: Nummernkreise zählen nur aufwärts.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceCounter_guard" BEFORE UPDATE OR DELETE ON "FinanceCounter"
  FOR EACH ROW EXECUTE FUNCTION "finance_counter_guard"();

-- -----------------------------------------------------------------------------
-- Einstellungen: Abschluss nur nach vorn (setzt nur der Monatsabschluss), Beginn fest, sobald gebucht wurde
-- -----------------------------------------------------------------------------

CREATE FUNCTION "finance_settings_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "LedgerEntry" WHERE "clubId" = OLD."clubId") THEN
      RAISE EXCEPTION 'FINANCE_IMMUTABLE: Die Finanzeinstellungen gehören zu einem geführten Kassenbuch.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."closedThrough" IS DISTINCT FROM OLD."closedThrough" THEN
    IF pg_trigger_depth() < 2
       OR (OLD."closedThrough" IS NOT NULL AND (NEW."closedThrough" IS NULL OR NEW."closedThrough" < OLD."closedThrough")) THEN
      RAISE EXCEPTION 'PERIOD_REOPEN_FORBIDDEN: Ein abgeschlossener Zeitraum lässt sich nicht wieder öffnen.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW."ledgerStartDate" <> OLD."ledgerStartDate"
     AND EXISTS (SELECT 1 FROM "LedgerEntry" WHERE "clubId" = OLD."clubId") THEN
    RAISE EXCEPTION 'FINANCE_IMMUTABLE: Der Beginn des Kassenbuchs steht fest, sobald gebucht wurde.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceSettings_guard" BEFORE UPDATE OR DELETE ON "FinanceSettings"
  FOR EACH ROW EXECUTE FUNCTION "finance_settings_guard"();

-- -----------------------------------------------------------------------------
-- Kategorien: Art und Systemkennung stehen fest, sobald gebucht wurde (der Bereich darf sich ändern – frühere Buchungen
-- behalten ihre Momentaufnahme).
-- -----------------------------------------------------------------------------

CREATE FUNCTION "finance_category_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."direction" <> OLD."direction" OR NEW."systemKey" IS DISTINCT FROM OLD."systemKey")
     AND EXISTS (SELECT 1 FROM "LedgerLine" WHERE "clubId" = OLD."clubId" AND "categoryId" = OLD."id") THEN
    RAISE EXCEPTION 'CATEGORY_IN_USE: Diese Kategorie wird schon verwendet – Einnahme/Ausgabe lässt sich nicht mehr ändern.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceCategory_guard" BEFORE UPDATE ON "FinanceCategory"
  FOR EACH ROW EXECUTE FUNCTION "finance_category_guard"();

-- -----------------------------------------------------------------------------
-- Buchung anlegen: Zeitraum offen, Konto aktiv, Barkasse nicht in der Zukunft, Anfangsbestand und Storno stimmig
-- -----------------------------------------------------------------------------

CREATE FUNCTION "ledger_entry_before_insert"() RETURNS trigger
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

  SELECT "kind", "archivedAt", "name" INTO account
    FROM "FinanceAccount" WHERE "clubId" = NEW."clubId" AND "id" = NEW."accountId";
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

CREATE TRIGGER "LedgerEntry_before_insert" BEFORE INSERT ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION "ledger_entry_before_insert"();

-- Zeile anlegen: nur zu einer Buchung derselben Transaktion; Momentaufnahmen (Bereich, Kategorie, Datum, Konto) setzt die
-- Datenbank – sie ist hier die maßgebliche Stelle.
CREATE FUNCTION "ledger_line_before_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  entry record;
  category record;
  original_line record;
BEGIN
  SELECT xmin, "bookingDate", "accountId", "kind", "reversalOfId" INTO entry
    FROM "LedgerEntry" WHERE "clubId" = NEW."clubId" AND "id" = NEW."entryId";
  IF entry.xmin <> pg_current_xact_id()::xid THEN
    RAISE EXCEPTION 'FINANCE_IMMUTABLE: Zu einer gespeicherten Buchung lassen sich keine Zeilen hinzufügen.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT "name", "sphere", "archivedAt" INTO category
    FROM "FinanceCategory" WHERE "clubId" = NEW."clubId" AND "id" = NEW."categoryId";
  NEW."sphere" := category."sphere";
  NEW."categoryName" := category."name";
  -- Ein Storno hebt die Buchung so auf, wie sie war: Bereich und Kategoriename der ursprünglichen Zeile (gleiche Stelle),
  -- auch wenn die Kategorie inzwischen umbenannt oder einem anderen Bereich zugeordnet wurde.
  IF entry."kind" = 'REVERSAL' THEN
    SELECT "sphere", "categoryName" INTO original_line
      FROM "LedgerLine"
      WHERE "clubId" = NEW."clubId" AND "entryId" = entry."reversalOfId" AND "position" = NEW."position"
        AND "categoryId" = NEW."categoryId";
    IF FOUND THEN
      NEW."sphere" := original_line."sphere";
      NEW."categoryName" := original_line."categoryName";
    END IF;
  END IF;
  NEW."bookingDate" := entry."bookingDate";
  NEW."accountId" := entry."accountId";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "LedgerLine_before_insert" BEFORE INSERT ON "LedgerLine"
  FOR EACH ROW EXECUTE FUNCTION "ledger_line_before_insert"();

-- -----------------------------------------------------------------------------
-- Beim Abschluss der Transaktion (zurückgestellt): Zeilen = Betrag, Storno spiegelt das Original, Umbuchung paarig
-- -----------------------------------------------------------------------------

CREATE FUNCTION "ledger_balance_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  line_count int;
  line_sum bigint;
  legs record;
BEGIN
  SELECT count(*), coalesce(sum("amountCents"), 0) INTO line_count, line_sum
    FROM "LedgerLine" WHERE "clubId" = NEW."clubId" AND "entryId" = NEW."id";
  IF line_count < 1 OR line_sum <> NEW."amountCents" THEN
    RAISE EXCEPTION 'LEDGER_UNBALANCED: Die Zeilen der Buchung ergeben nicht den Betrag.' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."kind" = 'REVERSAL' THEN
    IF EXISTS (
      (SELECT "categoryId", "sphere", "departmentId", "eventId", -"amountCents" AS a
         FROM "LedgerLine" WHERE "clubId" = NEW."clubId" AND "entryId" = NEW."reversalOfId"
       EXCEPT ALL
       SELECT "categoryId", "sphere", "departmentId", "eventId", "amountCents"
         FROM "LedgerLine" WHERE "clubId" = NEW."clubId" AND "entryId" = NEW."id")
      UNION ALL
      (SELECT "categoryId", "sphere", "departmentId", "eventId", "amountCents"
         FROM "LedgerLine" WHERE "clubId" = NEW."clubId" AND "entryId" = NEW."id"
       EXCEPT ALL
       SELECT "categoryId", "sphere", "departmentId", "eventId", -"amountCents"
         FROM "LedgerLine" WHERE "clubId" = NEW."clubId" AND "entryId" = NEW."reversalOfId")
    ) THEN
      RAISE EXCEPTION 'REVERSAL_INVALID: Ein Storno muss die Zeilen des Originals genau aufheben.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW."kind" = 'TRANSFER' THEN
    SELECT count(*) AS n, count(DISTINCT "accountId") AS accounts, coalesce(sum("amountCents"), 0) AS total INTO legs
      FROM "LedgerEntry" WHERE "clubId" = NEW."clubId" AND "transferGroupId" = NEW."transferGroupId" AND "kind" = 'TRANSFER';
    IF legs.n <> 2 OR legs.accounts <> 2 OR legs.total <> 0 THEN
      RAISE EXCEPTION 'LEDGER_UNBALANCED: Eine Umbuchung besteht aus zwei gleich großen Hälften auf zwei Konten.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "LedgerEntry_balance_check" AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ledger_balance_check"();

-- Barkasse: am Ende jedes Tages ab dem Buchungsdatum nicht im Minus. Gleichzeitige Buchungen derselben Kasse werden über
-- eine Sperre je Kasse nacheinander geprüft (eine Beratungssperre – eine Zeilensperre auf das Konto stieße mit den Sperren
-- der Fremdschlüssel-Prüfung zusammen).
CREATE FUNCTION "ledger_cash_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  account_kind "FinanceAccountKind";
  first_negative record;
BEGIN
  SELECT "kind" INTO account_kind FROM "FinanceAccount"
    WHERE "clubId" = NEW."clubId" AND "id" = NEW."accountId";
  IF account_kind <> 'CASH' THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW."clubId" || ':cash:' || NEW."accountId"));
  SELECT day, balance INTO first_negative FROM (
    SELECT "bookingDate" AS day, sum(sum("amountCents")) OVER (ORDER BY "bookingDate") AS balance
      FROM "LedgerEntry" WHERE "clubId" = NEW."clubId" AND "accountId" = NEW."accountId"
      GROUP BY "bookingDate"
  ) running
  WHERE day >= NEW."bookingDate" AND balance < 0
  ORDER BY day LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'CASH_NEGATIVE: Die Barkasse wäre am % im Minus (−% €).',
      to_char(first_negative.day, 'DD.MM.YYYY'),
      replace(to_char(abs(first_negative.balance) / 100.0, 'FM999999990.00'), '.', ',')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "LedgerEntry_cash_check" AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ledger_cash_check"();
