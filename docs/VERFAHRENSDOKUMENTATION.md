# Verfahrensdokumentation Kassenbuch (Fassung 1, Oktober 2026)

Diese Beschreibung erklärt, wie VereinsFlow das Kassenbuch eines Vereins führt – für den Verein selbst, für Kassenprüfer
und für das Finanzamt (GoBD, Rz. 151 ff.). Sie gilt für jeden Verein, der das Kassenbuch in VereinsFlow nutzt; der Verein
ergänzt sie um seine eigene Organisation (wer bucht, wer prüft, wo liegen Papierbelege). Fachbegriffe sollte ein
Steuerberater prüfen. Technische Einzelheiten: [ADR-0010](adr/0010-finanzen-kassenbuch.md).

## 1. Allgemeine Beschreibung

- **Zweck:** Erfassen aller Einnahmen und Ausgaben des Vereins auf seinen Konten (Bankkonten, Barkassen), mit Belegen,
  Monatsabschluss und Kassensturz.
- **System:** VereinsFlow, eine Web-Anwendung. Daten liegen in einer PostgreSQL-Datenbank; jeder Verein sieht nur seine
  eigenen Daten (Mandantentrennung in Anwendung und Datenbank).
- **Beginn:** Der Verein legt fest, ab welchem Tag er in VereinsFlow bucht, und trägt die Anfangsbestände seiner Konten
  zu diesem Tag ein. Frühere Vorgänge gehören in die bisherigen Unterlagen.

## 2. Rollen und Rechte

- **Finanzen ansehen** (`finance:read`): Kontostände, Buchungen, Belege, Abschlüsse sehen. Standard: Vorstand,
  Vereinsadministration.
- **Finanzen bearbeiten** (`finance:manage`): buchen, stornieren, Belege anhängen, Kassensturz, Monatsabschluss, Konten
  und Kategorien pflegen. Standard: Vorstand (Kassenwart), Vereinsadministration.
- Die Rechte gelten nur vereinsweit; Abteilungsleitungen und Mitglieder sehen die Finanzen nicht. Wer welche Rolle hat,
  legt der Verein unter „Mitglieder“ fest.

## 3. Buchen

- Jede Buchung hat eine **fortlaufende Nummer je Jahr** („2026-0042“) ohne Lücken, ein Buchungsdatum (Tag, an dem das
  Geld geflossen ist; nicht in der Zukunft), Konto, Betrag, Beschreibung und optional das Gegenüber.
- Der Betrag kann auf **mehrere Kategorien** aufgeteilt werden (Zeilen), jeweils mit Abteilung oder Veranstaltung.
  Kategorien sind in Alltagssprache benannt und einem steuerlichen Bereich zugeordnet (ideeller Bereich,
  Vermögensverwaltung, Zweckbetrieb, wirtschaftlicher Geschäftsbetrieb). Jede Zeile speichert Kategoriename und Bereich
  zum Zeitpunkt der Buchung – spätere Änderungen an der Kategorie verändern frühere Buchungen nicht.
- Die **Barkasse** kann an keinem Tag ins Minus rutschen; die Datenbank prüft das beim Speichern.
- Bargeld zur Bank bringen ist eine **Umbuchung** (zwei Buchungen mit gemeinsamer Kennung) – weder Einnahme noch Ausgabe.
- Beim Speichern hält die Datenbank fest, wann und von wem gebucht wurde. Alle Vorgänge stehen zusätzlich im
  Änderungsprotokoll des Vereins.

## 4. Unveränderbarkeit und Korrekturen

- Gespeicherte Buchungen lassen sich **weder ändern noch löschen** – das verhindert die Datenbank selbst (Trigger),
  unabhängig von der Anwendung.
- Eine falsche Buchung wird **storniert**: Eine Gegenbuchung mit eigener Nummer hebt sie genau auf und verweist auf sie;
  jede Buchung kann höchstens einmal storniert werden, ein Storno nicht noch einmal. „Korrigieren“ ist Storno und neue
  Buchung in einem Schritt. Das Storno trägt das Datum der ursprünglichen Buchung, solange deren Monat offen ist, sonst
  den ersten offenen Tag.
- Anfangsbestände werden über „Anfangsbestand korrigieren“ geändert (Storno und neuer Anfangsbestand), solange der Beginn
  des Kassenbuchs nicht abgeschlossen ist.

## 5. Belege

- Zu jeder Einnahme und Ausgabe gehört ein Beleg: eine Datei (Foto oder PDF, beim Buchen oder später angehängt) oder ein
  **Eigenbeleg** (kurzer Text: was bezahlt wurde und warum es keinen Beleg gibt). Bezahlte Eingangsrechnungen werden mit
  „Ins Kassenbuch“ gebucht und hängen dann als Beleg an der Buchung.
- Hochgeladene Belege sind Dokumente der Stufe „Nur Finanzen“. Dateien werden beim Hochladen auf Typ und Inhalt geprüft
  und unter einem zufälligen Namen gespeichert.
- **Aufbewahrung:** Hängt ein Dokument an einer Buchung, bleibt es bis zum 31.12. des achten Jahres nach dem Buchungsjahr
  gesperrt (kein Papierkorb, kein Löschen) – geprüft in der Datenbank. Ein Beleg lässt sich nur entfernen, solange der
  Monat der Buchung nicht abgeschlossen ist; die Rechnung, die eine Buchung bezahlt, bleibt immer angehängt.
- Papierbelege bewahrt der Verein zusätzlich nach seinen eigenen Regeln auf (Ort: ______________________).

## 6. Kassensturz

- Die Barkasse wird regelmäßig gezählt (mindestens vor jedem Monatsabschluss). VereinsFlow vergleicht den gezählten
  Betrag mit dem Kassenbuch; eine Differenz muss begründet werden und wird als Buchung „Kassendifferenz“ festgehalten.
- Kassenstürze lassen sich nicht ändern oder löschen.

## 7. Monatsabschluss

- Monate werden der Reihe nach abgeschlossen, frühestens am Tag nach Monatsende; eine Checkliste weist auf fehlende
  Belege, ausstehende Kassenstürze und nicht gebuchte bezahlte Rechnungen hin.
- Beim Abschluss speichert die Datenbank die Kontostände, die Zahl der Buchungen, die höchste Nummer und eine
  **Prüfsumme** (SHA-256 über alle Buchungen und Zeilen des Monats, verkettet mit der Prüfsumme des Vormonats). Die Seite
  „Abschluss“ rechnet die Prüfsummen bei jedem Aufruf nach.
- Danach ist der Monat **festgeschrieben**: keine neuen Buchungen in diesem Zeitraum, kein Entfernen von Belegen. Ein
  Abschluss lässt sich nicht zurücknehmen. Der Abschluss des Dezembers ist der Jahresabschluss.

## 8. Datensicherheit und Aufbewahrung

- Anmeldung mit persönlichem Konto; Rechte werden bei jedem Zugriff geprüft. Downloads laufen über eine geprüfte Route.
- Datensicherung durch den Betreiber nach [OPERATIONS.md](OPERATIONS.md): täglich Datenbank und Dateiablage, mindestens
  7–30 Tage aufbewahrt, Wiederherstellung regelmäßig getestet.
- Bücher und Abschlüsse werden 10 Jahre aufbewahrt, Belege 8 Jahre (jeweils ab Ende des Kalenderjahres). Einträge der
  Finanzen im Änderungsprotokoll bleiben 10 volle Jahre. Personenbezogene Angaben in Buchungen (Name des Gegenübers)
  bleiben bis zum Ende der Frist erhalten (Art. 17 Abs. 3 lit. b DSGVO).

## 9. Änderungen an dieser Dokumentation

| Fassung | Datum      | Änderung                                                       |
| ------- | ---------- | -------------------------------------------------------------- |
| 1       | 05.10.2026 | Erste Fassung: Buchen, Storno, Belege, Kassensturz, Abschluss. |
