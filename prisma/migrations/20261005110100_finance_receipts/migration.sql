-- Etappe 3: Belege und Rechnungen im Kassenbuch (ADR-0010, Abschnitt „Belege“).
--
-- Belege (Quittung, Rechnung, Kontoauszug) hängen als LedgerAttachment an einer Buchung – mehrere je Buchung, oder ein
-- „Eigenbeleg“ als Text, wenn es keinen Beleg gibt. Ein angehängtes Dokument wird bis zum Ende der Aufbewahrungsfrist
-- (8 Jahre ab Ende des Buchungsjahres, § 147 Abs. 3 AO) aufbewahrt: Die Datenbank verweigert Papierkorb, Archiv und
-- Löschen bis dahin. Bezahlte Rechnungen lassen sich als Buchung übernehmen (LedgerLine.invoiceId) – solange die Buchung
-- gilt, bleibt die Rechnung bezahlt und ihr Betrag fest.

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "retainUntil" DATE;

-- AlterTable
ALTER TABLE "LedgerLine" ADD COLUMN "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "LedgerAttachment" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "documentId" TEXT,
    "note" TEXT,
    "attachedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachedById" TEXT,

    CONSTRAINT "LedgerAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerAttachment_clubId_documentId_idx" ON "LedgerAttachment"("clubId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAttachment_clubId_id_key" ON "LedgerAttachment"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAttachment_clubId_entryId_documentId_key" ON "LedgerAttachment"("clubId", "entryId", "documentId");

-- CreateIndex
CREATE INDEX "LedgerLine_clubId_invoiceId_idx" ON "LedgerLine"("clubId", "invoiceId");

-- AddForeignKey
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_clubId_invoiceId_fkey" FOREIGN KEY ("clubId", "invoiceId") REFERENCES "Invoice"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAttachment" ADD CONSTRAINT "LedgerAttachment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAttachment" ADD CONSTRAINT "LedgerAttachment_clubId_entryId_fkey" FOREIGN KEY ("clubId", "entryId") REFERENCES "LedgerEntry"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAttachment" ADD CONSTRAINT "LedgerAttachment_clubId_documentId_fkey" FOREIGN KEY ("clubId", "documentId") REFERENCES "Document"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Prüfungen
-- -----------------------------------------------------------------------------

ALTER TABLE "LedgerAttachment" ADD CONSTRAINT "LedgerAttachment_one_kind_chk"
  CHECK (num_nonnulls("documentId", "note") = 1);
ALTER TABLE "LedgerAttachment" ADD CONSTRAINT "LedgerAttachment_note_chk"
  CHECK ("note" IS NULL OR char_length(btrim("note")) BETWEEN 3 AND 500);
-- Ein Eigenbeleg je Buchung genügt (mehrere Dateien sind erlaubt, jede höchstens einmal – siehe Unique-Index).
CREATE UNIQUE INDEX "LedgerAttachment_one_note" ON "LedgerAttachment"("clubId", "entryId") WHERE "documentId" IS NULL;

-- -----------------------------------------------------------------------------
-- Aufbewahrung der Belege
-- -----------------------------------------------------------------------------

-- Frist eines Belegs: Ende des Jahres, in dem gebucht wurde (Buchungsjahr bzw. Jahr der Eintragung, das spätere), plus 8.
CREATE FUNCTION "ledger_receipt_retain_until"(club text, entry text) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT make_date(greatest("year", extract(year FROM ("recordedAt" AT TIME ZONE 'Europe/Berlin'))::int) + 8, 12, 31)
  FROM "LedgerEntry" WHERE "clubId" = club AND "id" = entry;
$$;

-- Nach dem Anhängen bzw. Entfernen: Frist des Dokuments = späteste Frist seiner Anhänge (ohne Anhang keine).
CREATE FUNCTION "ledger_attachment_retention"() RETURNS trigger
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
  UPDATE "Document" d SET "retainUntil" = (
    SELECT max("ledger_receipt_retain_until"(a."clubId", a."entryId"))
      FROM "LedgerAttachment" a WHERE a."clubId" = doc_club AND a."documentId" = doc_id
  )
  WHERE d."clubId" = doc_club AND d."id" = doc_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "LedgerAttachment_retention" AFTER INSERT OR DELETE ON "LedgerAttachment"
  FOR EACH ROW EXECUTE FUNCTION "ledger_attachment_retention"();

-- Nur Dokumente außerhalb des Papierkorbs anhängen. Die Sperre wartet ein gleichzeitiges Löschen ab (und umgekehrt).
CREATE FUNCTION "ledger_attachment_before_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  deleted timestamptz;
BEGIN
  IF NEW."documentId" IS NOT NULL THEN
    SELECT "deletedAt" INTO deleted FROM "Document"
      WHERE "clubId" = NEW."clubId" AND "id" = NEW."documentId" FOR UPDATE;
    IF deleted IS NOT NULL THEN
      RAISE EXCEPTION 'FINANCE_IMMUTABLE: Das Dokument liegt im Papierkorb – bitte erst wiederherstellen.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "LedgerAttachment_before_insert" BEFORE INSERT ON "LedgerAttachment"
  FOR EACH ROW EXECUTE FUNCTION "ledger_attachment_before_insert"();

-- Anhänge ändert man nicht; entfernen nur, solange der Zeitraum der Buchung offen ist (sonst fehlte nach dem Abschluss ein
-- Beleg, der dazugehörte). Die Aufbewahrungsroutine darf nach Ablauf der Frist löschen.
CREATE FUNCTION "ledger_attachment_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  closed date;
  entry record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'FINANCE_IMMUTABLE: Ein angehängter Beleg lässt sich nicht ändern – bitte entfernen und neu anhängen.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT "bookingDate", "year" INTO entry FROM "LedgerEntry" WHERE "clubId" = OLD."clubId" AND "id" = OLD."entryId";
  IF coalesce(current_setting('vereinsflow.finance_purge', true), '') = 'on'
     AND "ledger_book_expired"(OLD."clubId", entry."year") THEN
    RETURN OLD;
  END IF;
  -- Die Rechnung, die die Buchung bezahlt, bleibt angehängt (sonst hinge die gebuchte Rechnung ohne Beleg und Frist).
  IF OLD."documentId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "LedgerLine" l JOIN "Invoice" i ON i."clubId" = l."clubId" AND i."id" = l."invoiceId"
    WHERE l."clubId" = OLD."clubId" AND l."entryId" = OLD."entryId" AND i."documentId" = OLD."documentId"
  ) THEN
    RAISE EXCEPTION 'FINANCE_IMMUTABLE: Das ist die Rechnung, die diese Buchung bezahlt – sie bleibt angehängt.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT "closedThrough" INTO closed FROM "FinanceSettings" WHERE "clubId" = OLD."clubId" FOR SHARE;
  IF closed IS NOT NULL AND entry."bookingDate" <= closed THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: Bis zum % ist das Kassenbuch abgeschlossen – Belege dieser Zeit bleiben angehängt.',
      to_char(closed, 'DD.MM.YYYY') USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "LedgerAttachment_guard" BEFORE UPDATE OR DELETE ON "LedgerAttachment"
  FOR EACH ROW EXECUTE FUNCTION "ledger_attachment_guard"();

-- Dokumente mit laufender Frist: nicht löschen, nicht in den Papierkorb, nicht archivieren. Die Frist senkt nur der Trigger
-- der Anhänge (beim Entfernen eines Anhangs im offenen Zeitraum).
CREATE FUNCTION "document_retention_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  berlin_today date := (now() AT TIME ZONE 'Europe/Berlin')::date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."retainUntil" IS NOT NULL AND OLD."retainUntil" >= berlin_today THEN
      RAISE EXCEPTION 'DOCUMENT_RETAINED: Dieses Dokument ist ein Beleg im Kassenbuch und wird bis % aufbewahrt.',
        to_char(OLD."retainUntil", 'DD.MM.YYYY') USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."retainUntil" IS DISTINCT FROM OLD."retainUntil"
     AND (NEW."retainUntil" IS NULL OR (OLD."retainUntil" IS NOT NULL AND NEW."retainUntil" < OLD."retainUntil"))
     AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'DOCUMENT_RETAINED: Die Aufbewahrungsfrist eines Belegs lässt sich nicht verkürzen.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."retainUntil" IS NOT NULL AND NEW."retainUntil" >= berlin_today
     AND ((NEW."deletedAt" IS NOT NULL AND OLD."deletedAt" IS NULL)
       OR (NEW."archivedAt" IS NOT NULL AND OLD."archivedAt" IS NULL)) THEN
    RAISE EXCEPTION 'DOCUMENT_RETAINED: Dieses Dokument ist ein Beleg im Kassenbuch und wird bis % aufbewahrt.',
      to_char(NEW."retainUntil", 'DD.MM.YYYY') USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Document_retention_guard" BEFORE UPDATE OR DELETE ON "Document"
  FOR EACH ROW EXECUTE FUNCTION "document_retention_guard"();

-- -----------------------------------------------------------------------------
-- Rechnungen im Kassenbuch
-- -----------------------------------------------------------------------------

-- Gilt die Buchung einer Rechnung (nicht storniert), bleibt die Rechnung bezahlt und ihr Betrag fest.
CREATE FUNCTION "invoice_booked"(club text, invoice text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "LedgerLine" l
      JOIN "LedgerEntry" e ON e."clubId" = l."clubId" AND e."id" = l."entryId"
    WHERE l."clubId" = club AND l."invoiceId" = invoice AND e."kind" = 'STANDARD'
      AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" r WHERE r."clubId" = e."clubId" AND r."reversalOfId" = e."id")
  );
$$;

CREATE FUNCTION "invoice_booked_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ((OLD."status" = 'PAID' AND NEW."status" <> 'PAID') OR NEW."amountCents" IS DISTINCT FROM OLD."amountCents")
     AND "invoice_booked"(OLD."clubId", OLD."id") THEN
    RAISE EXCEPTION 'INVOICE_BOOKED: Diese Rechnung ist im Kassenbuch gebucht – storniere zuerst die Buchung.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Invoice_booked_guard" BEFORE UPDATE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION "invoice_booked_guard"();

-- Zeile anlegen (ersetzt die Fassung aus 20261005100000): wie bisher, dazu eine Rechnung nur einmal buchen.
CREATE OR REPLACE FUNCTION "ledger_line_before_insert"() RETURNS trigger
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
  -- Eine Rechnung gehört zu höchstens einer geltenden Buchung (mehrere Zeilen derselben Buchung sind erlaubt). Die Sperre
  -- auf die Rechnung reiht gleichzeitiges Buchen, „wieder offen“ und Betragsänderungen hintereinander.
  IF NEW."invoiceId" IS NOT NULL THEN
    PERFORM 1 FROM "Invoice" WHERE "clubId" = NEW."clubId" AND "id" = NEW."invoiceId" FOR UPDATE;
  END IF;
  IF NEW."invoiceId" IS NOT NULL AND entry."kind" = 'STANDARD' AND EXISTS (
    SELECT 1 FROM "LedgerLine" l
      JOIN "LedgerEntry" e ON e."clubId" = l."clubId" AND e."id" = l."entryId"
    WHERE l."clubId" = NEW."clubId" AND l."invoiceId" = NEW."invoiceId" AND l."entryId" <> NEW."entryId"
      AND e."kind" = 'STANDARD'
      AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" r WHERE r."clubId" = e."clubId" AND r."reversalOfId" = e."id")
  ) THEN
    RAISE EXCEPTION 'INVOICE_BOOKED: Diese Rechnung ist schon im Kassenbuch gebucht.' USING ERRCODE = 'check_violation';
  END IF;
  NEW."bookingDate" := entry."bookingDate";
  NEW."accountId" := entry."accountId";
  RETURN NEW;
END;
$$;

-- Zurückgestellte Prüfung (ersetzt die Fassung aus 20261005100000): ein Storno spiegelt auch die Rechnung der Zeilen.
CREATE OR REPLACE FUNCTION "ledger_balance_check"() RETURNS trigger
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
      (SELECT "categoryId", "sphere", "departmentId", "eventId", "invoiceId", -"amountCents" AS a
         FROM "LedgerLine" WHERE "clubId" = NEW."clubId" AND "entryId" = NEW."reversalOfId"
       EXCEPT ALL
       SELECT "categoryId", "sphere", "departmentId", "eventId", "invoiceId", "amountCents"
         FROM "LedgerLine" WHERE "clubId" = NEW."clubId" AND "entryId" = NEW."id")
      UNION ALL
      (SELECT "categoryId", "sphere", "departmentId", "eventId", "invoiceId", "amountCents"
         FROM "LedgerLine" WHERE "clubId" = NEW."clubId" AND "entryId" = NEW."id"
       EXCEPT ALL
       SELECT "categoryId", "sphere", "departmentId", "eventId", "invoiceId", -"amountCents"
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
