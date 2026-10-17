ENTWURF – keine Rechtsberatung, vor Live-Gang anwaltlich prüfen

# Vorgabe für Online-Checkout, Kundenkonto, Kündigungs- und Widerrufsfunktion von VereinsFlow

Stand: 17.10.2026. Gilt für den noch zu bauenden Bestellvorgang auf vereins-flow.com und das Kundenkonto der Anwendung. Rechtsgrundlagen mit Fundstellen und Abrufdatum stehen in `quellen.md`; alle offenen Angaben in `platzhalter-gesamt.md`. Die Texte hier müssen wortgleich mit `agb.html` und `widerruf.html` sein (Firma, Kontakt, Laufzeit, Preise, Kündigungsweg).

## 0. Feststehende Eckdaten (in allen Dokumenten identisch)

| Punkt | Festlegung |
|---|---|
| Anbieter | H&B Software Solution UG (haftungsbeschränkt) i. G., Oberschlesienstraße 6a, 45711 Datteln, vertreten durch den Geschäftsführer Luis Heidecker. Die Gesellschaft befindet sich in Gründung; die Eintragung in das Handelsregister des Amtsgerichts Recklinghausen wird beantragt. (Stand 17.10.2026: Zusatz „i. G.“ bis zur Eintragung, keine HRB-Nummer, keine USt-IdNr.; Gesellschafter sind Luis Heidecker und Ben Bleckert, Ben Bleckert ist nicht Geschäftsführer) |
| Kontakt | kontakt@vereins-flow.com, +49 176 56792302 |
| Produkt | VereinsFlow, Web-Anwendung (SaaS) zur Vereinsverwaltung: Mitglieder, Termine, Helferschichten, Nachrichten, Dokumente, Finanzen/Kassenbuch; Browser und Android-App |
| Vertragstyp | Abonnement, Dauerschuldverhältnis; rechtlich eine **digitale Dienstleistung** (§ 327 Abs. 2 Satz 2 BGB) und für das Widerrufsrecht eine **Dienstleistung** (§ 356 Abs. 5, § 357a Abs. 2 BGB) |
| Laufzeit | unbefristet, keine Mindestlaufzeit; Abrechnungszeitraum Kalendermonat, erster Monat anteilig nach Tagen |
| Kündigung | Kunde: jederzeit zum Ende des laufenden Kalendermonats – Textform (E-Mail), Kundenkonto oder Kündigungsschaltfläche „Verträge hier kündigen“ (§ 312k BGB). Anbieter: drei Monate zum Monatsende |
| Preise | Staffel nach Mitgliederzahl, Beträge [BITTE ERGÄNZEN]; Endpreise inkl. USt gegenüber Verbrauchern; Kleinunternehmer-Variante vorgesehen |
| Zahlung | offen – Variante A: Zahlung über Stripe; Variante B: Zahlung über Mollie; Variante C: Zahlung auf Rechnung per Überweisung (gleiche Bezeichnungen in agb.html § 4 Abs. 4 und datenschutz.html Abschnitt 8) [BITTE ERGÄNZEN: Entscheidung] |
| Kein kostenloser Tarif, keine Testphase | Demo-Termin vor Vertragsschluss möglich |
| Datenschutz-Rollen | Kunde Verantwortlicher für Mitgliederdaten, Anbieter Auftragsverarbeiter (Art. 28 DSGVO) – AV-Vertrag ist Anlage 1 der AGB |

## 1. Begriffe und Kundentypen

| Kundentyp im Checkout | Rechtlich | Widerrufsbelehrung und Opt-in zeigen? | Preisdarstellung | Gerichtsstandsklausel |
|---|---|---|---|---|
| Privatperson | Verbraucher (§ 13 BGB) | **Ja** | brutto (PAngV) | nein |
| Verein / gemeinnützige Organisation | kein Verbraucher; Unternehmer nur bei wirtschaftlicher Tätigkeit (§ 14 BGB) | nein (kein gesetzliches Widerrufsrecht) | brutto, netto und USt in der Rechnung ausgewiesen | nur wenn Kaufmann (praktisch selten) |
| Unternehmen / Selbständige | Unternehmer (§ 14 BGB) | nein | brutto; netto und USt ausgewiesen | nur wenn Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen (§ 38 ZPO) |

Hinweise:

- Ein Idealverein ist nach herrschender Auffassung häufig weder Verbraucher noch Unternehmer. Folge: §§ 308, 309 BGB (Klauselverbote) gelten gegenüber ihm uneingeschränkt (§ 310 Abs. 1 BGB nimmt nur Unternehmer aus). Die AGB sind deshalb durchgehend §§ 308/309-fest formuliert; nur Gerichtsstand und B2B-Gewährleistung sind ausdrücklich auf Unternehmer bzw. Kaufleute beschränkt. Anwaltlich bestätigen lassen.
- Die Abfrage muss ehrlich beantwortet werden können: Wer als „Privatperson“ bestellt, ist Vertragspartner persönlich. Wer für einen Verein bestellt, muss vertretungsberechtigt sein; Vertragspartner wird der Verein (AGB § 3 Abs. 6). Deshalb bei Verein/Unternehmen die vertretende Person mit Funktion erfassen.
- Keine Vorbelegung des Kundentyps. Keine Default-Auswahl „Unternehmer“, um die Widerrufsbelehrung zu vermeiden – das wäre eine Umgehung (§ 312k Abs. 6 BGB-Gedanke, § 327s Abs. 3 BGB) und abmahnfähig.

## 2. Rechtsgrundlagen im Überblick (Kurzfassung, Details in quellen.md)

| Norm | Anforderung an Checkout/Konto |
|---|---|
| § 312i Abs. 1 BGB, Art. 246c EGBGB | Eingabefehler erkennen und berichtigen können; Informationen zu technischen Schritten, Speicherung des Vertragstexts, Korrekturmöglichkeit, Sprache; unverzügliche elektronische Eingangsbestätigung; AGB bei Vertragsschluss abrufbar und speicherbar |
| § 312j Abs. 1 BGB | spätestens zu Beginn des Bestellvorgangs: akzeptierte Zahlungsmittel (Lieferbeschränkungen entfallen) |
| § 312j Abs. 2 BGB | unmittelbar vor der Bestellung, klar, verständlich, hervorgehoben: Art. 246a § 1 Abs. 1 Satz 1 Nr. 1, 5–8, 11a, 14, 15 EGBGB (wesentliche Merkmale, Gesamtpreis, monatliche Gesamtkosten, Laufzeit/Kündigungsbedingungen, Mindestdauer) |
| § 312j Abs. 3 und 4 BGB | Schaltfläche gut lesbar, Beschriftung ausschließlich „zahlungspflichtig bestellen“ – sonst kommt kein Vertrag zustande |
| § 312d Abs. 1 BGB, Art. 246a § 1 EGBGB | vollständige vorvertragliche Informationen (Liste in Abschnitt 5) |
| § 312f Abs. 2 BGB | Vertragsbestätigung auf dauerhaftem Datenträger (E-Mail) innerhalb angemessener Frist, spätestens vor Beginn der Dienstleistung; enthält Art.-246a-Angaben, soweit nicht schon vorher auf dauerhaftem Datenträger übermittelt |
| § 355, § 356 Abs. 5, § 357a Abs. 2 BGB | 14 Tage Widerruf ab Vertragsschluss; Wertersatz nur bei ausdrücklichem Verlangen des Verbrauchers, vorzeitig zu beginnen, und ordnungsgemäßer Belehrung; Erlöschen nur bei vollständiger Erbringung nach Zustimmung und Kenntnisbestätigung |
| § 356a BGB (seit 19.6.2026) | Online-Widerrufsfunktion „Vertrag widerrufen“, Bestätigungsfunktion „Widerruf bestätigen“, Eingangsbestätigung mit Datum und Uhrzeit |
| § 312k BGB | Kündigungsschaltfläche „Verträge hier kündigen“, Bestätigungsseite mit Pflichtfeldern, Bestätigungsschaltfläche „jetzt kündigen“, speicherbare Kündigungserklärung, sofortige Bestätigung in Textform |
| §§ 327 ff. BGB | Bereitstellung, Aktualisierungen, Mängelrechte, Änderungen (§ 327r), Bereitstellung der Inhalte nach Vertragsende (§ 327p Abs. 3) – gilt für Verbraucher, in den AGB freiwillig für alle |
| PAngV §§ 1, 3, 6 | Gesamtpreis einschließlich USt, eindeutig zugeordnet, gut lesbar; im Fernabsatz Hinweis, dass USt enthalten ist und ob weitere Kosten anfallen |
| § 36 VSBG | Hinweis zur Verbraucherschlichtung auf der Website und mit den AGB (Formulierung in AGB § 15) |
| § 37 VSBG | nach gescheiterter Beschwerde: Hinweis in Textform auf zuständige Verbraucherschlichtungsstelle und (Nicht-)Teilnahme – als Textbaustein im Support hinterlegen |
| § 14 Abs. 4 UStG, § 27 Abs. 38 UStG, § 147 AO | Rechnungspflichtangaben, E-Rechnung im B2B-Inland mit Übergangsfristen, Aufbewahrung |
| § 5 DDG | Anbieterkennzeichnung (Impressum) überall erreichbar – Firma mit „i. G.“, Vertretungsberechtigter (Geschäftsführer Luis Heidecker), Satz zur Gründung; Registergericht Amtsgericht Recklinghausen mit HRB-Nummer und USt-IdNr., sobald vorhanden |
| § 35a GmbHG | Pflichtangaben auf allen Geschäftsbriefen an bestimmte Empfänger (auch E-Mails und Rechnungen): Rechtsform, Sitz der Gesellschaft, Registergericht und Registernummer – sobald eingetragen –, alle Geschäftsführer mit Familiennamen und mindestens einem ausgeschriebenen Vornamen (derzeit: Luis Heidecker). In der Gründungsphase Firma mit „i. G.“; die Handelnden haften bis zur Eintragung persönlich (§ 11 Abs. 2 GmbHG) |
| VO (EU) 2024/3228 | OS-Plattform eingestellt, VO (EU) Nr. 524/2013 mit Wirkung vom 20.7.2025 aufgehoben – **kein OS-Link** mehr auf der Website |

## 3. Ablauf des Checkouts (Schritte und Pflichtinhalte)

Alle Schritte in deutscher Sprache; jeder Schritt mit „Zurück“; Eingaben bleiben beim Zurückgehen erhalten (Korrekturmöglichkeit, § 312i Abs. 1 Nr. 1 BGB). Keine vorangekreuzten Kästchen. Kein Timer, kein Verknappungshinweis.

### Schritt 1 – Tarif wählen

- Eingabe oder Auswahl der Mitgliederzahl → Anzeige der Staffel und des Monatspreises.
- Preisanzeige exakt in dieser Form (PAngV § 3, § 6; Art. 246a § 1 Abs. 1 Nr. 5 und 8 EGBGB):
  „**[Betrag] € pro Monat** inkl. 19 % USt. Keine weiteren Kosten. Monatlich kündbar, keine Mindestlaufzeit.“
  – Kleinunternehmer-Variante: „**[Betrag] € pro Monat**. Keine Umsatzsteuer (Kleinunternehmer gemäß § 19 UStG). Keine weiteren Kosten. …“ [BITTE ERGÄNZEN: Variante festlegen]
  – Für Verein/Unternehmen zusätzlich in Klammern: „(netto [Betrag] € + [Betrag] € USt)“. Der Bruttopreis bleibt die größere Zahl (§ 3 Abs. 3 PAngV: Gesamtpreis hervorheben).
- Hinweis zur Staffelmechanik (AGB § 4 Abs. 2): „Maßgeblich ist die Mitgliederzahl am Monatsersten. Wechselt die Staffel, gilt der neue Preis ab dem Folgemonat.“
- Vollständige Staffeltabelle verlinken oder einblenden [BITTE ERGÄNZEN: Staffeln und Beträge].

### Schritt 2 – Kundentyp und Angaben

- Pflicht-Auswahl (Radio, keine Vorbelegung): „Ich bestelle als … ○ Verein oder Organisation ○ Unternehmen oder Selbständige:r ○ Privatperson“.
- Felder Verein/Organisation: Vereinsname (Vertragspartner), Rechtsform (e. V. / nicht eingetragener Verein / sonstige), Anschrift, vertretende Person (Vorname, Nachname, Funktion), E-Mail (Vertrags- und Rechnungs-E-Mail), optional Telefon, optional USt-IdNr. Bestätigung (Checkbox, nicht vorangekreuzt): „Ich bin zur Vertretung des Vereins berechtigt.“
- Felder Unternehmen: Firma, Anschrift, Ansprechperson, E-Mail, optional USt-IdNr.
- Felder Privatperson: Vorname, Nachname, Anschrift, E-Mail.
- E-Mail-Adresse doppelt eingeben oder vor Vertragsschluss per Bestätigungslink prüfen (die E-Mail ist der dauerhafte Datenträger für alle Vertragsmitteilungen).
- Datenschutzhinweis als Satz unter dem Formular (keine Checkbox): „Wir verarbeiten Ihre Angaben zur Vertragsdurchführung. Einzelheiten: [Datenschutzerklärung](datenschutz.html).“ (Abschnitte 6 bis 9 der Datenschutzerklärung der Website) [BITTE ERGÄNZEN: zusätzlich Plattform-Datenschutzerklärung der Anwendung verlinken]

### Schritt 3 – Zahlungsart

- Akzeptierte Zahlungsmittel bereits in Schritt 1 als Zeile anzeigen (§ 312j Abs. 1 BGB), hier auswählen.
- Variante A – Zahlung über Stripe: Weiterleitung auf die gehostete Stripe-Bezahlseite (Stripe Checkout; so beschreibt es datenschutz.html Abschnitt 8, die CSP der Website bleibt unverändert); Hinweis „Ihre Zahlungsdaten geben Sie direkt bei Stripe ein.“ Wird stattdessen ein in die eigene Seite eingebettetes Stripe-Element verwendet, muss die CSP (derzeit `default-src 'self'`) geöffnet und die Datenschutzerklärung angepasst werden.
- Variante B – Zahlung über Mollie: analog (Weiterleitung auf die gehostete Mollie-Bezahlseite).
- Variante C – Zahlung auf Rechnung per Überweisung: Hinweis „Rechnung per E-Mail zum Monatsbeginn, zahlbar innerhalb von 14 Tagen nach Zugang der Rechnung.“ Für Verbraucher nur, wenn Bonitätsrisiko akzeptiert wird; SEPA-Lastschriftmandat optional.
- [BITTE ERGÄNZEN: Entscheidung Zahlungsart; dann nur die gewählte Variante in AGB § 4 Abs. 4 behalten]

### Schritt 4 – Übersicht und Bestellung (eine Seite, ohne Scrollen zwischen Pflichtinfos und Button)

Reihenfolge von oben nach unten:

1. **Zusammenfassung mit Bearbeiten-Links** je Block (Tarif, Angaben, Zahlungsart) – Korrekturmöglichkeit.
2. **Pflichtinformationen unmittelbar vor der Bestellung** (§ 312j Abs. 2 BGB), optisch hervorgehoben (Rahmen, nicht ausblendbar), Wortlaut:
   - „**Leistung:** VereinsFlow – Vereinsverwaltung als Web-Anwendung (Mitglieder, Termine, Helferschichten, Nachrichten, Dokumente, Finanzen/Kassenbuch), Zugriff über Browser und Android-App. Tarif bis [n] Mitglieder.“ (Nr. 1)
   - „**Preis:** [Betrag] € pro Monat inkl. USt. Keine weiteren Kosten. Erster Monat anteilig nach Tagen.“ (Nr. 5, 7, 8) – Kleinunternehmer: „… pro Monat, keine Umsatzsteuer (§ 19 UStG).“
   - „**Laufzeit und Kündigung:** Unbefristet, keine Mindestlaufzeit. Jederzeit zum Ende des laufenden Kalendermonats kündbar – per E-Mail, im Kundenkonto oder über ‚Verträge hier kündigen‘.“ (Nr. 14, 15)
   - „**Zahlung:** [gewählte Zahlungsart], monatlich im Voraus.“ (Nr. 10)
   - Nr. 11a (Haltbarkeitsgarantie) entfällt – keine Ware.
3. **Checkboxen** (alle nicht vorangekreuzt, alle einzeln, Texte wörtlich aus Abschnitt 4):
   - AGB-Einbeziehung (Pflicht für alle).
   - Widerrufsbelehrung zur Kenntnis (nur Verbraucher; empfohlen, keine gesetzliche Pflicht – alternativ reicht die hervorgehobene Anzeige mit Link; die Checkbox erleichtert den Nachweis).
   - Opt-in sofortiger Beginn (nur Verbraucher; **getrennt** von AGB-Checkbox; nicht Pflicht – wer nicht anhakt, bekommt den Zugang nach 14 Tagen, siehe Abschnitt 6).
4. **Schaltfläche**: Text ausschließlich „**zahlungspflichtig bestellen**“ – nichts davor, nichts dahinter, keine Icons im Text, mindestens so groß wie alle anderen Schaltflächen der Seite, farblich hervorgehoben. Nicht: „Jetzt abonnieren“, „Kostenpflichtig bestellen und loslegen“, „Weiter“. Deaktiviert, bis die Pflicht-Checkboxen gesetzt sind; Fehlermeldung textlich, nicht nur farblich.
5. Unter der Schaltfläche in normaler Schriftgröße: Links zu AGB, Widerrufsbelehrung, Datenschutzerklärung, Impressum.

### Schritt 5 – Nach dem Klick

- Serverseitig speichern (Beweissicherung, Abschnitt 11): Zeitstempel, Kundentyp, alle Angaben, Checkbox-Zustände mit Wortlaut, Version und Prüfsumme der AGB, des AV-Vertrags und der Widerrufsbelehrung, Preis und Staffel, IP-Adresse (pseudonymisiert nach 7 Tagen), User-Agent.
- Danke-Seite mit Bestellnummer, Zusammenfassung, Hinweis „Sie erhalten in Kürze die Auftragsbestätigung per E-Mail“; bei Variante A/B Hinweis auf Zahlungsstatus.
- Zugang: Verbraucher mit Opt-in, Vereine und Unternehmen sofort; Verbraucher ohne Opt-in nach Ablauf der Widerrufsfrist (automatisch am 15. Tag nach Vertragsschluss, E-Mail „Ihr Zugang ist freigeschaltet“).

## 4. Checkbox-Texte (wörtlich)

**AGB (alle Kunden, Pflicht):**
„Ich habe die [Allgemeinen Geschäftsbedingungen](agb.html) einschließlich des Vertrags zur Auftragsverarbeitung (Anlage 1) gelesen und bin mit ihrer Geltung einverstanden.“

**Widerrufsbelehrung (nur Verbraucher, empfohlen):**
„Ich habe die [Widerrufsbelehrung](widerruf.html) zur Kenntnis genommen.“

**Opt-in sofortiger Beginn (nur Verbraucher, getrennt, nicht vorangekreuzt):**
„Ich verlange ausdrücklich, dass VereinsFlow bereits vor Ablauf der Widerrufsfrist bereitgestellt wird. Mir ist bekannt, dass ich bei einem Widerruf einen angemessenen Betrag für die bis zum Widerruf erbrachte Leistung zahlen muss und dass mein Widerrufsrecht erlischt, wenn die Leistung vollständig erbracht ist.“

Begründung: VereinsFlow ist eine digitale Dienstleistung, keine „digitalen Inhalte“. Für Dienstleistungen gelten § 356 Abs. 5 Nr. 2 (Erlöschen erst mit vollständiger Erbringung) und § 357a Abs. 2 BGB (Wertersatz bei vorzeitigem Beginn). Die für digitale Inhalte übliche Formel „… und weiß, dass mein Widerrufsrecht mit Beginn der Ausführung erlischt“ (§ 356 Abs. 6 BGB) wäre hier **falsch** und würde den Verbraucher über sein Widerrufsrecht täuschen. Falls die anwaltliche Prüfung VereinsFlow abweichend als digitalen Inhalt einordnet, lautet der Text stattdessen: „Ich stimme ausdrücklich zu, dass mit der Ausführung des Vertrags vor Ablauf der Widerrufsfrist begonnen wird, und bestätige meine Kenntnis davon, dass ich durch diese Zustimmung mit Beginn der Ausführung mein Widerrufsrecht verliere.“ – dann auch die Belehrung anpassen (Gestaltungshinweis 6 entfällt, Erlöschenshinweis nach § 356 Abs. 6 BGB).

**Vertretungsberechtigung (nur Verein/Unternehmen):**
„Ich bin zur Vertretung des Vereins / des Unternehmens berechtigt.“

Technisch: Jede Checkbox hat ein eigenes `<label>`, Status wird mit Wortlaut-Version protokolliert. Keine zusammengefasste „Ich akzeptiere alles“-Box.

## 5. Vorvertragliche Informationen (Art. 246a § 1 EGBGB) – wo sie stehen

| Nr. | Information | Ort |
|---|---|---|
| 1 | wesentliche Eigenschaften | Produktseite, Leistungsbeschreibung (AGB § 2), Schritt 4 |
| 2–4 | Identität, Anschrift, Beschwerdeanschrift | Impressum, AGB „Anbieter“, Fußzeile |
| 3 | Telefon, E-Mail | Impressum, AGB, Fußzeile |
| 5, 7, 8 | Gesamtpreis inkl. Steuern, keine Zusatzkosten, monatliche Gesamtkosten | Schritt 1 und 4, Preisseite, AGB § 4 |
| 10 | Zahlungs- und Leistungsbedingungen, Beschwerdeverfahren | Schritt 3 und 4, AGB § 4, § 15 Abs. 1 |
| 11b | Hinweis auf gesetzliches Gewährleistungsrecht für digitale Dienstleistungen | AGB § 10 Abs. 1 (Satz „Es gilt das gesetzliche Gewährleistungsrecht …“) – zusätzlich als Satz auf der Preisseite empfehlenswert |
| 11c | Mindestdauer der Softwareaktualisierungen | AGB § 2 Abs. 6: für die gesamte Vertragslaufzeit |
| 12 | Kundendienst | AGB § 2 Abs. 7 |
| 14, 15 | Laufzeit, Kündigungsbedingungen, Mindestdauer (keine) | Schritt 4, AGB § 5 |
| 17, 18 | Funktionalität, Kompatibilität/Interoperabilität | AGB § 2 Abs. 8 (Systemvoraussetzungen); nötig auch für § 327k Abs. 4 BGB |
| 19 | außergerichtliche Streitbeilegung | AGB § 15 Abs. 2 |
| Abs. 2 | Widerrufsbedingungen, Muster-Widerrufsformular, Widerrufsfunktion, Wertersatz | widerruf.html, Schritt 4 (Link), Bestätigungs-E-Mail |
| Abs. 3 Nr. 2 | Umstände des vorzeitigen Erlöschens | widerruf.html Abschnitt 3 |

Entfallen: Nr. 6 (keine personalisierten Preise – falls doch, Hinweis nötig), 9, 11, 11a, 13, 16, 20, 21.

## 6. Verbraucher ohne Opt-in

- Zugang wird am 15. Tag nach Vertragsschluss automatisch freigeschaltet; bis dahin zeigt das Kundenkonto: „Ihr Zugang wird am [Datum] freigeschaltet. Sie können den Vertrag bis dahin jederzeit widerrufen. Möchten Sie sofort starten? [Sofort starten – ich verlange die Bereitstellung vor Ablauf der Widerrufsfrist]“ – ein Klick dort entspricht dem Opt-in (gleicher Wortlaut wie Abschnitt 4, Protokollierung, Bestätigung per E-Mail als Nachtrag zur Vertragsbestätigung).
- Zahlung: Erst mit der Freischaltung beginnt die anteilige Berechnung (AGB § 4 Abs. 3 und § 14 Abs. 3 regeln das ausdrücklich); bei Variante A/B den Einzug entsprechend erst am Tag der Freischaltung auslösen.

## 7. Bestätigungs-E-Mail (§ 312i Abs. 1 Nr. 3, § 312f Abs. 2 BGB)

Versand sofort nach Bestellung (automatisch), spätestens vor Freischaltung des Zugangs. Absender kontakt@vereins-flow.com, Betreff „Ihre Bestellung bei VereinsFlow – Auftragsbestätigung [Bestellnummer]“. Inhalt:

1. Anrede, Satz „Vielen Dank für Ihre Bestellung. Hiermit bestätigen wir den Vertrag über die Nutzung von VereinsFlow.“ (= Annahme, AGB § 3 Abs. 4).
2. Vertragsdaten: Bestellnummer, Vertragspartner (Vereinsname/Firma/Name), Anschrift, Tarif und Mitgliederzahl, Preis pro Monat (brutto; netto/USt), Zahlungsart, Vertragsbeginn, Abrechnungszeitraum, Kündigungsregel im Wortlaut von Schritt 4.
3. Für Verbraucher: Protokoll des Opt-ins im Wortlaut mit Datum/Uhrzeit (entsprechend § 312f Abs. 3 BGB) – oder der Hinweis, dass der Zugang am [Datum] freigeschaltet wird.
4. Hinweis auf Kundenkonto (Link), auf „Verträge hier kündigen“ und für Verbraucher auf „Vertrag widerrufen“ (Link, 14 Tage).
5. Anhänge als PDF: AGB in der Vertragsfassung inkl. Anlage 1 (AV-Vertrag) und Anlage 2 (Leistungsbeschreibung, Preisstaffel); Widerrufsbelehrung mit Muster-Widerrufsformular (nur Verbraucher; schadet aber nicht, allen beizufügen); Rechnung (oder gesonderte E-Mail).
6. Fußzeile mit vollständiger Anbieterkennzeichnung (§ 5 DDG) und den Pflichtangaben für Geschäftsbriefe nach § 35a GmbHG: „H&B Software Solution UG (haftungsbeschränkt) i. G., Oberschlesienstraße 6a, 45711 Datteln, Sitz Datteln, vertreten durch den Geschäftsführer Luis Heidecker. Die Gesellschaft befindet sich in Gründung; die Eintragung in das Handelsregister des Amtsgerichts Recklinghausen wird beantragt.“ Nach der Eintragung: „i. G.“ und den Satz zur Gründung streichen, stattdessen „Registergericht Amtsgericht Recklinghausen, HRB [nach Eintragung ergänzen]“.

PDFs werden serverseitig aus derselben Textquelle wie die HTML-Seiten erzeugt (eine Quelle, kein Abweichen). Jede Version erhält Datum und Versionsnummer; die Prüfsumme wird mit der Bestellung gespeichert.

## 8. Kündigungsschaltfläche und Bestätigungsseite (§ 312k BGB)

**Platzierung:** Link „Verträge hier kündigen“ in der Fußzeile jeder Seite der Website (ist in agb.html und widerruf.html bereits vorgesehen; in index.html, impressum.html, datenschutz.html, barrierefreiheit.html, 404.html und newsletter.php nachziehen, Fassung in footer-vorschlag.html) und im Kundenkonto. Ständig verfügbar, ohne Login erreichbar (§ 312k Abs. 2 Satz 4: „unmittelbar und leicht zugänglich“ – eine Login-Pflicht ist umstritten; deshalb Identifikation über Felder, nicht über Anmeldung).

**Beschriftung:** exakt „Verträge hier kündigen“. Keine Zusätze.

**Bestätigungsseite `kuendigen.html`** (noch zu bauen; Zielseite der Schaltfläche, ein Klick entfernt), Felder nach § 312k Abs. 2 Satz 3 Nr. 1:

- a) Art der Kündigung: ○ ordentliche Kündigung zum Monatsende ○ außerordentliche Kündigung – Textfeld „Kündigungsgrund“ (nur bei außerordentlich Pflicht).
- b) Identifizierung: Name des Kunden/Vereins, E-Mail-Adresse des Vertrags, optional Kundennummer.
- c) Bezeichnung des Vertrags: Auswahl „VereinsFlow-Abonnement“ (Vorbelegung zulässig, da nur ein Produkt) plus optional Vereinsname.
- d) Zeitpunkt: ○ „zum nächstmöglichen Zeitpunkt (Ende des laufenden Kalendermonats)“ ○ Datum (Monatsende, Datumsfeld). Ohne Angabe gilt der frühestmögliche Zeitpunkt (§ 312k Abs. 5).
- e) E-Mail-Adresse für die Kündigungsbestätigung (vorbelegt aus b).
- **Bestätigungsschaltfläche**: exakt „**jetzt kündigen**“. Keine Zwischenseiten, keine „Sind Sie sicher?“-Rückfragen, keine Rückhalteangebote vor dem Absenden.

**Nach dem Klick (§ 312k Abs. 3 und 4):**

- Seite zeigt die abgegebene Erklärung mit Datum und Uhrzeit, dem Hinweis „abgegeben über die Kündigungsschaltfläche auf vereins-flow.com“ und einer Schaltfläche „Kündigungserklärung speichern (PDF)“ sowie druckbar.
- Sofortige E-Mail an die Adresse aus e): Inhalt der Erklärung, Datum und Uhrzeit des Zugangs, Zeitpunkt der Vertragsbeendigung (z. B. „Ihr Vertrag endet am 30.11.2026, 24 Uhr“), Hinweis auf Datenexport bis [Frist aus AGB § 9 Abs. 3] und Löschung danach.
- Zugangsvermutung: Die Erklärung gilt als unmittelbar nach Abgabe zugegangen (§ 312k Abs. 4 Satz 2) – Zeitstempel serverseitig setzen.
- Plausibilitätsprüfung (unbekannte E-Mail) darf die Abgabe nicht verhindern: Erklärung speichern, Bestätigung senden, Kunde ggf. um Klärung bitten.

**Sanktion bei Verstoß** (§ 312k Abs. 6): Verbraucher können jederzeit fristlos kündigen – daher Funktion vor Live-Gang testen (Mobil, ohne JavaScript, Screenreader).

Die Kündigung per E-Mail an kontakt@vereins-flow.com und im Kundenkonto bleibt daneben möglich (AGB § 5 Abs. 2); auch dort Bestätigung mit Inhalt, Zugangszeitpunkt und Beendigungsdatum.

## 9. Online-Widerrufsfunktion (§ 356a BGB)

- Schaltfläche „**Vertrag widerrufen**“ (oder gleichbedeutend eindeutig) – während der 14-tägigen Frist ständig verfügbar, hervorgehoben platziert, leicht zugänglich: im Kundenkonto auf der Startseite und auf der Seite `widerrufen.html` (noch zu bauen) [BITTE ERGÄNZEN: Internetadresse festlegen, Vorschlag vereins-flow.com/widerrufen.html; dieselbe Adresse steht zweimal in widerruf.html]. Nach Ablauf der Frist darf die Schaltfläche verschwinden; die formlose Widerrufsmöglichkeit per E-Mail bleibt bestehen.
- Felder (§ 356a Abs. 2): Name des Verbrauchers; Angaben zur Identifizierung des Vertrags (Bestellnummer oder E-Mail des Vertrags, Vorbelegung im eingeloggten Zustand); E-Mail-Adresse für die Eingangsbestätigung.
- Bestätigungsfunktion: Schaltfläche „**Widerruf bestätigen**“.
- Eingangsbestätigung unverzüglich per E-Mail (dauerhafter Datenträger): Inhalt der Widerrufserklärung, Datum und Uhrzeit des Eingangs (§ 356a Abs. 4). Zusätzlich Abwicklung: Rückzahlung binnen 14 Tagen über dasselbe Zahlungsmittel (§ 357 Abs. 1, 3 BGB), Berechnung des Wertersatzes nach Tagen (nur bei Opt-in), Sperrung des Zugangs, Datenexport-Frist.
- Rechtzeitigkeit: Absenden vor Fristablauf genügt (§ 356a Abs. 5) – serverseitiger Zeitstempel, Zeitzone Europe/Berlin.
- Nur für Verbraucher anzeigen; Vereine/Unternehmen sehen stattdessen „Verträge hier kündigen“.

## 10. Preisangaben auf der Website (PAngV)

- Jede Preisnennung (Startseite, Preisseite, Checkout) als Gesamtpreis in Euro pro Monat mit dem Zusatz „inkl. USt.“ (bzw. Kleinunternehmer-Hinweis) und „keine weiteren Kosten“ (§ 6 Abs. 1 PAngV).
- Staffeltabelle: Spalte Mitgliederzahl, Spalte Preis/Monat brutto; netto nur als Nebenangabe.
- Keine „ab“-Preise ohne sofort sichtbare Staffel. Keine Durchstreichpreise ohne 30-Tage-Tiefstpreis (§ 11 PAngV – falls jemals Rabatte).
- Preisänderungen: Ankündigung sechs Wochen vorher (AGB § 4 Abs. 7); Website-Preise am Stichtag umstellen, Bestandskunden per E-Mail mit Widerspruchshinweis.

## 11. Rechnungsstellung

- Rechnung automatisch zu Beginn jedes Abrechnungsmonats (Variante A/B nach erfolgreichem Einzug; Variante C mit Zahlungsziel 14 Tage), per E-Mail als PDF und im Kundenkonto. Zustimmung zum elektronischen Versand steht in AGB § 4 Abs. 5 (§ 14 Abs. 1 Satz 5 UStG).
- Anbieterangaben auf der Rechnung in der Gründungsphase (Stand 17.10.2026): Firma „H&B Software Solution UG (haftungsbeschränkt) i. G.“, Oberschlesienstraße 6a, 45711 Datteln, Geschäftsführer Luis Heidecker. Rechnungen sind Geschäftsbriefe im Sinne von § 35a GmbHG; Pflichtangaben: Rechtsform, Sitz der Gesellschaft (Datteln), Registergericht und Registernummer – sobald eingetragen (Amtsgericht Recklinghausen; HRB-Nummer nach Eintragung ergänzen) –, alle Geschäftsführer mit Familiennamen und mindestens einem ausgeschriebenen Vornamen (derzeit nur Luis Heidecker). Bis zur Eintragung zusätzlich der Satz „Die Gesellschaft befindet sich in Gründung; die Eintragung in das Handelsregister des Amtsgerichts Recklinghausen wird beantragt.“ Nach der Eintragung „i. G.“ streichen. Die Rechnungsvorlage wortgleich mit impressum.html (Fassung B) und agb.html („Anbieter“) halten.
- Pflichtangaben (§ 14 Abs. 4 UStG): vollständiger Name und Anschrift von Anbieter und Kunde; Steuernummer oder USt-IdNr. des Anbieters (in der Gründungsphase noch nicht vorhanden – Steuernummer bzw. USt-IdNr. nach Erteilung ergänzen; ohne eine der beiden Angaben ist keine ordnungsgemäße Rechnung möglich, also vor der ersten Rechnung klären); Ausstellungsdatum; fortlaufende Rechnungsnummer; Art und Umfang der Leistung („Nutzung VereinsFlow, Tarif bis [n] Mitglieder, Leistungszeitraum [Monat]“); Leistungszeitraum; Entgelt netto, Steuersatz und Steuerbetrag (bzw. Hinweis „Steuerbefreiung für Kleinunternehmer (§ 19 UStG)“); bei Vereinen als juristische Personen, die nicht Unternehmer sind, besteht Rechnungspflicht innerhalb von sechs Monaten (§ 14 Abs. 2 Satz 2 Nr. 2 UStG).
- E-Rechnung: Für Leistungen an inländische Unternehmer ist die Rechnung grundsätzlich als strukturierte E-Rechnung (EN 16931, z. B. XRechnung oder ZUGFeRD) auszustellen (§ 14 Abs. 2 Satz 2 Nr. 1 UStG). Übergang: bis 31.12.2026 PDF/Papier mit Zustimmung des Empfängers zulässig, bis 31.12.2027, wenn der Gesamtumsatz des Anbieters im Vorjahr höchstens 800.000 € betrug (§ 27 Abs. 38 UStG). Empfehlung: von Beginn an ZUGFeRD-PDF (hybrid) erzeugen – erfüllt beides. Mit Steuerberatung abstimmen [BITTE ERGÄNZEN: Entscheidung Rechnungsformat].
- Gutschriften bei Widerruf/Minderung als Stornorechnung mit Bezug auf die Ursprungsrechnung.

## 12. Aufbewahrung und Protokollierung

| Was | Wie lange | Grundlage |
|---|---|---|
| Rechnungen, Buchungsbelege, Zahlungsnachweise | 8 Jahre ab Schluss des Kalenderjahrs | § 147 Abs. 1 Nr. 4, Abs. 3 AO (Buchungsbelege acht Jahre); § 14b UStG |
| Handels-/Geschäftsbriefe (Auftragsbestätigungen, Kündigungen, Widerrufe) | 6 Jahre | § 147 Abs. 1 Nr. 2 und 3, Abs. 3 AO; § 257 HGB |
| Bestell-Protokoll (Checkbox-Zustände, AGB-/Belehrungs-Version mit Prüfsumme, Zeitstempel, Opt-in-Wortlaut) | Vertragslaufzeit + 3 Jahre (regelmäßige Verjährung § 195 BGB, ab Jahresende § 199 BGB) | Nachweis der Einbeziehung, der Belehrung und des Opt-ins (Beweislast beim Unternehmer) |
| IP-Adresse der Bestellung | 7 Tage im Klartext, danach Hash | Art. 6 Abs. 1 lit. f DSGVO, Missbrauchsschutz |
| Kündigungs- und Widerrufserklärungen mit Eingangszeit | wie Geschäftsbriefe, mindestens bis Ablauf der Verjährung | § 312k Abs. 4, § 356a Abs. 4 BGB |
| Mitgliederdaten des Kunden (Auftragsdaten) | bis Vertragsende + Exportfrist, dann Löschung nach AGB § 9 Abs. 3 / AV-Vertrag | Art. 28 Abs. 3 lit. g DSGVO |

Alle Rechtstexte versioniert ablegen (Datum, Versionsnummer, Prüfsumme); jede Bestellung referenziert die Version. Alte Versionen bleiben im Kundenkonto für den jeweiligen Vertrag abrufbar (AGB § 3 Abs. 5).

## 13. Kundenkonto – Mindestfunktionen

- Vertragsübersicht: Tarif, gezählte Mitgliederzahl und Staffel, Preis, nächster Abrechnungstermin, Vertragsbeginn, Kündigungsstatus.
- Dokumente: Auftragsbestätigung, AGB/AV-Vertrag/Leistungsbeschreibung in der Vertragsfassung, Widerrufsbelehrung, alle Rechnungen.
- Stammdaten ändern (Anschrift, Rechnungs-E-Mail, vertretende Person).
- Zahlungsart ändern (Variante A/B: Link zum Zahlungsdienstleister-Portal).
- Datenexport (Formate [BITTE ERGÄNZEN]) jederzeit; nach Vertragsende Nur-Lese-Zugang oder Exportlink für [Frist aus AGB § 9 Abs. 3].
- „Verträge hier kündigen“ (Abschnitt 8) und – während der Frist, nur Verbraucher – „Vertrag widerrufen“ (Abschnitt 9).
- Hinweisbereich für Änderungsmitteilungen (AGB § 11, § 12, § 4 Abs. 7) mit Datum, zusätzlich zur E-Mail.

## 14. Exakte Zeichenketten (für Entwicklung und Tests)

| Element | Text |
|---|---|
| Bestellschaltfläche | `zahlungspflichtig bestellen` |
| Kündigungsschaltfläche (Website/Konto) | `Verträge hier kündigen` |
| Bestätigungsschaltfläche Kündigung | `jetzt kündigen` |
| Widerrufsfunktion | `Vertrag widerrufen` |
| Bestätigungsfunktion Widerruf | `Widerruf bestätigen` |
| Betreff Auftragsbestätigung | `Ihre Bestellung bei VereinsFlow – Auftragsbestätigung [Nr.]` |
| Betreff Kündigungsbestätigung | `Bestätigung Ihrer Kündigung – VereinsFlow` |
| Betreff Widerrufs-Eingangsbestätigung | `Eingangsbestätigung Ihres Widerrufs – VereinsFlow` |
| Hinweis VSBG (Website und AGB) | `Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen (§ 36 VSBG).` |

## 15. Checkliste vor Live-Gang

- [ ] Anwaltliche Prüfung aller Texte (AGB, Widerrufsbelehrung, AV-Vertrag, Datenschutzerklärung der Anwendung, Checkout-Texte).
- [ ] Alle `[BITTE ERGÄNZEN]`-Stellen aus `platzhalter-gesamt.md` gefüllt; `.draft-notice` und `.fill` aus den HTML-Seiten entfernt.
- [ ] Impressum, Datenschutzerklärung, Fußzeile aller Seiten auf H&B Software Solution UG (haftungsbeschränkt) i. G., vertreten durch den Geschäftsführer Luis Heidecker, umgestellt (frühestens ab notarieller Beurkundung, mit dem Satz zur Gründung); nach Eintragung „i. G.“ und den Satz zur Gründung entfernen, HRB-Nummer beim Registergericht Amtsgericht Recklinghausen eintragen; USt-IdNr. nach Erteilung eintragen (Impressum, AGB, Rechnungen).
- [ ] Button-Texte exakt wie Abschnitt 14, auch auf Mobilgeräten vollständig lesbar (kein Abschneiden, kein Umbruch in ein anderes Wort).
- [ ] Widerrufsbelehrung und Opt-in erscheinen nur bei „Privatperson“; Vereine/Unternehmen sehen beides nicht; kein Kundentyp vorbelegt.
- [ ] Bestätigungs-E-Mail enthält AGB + AV-Vertrag + Widerrufsbelehrung + Formular als PDF und das Opt-in-Protokoll.
- [ ] Kündigungsschaltfläche ohne Login erreichbar, Bestätigungsseite vollständig, Bestätigungs-E-Mail mit Datum/Uhrzeit/Beendigungszeitpunkt; speicherbare Kündigungserklärung.
- [ ] Widerrufsfunktion 14 Tage sichtbar, Eingangsbestätigung mit Datum/Uhrzeit.
- [ ] Preise überall brutto mit „inkl. USt.“ und „keine weiteren Kosten“ (oder Kleinunternehmer-Hinweis), Staffel vollständig.
- [ ] Kein Link zur EU-OS-Plattform irgendwo auf der Website.
- [ ] CSP (`_headers`, `.htaccess`) für Zahlungsdienstleister angepasst, falls Variante A/B; Datenschutzerklärung entsprechend.
- [ ] Versionierung und Protokollierung (Abschnitt 12) im Backend aktiv; Testbestellung als Verbraucher und als Verein durchgespielt, inklusive Widerruf und Kündigung.
