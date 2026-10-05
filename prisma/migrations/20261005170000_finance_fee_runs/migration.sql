-- Etappe 7: Beitragslauf – aus der Vorschau werden Beiträge (Forderungen) mit Nummer, Zeilen und den Tagen, die sie
-- abdecken. Die Datenbank sichert: kein Tag zweimal (Ausschlussbedingung), Beträge und Zeilen nie geändert, Summe der
-- Zeilen = Betrag, gestrichen nur ohne Zahlung, Nummern lückenlos (Nummernkreis aus Etappe 2).

-- CreateEnum
CREATE TYPE "FeeRunStatus" AS ENUM ('CREATED', 'REVERTED');
CREATE TYPE "ChargeKind" AS ENUM ('FEE', 'MANUAL');
CREATE TYPE "ChargeStatus" AS ENUM ('OPEN', 'PAID', 'VOID', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "FeeRun" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "FeeRunStatus" NOT NULL DEFAULT 'CREATED',
    "idempotencyKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "chargeCount" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "numberFrom" INTEGER,
    "numberTo" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "revertedAt" TIMESTAMPTZ(3),
    "revertedById" TEXT,
    "revertReason" TEXT,

    CONSTRAINT "FeeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" "ChargeKind" NOT NULL DEFAULT 'FEE',
    "title" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "familyId" TEXT,
    "payerMemberId" TEXT NOT NULL,
    "feeRunId" TEXT,
    "periodStart" DATE,
    "periodEnd" DATE,
    "dueDate" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "writtenOffCents" INTEGER NOT NULL DEFAULT 0,
    "status" "ChargeStatus" NOT NULL DEFAULT 'OPEN',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "calculation" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "debtorName" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "collectionHold" BOOLEAN NOT NULL DEFAULT false,
    "reminderLevel" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMPTZ(3),
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "voidedById" TEXT,
    "writtenOffAt" TIMESTAMPTZ(3),
    "writtenOffReason" TEXT,
    "writtenOffById" TEXT,
    "replacesChargeId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeLine" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "feeTypeId" TEXT,
    "feeRateId" TEXT,
    "assignmentId" TEXT,
    "fromDate" DATE,
    "toDate" DATE,
    "amountCents" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "departmentId" TEXT,
    "text" TEXT NOT NULL,

    CONSTRAINT "ChargeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeCoverage" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "chargeLineId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "feeGroup" TEXT NOT NULL,
    "coversFrom" DATE NOT NULL,
    "coversTo" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChargeCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeeRun_clubId_id_key" ON "FeeRun"("clubId", "id");
CREATE UNIQUE INDEX "FeeRun_clubId_idempotencyKey_key" ON "FeeRun"("clubId", "idempotencyKey");
CREATE UNIQUE INDEX "FeeRun_clubId_year_number_key" ON "FeeRun"("clubId", "year", "number");
CREATE INDEX "FeeRun_clubId_periodStart_idx" ON "FeeRun"("clubId", "periodStart");
CREATE UNIQUE INDEX "Charge_clubId_id_key" ON "Charge"("clubId", "id");
CREATE UNIQUE INDEX "Charge_clubId_year_number_key" ON "Charge"("clubId", "year", "number");
CREATE UNIQUE INDEX "Charge_replacesChargeId_key" ON "Charge"("replacesChargeId");
CREATE INDEX "Charge_clubId_status_dueDate_idx" ON "Charge"("clubId", "status", "dueDate");
CREATE INDEX "Charge_clubId_payerMemberId_status_idx" ON "Charge"("clubId", "payerMemberId", "status");
CREATE INDEX "Charge_clubId_memberId_periodStart_idx" ON "Charge"("clubId", "memberId", "periodStart");
CREATE INDEX "Charge_clubId_feeRunId_idx" ON "Charge"("clubId", "feeRunId");
CREATE INDEX "Charge_clubId_familyId_idx" ON "Charge"("clubId", "familyId");
CREATE UNIQUE INDEX "ChargeLine_clubId_id_key" ON "ChargeLine"("clubId", "id");
CREATE UNIQUE INDEX "ChargeLine_chargeId_position_key" ON "ChargeLine"("chargeId", "position");
CREATE INDEX "ChargeLine_clubId_chargeId_idx" ON "ChargeLine"("clubId", "chargeId");
CREATE INDEX "ChargeLine_clubId_feeRateId_idx" ON "ChargeLine"("clubId", "feeRateId");
CREATE INDEX "ChargeLine_clubId_assignmentId_idx" ON "ChargeLine"("clubId", "assignmentId");
CREATE UNIQUE INDEX "ChargeCoverage_clubId_id_key" ON "ChargeCoverage"("clubId", "id");
CREATE INDEX "ChargeCoverage_clubId_memberId_idx" ON "ChargeCoverage"("clubId", "memberId");
CREATE INDEX "ChargeCoverage_clubId_chargeLineId_idx" ON "ChargeCoverage"("clubId", "chargeLineId");

-- AddForeignKey
ALTER TABLE "FeeRun" ADD CONSTRAINT "FeeRun_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_clubId_payerMemberId_fkey" FOREIGN KEY ("clubId", "payerMemberId") REFERENCES "Member"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_clubId_familyId_fkey" FOREIGN KEY ("clubId", "familyId") REFERENCES "FeeFamily"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_clubId_feeRunId_fkey" FOREIGN KEY ("clubId", "feeRunId") REFERENCES "FeeRun"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_replacesChargeId_fkey" FOREIGN KEY ("replacesChargeId") REFERENCES "Charge"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ChargeLine" ADD CONSTRAINT "ChargeLine_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChargeLine" ADD CONSTRAINT "ChargeLine_clubId_chargeId_fkey" FOREIGN KEY ("clubId", "chargeId") REFERENCES "Charge"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ChargeLine" ADD CONSTRAINT "ChargeLine_clubId_feeTypeId_fkey" FOREIGN KEY ("clubId", "feeTypeId") REFERENCES "FeeType"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ChargeLine" ADD CONSTRAINT "ChargeLine_clubId_categoryId_fkey" FOREIGN KEY ("clubId", "categoryId") REFERENCES "FinanceCategory"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ChargeLine" ADD CONSTRAINT "ChargeLine_clubId_departmentId_fkey" FOREIGN KEY ("clubId", "departmentId") REFERENCES "Department"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ChargeCoverage" ADD CONSTRAINT "ChargeCoverage_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChargeCoverage" ADD CONSTRAINT "ChargeCoverage_clubId_chargeLineId_fkey" FOREIGN KEY ("clubId", "chargeLineId") REFERENCES "ChargeLine"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ChargeCoverage" ADD CONSTRAINT "ChargeCoverage_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Prüfungen
-- -----------------------------------------------------------------------------

ALTER TABLE "FeeRun" ADD CONSTRAINT "FeeRun_values_chk"
  CHECK ("periodEnd" >= "periodStart" AND "chargeCount" >= 0 AND "totalCents" >= 0
         AND char_length("label") BETWEEN 1 AND 80
         AND (("status" = 'REVERTED') = ("revertedAt" IS NOT NULL))
         AND ("status" <> 'REVERTED' OR char_length(btrim(coalesce("revertReason", ''))) BETWEEN 2 AND 300));

ALTER TABLE "Charge" ADD CONSTRAINT "Charge_amounts_chk"
  CHECK ("amountCents" BETWEEN 1 AND 1000000000 AND "paidCents" >= 0 AND "writtenOffCents" >= 0
         AND "paidCents" + "writtenOffCents" <= "amountCents" AND "reminderLevel" >= 0);
-- Status passt immer zu den Beträgen: offen (noch nicht ganz bezahlt), bezahlt, gestrichen (ohne Zahlung), ausgebucht.
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_status_chk"
  CHECK (("status" = 'OPEN' AND "paidCents" < "amountCents" AND "writtenOffCents" = 0)
      OR ("status" = 'PAID' AND "paidCents" = "amountCents" AND "writtenOffCents" = 0)
      OR ("status" = 'VOID' AND "paidCents" = 0 AND "writtenOffCents" = 0 AND "voidedAt" IS NOT NULL
          AND char_length(btrim(coalesce("voidReason", ''))) BETWEEN 2 AND 300)
      OR ("status" = 'WRITTEN_OFF' AND "writtenOffCents" > 0 AND "paidCents" + "writtenOffCents" = "amountCents"
          AND "writtenOffAt" IS NOT NULL));
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_text_chk"
  CHECK (char_length("title") BETWEEN 1 AND 120 AND char_length("explanation") <= 2000
         AND char_length("debtorName") BETWEEN 1 AND 200 AND char_length("payerName") BETWEEN 1 AND 200
         AND ("periodStart" IS NULL) = ("periodEnd" IS NULL)
         AND ("periodEnd" IS NULL OR "periodEnd" >= "periodStart"));

-- Eine Zeile kann auf 0 Cent gerundet sein (ein einzelner Tag) – sie bleibt trotzdem: Sie hält fest, welche Tage abgerechnet sind.
ALTER TABLE "ChargeLine" ADD CONSTRAINT "ChargeLine_values_chk"
  CHECK ("position" >= 0 AND char_length("text") BETWEEN 1 AND 300
         AND ("fromDate" IS NULL) = ("toDate" IS NULL)
         AND ("toDate" IS NULL OR "toDate" >= "fromDate"));

ALTER TABLE "ChargeCoverage" ADD CONSTRAINT "ChargeCoverage_values_chk"
  CHECK ("coversTo" >= "coversFrom" AND char_length("feeGroup") BETWEEN 1 AND 64);
-- Kein Tag zweimal: je Mitglied und Gruppe (Grundbeitrag/Familie bzw. Beitragsart) höchstens eine geltende Abdeckung.
ALTER TABLE "ChargeCoverage" ADD CONSTRAINT "ChargeCoverage_no_overlap"
  EXCLUDE USING gist ("clubId" WITH =, "memberId" WITH =, "feeGroup" WITH =,
    daterange("coversFrom", "coversTo", '[]') WITH &&) WHERE ("active");

-- -----------------------------------------------------------------------------
-- Beitragslauf: nur „rückgängig“ (CREATED → REVERTED mit Grund), sonst unveränderlich; löschen nie.
-- -----------------------------------------------------------------------------

CREATE FUNCTION "fee_run_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION 'FEE_RUN_LOCKED: Ein Beitragslauf bleibt erhalten – er lässt sich nur rückgängig machen.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'REVERTED'
     OR (to_jsonb(NEW) - 'status' - 'revertedAt' - 'revertedById' - 'revertReason')
        <> (to_jsonb(OLD) - 'status' - 'revertedAt' - 'revertedById' - 'revertReason') THEN
    RAISE EXCEPTION 'FEE_RUN_LOCKED: Ein Beitragslauf lässt sich nicht ändern – nur rückgängig machen.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FeeRun_guard" BEFORE UPDATE OR DELETE ON "FeeRun"
  FOR EACH ROW EXECUTE FUNCTION "fee_run_guard"();

-- -----------------------------------------------------------------------------
-- Beiträge: Betrag, Zeilen, Mitglied, Zahler, Zeitraum und Erklärung bleiben, wie sie erstellt wurden. Änderbar sind
-- nur Status und Zahlungsstand (Zahlungen ab Etappe 8 über ihre Zuordnung), Fälligkeit (solange offen), Mahnstufe und
-- „nicht einziehen“. Gestrichen und ausgebucht sind endgültig. Löschen nie.
-- -----------------------------------------------------------------------------

CREATE FUNCTION "charge_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION 'CHARGE_LOCKED: Ein Beitrag bleibt erhalten – streiche ihn stattdessen.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF (to_jsonb(NEW) - 'paidCents' - 'writtenOffCents' - 'status' - 'dueDate' - 'collectionHold' - 'reminderLevel'
        - 'lastReminderAt' - 'voidedAt' - 'voidReason' - 'voidedById' - 'writtenOffAt' - 'writtenOffReason'
        - 'writtenOffById' - 'updatedAt')
     <> (to_jsonb(OLD) - 'paidCents' - 'writtenOffCents' - 'status' - 'dueDate' - 'collectionHold' - 'reminderLevel'
        - 'lastReminderAt' - 'voidedAt' - 'voidReason' - 'voidedById' - 'writtenOffAt' - 'writtenOffReason'
        - 'writtenOffById' - 'updatedAt') THEN
    RAISE EXCEPTION 'CHARGE_LOCKED: Ein erstellter Beitrag lässt sich nicht ändern – streiche ihn und erstelle ihn neu.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" IN ('VOID', 'WRITTEN_OFF')
     AND (to_jsonb(NEW) - 'updatedAt') <> (to_jsonb(OLD) - 'updatedAt') THEN
    RAISE EXCEPTION 'CHARGE_LOCKED: Ein gestrichener oder ausgebuchter Beitrag bleibt, wie er ist.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Zahlungsstand nur über Zahlungen (deren Trigger); von Hand nur streichen oder ausbuchen.
  IF NEW."paidCents" <> OLD."paidCents" AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'CHARGE_LOCKED: Der Zahlungsstand ändert sich nur über erfasste Zahlungen.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" <> OLD."status" AND pg_trigger_depth() < 2
     AND NOT (OLD."status" = 'OPEN' AND NEW."status" IN ('VOID', 'WRITTEN_OFF')) THEN
    RAISE EXCEPTION 'CHARGE_LOCKED: Dieser Statuswechsel geht nur über erfasste Zahlungen.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."dueDate" <> OLD."dueDate" AND OLD."status" <> 'OPEN' THEN
    RAISE EXCEPTION 'CHARGE_LOCKED: Die Fälligkeit lässt sich nur bei offenen Beiträgen ändern.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Charge_guard" BEFORE UPDATE OR DELETE ON "Charge"
  FOR EACH ROW EXECUTE FUNCTION "charge_guard"();

-- Gestrichen: Die abgedeckten Tage werden wieder frei (ein neuer Lauf kann sie berechnen).
CREATE FUNCTION "charge_void_release"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "ChargeCoverage" c SET "active" = false
    FROM "ChargeLine" l
   WHERE l."clubId" = NEW."clubId" AND l."chargeId" = NEW."id"
     AND c."clubId" = l."clubId" AND c."chargeLineId" = l."id" AND c."active";
  RETURN NULL;
END;
$$;

CREATE TRIGGER "Charge_void_release" AFTER UPDATE OF "status" ON "Charge"
  FOR EACH ROW WHEN (NEW."status" = 'VOID' AND OLD."status" <> 'VOID')
  EXECUTE FUNCTION "charge_void_release"();

-- Zeilen: unveränderlich, nie gelöscht.
CREATE FUNCTION "charge_line_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() >= 2 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'CHARGE_LOCKED: Die Zeilen eines Beitrags lassen sich nicht ändern.' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "ChargeLine_guard" BEFORE UPDATE OR DELETE ON "ChargeLine"
  FOR EACH ROW EXECUTE FUNCTION "charge_line_guard"();

-- Summe der Zeilen = Betrag – geprüft am Ende der Transaktion (Beitrag und Zeilen werden nacheinander angelegt).
CREATE FUNCTION "charge_lines_sum_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_id text;
  total integer;
  lines bigint;
BEGIN
  -- Getrennte Zweige: Ein Ausdruck mit NEW."chargeId" ließe sich für eine Zeile von "Charge" gar nicht erst vorbereiten.
  IF TG_TABLE_NAME = 'Charge' THEN
    target_id := NEW."id";
  ELSE
    target_id := NEW."chargeId";
  END IF;
  SELECT c."amountCents" INTO total FROM "Charge" c WHERE c."clubId" = NEW."clubId" AND c."id" = target_id;
  SELECT coalesce(sum(l."amountCents"), 0) INTO lines
    FROM "ChargeLine" l WHERE l."clubId" = NEW."clubId" AND l."chargeId" = target_id;
  IF total IS NULL OR lines <> total THEN
    RAISE EXCEPTION 'CHARGE_INVALID: Die Zeilen eines Beitrags ergeben nicht seinen Betrag.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "Charge_lines_sum" AFTER INSERT ON "Charge"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "charge_lines_sum_check"();
CREATE CONSTRAINT TRIGGER "ChargeLine_lines_sum" AFTER INSERT ON "ChargeLine"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "charge_lines_sum_check"();

-- Abdeckung: nur freigeben (aktiv → nicht mehr aktiv, beim Streichen), sonst unveränderlich; löschen nie.
CREATE FUNCTION "charge_coverage_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION 'CHARGE_LOCKED: Abgerechnete Tage bleiben erhalten.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF NOT (OLD."active" AND NOT NEW."active" AND (to_jsonb(NEW) - 'active') = (to_jsonb(OLD) - 'active')) THEN
    RAISE EXCEPTION 'CHARGE_LOCKED: Abgerechnete Tage werden nur durch Streichen des Beitrags frei.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ChargeCoverage_guard" BEFORE UPDATE OR DELETE ON "ChargeCoverage"
  FOR EACH ROW EXECUTE FUNCTION "charge_coverage_guard"();
