-- =============================================================================
-- Web-Push als zusätzlicher Versandweg der Benachrichtigungen (neben Benachrichtigungscenter und E-Mail).
-- PushSubscription: ein Abo je Gerät und Benutzer (der Endpunkt ist eine geheime Adresse beim Push-Dienst des
-- Browser-Herstellers). Notification.pushStatus: Zustellstand analog zu emailStatus – die Benachrichtigung bleibt die
-- einzige Quelle, der Push ist nur ein weiterer Kanal.
-- =============================================================================

-- CreateEnum
CREATE TYPE "PushStatus" AS ENUM ('NONE', 'PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "pushSentAt" TIMESTAMPTZ(3),
ADD COLUMN     "pushStatus" "PushStatus" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMPTZ(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "Notification_pushStatus_createdAt_idx" ON "Notification"("pushStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Prüfregeln (unabhängig vom Anwendungscode)
-- -----------------------------------------------------------------------------

-- Der Server sendet nur an https-Adressen; der Zähler ist nie negativ.
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_endpoint_https_chk" CHECK (
  "endpoint" LIKE 'https://%' AND char_length("endpoint") <= 2048
);
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_failure_chk" CHECK ("failureCount" >= 0);
