# ADR-0013: Spenden – Geldspende als Zeile im Kassenbuch, Sach- und Aufwandsspenden ohne Buchung, Status berechnet

Stand: 07.10.2026 · Status: angenommen (Teil 1 „Erfassen“ gebaut; Teil 2 „Zuwendungsbestätigungen“ folgt)

## Kontext

Ein gemeinnütziger Verein muss die Vereinnahmung jeder Zuwendung und ihre zweckentsprechende Verwendung aufzeichnen und ein
Doppel jeder Zuwendungsbestätigung aufbewahren (§ 50 Abs. 7 EStDV); bei Sach- und Aufwandsspenden gehören die Grundlagen des
bestätigten Werts dazu. Bis 300 € je Zuwendung genügt dem Spender statt einer Bestätigung der Kontoauszug **plus** ein vom
Verein hergestellter Beleg (§ 50 Abs. 4 EStDV). Bestätigungen darf der Verein nur ausstellen, solange sein Bescheid gilt
(Freistellungsbescheid bzw. Anlage zum KSt-Bescheid 5 Jahre, Feststellung nach § 60a AO 3 Jahre, taggenau, § 63 Abs. 5 AO).
Wer vorsätzlich oder grob fahrlässig eine unrichtige Bestätigung ausstellt oder Geld zweckwidrig verwendet, haftet
(§ 10b Abs. 4 EStG). Geld steht schon im Kassenbuch (ADR-0010) – Spenden dürfen dort keine zweite, abweichende Wahrheit
erzeugen. Die Kassenwarte sind Ehrenamtliche ohne Steuerwissen; gestaltet wird nach Entwurf 3 „Spenden-Cockpit“.

## Entscheidung

- **Geldspende = eine Zeile im Kassenbuch.** Jede Geldspende (`Donation.kind = MONEY`) zeigt auf genau eine `LedgerLine` der
  Kategorie „Spenden“ (gewöhnliche Einnahme, nicht storniert; eine Spende je Zeile). Betrag, Tag der Zuwendung, Abteilung und
  Veranstaltung setzt die **Datenbank** aus der Zeile und hält sie fest – sonst zeigten Spenden-Seite und Kassenbuch
  verschiedene Zahlen oder Zwecke. Ein anderer Abteilungs-Zweck geht nur über „Korrigieren“ der Buchung; frei änderbar
  bleibt der Text-Zweck (mit Protokoll alt/neu, K3). Eine Buchung mit zwei Spendern = zwei Zeilen.
- **„Spende erfassen“** bucht und zeichnet in einer Transaktion auf; **„Als Spende kennzeichnen“** ordnet eine schon gebuchte
  Spenden-Einnahme nachträglich einem Spender zu. Spenden-Buchungen ohne Spender zählen in allen Summen mit („Spender fehlt“),
  aber nicht als Spender.
- **Sach- und Aufwandsspenden ohne Buchung.** Es ist kein Geld geflossen, eine Null-Buchung verbietet das Kassenbuch. Sie
  stehen nur als Spende mit Nachweisen (`DonationAttachment`: Datei „Nur Finanzen“ oder Vermerk). Sachspende: genaue
  Bezeichnung und Herkunft (Betriebs-/Privatvermögen/keine Angabe). Aufwandsspende: Anspruch vor Beginn der Tätigkeit
  eingeräumt, Verzicht erst nach ihrem Ende und rechtzeitig (3 Monate nach Fälligkeit, regelmäßig 1 Jahr), Pflicht-Häkchen
  „Anspruch stand vorher fest …“ mit Zeitpunkt und Person an der Spende (BMF 25.11.2014, K13). Der Tag liegt nicht in der
  Zukunft und nicht vor dem Beginn des Kassenbuchs (K19).
- **Spendendose = Spende ohne Spender** mit Pflicht-Bezeichnung („Spendendose Theke“), nur Geld, Bestätigung „nicht möglich“.
- **Spender:** ein Mitglied (Name und Anschrift kommen live aus dem Mitglied – eine Quelle) oder eine andere Person, Firma,
  Stiftung bzw. ein anderer Verein mit eigener Anschrift. Der erste Spender eines Mitglieds entsteht bei der ersten Spende
  unter einer Sperre je Mitglied (K18); die Verknüpfung mit dem Mitglied steht danach fest.
- **Status je Spende wird berechnet**, nie gespeichert (`receipt-status.ts`): storniert → erstellt → nicht möglich → Spender
  fehlt → gesperrt → nicht nötig (verzichtet) → nicht nötig (vereinfachter Nachweis) → Adresse fehlt → nötig. Maßgeblich für
  „bis 300 € nicht nötig“ ist, **wie der Spender gezahlt hat** (`paymentMethod`: Überweisung, bar, PayPal o. ä.), nicht das
  Konto der Buchung – Bargeld, das der Kassenwart selbst einzahlt, bleibt „bar“ (K1). Bar und PayPal sind nie „nicht nötig“;
  Sach- und Aufwandsspenden immer „nötig“; der Wunsch des Spenders („möchte eine“ / „braucht keine“) übersteuert.
- **Beleg für den vereinfachten Nachweis** (`/finanzen/spenden/beleg`) schon in Teil 1: Ohne ihn stimmte „nicht nötig“ nicht
  (K11). Er braucht dieselben Finanzamt-Angaben wie eine Bestätigung; kein amtliches Muster, als eigener Vorschlag gekennzeichnet.
- **Finanzamt-Angaben** an den Einstellungen der Finanzen (Finanzamt, Steuernummer, Art und Datum des Bescheids, letzter
  Veranlagungszeitraum, Zwecke im Genitiv „des Sports“, bei § 60a zusätzlich im Akkusativ „den Sport“ – K5). Gültigkeit
  taggenau am Ausstellungstag (14.03.2024 → bis einschließlich 14.03.2029; 29.02. → 28.02.), Warnung ab 90 Tagen vorher.
- **Storno:** Wird die Buchung einer Geldspende storniert, gilt die Spende als storniert (berechnet). „Korrigieren“ übernimmt
  eine eindeutige Spende auf die neue Zeile. Sach- und Aufwandsspenden werden mit Grund storniert, nie gelöscht.
  „Kennzeichnung zurücknehmen“ löscht nur die Zuordnung einer Geldspende – die Buchung bleibt.
- **Nebenaufzeichnung, nicht Kassenbuch:** Spenden bleiben in abgeschlossenen Monaten erfass- und zuordenbar; neue
  Geldspenden buchen nur im offenen Zeitraum (Regel des Kassenbuchs).
- **Eine Quelle für alle Zahlen:** `getDonationsPage(ctx, year)` liefert die Seite; die violette Karte der Übersicht nutzt
  dieselbe Funktion. Stornierte Spenden zählen nirgends.
- **Sperren ohne Verklemmung (K2):** Ändern, Zuordnen, Stornieren, Zurücknehmen und Sperren eines Spenders nehmen die
  Sperre `finance:donations`; Abläufe, die buchen („Spende erfassen“, „Korrigieren“), nehmen sie nie vor der letzten Buchung.
- **Aufbewahrung:** Nachweise mindestens bis 31.12. des Jahres der Zuwendung bzw. der Erfassung (das spätere) + 10; hängt
  dasselbe Dokument auch an einer Buchung, gilt die längere Frist (`document_finance_retain_until`). Teil 2 ergänzt das
  Jahr der Ausstellung der Bestätigung (K10). Die Aufbewahrungsroutine (Etappe 22) darf erst danach löschen (K20).
- **Rechte:** Lesen `finance:read`, alles Schreibende `finance:manage`, jeweils nur vereinsweit.
- **Teil 2 (folgt):** Zuwendungsbestätigungen nach amtlichem Muster (BMF 07.11.2013, Vordrucke 034122/034123/034132) wörtlich,
  Nummer „ZB-2026-0007“ lückenlos je Ausstellungsjahr, Ausstellungstag = heute, unveränderliches Doppel (gespeichertes HTML
  plus SHA-256), höchstens eine geltende Bestätigung je Spende, Sammelbestätigung je Spender und Jahr; eine Spende mit
  geltender Bestätigung ist gesperrt (`DONATION_LOCKED`). Unterschrift standardmäßig von Hand; maschinelle Erstellung nur
  nach Anzeige beim Finanzamt und nie bei Sach- und Aufwandsspenden.

## Folgen

- Die Spendensumme enthält Sach- und Aufwandsspenden, die nicht im Kassenbuch stehen; die violette Karte der Übersicht sagt
  deshalb „davon … ohne Buchung“, während „Überschuss“ daneben nur Gebuchtes zählt. Der Kassenbericht (Etappe 17) führt sie
  „nachrichtlich“.
- Wird das Storno einer Spenden-Buchung erst im Folgejahr gebucht, weicht die Spendensumme des Vorjahres vom Kassenbericht
  um diesen Betrag ab (die Spende zählt nirgends mehr).
- Datenschutz: Wird ein Mitglied anonymisiert (auch automatisch: Papierkorb, Austritt), kopiert die Anonymisierung vorher
  Name und Anschrift als Momentaufnahme in den Spender und sperrt ihn (K4) – die Aufzeichnung „wer hat was gegeben“ bleibt
  bis zum Fristende (Art. 17 Abs. 3 lit. b DSGVO). Protokolleinträge der Spenden enthalten keine Namen und Anschriften (sie
  bleiben 10 Jahre, K16). Siehe [PRIVACY.md](../PRIVACY.md).
- Eine Abteilung, die Zweck von Spenden ist, lässt sich nicht löschen, nur deaktivieren.
- PayPal-Spenden bis 300 € gelten vorsichtshalber als „Bestätigung nötig“; Rückspenden, ELSTER-Übermittlung und Versand als
  PDF sind nicht in v1. Keine Steuerberatung: Die Oberfläche verweist im Zweifel auf den Steuerberater.
- Verfahrensdokumentation: [docs/VERFAHRENSDOKUMENTATION.md](../VERFAHRENSDOKUMENTATION.md), Abschnitt „Spenden“.
