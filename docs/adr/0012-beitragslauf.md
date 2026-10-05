# ADR-0012: Beitragslauf – genau die Vorschau, kein Tag zweimal, rückgängig solange nichts bezahlt ist

Status: gültig (Oktober 2026)

## Kontext

Aus „Wer zahlt was“ (ADR-0011) werden im Beitragslauf echte Beiträge (Forderungen) mit Nummer. Kassenwarte rechnen
ehrenamtlich und oft in mehreren Anläufen: Mitglieder werden nachgetragen, ein Betrag war falsch, ein zweites Fenster ist
offen. Ein Beitrag darf deshalb nie doppelt entstehen, nie etwas anderes enthalten als die geprüfte Vorschau und muss sich
zurücknehmen lassen, solange noch kein Geld geflossen ist. Beiträge sind Buchhaltungsunterlagen und bleiben erhalten.

## Entscheidung

- **Drei Schritte** (`/finanzen/beitraege/lauf`): Prüfen (Hinweise als Text, jeder mit Link), Vorschau (Summen, jede Zeile
  mit ihrer Rechnung, Filter), Erstellen (Rückfrage). Ein weiterer Lauf für denselben Zeitraum ist ein **Nachlauf** und
  erstellt nur, was noch fehlt.
- **Genau die Vorschau:** Die Vorschau hat einen Prüfwert (SHA-256 über alles, was entstehen würde – Wer, Zahler, Zahlweg,
  Betrag, Zeilen, abgedeckte Tage, Zeitraum, Fälligkeit; ohne Zeitpunkte). Beim Erstellen rechnet der Server unter einer
  Sperre des Vereins neu; weicht der Prüfwert ab, entsteht nichts („bitte neu prüfen“). Ein doppelter Klick ergibt
  denselben Lauf (Schlüssel aus Zeitraum, Zahl der rückgängig gemachten Läufe und Prüfwert).
- **Kein Tag zweimal** (`ChargeCoverage`): Jede Zeile hält fest, welche Tage sie für wen abdeckt – Gruppe „BASE“ für Grund-
  und Familienbeitrag, sonst die Beitragsart; die Aufnahmegebühr deckt „immer“ ab (einmal je Mitglied). Der Rechenkern lässt
  abgedeckte Tage weg („schon berechnet“), die Datenbank sichert es mit einer Ausschlussbedingung auch bei gleichzeitigen
  Läufen. Ein Monatslauf und danach ein Quartalslauf berechnen den Oktober also nur einmal.
- **Unveränderlich** (Trigger): Betrag, Zeilen, Mitglied, Zahler, Zeitraum und Erklärung eines Beitrags bleiben, wie sie
  erstellt wurden; die Summe der Zeilen ist der Betrag (geprüft am Ende der Transaktion). Änderbar sind nur Status und
  Zahlungsstand (Zahlungen ab Etappe 8, nur über ihre Zuordnung), Fälligkeit solange offen, Mahnstufe und „nicht
  einziehen“. Gestrichen und ausgebucht sind endgültig; gelöscht wird nie.
- **Rückgängig und streichen:** Ein Lauf lässt sich rückgängig machen (alle Beiträge gestrichen, mit Grund), solange keiner
  bezahlt, ausgebucht oder erinnert ist; einzelne offene, unbezahlte Beiträge lassen sich streichen. Gestrichen gibt die
  abgedeckten Tage wieder frei; die Nummer bleibt als „gestrichen“ sichtbar.
- **Nummern** „B-2026-0412“ aus dem lückenlosen Nummernkreis des Kassenbuchs (ADR-0010), je Jahr des Zeitraums, in der
  Reihenfolge der Vorschau. Kategorie je Zeile: die der Beitragsart, sonst „Mitgliedsbeiträge“ bzw. „Aufnahmegebühren“.
- **Aufnahmegebühr** einmal, im Zeitraum des Eintritts – ein Nachlauf für diesen Zeitraum holt sie für nachgetragene
  Mitglieder nach; nicht bei Beitragsfreiheit am Eintrittstag und nur für Eintritte ab ihrem ersten Betrag.

## Folgen

- Der Beitragslauf braucht ein eingerichtetes Kassenbuch (Kategorien, später die Zahlungen).
- „Wer zahlt was“ zeigt weiterhin den ganzen Zeitraum (ohne Abzug schon erstellter Beiträge); der Beitragslauf zeigt, was
  noch zu erstellen ist.
- Namen in Beiträgen (Mitglied, Zahler) sind Teil der Buchhaltung und bleiben bei einer Anonymisierung erhalten; Sperren
  und Löschen nach Ablauf der Aufbewahrung regelt Etappe 22.
- Ein Betrag oder eine Ermäßigung, mit denen schon Beiträge erstellt wurden, lassen sich nicht mehr zurücknehmen – nur
  durch einen neuen Betrag bzw. ein Ende ersetzen.
- Lastschrift (Etappe 11–13) und Zahlungen (Etappe 8) erweitern die Sperren von „rückgängig“ und „streichen“.
- Familien im Nachlauf: Eine Abdeckung merkt sich, ob sie aus einem Familienbeitrag stammt. Kommt ein Kind später in eine
  schon abgerechnete Familie, zahlt es diese Tage über die Familie – kein eigener Grundbeitrag, kein zweiter Familienbeitrag.
- Ein doppelter Klick ergibt denselben Lauf; nach dem Streichen (einzeln oder per „rückgängig“) entsteht neu, was fehlt –
  die Zahl der gestrichenen Beiträge des Zeitraums gehört zum Schlüssel.
- „Beitragslauf ist bereit“ fragt, ob ein Lauf den Zeitraum ganz enthält; nach einem Wechsel des Rhythmus (monatlich ↔
  vierteljährlich) entscheidet die Vorschau, ob noch etwas zu erstellen ist.
- Für schon ganz abgerechnete Mitglieder gibt ein Nachlauf keine Hinweise mehr aus (sie betreffen keinen neuen Beitrag).
- Aufnahmegebühr im Zeitraum des ersten Beitragstags (bei „ab dem Folgemonat“ also im Folgemonat), nicht für Mitglieder, die
  dann beitragsfrei sind (Befreiung, Ehrenmitglied, fester Betrag 0 €).
