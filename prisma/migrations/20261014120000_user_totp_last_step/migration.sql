-- =============================================================================
-- Zwei-Faktor-Anmeldung (TOTP): Schutz gegen das erneute Einreichen eines Codes. Ein Code aus der Authenticator-App
-- gilt 30 Sekunden (bei der Prüfung meist mit ±1 Zeitschritt Spielraum). Wer einen Code mitliest, könnte ihn sonst
-- innerhalb dieser Zeit ein zweites Mal verwenden. Gespeichert wird deshalb der zuletzt angenommene Zeitschritt
-- (Unixzeit / 30); angenommen werden danach nur noch Codes aus einem SPÄTEREN Zeitschritt.
-- Leer = noch nie ein Code angenommen (auch bei Konten ohne Zwei-Faktor). Bestehende Zeilen bleiben unverändert.
--
-- Rückgängig (falls nötig): ALTER TABLE "User" DROP COLUMN "totpLastStep";
-- =============================================================================

-- AlterTable
ALTER TABLE "User" ADD COLUMN "totpLastStep" INTEGER;

-- Ein Zeitschritt ist nie negativ. INTEGER reicht aus: 2^31 Schritte · 30 s ≈ 2040 Jahre ab 1970.
ALTER TABLE "User" ADD CONSTRAINT "User_totp_last_step_chk" CHECK ("totpLastStep" IS NULL OR "totpLastStep" >= 0);
