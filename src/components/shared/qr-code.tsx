import { qrMatrix, qrPath, qrViewBoxSize } from "@/lib/qr-code";
import { cn } from "@/lib/utils";

/**
 * QR-Code als eingebettetes SVG (Server-Komponente): die Matrix kommt aus `qrcode`, gezeichnet wird ein einziger Pfad aus
 * den Modulen – kein fertiges SVG als Text, kein `dangerouslySetInnerHTML`, keine Bilddatei. Scharf in jeder Größe, auch
 * im A4-Druck.
 *
 * Bewusst feste Farben (Schwarz auf Weiß, auch in der dunklen Darstellung): Kameras erkennen einen QR-Code nur sicher mit
 * dunklen Modulen auf hellem Grund; ein „umgedrehter“ Code wird von vielen Apps nicht gelesen. Die helle Ruhezone gehört
 * zum Code dazu.
 */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  /** Name für Screenreader, z. B. „QR-Code zum Beitrittsformular“. */
  label: string;
  className?: string;
}) {
  const matrix = qrMatrix(value);
  const size = qrViewBoxSize(matrix);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      data-slot="qr-code"
      className={cn("block shrink-0", className)}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={qrPath(matrix)} fill="#000000" />
    </svg>
  );
}
