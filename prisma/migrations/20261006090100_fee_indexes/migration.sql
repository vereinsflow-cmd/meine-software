-- Indizes für die Beiträge: Liste „alle“ nach Fälligkeit und die Abdeckungen eines Zeitraums im Beitragslauf.

-- CreateIndex
CREATE INDEX "Charge_clubId_dueDate_idx" ON "Charge"("clubId", "dueDate");

-- CreateIndex
CREATE INDEX "ChargeCoverage_clubId_coversTo_idx" ON "ChargeCoverage"("clubId", "coversTo");
