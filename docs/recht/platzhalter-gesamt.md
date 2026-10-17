ENTWURF – keine Rechtsberatung, vor Live-Gang anwaltlich prüfen

# Platzhalter und offene Entscheidungen (gesamt)

Stand 17. Oktober 2026, zusammengeführt aus `platzhalter.md` und `platzhalter-datenschutz.md` (die beiden alten Listen liegen unter `pruefung/alt/`). Doppelungen sind zusammengefasst: Steht dieselbe Angabe in mehreren Dateien, erscheint sie einmal, die Spalte „Datei“ nennt alle Stellen. Sortiert nach Datei in der Reihenfolge der Dateien (AGB, Widerruf, Formular, Impressum, Datenschutz, Barrierefreiheit, Fußzeile, Checkout, übergreifend).

In den HTML-Dateien stehen die Platzhalter als `<span class="fill">[BITTE ERGÄNZEN: …]</span>` (gelb). Vor dem Live-Gang: Wert eintragen, `<span>` entfernen, Entwurfskasten `.draft-notice` löschen. Suchen mit `grep -n 'class="fill"' *.html`. Die Platzhalter in den auskommentierten Fassungen B (UG) des Impressums und der Datenschutzerklärung zählen mit.

**Wer klärt:** Betreiber (Geschäftsführung), Steuerberatung, Anwalt, ergänzend Entwicklung (technische Angabe). „/“ heißt: gemeinsam.

**Gesamtzahl: 69 offene Punkte** (74 Nummern; Nr. 2, 3, 4, 5 und 39 sind erledigt und bleiben mit ihrer Nummer stehen, Nr. 73 und 74 sind neu).

**Neue Angaben des Betreibers vom 17.10.2026:** Die H&B Software Solution UG (haftungsbeschränkt) befindet sich in Gründung; die Eintragung in das Handelsregister des Amtsgerichts Recklinghausen wird beantragt. Einziger Geschäftsführer (vertretungsberechtigt) ist Luis Heidecker; Gesellschafter sind Luis Heidecker und Ben Bleckert. Bis zur Eintragung: Firma mit „i. G.“, keine HRB-Nummer; eine USt-IdNr. liegt noch nicht vor. Einheitlicher Wortlaut in allen Texten: „H&B Software Solution UG (haftungsbeschränkt) i. G.“, „vertreten durch den Geschäftsführer Luis Heidecker“, „Die Gesellschaft befindet sich in Gründung; die Eintragung in das Handelsregister des Amtsgerichts Recklinghausen wird beantragt.“

| Nr. | Datei | Stelle | Was fehlt | Wer klärt |
|---|---|---|---|---|
| 1 | `agb.html` | Einleitungssatz | Datum des Inkrafttretens der AGB | Betreiber |
| 2 | `agb.html` „Anbieter“; `impressum.html` Fassung B; `datenschutz.html` Abschn. 1 Fassung B | Geschäftsführung | **erledigt 17.10.2026:** „vertreten durch den Geschäftsführer Luis Heidecker“ (einziger Geschäftsführer; Ben Bleckert ist Gesellschafter/Mitgründer, nicht Geschäftsführer, und wird deshalb nur in der GbR-Fassung A des Impressums und der Datenschutzerklärung genannt) | Betreiber |
| 3 | `agb.html` „Anbieter“; `impressum.html` Fassung B | Registergericht | **erledigt 17.10.2026:** Amtsgericht Recklinghausen; bis zur Eintragung steht der Satz „Die Gesellschaft befindet sich in Gründung; die Eintragung in das Handelsregister des Amtsgerichts Recklinghausen wird beantragt.“ (auch in `datenschutz.html` Fassung B und `checkout-vorgabe.md`) | Betreiber |
| 4 | `agb.html` „Anbieter“; `impressum.html` Fassung B | Registernummer | **erledigt 17.10.2026:** entfällt bis zur Eintragung; sichtbarer Platzhalter entfernt, Hinweis „nach Eintragung ergänzen“ als Kommentar bzw. Arbeitsnotiz behalten → weiter als Nr. 73 | Betreiber |
| 5 | `agb.html` „Anbieter“; `impressum.html` Fassung B; `checkout-vorgabe.md` Abschn. 11 | USt-IdNr. | **erledigt 17.10.2026:** in der Gründungsphase liegt keine USt-IdNr. vor; sichtbare Platzhalter entfernt, Kommentar „USt-IdNr. nach Erteilung ergänzen (§ 5 Abs. 1 Nr. 6 DDG)“ behalten (Impressum und AGB: keine Steuernummer; auf Rechnungen genügt Steuernummer oder USt-IdNr., Abschn. 11) → weiter als Nr. 74 | Betreiber / Steuerberatung |
| 6 | `agb.html` § 2 Abs. 2 | Leistungsbeschreibung | Adresse der Leistungsbeschreibung/Funktionsübersicht auf der Website (wird Anlage 2) | Betreiber |
| 7 | `agb.html` § 2 Abs. 4 | Verfügbarkeit | Wert im Monatsmittel (Vorschlag 99,0 %) | Betreiber |
| 8 | `agb.html` § 2 Abs. 5 | Wartung | Zeitfenster für planbare Wartung | Betreiber |
| 9 | `agb.html` § 2 Abs. 5 | Wartung | Vorlauf der Wartungsankündigung (Vorschlag 48 Stunden) | Betreiber |
| 10 | `agb.html` § 2 Abs. 5 | Wartung | Höchstdauer je Kalendermonat (Vorschlag 8 Stunden) | Betreiber |
| 11 | `agb.html` § 2 Abs. 7 | Support | Supportzeiten und übliche Reaktionszeit | Betreiber |
| 12 | `agb.html` § 2 Abs. 8 | Systemvoraussetzungen | unterstützte Browser | Entwicklung |
| 13 | `agb.html` § 2 Abs. 8 | Systemvoraussetzungen | Android-Mindestversion | Entwicklung |
| 14 | `agb.html` § 2 Abs. 8 | Android-App | Bezugsweg (Google Play oder Direktdownload) | Betreiber |
| 15 | `agb.html` § 4 Abs. 1; `checkout-vorgabe.md` Abschn. 0, Schritt 1 | Preisstaffel | Staffelgrenzen und Beträge je Staffel (Anlage 2; im Checkout als Staffeltabelle) | Betreiber |
| 16 | `agb.html` § 4 Abs. 1 (Kommentar); `checkout-vorgabe.md` Schritt 1 | Umsatzsteuer | Entscheidung Regelbesteuerung oder Kleinunternehmer (§ 19 UStG); bei Kleinunternehmer den Ersatzsatz aus dem Kommentar einsetzen | Steuerberatung |
| 17 | `agb.html` § 4 Abs. 2 | Zählregel | Welche Datensätze zählen (nur aktive Mitglieder? Helfer ohne Mitgliedschaft?) | Betreiber |
| 18 | `agb.html` § 4 Abs. 4; `datenschutz.html` Abschn. 8; `checkout-vorgabe.md` Abschn. 0, Schritt 3 | Zahlungsart (Entscheidung) | Variante A: Zahlung über Stripe, B: Zahlung über Mollie oder C: Zahlung auf Rechnung per Überweisung wählen; nicht gewählte Varianten in AGB und Datenschutzerklärung streichen | Betreiber |
| 19 | `agb.html` § 4 Abs. 4 Variante A | Zahlungsmethoden Stripe | Kreditkarte und/oder SEPA-Lastschrift | Betreiber |
| 20 | `agb.html` § 4 Abs. 4 Variante B | Zahlungsmethoden Mollie | Zahlungsmethoden (z. B. SEPA-Lastschrift, Kreditkarte, PayPal) | Betreiber |
| 21 | `agb.html` § 4 Abs. 4 Variante C | SEPA-Lastschrift | ob zusätzlich ein SEPA-Lastschriftmandat angeboten wird | Betreiber |
| 22 | `agb.html` § 6 Abs. 2 | Nutzerzugänge | ob die Zahl der Nutzerzugänge begrenzt ist | Betreiber |
| 23 | `agb.html` § 7 Abs. 3 | Besondere Datenkategorien | ob die Anwendung Felder für Art.-9-Daten vorsieht | Betreiber / Entwicklung |
| 24 | `agb.html` § 8 Abs. 1 und § 16 Abs. 5 (Anlage 1) | AV-Vertrag | Vertrag zur Auftragsverarbeitung (Art. 28 Abs. 3 DSGVO) als Anlage 1 erstellen; als PDF-Anhang der Bestätigungs-E-Mail | Anwalt |
| 25 | `agb.html` § 8 Abs. 2; `datenschutz.html` Abschn. 10; `checkout-vorgabe.md` Schritt 2 | Plattform-Datenschutzerklärung | Datenschutzerklärung der Anwendung erstellen und verlinken (`datenschutz.html` deckt Website samt Kundenkonto/Abo/Zahlung ab, nicht die Anwendung) | Anwalt / Betreiber |
| 26 | `agb.html` § 8 Abs. 3; `datenschutz.html` Abschn. 10 | Hoster und Standort der Anwendung | Hoster und Standort der Rechenzentren; bei Einrichtung des IONOS-Servers Standort und AV-Vertrag bestätigen | Betreiber |
| 27 | `agb.html` § 9 Abs. 1 | Datensicherung | Sicherungsintervall (z. B. täglich) | Betreiber / Entwicklung |
| 28 | `agb.html` § 9 Abs. 1 | Datensicherung | Aufbewahrungsdauer der Sicherungen (z. B. 30 Tage) | Betreiber / Entwicklung |
| 29 | `agb.html` § 9 Abs. 1 | Datensicherung | ob und wie einzelne, vom Kunden gelöschte Daten wiederhergestellt werden | Betreiber / Entwicklung |
| 30 | `agb.html` § 9 Abs. 2; `checkout-vorgabe.md` Abschn. 13 | Datenexport | Exportformate (z. B. CSV, PDF) | Entwicklung |
| 31 | `agb.html` § 9 Abs. 3 | Datenexport nach Vertragsende | Exportfrist (Vorschlag 30 Tage) | Betreiber |
| 32 | `agb.html` § 9 Abs. 3 | Datenexport nach Vertragsende | Mechanismus (Nur-Lese-Zugang oder Exportlink) | Entwicklung |
| 33 | `agb.html` § 9 Abs. 3 | Löschung nach Vertragsende | Löschfrist inklusive Sicherungen (Vorschlag 90 Tage) | Betreiber / Anwalt |
| 34 | `agb.html` § 11 Abs. 2 | Änderungen der Anwendung | Vorlauf der Information über beeinträchtigende Änderungen (Vorschlag 30 Tage) | Betreiber |
| 35 | `agb.html` § 15 Abs. 1 | Beschwerden | übliche Antwortzeit (z. B. fünf Werktage) | Betreiber |
| 36 | `agb.html` § 16 Abs. 5 (Anlage 2) | Leistungsbeschreibung und Preisstaffel | Text der Anlage 2 erstellen; als PDF-Anhang der Bestätigungs-E-Mail | Betreiber |
| 37 | `widerruf.html` Abschn. 2 und 4; `checkout-vorgabe.md` Abschn. 9 | Online-Widerrufsfunktion | Internetadresse (zweimal, muss gleich lauten; Vorschlag vereins-flow.com/widerrufen.html); Seite `widerrufen.html` ist noch zu bauen | Betreiber / Entwicklung |
| 38 | `widerrufsformular.txt` Zeilen 1–2 | Entwurfshinweise | Entwurfs- und Quellenhinweis vor Veröffentlichung entfernen; sonst keine Platzhalter | Betreiber |
| 39 | `impressum.html` Fassung A (aktiv) | Umsatzsteuer | **erledigt 17.10.2026:** keine USt-IdNr. vorhanden (Gründungsphase); sichtbarer Abschnitt in Fassung A entfernt und als Kommentar behalten → weiter als Nr. 74 | Betreiber / Steuerberatung |
| 40 | `impressum.html` (Kommentar § 18 Abs. 2 MStV) | Verantwortlicher für redaktionelle Inhalte | nur falls später Blog oder Magazin hinzukommt: Name des Verantwortlichen (bedingt) | Betreiber |
| 41 | `datenschutz.html` Einleitung | Stand | Datum des Stands (Live-Gang) | Betreiber |
| 42 | `datenschutz.html` Abschn. 1 (Kommentar, Option) | Datenschutzbeauftragter | nur bei freiwilliger Benennung: Name/Funktion, Anschrift, E-Mail (bedingt) | Betreiber |
| 43 | `datenschutz.html` Abschn. 3 | Server-Logdateien | Speicherfrist laut IONOS-AV-Vertrag/TOM des Tarifs (bisherige Angabe „höchstens acht Wochen“ nicht belegt) | Betreiber |
| 44 | `datenschutz.html` Abschn. 6 | Sitzungs-Cookie | Name und Laufzeit des Cookies von Kundenkonto/Checkout | Entwicklung |
| 45 | `datenschutz.html` Abschn. 6 | Empfänger | wo Kundenkonto und Checkout laufen (IONOS-Webspace und/oder eigener IONOS-Server), jeweils mit AV-Vertrag | Betreiber / Entwicklung |
| 46 | `datenschutz.html` Abschn. 6, 7 und 8 Variante C | Steuerberatung als Empfänger | Name und Ort der Kanzlei, falls Kunden-/Rechnungs-/Kontodaten dorthin gehen (drei Stellen) | Betreiber / Steuerberatung |
| 47 | `datenschutz.html` Abschn. 6 | Speicherdauer | Löschfrist für Kundenkonten ohne Vertrag (z. B. zwölf Monate nach letzter Anmeldung) | Betreiber |
| 48 | `datenschutz.html` Abschn. 8 Variante A | Stripe | Anschrift der Stripe Payments Europe, Limited laut aktuellem Vertrag/Datenschutzcenter prüfen | Betreiber |
| 49 | `datenschutz.html` Abschn. 8 Variante A und B | Alternative Rechnung | Satz „Sie können stattdessen die Zahlung auf Rechnung wählen (Variante C)“, falls angeboten (zwei Stellen) | Betreiber |
| 50 | `datenschutz.html` Abschn. 8 Variante B | Mollie | Anschrift und Firmierung der Mollie B.V. laut Nutzungsvereinbarung/KvK prüfen | Betreiber |
| 51 | `datenschutz.html` Abschn. 8 Variante B | Mollie | welche Daten (Name, E-Mail) vorausgefüllt an Mollie gehen | Entwicklung |
| 52 | `datenschutz.html` Abschn. 8 Variante C | Bank | Name der kontoführenden Bank | Betreiber |
| 53 | `datenschutz.html` Abschn. 10 | Anwendung | Adresse der Anwendung (z. B. app.vereins-flow.com) | Betreiber |
| 54 | `datenschutz.html` Entwurfskasten, Abschn. 6–9 | Online-Abo-Abschnitte | Abschnitte 6 bis 9 bis zum Start des Online-Abos entfernen oder als „geplant“ kennzeichnen (Entscheidung, kein Textplatzhalter) | Betreiber / Anwalt |
| 55 | `datenschutz.html` Abschn. 9 (Lücke aus der Querprüfung) | Widerrufsfunktion | Datenverarbeitung der Online-Widerrufsfunktion (§ 356a BGB; Name, Vertragskennung, E-Mail, Eingangszeit) fehlt; analog Abschn. 9 (Kündigung) ergänzen | Anwalt |
| 56 | `datenschutz.html` Abschn. 6 und `checkout-vorgabe.md` Abschn. 12 (Widerspruch aus der Querprüfung) | IP-Adresse der Bestellung | Datenschutzerklärung speichert die IP als Nachweisdaten für die Vertragsdauer plus Verjährung; die Checkout-Vorgabe löscht sie nach 7 Tagen im Klartext (danach Hash). Eine Linie wählen und beide Texte angleichen; Hash gilt rechtlich als Pseudonym | Anwalt / Betreiber |
| 57 | `barrierefreiheit.html` Abschn. 1 | Kleinstunternehmen | Status bestätigen: weniger als zehn Beschäftigte und Jahresumsatz/Bilanzsumme bis 2 Mio. €, jährlich prüfen | Betreiber |
| 58 | `barrierefreiheit.html` Abschn. 5 | Stand der Vereinbarkeit | „vollständig“ oder „teilweise vereinbar“ nach der Hilfsmittelprüfung (vorläufig: teilweise) | Betreiber |
| 59 | `barrierefreiheit.html` Abschn. 6 | Fokusrahmen `:has()` | Termin für die Rückfalllösung | Entwicklung |
| 60 | `barrierefreiheit.html` Abschn. 6 | Bewegung | Termin für den Schalter „Bewegung aus“ oder „nicht geplant“ | Betreiber |
| 61 | `barrierefreiheit.html` Abschn. 6 | Hilfsmittelprüfung | Termin der Prüfung mit Screenreadern und 400 % Zoom | Betreiber |
| 62 | `barrierefreiheit.html` Abschn. 3 und 6; `agb.html` § 3 | Barrierefreie Alternative zum Checkout | tatsächlich angebotene Alternative (Rechnung, E-Mail, Telefon); Abschn. 3 verspricht „Vertragsabschluss per E-Mail oder Telefon“, `agb.html` § 3 kennt nur den Online-Checkout – Aussage und AGB angleichen | Betreiber / Anwalt |
| 63 | `barrierefreiheit.html` Abschn. 7 | Veröffentlichung | Datum der Veröffentlichung | Betreiber |
| 64 | `barrierefreiheit.html` Abschn. 7 | Prüfung | Datum der letzten Überprüfung | Betreiber |
| 65 | `barrierefreiheit.html` Abschn. 8 | Feedback | Antwortfrist (z. B. zwei Wochen) | Betreiber |
| 66 | `barrierefreiheit.html` Abschn. 9 | Schlichtungsstelle BGG | Anschrift laut schlichtungsstelle-bgg.de prüfen (derzeit Mauerstraße 53, 10117 Berlin) | Betreiber |
| 67 | `footer-vorschlag.html` (alle Seiten) | Fußzeilen-Links | „AGB“, „Widerruf“ und „Verträge hier kündigen“ in die Fußzeile aller Seiten freischalten, sobald `agb.html`, `widerruf.html`, `kuendigen.html` existieren (`agb.html` und `widerruf.html` tragen sie bereits) | Entwicklung |
| 68 | `footer-vorschlag.html`; `datenschutz.html` Abschn. 2 | Cookie-Hinweis in der Fußzeile | Satz „setzt keine Cookies“ ersetzen, sobald das Sitzungs-Cookie des Kundenkontos existiert (Wortlaut steht in `footer-vorschlag.html` Punkt 4; `agb.html` und `widerruf.html` tragen ihn bereits) | Entwicklung |
| 69 | `checkout-vorgabe.md` Abschn. 11 | Rechnungsformat | Entscheidung PDF, ZUGFeRD oder XRechnung (E-Rechnung im B2B) | Steuerberatung |
| 70 | Übergreifend: `impressum.html`, `datenschutz.html`, `barrierefreiheit.html` (zwei Stellen), alle Fußzeilen; im Repo `index.html` (JSON-LD `legalName`, Einwilligungstext am Formular, Fußzeile), `newsletter.php` (`VF_EINWILLIGUNG`, `VF_ANBIETER`, Fußzeile), `404.html` (Fußzeile) – Zeilen Stand 17.10.2026: index.html 51, 943, 964, 991; newsletter.php 43, 52, 148, 175; 404.html 85, 112 | Umstellung GbR → UG i. G. | Firma auf der ganzen Website gleichzeitig umstellen (erst ab notarieller Beurkundung, mit „i. G.“); nach Eintragung „i. G.“ streichen und Registerangaben eintragen. Im Repo zusätzlich `VF_EINWILLIGUNG` hochzählen und den neuen Wortlaut in `README.md` ergänzen. Übergang der Verträge und Newsletter-Einwilligungen von der GbR auf die UG anwaltlich klären | Betreiber / Anwalt |
| 71 | Übergreifend | Neue Seiten | `kuendigen.html` (Abschn. 8) und `widerrufen.html` (Abschn. 9) nach `checkout-vorgabe.md` bauen; bis dahin keine Links veröffentlichen | Entwicklung |
| 72 | Übergreifend: `_headers`, `.htaccess` | CSP | nur anpassen, falls Stripe.js/Elements eingebettet statt gehosteter Checkout verwendet wird (derzeit `default-src 'self'`, `connect-src 'none'`); dann auch Datenschutzerklärung ändern | Entwicklung |
| 73 | Übergreifend: `impressum.html` Fassung B, `agb.html` „Anbieter“, `datenschutz.html` Abschn. 1 Fassung B, `widerruf.html` Abschn. 2 und 5, `widerrufsformular.txt`, `barrierefreiheit.html` (Einleitung, Abschn. 8), `checkout-vorgabe.md` Abschn. 0, 7, 11, 15; Fußzeilen (`agb.html`, `widerruf.html`, `footer-vorschlag.html`) | Nach Handelsregister-Eintragung | „i. G.“ streichen, den Satz „Die Gesellschaft befindet sich in Gründung …“ entfernen, HRB-Nummer eintragen (Registergericht Amtsgericht Recklinghausen steht bereits; Stellen sind als Kommentar „nach Eintragung ergänzen“ bzw. Arbeitsnotiz „HRB-NUMMER“ markiert) | Betreiber |
| 74 | `impressum.html` Fassung A und B (Kommentar „Umsatzsteuer“), `agb.html` „Anbieter“ (Kommentar), `checkout-vorgabe.md` Abschn. 11 | USt-IdNr. nach Erteilung | USt-IdNr. eintragen, sobald das Bundeszentralamt für Steuern sie erteilt hat (§ 5 Abs. 1 Nr. 6 DDG); auf Rechnungen bis dahin Steuernummer, sobald vom Finanzamt vergeben (§ 14 Abs. 4 Nr. 2 UStG) | Betreiber / Steuerberatung |

## Hinweise zur Zählung

- Gelbe `.fill`-Spannen in den HTML-Dateien (Quelltext, Stand 17.10.2026 nach Eintragen der Betreiberangaben): `agb.html` 32, `widerruf.html` 2, `impressum.html` 0, `datenschutz.html` 17 (16 aktiv, 1 in Kommentaren), `barrierefreiheit.html` 12 – zusammen 63 (vorher 73: entfallen sind Geschäftsführung, Registergericht, Registernummer und USt-IdNr. in `agb.html`, alle fünf in `impressum.html` und die Geschäftsführung in `datenschutz.html` Fassung B). Sie ergeben nach dem Zusammenfassen von Doppelungen und mit den Entscheidungen ohne Textplatzhalter die Punkte oben.
- Erledigte Punkte (Nr. 2, 3, 4, 5, 39) bleiben mit ihrer Nummer in der Liste, damit Verweise aus den Dateien stabil bleiben; sie zählen nicht mehr als offen.
- Bedingte Punkte (nur falls später nötig): Nr. 40 (Blog/Magazin) und Nr. 42 (freiwilliger Datenschutzbeauftragter).
- Nicht in der Liste: die anwaltliche Prüfung aller Texte (Pflicht vor dem Live-Gang) und die Checkliste in `checkout-vorgabe.md` Abschn. 15.
