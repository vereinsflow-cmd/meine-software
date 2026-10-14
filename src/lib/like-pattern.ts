/**
 * Maskiert die LIKE-Platzhalter `%` und `_` (und das Maskierzeichen `\`) in einem Suchtext.
 *
 * Prisma reicht den Text bei `contains`/`startsWith`/`endsWith` unverändert an `LIKE`/`ILIKE` weiter. Ohne Maskierung passt
 * „%“ auf beliebig viele Zeichen und „_“ auf genau eines – wer „100%“ sucht, fände dann auch „1000 €“. PostgreSQL nutzt `\`
 * als voreingestelltes Maskierzeichen.
 */
export function likeText(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
