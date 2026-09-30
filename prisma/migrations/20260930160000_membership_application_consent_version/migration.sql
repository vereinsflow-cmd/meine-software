-- =============================================================================
-- Beitrittsanträge: Fassung des Einwilligungstexts am Antrag. Das Pflicht-Kästchen im Formular („Ich bin einverstanden,
-- dass der Verein meine Angaben speichert, um meinen Antrag zu bearbeiten.“) ist eine eigene, eng begrenzte Einwilligung –
-- nicht die „Einwilligung in die Datenverarbeitung“ der Mitgliedschaft. Mit Zeitpunkt UND Fassung lässt sich auch nach
-- einer späteren Änderung des Kästchens belegen, welchem Text die Person zugestimmt hat (Art. 7 Abs. 1 DSGVO). Die Anwendung
-- setzt die Fassung bei jedem Antrag selbst (`APPLICATION_CONSENT_VERSION`), deshalb ohne Standardwert; bereits
-- eingegangene Anträge stammen alle aus der ersten Fassung.
-- =============================================================================

-- AlterTable
ALTER TABLE "MembershipApplication" ADD COLUMN "consentTextVersion" TEXT NOT NULL DEFAULT 'beitrittsantrag-2026-09';
ALTER TABLE "MembershipApplication" ALTER COLUMN "consentTextVersion" DROP DEFAULT;

-- Fassung nie leer und kurz (eine Kennung, kein Text).
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_consent_version_chk"
  CHECK (length(btrim("consentTextVersion")) > 0 AND length("consentTextVersion") <= 64);
