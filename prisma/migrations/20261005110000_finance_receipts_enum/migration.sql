-- Belege im Kassenbuch: neue Zugriffsstufe „Nur Finanzen“ (sieht, wer die Finanzen ansehen darf). Eigene Migration, weil
-- ein neuer Enum-Wert erst nach dem Festschreiben verwendet werden kann.
ALTER TYPE "DocumentAccess" ADD VALUE IF NOT EXISTS 'FINANCE';
