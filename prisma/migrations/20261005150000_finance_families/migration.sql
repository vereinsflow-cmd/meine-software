-- Etappe 6: Familien – eine feste Gruppe, die der Kassenwart pflegt, zahlt einen Familienbeitrag statt der Grundbeiträge
-- ihrer Mitglieder, an einen Zahler. Mitglieder haben einen Zeitraum (ab/bis); so bleiben frühere Zeiträume richtig.

-- CreateTable
CREATE TABLE "FeeFamily" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feeTypeId" TEXT NOT NULL,
    "payerMemberId" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "FeeFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeFamilyMember" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "endedById" TEXT,

    CONSTRAINT "FeeFamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeeFamily_clubId_id_key" ON "FeeFamily"("clubId", "id");
CREATE INDEX "FeeFamily_clubId_payerMemberId_idx" ON "FeeFamily"("clubId", "payerMemberId");
CREATE UNIQUE INDEX "FeeFamilyMember_clubId_id_key" ON "FeeFamilyMember"("clubId", "id");
CREATE INDEX "FeeFamilyMember_clubId_familyId_idx" ON "FeeFamilyMember"("clubId", "familyId");
CREATE INDEX "FeeFamilyMember_clubId_memberId_validFrom_idx" ON "FeeFamilyMember"("clubId", "memberId", "validFrom");

-- AddForeignKey
ALTER TABLE "FeeFamily" ADD CONSTRAINT "FeeFamily_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeFamily" ADD CONSTRAINT "FeeFamily_clubId_feeTypeId_fkey" FOREIGN KEY ("clubId", "feeTypeId") REFERENCES "FeeType"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "FeeFamily" ADD CONSTRAINT "FeeFamily_clubId_payerMemberId_fkey" FOREIGN KEY ("clubId", "payerMemberId") REFERENCES "Member"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "FeeFamilyMember" ADD CONSTRAINT "FeeFamilyMember_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeFamilyMember" ADD CONSTRAINT "FeeFamilyMember_clubId_familyId_fkey" FOREIGN KEY ("clubId", "familyId") REFERENCES "FeeFamily"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "FeeFamilyMember" ADD CONSTRAINT "FeeFamilyMember_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Prüfungen
-- -----------------------------------------------------------------------------

ALTER TABLE "FeeFamily" ADD CONSTRAINT "FeeFamily_name_chk"
  CHECK (char_length(btrim("name")) BETWEEN 1 AND 80);
ALTER TABLE "FeeFamilyMember" ADD CONSTRAINT "FeeFamilyMember_dates_chk"
  CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");
-- Ein Mitglied ist an jedem Tag in höchstens einer Familie.
ALTER TABLE "FeeFamilyMember" ADD CONSTRAINT "FeeFamilyMember_no_overlap"
  EXCLUDE USING gist ("clubId" WITH =, "memberId" WITH =,
    daterange("validFrom", coalesce("validTo", 'infinity'::date), '[]') WITH &&);

-- Familie: Beitragsart der Art „Familienbeitrag“; der Zahler hat selbst keinen abweichenden Zahler (keine Ketten).
CREATE FUNCTION "fee_family_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "FeeType" t
                  WHERE t."clubId" = NEW."clubId" AND t."id" = NEW."feeTypeId" AND t."kind" = 'FAMILY') THEN
    RAISE EXCEPTION 'FAMILY_TYPE: Eine Familie braucht eine Beitragsart der Art „Familienbeitrag“.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Gleiche Sperre wie bei „Zahler und Zahlweg“: Zwei gleichzeitige Änderungen sähen sonst die Kette nicht.
  PERFORM pg_advisory_xact_lock(hashtext(NEW."clubId" || ':payer'));
  IF NEW."archivedAt" IS NULL AND EXISTS (
       SELECT 1 FROM "MemberFinance" f
        WHERE f."clubId" = NEW."clubId" AND f."memberId" = NEW."payerMemberId" AND f."payerMemberId" IS NOT NULL) THEN
    RAISE EXCEPTION 'PAYER_CHAIN: Wer für eine Familie zahlt, braucht selbst keinen Zahler – bitte direkt den Zahlenden wählen.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FeeFamily_guard" BEFORE INSERT OR UPDATE OF "feeTypeId", "payerMemberId", "archivedAt" ON "FeeFamily"
  FOR EACH ROW EXECUTE FUNCTION "fee_family_guard"();

-- Eine Beitragsart, die eine Familie nutzt, bleibt „Familienbeitrag“ (die Art einer Beitragsart ändert die Anwendung nie;
-- das hier sichert es zusätzlich ab).
CREATE FUNCTION "fee_type_family_kind_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."kind" = 'FAMILY' AND NEW."kind" <> 'FAMILY'
     AND EXISTS (SELECT 1 FROM "FeeFamily" f WHERE f."clubId" = OLD."clubId" AND f."feeTypeId" = OLD."id") THEN
    RAISE EXCEPTION 'FAMILY_TYPE: Diese Beitragsart nutzen Familien – sie bleibt ein Familienbeitrag.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FeeType_family_kind_guard" BEFORE UPDATE OF "kind" ON "FeeType"
  FOR EACH ROW EXECUTE FUNCTION "fee_type_family_kind_guard"();

-- „Zahler und Zahlweg“: Wer für eine Familie zahlt, bekommt selbst keinen abweichenden Zahler (keine Ketten) – solange
-- die Familie noch läuft (nicht aufgelöst und ein Mitglied heute oder künftig dabei).
CREATE OR REPLACE FUNCTION "member_finance_payer_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  berlin_today date := (now() AT TIME ZONE 'Europe/Berlin')::date;
BEGIN
  -- Eine Sperre je Verein: Zwei gleichzeitige Änderungen sähen sonst die Kette nicht.
  PERFORM pg_advisory_xact_lock(hashtext(NEW."clubId" || ':payer'));
  IF NEW."payerMemberId" IS NOT NULL AND (
       EXISTS (SELECT 1 FROM "MemberFinance" f
                WHERE f."clubId" = NEW."clubId" AND f."memberId" = NEW."payerMemberId" AND f."payerMemberId" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "MemberFinance" f
                WHERE f."clubId" = NEW."clubId" AND f."payerMemberId" = NEW."memberId")
    OR EXISTS (SELECT 1 FROM "FeeFamily" fam
                WHERE fam."clubId" = NEW."clubId" AND fam."payerMemberId" = NEW."memberId" AND fam."archivedAt" IS NULL
                  AND EXISTS (SELECT 1 FROM "FeeFamilyMember" fm
                               WHERE fm."clubId" = fam."clubId" AND fm."familyId" = fam."id"
                                 AND (fm."validTo" IS NULL OR fm."validTo" >= berlin_today)))) THEN
    RAISE EXCEPTION 'PAYER_CHAIN: Wer für andere zahlt, braucht selbst keinen Zahler – bitte direkt den zahlenden Elternteil wählen.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Familienmitglieder: nur beenden (bis), nicht umschreiben; entfernen nur, solange es noch nicht gilt oder am Tag der
-- Eingabe (versehentlich). So bleibt nachvollziehbar, wer wann zur Familie gehörte.
CREATE FUNCTION "fee_family_member_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'validTo' - 'endedById') <> (to_jsonb(OLD) - 'validTo' - 'endedById') THEN
      RAISE EXCEPTION 'FEE_HISTORY_LOCKED: Ein Familienmitglied lässt sich nur austragen (bis) – sonst bitte neu hinzufügen.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."validFrom" <= (now() AT TIME ZONE 'Europe/Berlin')::date
     AND (OLD."createdAt" AT TIME ZONE 'Europe/Berlin')::date < (now() AT TIME ZONE 'Europe/Berlin')::date
     AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'FEE_HISTORY_LOCKED: Wer schon zur Familie gehört hat, bleibt im Verlauf – trage das Mitglied stattdessen aus.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "FeeFamilyMember_guard" BEFORE UPDATE OR DELETE ON "FeeFamilyMember"
  FOR EACH ROW EXECUTE FUNCTION "fee_family_member_guard"();
