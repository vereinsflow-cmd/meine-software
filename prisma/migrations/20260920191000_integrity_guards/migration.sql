-- =============================================================================
-- Datenintegrität, die sich im Prisma-Schema nicht ausdrücken lässt.
--
-- Diese Regeln gelten unabhängig vom Anwendungscode: Selbst ein Programmierfehler in
-- der Geschäftslogik kann damit keine ungültigen Daten erzeugen. Die Anwendung prüft
-- dieselben Regeln vorab (für verständliche Fehlermeldungen); die Datenbank ist die
-- letzte Instanz – insbesondere bei gleichzeitigen Zugriffen (Race Conditions).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- CHECK-Constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "User"
  ADD CONSTRAINT "User_email_lowercase_chk" CHECK ("email" = lower("email"));

ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_email_lowercase_chk" CHECK ("email" = lower("email"));

ALTER TABLE "Club"
  ADD CONSTRAINT "Club_slug_format_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_expiry_chk" CHECK ("expiresAt" > "createdAt");

ALTER TABLE "RateLimitBucket"
  ADD CONSTRAINT "RateLimitBucket_count_chk" CHECK ("count" >= 0);

ALTER TABLE "Member"
  ADD CONSTRAINT "Member_dates_chk"
    CHECK ("leftAt" IS NULL OR "joinedAt" IS NULL OR "leftAt" >= "joinedAt"),
  ADD CONSTRAINT "Member_names_chk"
    CHECK (length(btrim("firstName")) > 0 AND length(btrim("lastName")) > 0);

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_time_chk" CHECK ("endsAt" >= "startsAt"),
  ADD CONSTRAINT "Event_capacity_chk"
    CHECK ("maxParticipants" IS NULL OR "maxParticipants" >= 0);

ALTER TABLE "EventShift"
  ADD CONSTRAINT "EventShift_time_chk" CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "EventShift_required_chk" CHECK ("requiredCount" BETWEEN 1 AND 500),
  ADD CONSTRAINT "EventShift_minage_chk" CHECK ("minAge" IS NULL OR "minAge" BETWEEN 0 AND 120);

ALTER TABLE "ShiftAssignment"
  ADD CONSTRAINT "ShiftAssignment_minutes_chk"
    CHECK ("workedMinutes" IS NULL OR "workedMinutes" BETWEEN 0 AND 1440);

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_size_chk" CHECK ("sizeBytes" >= 0),
  -- Ein Dokument gehört zu höchstens einem Bezugsobjekt (Veranstaltung, Mitglied, Aufgabe, Ordner).
  ADD CONSTRAINT "Document_single_parent_chk"
    CHECK (num_nonnulls("eventId", "memberId", "taskId", "folderId") <= 1);

-- Benachrichtigungen dürfen nur auf interne Pfade verweisen (kein Open-Redirect / Phishing-Link).
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_link_chk"
    CHECK (
      "linkUrl" IS NULL
      OR ("linkUrl" LIKE '/%' AND "linkUrl" NOT LIKE '//%' AND "linkUrl" NOT LIKE '/\%')
    );

-- ---------------------------------------------------------------------------
-- Höchstens eine offene Einladung je E-Mail-Adresse und Verein
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "Invitation_open_email_key"
  ON "Invitation" ("clubId", "email")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- Audit-Log ist unveränderlich
--   * UPDATE ist nie erlaubt.
--   * DELETE ist nur erlaubt, wenn die Aufbewahrungsroutine ausdrücklich
--     `SET LOCAL vereinsflow.audit_purge = 'on'` setzt.
-- ---------------------------------------------------------------------------

CREATE FUNCTION "audit_log_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditLog ist unveraenderlich (UPDATE nicht erlaubt)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' AND coalesce(current_setting('vereinsflow.audit_purge', true), '') <> 'on' THEN
    RAISE EXCEPTION 'AuditLog ist unveraenderlich (DELETE nur durch die Aufbewahrungsroutine)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AuditLog_guard"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_guard"();

-- ---------------------------------------------------------------------------
-- Überbuchung verhindern: Eine Schicht nimmt nie mehr Helfer auf als `requiredCount`.
-- Die Zeile der Schicht wird gesperrt, damit gleichzeitige Eintragungen nacheinander
-- geprüft werden (sonst könnten zwei Transaktionen den letzten freien Platz belegen).
-- ---------------------------------------------------------------------------

CREATE FUNCTION "shift_assignment_capacity_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_required integer;
  v_confirmed integer;
BEGIN
  IF NEW."status" = 'CONFIRMED' THEN
    SELECT "requiredCount" INTO v_required
      FROM "EventShift" WHERE "id" = NEW."shiftId" FOR UPDATE;

    SELECT count(*) INTO v_confirmed
      FROM "ShiftAssignment"
     WHERE "shiftId" = NEW."shiftId" AND "status" = 'CONFIRMED' AND "id" <> NEW."id";

    IF v_confirmed >= v_required THEN
      RAISE EXCEPTION 'SHIFT_FULL: Die Schicht ist bereits voll besetzt'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ShiftAssignment_capacity_guard"
  BEFORE INSERT OR UPDATE OF "status", "shiftId" ON "ShiftAssignment"
  FOR EACH ROW EXECUTE FUNCTION "shift_assignment_capacity_guard"();

-- ---------------------------------------------------------------------------
-- Doppelbelegung verhindern: Ein Mitglied kann nicht in zwei sich überschneidenden
-- Schichten gleichzeitig eingetragen sein. Pro Mitglied wird per Advisory-Lock
-- serialisiert, damit auch gleichzeitige Eintragungen sicher geprüft werden.
-- Abgesagte oder gelöschte Schichten zählen nicht.
-- ---------------------------------------------------------------------------

CREATE FUNCTION "shift_assignment_overlap_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'CONFIRMED' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."memberId", 0));

    IF EXISTS (
      SELECT 1
        FROM "ShiftAssignment" other
        JOIN "EventShift" other_shift ON other_shift."id" = other."shiftId"
        JOIN "EventShift" this_shift ON this_shift."id" = NEW."shiftId"
       WHERE other."memberId" = NEW."memberId"
         AND other."status" = 'CONFIRMED'
         AND other."id" <> NEW."id"
         AND other_shift."deletedAt" IS NULL
         AND other_shift."status" <> 'CANCELLED'
         AND this_shift."deletedAt" IS NULL
         AND this_shift."status" <> 'CANCELLED'
         AND other_shift."startsAt" < this_shift."endsAt"
         AND other_shift."endsAt" > this_shift."startsAt"
    ) THEN
      RAISE EXCEPTION 'SHIFT_OVERLAP: Das Mitglied ist zur selben Zeit bereits in einer anderen Schicht eingetragen'
        USING ERRCODE = 'exclusion_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ShiftAssignment_overlap_guard"
  BEFORE INSERT OR UPDATE OF "status", "shiftId" ON "ShiftAssignment"
  FOR EACH ROW EXECUTE FUNCTION "shift_assignment_overlap_guard"();

-- ---------------------------------------------------------------------------
-- Teilnehmerlimit: Zugesagte Teilnehmer überschreiten `maxParticipants` nie.
-- ---------------------------------------------------------------------------

CREATE FUNCTION "event_participant_capacity_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_max integer;
  v_accepted integer;
BEGIN
  IF NEW."status" = 'ACCEPTED' THEN
    SELECT "maxParticipants" INTO v_max
      FROM "Event" WHERE "id" = NEW."eventId" FOR UPDATE;

    IF v_max IS NOT NULL THEN
      SELECT count(*) INTO v_accepted
        FROM "EventParticipant"
       WHERE "eventId" = NEW."eventId" AND "status" = 'ACCEPTED' AND "id" <> NEW."id";

      IF v_accepted >= v_max THEN
        RAISE EXCEPTION 'EVENT_FULL: Das Teilnehmerlimit der Veranstaltung ist erreicht'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "EventParticipant_capacity_guard"
  BEFORE INSERT OR UPDATE OF "status", "eventId" ON "EventParticipant"
  FOR EACH ROW EXECUTE FUNCTION "event_participant_capacity_guard"();
