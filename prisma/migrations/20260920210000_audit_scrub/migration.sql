-- Datenschutz (Art. 17 DSGVO): Wird eine Person gelöscht oder anonymisiert, müssen auch ihre Namen in den
-- Klartext-Feldern des Änderungsprotokolls ("summary", "changes") entfernt werden können.
--
-- Das Änderungsprotokoll bleibt unveränderlich – mit genau einer Ausnahme: Innerhalb der Datenschutz- und
-- Aufbewahrungsroutine (`SET LOCAL vereinsflow.audit_purge = 'on'`) dürfen AUSSCHLIESSLICH "summary" und "changes"
-- überschrieben werden. Wer, wann, was (Aktion, Objekt-Art und -ID) bleibt unverändert nachweisbar.
-- (Bereits angewendete Migrationen werden nie nachträglich geändert – daher eine neue Migration.)

CREATE OR REPLACE FUNCTION "audit_log_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  purge_mode boolean := coalesce(current_setting('vereinsflow.audit_purge', true), '') = 'on';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF purge_mode
       AND NEW."id" = OLD."id"
       AND NEW."clubId" IS NOT DISTINCT FROM OLD."clubId"
       AND NEW."actorUserId" IS NOT DISTINCT FROM OLD."actorUserId"
       AND NEW."actorType" = OLD."actorType"
       AND NEW."action" = OLD."action"
       AND NEW."entityType" = OLD."entityType"
       AND NEW."entityId" IS NOT DISTINCT FROM OLD."entityId"
       AND NEW."ipPrefix" IS NOT DISTINCT FROM OLD."ipPrefix"
       AND NEW."requestId" IS NOT DISTINCT FROM OLD."requestId"
       AND NEW."createdAt" = OLD."createdAt" THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'AuditLog ist unveraenderlich (UPDATE nur fuer summary/changes durch die Datenschutzroutine)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' AND NOT purge_mode THEN
    RAISE EXCEPTION 'AuditLog ist unveraenderlich (DELETE nur durch die Aufbewahrungsroutine)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
