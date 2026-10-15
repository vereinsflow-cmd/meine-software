-- Etappe 15: Spenden (docs/adr/0013, Teil 1 – Erfassen; Zuwendungsbestätigungen folgen in finance_donation_receipts).
--
-- Spender (Mitglied oder andere Person/Firma/Stiftung), Spenden und ihre Nachweise sind Aufzeichnungen nach § 50 Abs. 7
-- EStDV neben dem Kassenbuch:
--   * Geldspende = genau eine Zeile im Kassenbuch (Kategorie „Spenden“, gewöhnliche Einnahme, nicht storniert). Betrag,
--     Tag, Abteilung und Veranstaltung setzt die Datenbank aus der Zeile und hält sie fest – sonst zeigten Spenden-Seite
--     und Kassenbuch verschiedene Zahlen oder Zwecke. Storniert gilt sie über das Storno der Buchung (berechnet).
--   * Sach- und Aufwandsspenden haben keine Buchung (kein Geld geflossen), dafür Nachweise; storniert wird mit Grund, nie
--     gelöscht. Der Tag der Zuwendung liegt nicht in der Zukunft und nicht vor dem Beginn des Kassenbuchs.
--   * Ohne Spender = Spendendose (nur Geld, mit Bezeichnung).
--   * Nachweise (Dateien) werden 10 Jahre aufbewahrt; ein Dokument an Buchung UND Spende behält die längere Frist.
-- Fehler melden sich mit einem Kürzel und einem deutschen Satz ('CODE: …'); src/server/action.ts übersetzt sie.

-- CreateEnum
CREATE TYPE "DonationKind" AS ENUM ('MONEY', 'IN_KIND', 'EXPENSE_WAIVER');

-- CreateEnum
CREATE TYPE "DonorKind" AS ENUM ('PERSON', 'COMPANY', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "DonationReceiptWish" AS ENUM ('AUTO', 'WANTED', 'NOT_WANTED');

-- CreateEnum
CREATE TYPE "DonationPaymentMethod" AS ENUM ('TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "InKindOrigin" AS ENUM ('BUSINESS', 'PRIVATE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WaiverBasis" AS ENUM ('STATUTE', 'BOARD_DECISION', 'CONTRACT');

-- CreateEnum
CREATE TYPE "ExemptionKind" AS ENUM ('EXEMPTION_NOTICE', 'KST_ANNEX', 'FINDING_60A');

-- AlterTable
ALTER TABLE "FinanceSettings" ADD COLUMN     "exemptionDate" DATE,
ADD COLUMN     "exemptionKind" "ExemptionKind",
ADD COLUMN     "exemptionLastYear" INTEGER,
ADD COLUMN     "membershipFeesDeductible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxNumber" TEXT,
ADD COLUMN     "taxOffice" TEXT,
ADD COLUMN     "taxPurposes" TEXT,
ADD COLUMN     "taxPurposesStatute" TEXT;

-- CreateTable
CREATE TABLE "Donor" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "kind" "DonorKind" NOT NULL DEFAULT 'PERSON',
    "memberId" TEXT,
    "name" TEXT,
    "street" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT,
    "restrictedAt" TIMESTAMPTZ(3),
    "restrictedReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Donor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "kind" "DonationKind" NOT NULL,
    "donorId" TEXT,
    "anonymousLabel" TEXT,
    "ledgerLineId" TEXT,
    "receivedOn" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentMethod" "DonationPaymentMethod",
    "departmentId" TEXT,
    "eventId" TEXT,
    "purposeText" TEXT,
    "receiptWish" "DonationReceiptWish" NOT NULL DEFAULT 'AUTO',
    "itemDescription" TEXT,
    "inKindOrigin" "InKindOrigin",
    "valuationDocs" BOOLEAN NOT NULL DEFAULT false,
    "activityText" TEXT,
    "waiverBasis" "WaiverBasis",
    "claimGrantedOn" DATE,
    "activityFrom" DATE,
    "activityTo" DATE,
    "claimDueOn" DATE,
    "regularActivity" BOOLEAN NOT NULL DEFAULT false,
    "claimConfirmedAt" TIMESTAMPTZ(3),
    "claimConfirmedById" TEXT,
    "note" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationAttachment" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "donationId" TEXT NOT NULL,
    "documentId" TEXT,
    "note" TEXT,
    "attachedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachedById" TEXT,

    CONSTRAINT "DonationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Donor_clubId_name_idx" ON "Donor"("clubId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Donor_clubId_id_key" ON "Donor"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Donor_clubId_memberId_key" ON "Donor"("clubId", "memberId");

-- CreateIndex
CREATE INDEX "Donation_clubId_receivedOn_idx" ON "Donation"("clubId", "receivedOn");

-- CreateIndex
CREATE INDEX "Donation_clubId_donorId_receivedOn_idx" ON "Donation"("clubId", "donorId", "receivedOn");

-- CreateIndex
CREATE INDEX "Donation_clubId_departmentId_idx" ON "Donation"("clubId", "departmentId");

-- CreateIndex
CREATE INDEX "Donation_clubId_eventId_idx" ON "Donation"("clubId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_clubId_id_key" ON "Donation"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_clubId_ledgerLineId_key" ON "Donation"("clubId", "ledgerLineId");

-- CreateIndex
CREATE INDEX "DonationAttachment_clubId_documentId_idx" ON "DonationAttachment"("clubId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DonationAttachment_clubId_id_key" ON "DonationAttachment"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DonationAttachment_clubId_donationId_documentId_key" ON "DonationAttachment"("clubId", "donationId", "documentId");

-- AddForeignKey
ALTER TABLE "Donor" ADD CONSTRAINT "Donor_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donor" ADD CONSTRAINT "Donor_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_clubId_donorId_fkey" FOREIGN KEY ("clubId", "donorId") REFERENCES "Donor"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_clubId_ledgerLineId_fkey" FOREIGN KEY ("clubId", "ledgerLineId") REFERENCES "LedgerLine"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_clubId_departmentId_fkey" FOREIGN KEY ("clubId", "departmentId") REFERENCES "Department"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_clubId_eventId_fkey" FOREIGN KEY ("clubId", "eventId") REFERENCES "Event"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationAttachment" ADD CONSTRAINT "DonationAttachment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationAttachment" ADD CONSTRAINT "DonationAttachment_clubId_donationId_fkey" FOREIGN KEY ("clubId", "donationId") REFERENCES "Donation"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationAttachment" ADD CONSTRAINT "DonationAttachment_clubId_documentId_fkey" FOREIGN KEY ("clubId", "documentId") REFERENCES "Document"("clubId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- -----------------------------------------------------------------------------
-- Prüfregeln
-- -----------------------------------------------------------------------------

-- Finanzamt-Angaben: Längen und Form wie im Bescheid; Art und Datum des Bescheids gemeinsam; der letzte
-- Veranlagungszeitraum nur bei Freistellungsbescheid/Anlage und nicht nach dem Bescheid; „Zwecke laut Satzung“ (Akkusativ,
-- „den Sport“) nur bei der Feststellung nach § 60a AO.
ALTER TABLE "FinanceSettings" ADD CONSTRAINT "FinanceSettings_tax_chk" CHECK (
  ("taxOffice" IS NULL OR char_length(btrim("taxOffice")) BETWEEN 2 AND 80)
  AND ("taxNumber" IS NULL OR (char_length("taxNumber") BETWEEN 5 AND 30 AND "taxNumber" ~ '^[0-9][0-9 /.-]*[0-9]$'))
  AND ("taxPurposes" IS NULL OR char_length(btrim("taxPurposes")) BETWEEN 3 AND 300)
  AND num_nonnulls("exemptionKind", "exemptionDate") IN (0, 2)
  AND ("exemptionLastYear" IS NULL OR "exemptionLastYear" BETWEEN 1990 AND 2100)
  AND ("exemptionKind" IS DISTINCT FROM 'FINDING_60A' OR "exemptionLastYear" IS NULL)
  AND ("exemptionLastYear" IS NULL OR "exemptionDate" IS NULL
       OR "exemptionLastYear" <= extract(year FROM "exemptionDate")::int)
  AND ("taxPurposesStatute" IS NULL
       OR ("exemptionKind" = 'FINDING_60A' AND char_length(btrim("taxPurposesStatute")) BETWEEN 3 AND 300))
);

-- Spender: ein Mitglied (Name und Anschrift kommen aus dem Mitglied – außer als Momentaufnahme eines gesperrten Spenders,
-- siehe anonymizeMemberData) oder ein eigener Name.
ALTER TABLE "Donor" ADD CONSTRAINT "Donor_identity_chk" CHECK (
  ("memberId" IS NOT NULL AND "kind" = 'PERSON'
    AND ("restrictedAt" IS NOT NULL OR num_nonnulls("name", "street", "postalCode", "city", "country") = 0))
  OR ("memberId" IS NULL AND char_length(btrim(coalesce("name", ''))) BETWEEN 2 AND 120)
);
ALTER TABLE "Donor" ADD CONSTRAINT "Donor_address_chk" CHECK (
  ("name" IS NULL OR char_length("name") <= 120)
  AND ("street" IS NULL OR char_length("street") <= 120)
  AND ("postalCode" IS NULL OR char_length("postalCode") <= 10)
  AND ("city" IS NULL OR char_length("city") <= 80)
  AND ("country" IS NULL OR "country" ~ '^[A-Z]{2}$')
  AND num_nonnulls("restrictedAt", "restrictedReason") IN (0, 2)
  AND ("restrictedReason" IS NULL OR char_length(btrim("restrictedReason")) BETWEEN 3 AND 200)
);

ALTER TABLE "Donation" ADD CONSTRAINT "Donation_amount_chk"
  CHECK ("amountCents" > 0 AND "amountCents" <= 1000000000);
-- Geld hat immer eine Buchungszeile und eine Zahlart, Sach- und Aufwandsspenden nie.
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_kind_chk" CHECK (
  ("kind" = 'MONEY') = ("ledgerLineId" IS NOT NULL)
  AND ("kind" = 'MONEY') = ("paymentMethod" IS NOT NULL)
);
-- Spender ODER Bezeichnung („Spendendose Theke“); ohne Spender nur Geld.
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_donor_chk" CHECK (
  num_nonnulls("donorId", "anonymousLabel") = 1
  AND ("donorId" IS NOT NULL OR "kind" = 'MONEY')
  AND ("anonymousLabel" IS NULL OR char_length(btrim("anonymousLabel")) BETWEEN 3 AND 80)
);
-- Zweck: Abteilung oder Veranstaltung (höchstens eins), dazu optional ein Text.
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_target_chk" CHECK (
  num_nonnulls("departmentId", "eventId") <= 1
  AND ("purposeText" IS NULL OR char_length(btrim("purposeText")) BETWEEN 2 AND 120)
  AND ("note" IS NULL OR char_length("note") <= 500)
);
-- Sachspende: genaue Bezeichnung und Herkunft (Muster 034123); sonst bleiben diese Felder leer.
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_in_kind_chk" CHECK (
  CASE WHEN "kind" = 'IN_KIND'
    THEN char_length(btrim(coalesce("itemDescription", ''))) BETWEEN 10 AND 500 AND "inKindOrigin" IS NOT NULL
    ELSE "itemDescription" IS NULL AND "inKindOrigin" IS NULL AND NOT "valuationDocs"
  END
);
-- Aufwandsspende (BMF 25.11.2014 Nr. 2): Anspruch eingeräumt vor Beginn der Tätigkeit, fällig nach ihrem Ende, verzichtet
-- erst nach ihrem Ende (nur auf einen entstandenen Anspruch); die Bestätigung des Anspruchs steht an der Spende selbst.
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_waiver_chk" CHECK (
  CASE WHEN "kind" = 'EXPENSE_WAIVER'
    THEN char_length(btrim(coalesce("activityText", ''))) BETWEEN 5 AND 300
      AND "waiverBasis" IS NOT NULL AND "claimGrantedOn" IS NOT NULL AND "activityFrom" IS NOT NULL
      AND "activityTo" IS NOT NULL AND "claimDueOn" IS NOT NULL AND "claimConfirmedAt" IS NOT NULL
      AND "claimGrantedOn" <= "activityFrom" AND "activityFrom" <= "activityTo"
      AND "activityTo" <= "claimDueOn" AND "activityTo" <= "receivedOn"
    ELSE num_nonnulls("activityText", "waiverBasis", "claimGrantedOn", "activityFrom", "activityTo", "claimDueOn",
                      "claimConfirmedAt", "claimConfirmedById") = 0
      AND NOT "regularActivity"
  END
);
-- Storniert (mit Grund) werden nur Sach- und Aufwandsspenden – eine Geldspende über das Storno ihrer Buchung.
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_void_chk" CHECK (
  num_nonnulls("voidedAt", "voidReason") IN (0, 2)
  AND ("voidedAt" IS NULL OR "kind" <> 'MONEY')
  AND ("voidReason" IS NULL OR char_length(btrim("voidReason")) BETWEEN 3 AND 200)
);

ALTER TABLE "DonationAttachment" ADD CONSTRAINT "DonationAttachment_one_kind_chk"
  CHECK (num_nonnulls("documentId", "note") = 1);
ALTER TABLE "DonationAttachment" ADD CONSTRAINT "DonationAttachment_note_chk"
  CHECK ("note" IS NULL OR char_length(btrim("note")) BETWEEN 3 AND 500);

-- -----------------------------------------------------------------------------
-- Spender: die Verknüpfung mit einem Mitglied steht fest (sonst änderte sich nachträglich, wer gespendet hat).
-- -----------------------------------------------------------------------------

CREATE FUNCTION "donor_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."memberId" IS DISTINCT FROM OLD."memberId" THEN
    RAISE EXCEPTION 'DONATION_LOCKED: Ein Spender bleibt mit seinem Mitglied verknüpft.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Donor_guard" BEFORE UPDATE ON "Donor"
  FOR EACH ROW EXECUTE FUNCTION "donor_guard"();

-- -----------------------------------------------------------------------------
-- Spende anlegen und ändern
-- -----------------------------------------------------------------------------

-- Tag einer Sach- oder Aufwandsspende: nicht in der Zukunft und nicht vor dem Beginn des Kassenbuchs (sonst stünde sie in
-- keiner Jahresauswahl). Geldspenden prüft das Kassenbuch selbst (Buchungstag).
CREATE FUNCTION "donation_day_check"(club text, day date) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  start_date date;
BEGIN
  IF day > (now() AT TIME ZONE 'Europe/Berlin')::date THEN
    RAISE EXCEPTION 'DONATION_INVALID: Der Tag der Zuwendung liegt in der Zukunft.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT "ledgerStartDate" INTO start_date FROM "FinanceSettings" WHERE "clubId" = club;
  IF FOUND AND day < start_date THEN
    RAISE EXCEPTION 'DONATION_INVALID: Das Kassenbuch beginnt am % – frühere Spenden gehören in die alten Unterlagen.',
      to_char(start_date, 'DD.MM.YYYY') USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- Gesperrte Spender (Art. 18 DSGVO, früheres Mitglied) bekommen keine neuen Spenden. FOR SHARE: Ein gleichzeitiges Sperren
-- wartet bzw. wird abgewartet – danach sieht die Spende die Sperre, oder das Sperren kommt nach ihr.
CREATE FUNCTION "donation_donor_check"(club text, donor text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  restricted timestamptz;
BEGIN
  SELECT "restrictedAt" INTO restricted FROM "Donor" WHERE "clubId" = club AND "id" = donor FOR SHARE;
  IF restricted IS NOT NULL THEN
    RAISE EXCEPTION 'DONATION_INVALID: Dieser Spender ist gesperrt – für ihn lassen sich keine Spenden mehr erfassen.'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- Geld: nur zu einer geltenden Einnahme der Kategorie „Spenden“. Betrag, Tag, Abteilung und Veranstaltung setzt die
-- Datenbank aus der Zeile – sie ist hier die maßgebliche Stelle (wie bei den Momentaufnahmen der Zeilen).
CREATE FUNCTION "donation_before_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  line record;
BEGIN
  NEW."createdAt" := now();
  IF NEW."kind" = 'MONEY' THEN
    SELECT l."amountCents", l."bookingDate", l."departmentId", l."eventId", l."entryId", e."kind" AS entry_kind,
           c."systemKey"
      INTO line
      FROM "LedgerLine" l
      JOIN "LedgerEntry" e ON e."clubId" = l."clubId" AND e."id" = l."entryId"
      JOIN "FinanceCategory" c ON c."clubId" = l."clubId" AND c."id" = l."categoryId"
     WHERE l."clubId" = NEW."clubId" AND l."id" = NEW."ledgerLineId";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DONATION_INVALID: Diese Buchungszeile gibt es nicht.' USING ERRCODE = 'check_violation';
    END IF;
    IF line."systemKey" IS DISTINCT FROM 'DONATIONS' OR line."amountCents" <= 0 THEN
      RAISE EXCEPTION 'DONATION_INVALID: Nur Einnahmen der Kategorie „Spenden“ lassen sich als Spende kennzeichnen.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF line.entry_kind <> 'STANDARD' THEN
      RAISE EXCEPTION 'DONATION_INVALID: Nur eine gewöhnliche Einnahme lässt sich als Spende kennzeichnen (kein Storno, keine Umbuchung).'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM "LedgerEntry" r WHERE r."clubId" = NEW."clubId" AND r."reversalOfId" = line."entryId") THEN
      RAISE EXCEPTION 'DONATION_INVALID: Diese Buchung ist storniert – sie lässt sich nicht mehr als Spende kennzeichnen.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW."amountCents" := line."amountCents";
    NEW."receivedOn" := line."bookingDate";
    NEW."departmentId" := line."departmentId";
    NEW."eventId" := line."eventId";
  ELSE
    PERFORM "donation_day_check"(NEW."clubId", NEW."receivedOn");
  END IF;
  IF NEW."voidedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'DONATION_INVALID: Eine Spende wird nicht storniert angelegt.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."donorId" IS NOT NULL THEN
    PERFORM "donation_donor_check"(NEW."clubId", NEW."donorId");
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Donation_before_insert" BEFORE INSERT ON "Donation"
  FOR EACH ROW EXECUTE FUNCTION "donation_before_insert"();

-- Ändern: Art, Buchungszeile und Erfassung stehen fest; bei Geld zusätzlich Betrag, Tag, Abteilung und Veranstaltung
-- (aus der Buchung – ein anderer Zweck nur über „Korrigieren“). Storniert bleibt storniert. Löschen: nur Geld
-- („Kennzeichnung zurücknehmen“ – die Buchung bleibt), die Kaskade beim Löschen eines Vereins und die
-- Aufbewahrungsroutine (vereinsflow.finance_purge = 'on') nach Ablauf der 10 Jahre; Sach- und Aufwandsspenden sonst nie.
CREATE FUNCTION "donation_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  changed text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() >= 2 THEN
      RETURN OLD;
    END IF;
    IF coalesce(current_setting('vereinsflow.finance_purge', true), '') = 'on'
       AND greatest(extract(year FROM OLD."receivedOn")::int,
                    extract(year FROM (OLD."createdAt" AT TIME ZONE 'Europe/Berlin'))::int) + 10
           < extract(year FROM (now() AT TIME ZONE 'Europe/Berlin'))::int THEN
      RETURN OLD;
    END IF;
    IF OLD."kind" = 'MONEY' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'DONATION_LOCKED: Eine Sach- oder Aufwandsspende bleibt erhalten – sie lässt sich nur stornieren.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."voidedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'DONATION_LOCKED: Eine stornierte Spende bleibt, wie sie ist.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT key INTO changed
    FROM unnest(ARRAY['id', 'clubId', 'kind', 'ledgerLineId', 'createdAt', 'createdById', 'claimConfirmedAt',
                      'claimConfirmedById']) AS key
   WHERE (to_jsonb(NEW) -> key) IS DISTINCT FROM (to_jsonb(OLD) -> key)
   LIMIT 1;
  IF changed IS NOT NULL THEN
    RAISE EXCEPTION 'DONATION_LOCKED: Art, Buchung und Erfassung einer Spende stehen fest (%).', changed
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."kind" = 'MONEY' THEN
    SELECT key INTO changed
      FROM unnest(ARRAY['amountCents', 'receivedOn', 'departmentId', 'eventId']) AS key
     WHERE (to_jsonb(NEW) -> key) IS DISTINCT FROM (to_jsonb(OLD) -> key)
     LIMIT 1;
    IF changed IS NOT NULL THEN
      RAISE EXCEPTION 'DONATION_LOCKED: Betrag, Tag und Abteilung bzw. Veranstaltung einer Geldspende kommen aus der Buchung – ändere sie über „Korrigieren“ im Kassenbuch.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Stornieren: dabei ändert sich sonst nichts.
  IF NEW."voidedAt" IS NOT NULL THEN
    IF (to_jsonb(NEW) - 'voidedAt' - 'voidedById' - 'voidReason' - 'updatedAt' - 'updatedById')
       <> (to_jsonb(OLD) - 'voidedAt' - 'voidedById' - 'voidReason' - 'updatedAt' - 'updatedById') THEN
      RAISE EXCEPTION 'DONATION_LOCKED: Beim Stornieren ändert sich sonst nichts an der Spende.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."kind" <> 'MONEY' AND NEW."receivedOn" <> OLD."receivedOn" THEN
    PERFORM "donation_day_check"(NEW."clubId", NEW."receivedOn");
  END IF;
  IF NEW."donorId" IS NOT NULL AND NEW."donorId" IS DISTINCT FROM OLD."donorId" THEN
    PERFORM "donation_donor_check"(NEW."clubId", NEW."donorId");
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Donation_guard" BEFORE UPDATE OR DELETE ON "Donation"
  FOR EACH ROW EXECUTE FUNCTION "donation_guard"();

-- -----------------------------------------------------------------------------
-- Nachweise und ihre Aufbewahrung
-- -----------------------------------------------------------------------------

-- Frist einer Spende: Ende des Jahres der Zuwendung bzw. der Erfassung (das spätere) plus 10 (§ 50 Abs. 7 EStDV, § 147
-- AO). Die Unterlagen zur Wertermittlung gehören „zusammen mit der Zuwendungsbestätigung“ in die Buchführung (BMF Nr. 6):
-- Teil 2 ergänzt das Jahr der Ausstellung.
CREATE FUNCTION "donation_retain_until"(club text, donation text) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT make_date(greatest(extract(year FROM "receivedOn")::int,
                            extract(year FROM ("createdAt" AT TIME ZONE 'Europe/Berlin'))::int) + 10, 12, 31)
  FROM "Donation" WHERE "clubId" = club AND "id" = donation;
$$;

-- Frist eines Dokuments = späteste Frist seiner Anhänge an Buchungen (8 Jahre) und an Spenden (10 Jahre); ohne Anhang keine.
CREATE FUNCTION "document_finance_retain_until"(club text, doc text) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT greatest(
    (SELECT max("ledger_receipt_retain_until"(a."clubId", a."entryId"))
       FROM "LedgerAttachment" a WHERE a."clubId" = club AND a."documentId" = doc),
    (SELECT max("donation_retain_until"(a."clubId", a."donationId"))
       FROM "DonationAttachment" a WHERE a."clubId" = club AND a."documentId" = doc));
$$;

-- Nach dem Anhängen bzw. Entfernen (ersetzt die Fassung aus finance_receipts): rechnet über beide Arten von Anhängen –
-- sonst senkte das Anhängen an eine Buchung die längere Spendenfrist desselben Dokuments. Gilt für LedgerAttachment und
-- DonationAttachment (beide haben "clubId" und "documentId").
CREATE OR REPLACE FUNCTION "ledger_attachment_retention"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  doc_club text := coalesce(NEW."clubId", OLD."clubId");
  doc_id text := CASE WHEN TG_OP = 'DELETE' THEN OLD."documentId" ELSE NEW."documentId" END;
BEGIN
  IF doc_id IS NULL THEN
    RETURN NULL;
  END IF;
  -- Erst das Dokument sperren, dann neu rechnen: Die Rechnung läuft so nach einer Wartezeit auf dem aktuellen Stand der
  -- Anhänge (gleichzeitiges Entfernen und Korrigieren verlieren keine Frist).
  PERFORM 1 FROM "Document" WHERE "clubId" = doc_club AND "id" = doc_id FOR UPDATE;
  UPDATE "Document" d SET "retainUntil" = "document_finance_retain_until"(doc_club, doc_id)
  WHERE d."clubId" = doc_club AND d."id" = doc_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "DonationAttachment_retention" AFTER INSERT OR DELETE ON "DonationAttachment"
  FOR EACH ROW EXECUTE FUNCTION "ledger_attachment_retention"();

-- Nur Dokumente außerhalb des Papierkorbs anhängen (gleiche Prüfung wie bei Belegen der Buchungen).
CREATE TRIGGER "DonationAttachment_before_insert" BEFORE INSERT ON "DonationAttachment"
  FOR EACH ROW EXECUTE FUNCTION "ledger_attachment_before_insert"();

-- Nachweise ändert man nicht. Entfernen ist erlaubt (falsche Datei erwischt) – Teil 2 sperrt es, solange eine geltende
-- Zuwendungsbestätigung die Spende enthält.
CREATE FUNCTION "donation_attachment_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'FINANCE_IMMUTABLE: Ein angehängter Nachweis lässt sich nicht ändern – bitte entfernen und neu anhängen.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "DonationAttachment_guard" BEFORE UPDATE OR DELETE ON "DonationAttachment"
  FOR EACH ROW EXECUTE FUNCTION "donation_attachment_guard"();

-- Ein geänderter Tag der Zuwendung (Sach-/Aufwandsspende) kann die Frist ihrer Nachweise verschieben.
CREATE FUNCTION "donation_retention_refresh"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  doc record;
BEGIN
  FOR doc IN
    SELECT DISTINCT a."documentId" AS id FROM "DonationAttachment" a
     WHERE a."clubId" = NEW."clubId" AND a."donationId" = NEW."id" AND a."documentId" IS NOT NULL
  LOOP
    PERFORM 1 FROM "Document" WHERE "clubId" = NEW."clubId" AND "id" = doc.id FOR UPDATE;
    UPDATE "Document" d SET "retainUntil" = "document_finance_retain_until"(NEW."clubId", doc.id)
    WHERE d."clubId" = NEW."clubId" AND d."id" = doc.id;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "Donation_retention_refresh" AFTER UPDATE OF "receivedOn" ON "Donation"
  FOR EACH ROW WHEN (NEW."receivedOn" IS DISTINCT FROM OLD."receivedOn")
  EXECUTE FUNCTION "donation_retention_refresh"();
