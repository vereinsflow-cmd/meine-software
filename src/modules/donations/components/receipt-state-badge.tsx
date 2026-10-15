import { ToneBadge, type Tone } from "@/components/shared/status-badge";
import { receiptBadge } from "../format";
import type { DonationReceiptState } from "../receipt-status";

/**
 * Ruhige Schilder wie im Entwurf: „nicht nötig“ grau gefüllt, „nicht möglich“, „gesperrt“, „Spender fehlt“ und „storniert“
 * nur grau umrandet (es gibt nichts zu tun), „nötig“ bernstein, „Adresse fehlt“ rot, „erstellt am …“ grün.
 */
const STATE_TONE: Record<DonationReceiptState, Tone> = {
  NEEDED: "warning",
  ADDRESS_MISSING: "danger",
  ISSUED: "success",
  SIMPLIFIED: "neutral",
  NOT_WANTED: "neutral",
  ANONYMOUS: "ended",
  RESTRICTED: "ended",
  NO_DONOR: "ended",
  VOID: "ended",
};

/**
 * Stand der Zuwendungsbestätigung einer Spende als Schild in Worten. Die Erklärung („Überweisung bis 300 € – Kontoauszug
 * und Beleg des Vereins genügen“) steht im `title` und für Screenreader direkt dahinter.
 */
export function ReceiptStateBadge({
  state,
  issuedOn,
  className,
}: {
  state: DonationReceiptState;
  issuedOn?: Date | null;
  className?: string;
}) {
  const badge = receiptBadge(state, issuedOn);
  return (
    <ToneBadge tone={STATE_TONE[state]} className={className}>
      <span title={badge.explanation}>{badge.label}</span>
      <span className="sr-only">. {badge.explanation}</span>
    </ToneBadge>
  );
}
