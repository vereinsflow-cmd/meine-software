import { create } from "qrcode";

/**
 * QR-Codes als SVG-Pfad – ohne Bild und ohne eingeschleustes Markup.
 *
 * Die Bibliothek `qrcode` liefert nur die Matrix (welches Modul ist dunkel); gezeichnet wird hier selbst: ein einziger
 * `<path>` aus waagerechten Streifen. So entsteht kein fertiges SVG als Text, das per `dangerouslySetInnerHTML` in die
 * Seite müsste, der Code ist scharf in jeder Größe (Bildschirm und A4-Druck) und braucht keine Datei-Anfrage.
 */

export interface QrMatrix {
  /** Kantenlänge in Modulen (ohne Ruhezone). */
  size: number;
  /** Dunkel? Zeilenweise, `size * size` Einträge. */
  dark: readonly boolean[];
}

/** Breite der hellen Ruhezone um den Code in Modulen – laut Norm mindestens 4, sonst lesen manche Kameras schlecht. */
export const QR_QUIET_ZONE = 4;

/**
 * Matrix zu einem Text. Fehlerkorrektur „M“ (etwa 15 %): verträgt Knicke und Flecken auf einem Aushang, der Code bleibt
 * dabei grob genug, um ihn aus einiger Entfernung zu scannen.
 */
export function qrMatrix(text: string): QrMatrix {
  const { modules } = create(text, { errorCorrectionLevel: "M" });
  return { size: modules.size, dark: Array.from(modules.data, (bit) => bit === 1) };
}

/**
 * SVG-Pfad der dunklen Module, verschoben um die Ruhezone. Nebeneinanderliegende dunkle Module einer Zeile werden zu
 * einem Rechteck zusammengefasst (`M x y h n v 1 h -n z`) – das hält den Pfad kurz und vermeidet feine Haarlinien
 * zwischen Nachbarmodulen, die beim Kantenglätten sonst sichtbar würden.
 */
export function qrPath(matrix: QrMatrix, quietZone = QR_QUIET_ZONE): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row++) {
    let col = 0;
    while (col < matrix.size) {
      if (!matrix.dark[row * matrix.size + col]) {
        col++;
        continue;
      }
      const start = col;
      while (col < matrix.size && matrix.dark[row * matrix.size + col]) col++;
      const width = col - start;
      parts.push(`M${start + quietZone} ${row + quietZone}h${width}v1h-${width}z`);
    }
  }
  return parts.join("");
}

/** Kantenlänge der gesamten Zeichenfläche in Modulen (Code plus Ruhezone auf beiden Seiten) – für die `viewBox`. */
export const qrViewBoxSize = (matrix: QrMatrix, quietZone = QR_QUIET_ZONE): number =>
  matrix.size + 2 * quietZone;
