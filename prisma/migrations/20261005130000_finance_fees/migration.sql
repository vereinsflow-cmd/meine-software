-- Etappe 5: Mitgliedsbeiträge – Beitragsarten mit Sätzen, Ermäßigungen/Befreiungen, abweichende Zahler und der
-- Status-Verlauf der Mitglieder (für „Wer zahlt was“ tageweise richtig: passiv ab 16.11., ausgetreten am 31.12. …).
-- Berechnet wird in der Anwendung (src/modules/fees/engine.ts); die Datenbank sichert Eindeutigkeit und Verlauf.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "FeeTypeKind" AS ENUM ('BASE', 'ADDITIONAL', 'ADMISSION', 'FAMILY');
CREATE TYPE "FeeInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'ONCE');
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'DIRECT_DEBIT', 'CASH');
CREATE TYPE "FeeAssignmentKind" AS ENUM ('ASSIGN', 'EXEMPT', 'DISCOUNT_PERCENT', 'FIXED_AMOUNT');
CREATE TYPE "ProRataEntry" AS ENUM ('DAY', 'MONTH_START', 'NEXT_MONTH', 'NONE');
CREATE TYPE "ProRataExit" AS ENUM ('DAY', 'MONTH_END', 'PERIOD_END');
CREATE TYPE "AgeRule" AS ENUM ('EXACT_DAY', 'PERIOD_START', 'CALENDAR_YEAR');

-- AlterTable
ALTER TABLE "FinanceSettings"
  ADD COLUMN "feeInterval" "FeeInterval" NOT NULL DEFAULT 'QUARTERLY',
  ADD COLUMN "dueDay" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "proRataEntry" "ProRataEntry" NOT NULL DEFAULT 'DAY',
  ADD COLUMN "proRataExit" "ProRataExit" NOT NULL DEFAULT 'DAY',
  ADD COLUMN "ageRule" "AgeRule" NOT NULL DEFAULT 'EXACT_DAY',
  ADD COLUMN "missingBirthDateAsAdult" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "minDebitCents" INTEGER NOT NULL DEFAULT 500;

-- CreateTable
CREATE TABLE "MemberStatusChange" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "MemberStatus" NOT NULL,
    "validFrom" DATE NOT NULL,
    -- Mikrosekunden und Uhrzeit des Einfügens (nicht Beginn der Transaktion): legt die Reihenfolge der Erfassung fest.
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "MemberStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeType" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FeeTypeKind" NOT NULL,
    "categoryId" TEXT,
    "departmentId" TEXT,
    "statuses" "MemberStatus"[] DEFAULT ARRAY[]::"MemberStatus"[],
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "familyMinMembers" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "description" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FeeType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeRate" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "feeTypeId" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "interval" "FeeInterval" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "FeeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberFinance" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "payerMemberId" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MemberFinance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberFeeAssignment" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" "FeeAssignmentKind" NOT NULL,
    "feeTypeId" TEXT,
    "percentBp" INTEGER,
    "amountCents" INTEGER,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "endedById" TEXT,

    CONSTRAINT "MemberFeeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberStatusChange_clubId_id_key" ON "MemberStatusChange"("clubId", "id");
CREATE INDEX "MemberStatusChange_clubId_memberId_validFrom_idx" ON "MemberStatusChange"("clubId", "memberId", "validFrom");
CREATE UNIQUE INDEX "FeeType_clubId_id_key" ON "FeeType"("clubId", "id");
CREATE UNIQUE INDEX "FeeType_clubId_name_key" ON "FeeType"("clubId", "name");
CREATE UNIQUE INDEX "FeeRate_clubId_id_key" ON "FeeRate"("clubId", "id");
CREATE UNIQUE INDEX "FeeRate_clubId_feeTypeId_validFrom_key" ON "FeeRate"("clubId", "feeTypeId", "validFrom");
CREATE UNIQUE INDEX "MemberFinance_clubId_id_key" ON "MemberFinance"("clubId", "id");
CREATE UNIQUE INDEX "MemberFinance_clubId_memberId_key" ON "MemberFinance"("clubId", "memberId");
CREATE INDEX "MemberFinance_clubId_payerMemberId_idx" ON "MemberFinance"("clubId", "payerMemberId");
CREATE UNIQUE INDEX "MemberFeeAssignment_clubId_id_key" ON "MemberFeeAssignment"("clubId", "id");
CREATE INDEX "MemberFeeAssignment_clubId_memberId_validFrom_idx" ON "MemberFeeAssignment"("clubId", "memberId", "validFrom");

-- AddForeignKey
ALTER TABLE "MemberStatusChange" ADD CONSTRAINT "MemberStatusChange_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberStatusChange" ADD CONSTRAINT "MemberStatusChange_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeType" ADD CONSTRAINT "FeeType_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeType" ADD CONSTRAINT "FeeType_clubId_categoryId_fkey" FOREIGN KEY ("clubId", "categoryId") REFERENCES "FinanceCategory"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeType" ADD CONSTRAINT "FeeType_clubId_departmentId_fkey" FOREIGN KEY ("clubId", "departmentId") REFERENCES "Department"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeRate" ADD CONSTRAINT "FeeRate_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeRate" ADD CONSTRAINT "FeeRate_clubId_feeTypeId_fkey" FOREIGN KEY ("clubId", "feeTypeId") REFERENCES "FeeType"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberFinance" ADD CONSTRAINT "MemberFinance_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberFinance" ADD CONSTRAINT "MemberFinance_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberFinance" ADD CONSTRAINT "MemberFinance_clubId_payerMemberId_fkey" FOREIGN KEY ("clubId", "payerMemberId") REFERENCES "Member"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberFeeAssignment" ADD CONSTRAINT "MemberFeeAssignment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberFeeAssignment" ADD CONSTRAINT "MemberFeeAssignment_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberFeeAssignment" ADD CONSTRAINT "MemberFeeAssignment_clubId_feeTypeId_fkey" FOREIGN KEY ("clubId", "feeTypeId") REFERENCES "FeeType"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Prüfungen
-- -----------------------------------------------------------------------------

ALTER TABLE "FinanceSettings" ADD CONSTRAINT "FinanceSettings_fees_chk"
  CHECK ("feeInterval" <> 'ONCE' AND "dueDay" BETWEEN 1 AND 28 AND "minDebitCents" BETWEEN 0 AND 100000);
ALTER TABLE "FeeType" ADD CONSTRAINT "FeeType_values_chk"
  CHECK (char_length(btrim("name")) BETWEEN 1 AND 60
         AND ("minAge" IS NULL OR "minAge" BETWEEN 0 AND 120)
         AND ("maxAge" IS NULL OR "maxAge" BETWEEN 0 AND 120)
         AND ("minAge" IS NULL OR "maxAge" IS NULL OR "minAge" <= "maxAge")
         AND ("kind" <> 'FAMILY' OR "familyMinMembers" >= 2)
         AND ("description" IS NULL OR char_length("description") <= 300)
         AND "priority" BETWEEN 0 AND 10000);
-- Grundbeiträge: Reihenfolge eindeutig – so ist nie unklar, welche Regel greift.
CREATE UNIQUE INDEX "FeeType_one_priority_per_base" ON "FeeType"("clubId", "priority")
  WHERE "kind" = 'BASE' AND "archivedAt" IS NULL;
ALTER TABLE "FeeRate" ADD CONSTRAINT "FeeRate_amount_chk"
  CHECK ("amountCents" BETWEEN 0 AND 1000000000);
ALTER TABLE "MemberFinance" ADD CONSTRAINT "MemberFinance_payer_chk"
  CHECK ("payerMemberId" IS NULL OR "payerMemberId" <> "memberId");
ALTER TABLE "MemberFinance" ADD CONSTRAINT "MemberFinance_note_chk"
  CHECK ("note" IS NULL OR char_length("note") <= 500);
ALTER TABLE "MemberFeeAssignment" ADD CONSTRAINT "MemberFeeAssignment_kind_chk"
  CHECK ((("kind" = 'DISCOUNT_PERCENT') = ("percentBp" IS NOT NULL))
         AND ("percentBp" IS NULL OR "percentBp" BETWEEN 1 AND 10000)
         AND (("kind" = 'FIXED_AMOUNT') = ("amountCents" IS NOT NULL))
         AND ("amountCents" IS NULL OR "amountCents" BETWEEN 1 AND 1000000000)
         AND (("kind" = 'ASSIGN') = ("feeTypeId" IS NOT NULL))
         AND ("kind" = 'ASSIGN' OR char_length(btrim(coalesce("reason", ''))) BETWEEN 2 AND 140)
         AND ("validTo" IS NULL OR "validTo" >= "validFrom"));
-- Je Mitglied und Tag höchstens eine feste Beitragsart und höchstens eine Ermäßigung/Befreiung/fester Betrag.
ALTER TABLE "MemberFeeAssignment" ADD CONSTRAINT "MemberFeeAssignment_no_overlap"
  EXCLUDE USING gist ("clubId" WITH =, "memberId" WITH =, (("kind" = 'ASSIGN')) WITH =,
    daterange("validFrom", coalesce("validTo", 'infinity'::date), '[]') WITH &&);

-- -----------------------------------------------------------------------------
-- Status-Verlauf: schreibt die Datenbank selbst – bei jedem neuen Mitglied und jeder Statusänderung, egal auf welchem Weg
-- (Formular, Import, Beitrittsantrag, Einladung, Anonymisierung). Einträge werden nicht geändert.
-- -----------------------------------------------------------------------------

CREATE FUNCTION "member_status_history"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  berlin_today date := (now() AT TIME ZONE 'Europe/Berlin')::date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Schon gekündigt angelegt (Import, Formular): aktiv ab Eintritt, ausgetreten ab dem Austrittstag.
    IF NEW."status" = 'LEFT' AND NEW."leftAt" IS NOT NULL
       AND coalesce(NEW."joinedAt", NEW."leftAt") < NEW."leftAt" THEN
      INSERT INTO "MemberStatusChange" ("id", "clubId", "memberId", "status", "validFrom")
        VALUES (gen_random_uuid()::text, NEW."clubId", NEW."id", 'ACTIVE', NEW."joinedAt");
      INSERT INTO "MemberStatusChange" ("id", "clubId", "memberId", "status", "validFrom", "createdAt")
        VALUES (gen_random_uuid()::text, NEW."clubId", NEW."id", 'LEFT', NEW."leftAt", clock_timestamp() + interval '1 microsecond');
      RETURN NULL;
    END IF;
    INSERT INTO "MemberStatusChange" ("id", "clubId", "memberId", "status", "validFrom")
      VALUES (gen_random_uuid()::text, NEW."clubId", NEW."id", NEW."status", coalesce(NEW."joinedAt", berlin_today));
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    -- Austritt mit Datum: ab dem Austrittstag; sonst ab heute.
    INSERT INTO "MemberStatusChange" ("id", "clubId", "memberId", "status", "validFrom")
      VALUES (gen_random_uuid()::text, NEW."clubId", NEW."id", NEW."status",
        CASE WHEN NEW."status" = 'LEFT' AND NEW."leftAt" IS NOT NULL THEN NEW."leftAt" ELSE berlin_today END);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "Member_status_history" AFTER INSERT OR UPDATE OF "status" ON "Member"
  FOR EACH ROW EXECUTE FUNCTION "member_status_history"();

CREATE FUNCTION "member_status_change_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'FEE_HISTORY_LOCKED: Der Status-Verlauf lässt sich nicht ändern.' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "MemberStatusChange_guard" BEFORE UPDATE ON "MemberStatusChange"
  FOR EACH ROW EXECUTE FUNCTION "member_status_change_guard"();

-- Verlauf für vorhandene Mitglieder: Ausgetretene mit Datum aktiv bis zum Austritt, alle anderen im heutigen Status –
-- jeweils ab Eintritt (bzw. Anlage).
INSERT INTO "MemberStatusChange" ("id", "clubId", "memberId", "status", "validFrom")
  SELECT gen_random_uuid()::text, m."clubId", m."id",
         CASE WHEN m."status" = 'LEFT' AND m."leftAt" IS NOT NULL THEN 'ACTIVE'::"MemberStatus" ELSE m."status" END,
         coalesce(m."joinedAt", (m."createdAt" AT TIME ZONE 'Europe/Berlin')::date)
    FROM "Member" m;
INSERT INTO "MemberStatusChange" ("id", "clubId", "memberId", "status", "validFrom", "createdAt")
  SELECT gen_random_uuid()::text, m."clubId", m."id", 'LEFT', m."leftAt", clock_timestamp() + interval '1 microsecond'
    FROM "Member" m WHERE m."status" = 'LEFT' AND m."leftAt" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Beitragssätze: nicht ändern („Neuer Betrag ab …“ legt einen neuen an); löschen nur, solange er noch nicht gilt.
-- -----------------------------------------------------------------------------

CREATE FUNCTION "fee_rate_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'FEE_RATE_LOCKED: Ein Beitragssatz lässt sich nicht ändern – lege einen neuen Betrag ab einem Datum an.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Löschen: solange er noch nicht gilt, oder am Tag der Eingabe (vertippt); sonst bleibt er für frühere Zeiträume.
  IF OLD."validFrom" <= (now() AT TIME ZONE 'Europe/Berlin')::date
     AND (OLD."createdAt" AT TIME ZONE 'Europe/Berlin')::date < (now() AT TIME ZONE 'Europe/Berlin')::date
     AND coalesce(current_setting('vereinsflow.finance_purge', true), '') <> 'on'
     AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'FEE_RATE_LOCKED: Ein Beitragssatz, der schon gilt, bleibt erhalten.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "FeeRate_guard" BEFORE UPDATE OR DELETE ON "FeeRate"
  FOR EACH ROW EXECUTE FUNCTION "fee_rate_guard"();

-- -----------------------------------------------------------------------------
-- Ermäßigungen und feste Beitragsarten: nur beenden (validTo), nicht umschreiben; löschen nur, solange sie noch nicht gelten.
-- -----------------------------------------------------------------------------

CREATE FUNCTION "fee_assignment_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Anonymisierung (Datenschutzroutine): nur den Grund ersetzen.
    IF coalesce(current_setting('vereinsflow.audit_purge', true), '') = 'on'
       AND (to_jsonb(NEW) - 'reason') = (to_jsonb(OLD) - 'reason') THEN
      RETURN NEW;
    END IF;
    IF (to_jsonb(NEW) - 'validTo' - 'endedById') <> (to_jsonb(OLD) - 'validTo' - 'endedById') THEN
      RAISE EXCEPTION 'FEE_HISTORY_LOCKED: Eine Ermäßigung lässt sich nur beenden – für andere Werte bitte eine neue anlegen.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- Löschen: solange sie noch nicht gilt, oder am Tag der Eingabe (versehentlich angelegt).
  IF OLD."validFrom" <= (now() AT TIME ZONE 'Europe/Berlin')::date
     AND (OLD."createdAt" AT TIME ZONE 'Europe/Berlin')::date < (now() AT TIME ZONE 'Europe/Berlin')::date
     AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'FEE_HISTORY_LOCKED: Eine Ermäßigung, die schon gilt, bleibt erhalten – beende sie stattdessen.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "MemberFeeAssignment_guard" BEFORE UPDATE OR DELETE ON "MemberFeeAssignment"
  FOR EACH ROW EXECUTE FUNCTION "fee_assignment_guard"();

-- Zahler: Wer für andere zahlt, hat selbst keinen abweichenden Zahler (keine Ketten).
CREATE FUNCTION "member_finance_payer_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Eine Sperre je Verein: Zwei gleichzeitige Änderungen sähen sonst die Kette nicht.
  PERFORM pg_advisory_xact_lock(hashtext(NEW."clubId" || ':payer'));
  IF NEW."payerMemberId" IS NOT NULL AND (
       EXISTS (SELECT 1 FROM "MemberFinance" f
                WHERE f."clubId" = NEW."clubId" AND f."memberId" = NEW."payerMemberId" AND f."payerMemberId" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "MemberFinance" f
                WHERE f."clubId" = NEW."clubId" AND f."payerMemberId" = NEW."memberId")) THEN
    RAISE EXCEPTION 'PAYER_CHAIN: Wer für andere zahlt, braucht selbst keinen Zahler – bitte direkt den zahlenden Elternteil wählen.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "MemberFinance_payer_guard" BEFORE INSERT OR UPDATE OF "payerMemberId" ON "MemberFinance"
  FOR EACH ROW EXECUTE FUNCTION "member_finance_payer_guard"();
