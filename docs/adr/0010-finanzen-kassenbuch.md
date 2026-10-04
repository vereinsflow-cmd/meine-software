# ADR-0010: Kassenbuch – Kopf und Zeilen, nur hinzufügen, Storno, Abschluss

Stand: 04.10.2026 · Status: angenommen

## Kontext

Vereine müssen Einnahmen und Ausgaben ordnungsgemäß aufzeichnen (§ 63 Abs. 3 AO; Rechenschaft des Vorstands nach § 259 BGB).
Für elektronische Aufzeichnungen gelten die GoBD: einzeln, vollständig, zeitgerecht, unveränderbar (§ 146 Abs. 4 AO);
Korrekturen müssen auf die ursprüngliche Buchung verweisen; Kassen dürfen nicht negativ werden (Kassensturzfähigkeit).
Bücher und Aufzeichnungen sind 10 Jahre, Buchungsbelege 8 Jahre aufzubewahren (§ 147 AO, seit 2025). Die Kassenwarte sind
Ehrenamtliche ohne Buchhaltungswissen.

## Entscheidung

- **Buchung = Kopf + Zeilen** (`LedgerEntry`, `LedgerLine`): Der Kopf trägt Konto, Datum, Betrag mit Vorzeichen (+ Einnahme,
  − Ausgabe), Text und Gegenüber; die Zeilen verteilen den Betrag auf Kategorien (mit Abteilung oder Veranstaltung). So wird
  ein Bankumsatz immer genau eine Buchung, auch wenn er mehrere Kategorien betrifft.
- **Nur hinzufügen.** Ein Trigger verbietet UPDATE und DELETE auf Buchungen und Zeilen (`finance_immutable_guard`); erlaubt
  ist das nur der Aufbewahrungsroutine nach Ablauf der Frist. Korrektur = **Storno** (Gegenbuchung mit `reversalOfId`, die die
  Zeilen des Originals exakt aufhebt; ein Storno lässt sich nicht stornieren, jede Buchung höchstens einmal) bzw.
  **Korrigieren** = Storno + neue Buchung in einer Transaktion. Das Storno trägt das Datum der Buchung, solange deren
  Zeitraum offen ist (sonst den ersten offenen Tag), und übernimmt deren Bereich und Kategorienamen. Ein Anfangsbestand wird
  nicht von Hand storniert, sondern über „Anfangsbestand korrigieren“ (Storno + neuer Bestand am Beginn des Kassenbuchs,
  solange dieser Tag nicht abgeschlossen ist).
- **Summen stimmen immer:** ein zurückgestellter Trigger prüft beim Festschreiben, dass jede Buchung Zeilen hat und diese den
  Betrag ergeben; Zeilen lassen sich später nicht nachschieben.
- **Momentaufnahmen:** Zeilen merken sich Kategoriename und steuerlichen Bereich zum Zeitpunkt der Buchung (die Datenbank setzt
  sie). Spätere Umbenennungen gelten nur für neue Buchungen.
- **Lückenlose Nummern** je Jahr (`FinanceCounter`, Zeilensperre in derselben Transaktion; „2026-0042“). Stornos bekommen
  eigene Nummern.
- **Barkasse:** am Ende keines Tages ab dem Buchungsdatum im Minus (zurückgestellter Trigger mit einer Advisory-Sperre je
  Kasse, damit gleichzeitige Ausgaben nacheinander geprüft werden – eine Zeilensperre auf dem Konto verklemmte sich mit den
  Fremdschlüssel-Sperren). Keine Buchung auf irgendeinem Konto in der Zukunft (`FUTURE_DATE`).
- **Abschluss:** `FinanceSettings.closedThrough` sperrt Buchungen bis zu diesem Tag (geprüft beim Anlegen mit `FOR SHARE`;
  der Monatsabschluss setzt den Wert nur nach vorn). Ein Abschluss wird nie zurückgenommen.
- **Belege** (`LedgerAttachment`): mehrere Dateien je Buchung oder ein Eigenbeleg als Text. Hochgeladene Belege sind
  Dokumente der Stufe „Nur Finanzen“. Beim Anhängen setzt die Datenbank `Document.retainUntil` auf das Ende der
  Aufbewahrungsfrist (31.12. des Buchungsjahres + 8, § 147 Abs. 3 AO) und verweigert bis dahin Papierkorb, Archiv und
  Löschen (`DOCUMENT_RETAINED`). Anhänge sind unveränderlich; entfernen nur im offenen Zeitraum (dann entfällt die Frist).
  Beim Korrigieren wandern die Belege zur neuen Buchung.
- **Rechnungen im Kassenbuch:** Zeilen verweisen auf die bezahlte Rechnung (`LedgerLine.invoiceId`), die Rechnung hängt als
  Beleg an. Eine Rechnung hat höchstens eine geltende Buchung; solange sie gilt, bleibt die Rechnung bezahlt und ihr Betrag
  fest (`INVOICE_BOOKED`) – erst das Storno gibt sie frei.
- **Kategorien in Alltagssprache** mit Bereich (ideeller Bereich, Vermögensverwaltung, Zweckbetrieb, wirtschaftlicher
  Geschäftsbetrieb, neutral) – als Vorschlag; Art (Einnahme/Ausgabe) und Systemkennung stehen fest, sobald gebucht wurde.
- **Rechte:** `finance:read`/`finance:manage`/`finance:export` wirken nur vereinsweit (`modules/finance/access.ts`).
- **Fehler** aus Triggern tragen ein Kürzel und einen deutschen Satz (`CASH_NEGATIVE: Die Barkasse wäre am … im Minus …`);
  `mapDatabaseError` zeigt den Satz an.

## Folgen

- Keine „Bearbeiten“-Funktion für Buchungen; die Oberfläche erklärt das und bietet „Korrigieren“.
- Ein Verein mit Kassenbuch lässt sich nicht still komplett löschen (die Triggers verweigern das Löschen der Buchungen) – gewollt.
- Datenschutz: Bei Löschung oder Anonymisierung bleiben Buchungen samt Namen des Gegenübers bis zum Ende der Aufbewahrungsfrist
  (Art. 17 Abs. 3 lit. b DSGVO); Einträge der Finanzen im Änderungsprotokoll bleiben 10 volle Jahre.
- Die Verfahrensdokumentation (GoBD Rz. 151 ff.) folgt mit dem Monatsabschluss; die Begriffe sollte ein Steuerberater prüfen.
