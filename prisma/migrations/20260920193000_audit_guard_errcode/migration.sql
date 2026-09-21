-- Korrektur zu "integrity_guards": Der Audit-Trigger meldet Verstöße jetzt mit dem SQLSTATE
-- check_violation. Bei restrict_violation macht Prisma daraus eine nichtssagende
-- "Foreign key constraint violated"-Meldung; bei check_violation bleibt der Text erhalten.
-- (Bereits angewendete Migrationen werden nie nachträglich geändert – daher eine neue Migration.)

CREATE OR REPLACE FUNCTION "audit_log_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditLog ist unveraenderlich (UPDATE nicht erlaubt)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' AND coalesce(current_setting('vereinsflow.audit_purge', true), '') <> 'on' THEN
    RAISE EXCEPTION 'AuditLog ist unveraenderlich (DELETE nur durch die Aufbewahrungsroutine)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
