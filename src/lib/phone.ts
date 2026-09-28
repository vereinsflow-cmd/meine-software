/**
 * `tel:`-Link zu einer eingegebenen Telefonnummer (Antippen ruft am Handy an): nur Ziffern und „+“ bleiben stehen, die in
 * Deutschland übliche „(0)“ nach der Ländervorwahl fällt weg („+49 (0)170 …“ wählt sonst „+490170…“).
 */
export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/\(0\)/g, "").replace(/[^\d+]/g, "")}`;
}
