# Rechtstexte – Entwürfe (nicht veröffentlicht)

**ENTWURF – keine Rechtsberatung.** Vor dem Live-Gang muss ein Anwalt für IT-/Medienrecht die Texte prüfen, besonders AGB, Widerrufsbelehrung und den noch zu schreibenden AV-Vertrag.

Erstellt am 17.10.2026 für den geplanten Online-Verkauf (Monatsabo, Online-Checkout, Verbraucher und Vereine) durch die künftige **H&B Software Solution UG (haftungsbeschränkt)**. Die Website verkauft heute noch nichts; die Texte gehören zusammen mit Checkout, UG-Gründung und ausgefüllten Platzhaltern online.

**Stand 17.10.2026 – Gründungsphase.** Die H&B Software Solution UG (haftungsbeschränkt) befindet sich in Gründung; die Eintragung in das Handelsregister des Amtsgerichts Recklinghausen wird beantragt. Geschäftsführer und allein vertretungsberechtigt ist Luis Heidecker; Gesellschafter (Mitgründer) sind Luis Heidecker und Ben Bleckert. Alle UG-Texte führen die Firma deshalb als „H&B Software Solution UG (haftungsbeschränkt) i. G.“, nennen „vertreten durch den Geschäftsführer Luis Heidecker“ und den Satz „Die Gesellschaft befindet sich in Gründung; die Eintragung in das Handelsregister des Amtsgerichts Recklinghausen wird beantragt.“ HRB-Nummer und USt-IdNr. gibt es noch nicht; die Stellen stehen als Kommentar „nach Eintragung ergänzen“ bzw. „nach Erteilung ergänzen“ (Platzhalterliste Nr. 73 und 74). Die Website selbst bleibt bis zur notariellen Beurkundung bei der VereinsFlow GbR (`impressum.html` Fassung A, aktiv); die Umstell-Anleitung steht im Kommentar von `impressum.html`. Der Notartermin steht noch aus: Bis zur Beurkundung bleibt die VereinsFlow GbR Anbieterin der Live-Website; die Entwürfe mit „UG i. G.“ dürfen erst ab der Beurkundung veröffentlicht werden.

| Datei | Inhalt |
|---|---|
| `agb.html` | AGB (16 Paragrafen), Website-Gerüst |
| `widerruf.html`, `widerrufsformular.txt` | Widerrufsbelehrung nach Anlage 1 EGBGB, Muster-Widerrufsformular |
| `impressum.html` | Fassung A GbR (aktiv) und Fassung B UG i. G. (auskommentiert) mit Umstell-Anleitung |
| `datenschutz.html` | Datenschutzerklärung der Website, erweitert um Kundenkonto, Rechnungen, Zahlung (3 Varianten), Kündigungsbutton |
| `barrierefreiheit.html`, `bfsg-checkliste.md` | Erklärung zur Barrierefreiheit (BFSG, derzeit freiwillig) und WCAG-Prüfung der Startseite |
| `footer-vorschlag.html` | Fußzeile für alle Seiten mit den neuen Links (teils auskommentiert) |
| `checkout-vorgabe.md` | Bauanleitung für Checkout, Bestätigungs-E-Mail, Kündigungs- und Widerrufsschaltfläche, Rechnungen |
| `platzhalter-gesamt.md` | Alle Platzhalter und Entscheidungen mit Zuständigkeit (74 Nummern, davon 69 offen; Stand 17.10.2026) |
| `quellen.md`, `quellen-datenschutz.md` | Geprüfte Gesetzesstellen mit amtlicher Fundstelle und Abrufdatum |

## So kommen die Texte online

1. Platzhalter ausfüllen (`grep -n 'class="fill"' docs/recht/*.html`), `<span class="fill">` und den Kasten `.draft-notice` entfernen. Entscheidungen aus `platzhalter-gesamt.md` abarbeiten, nicht gewählte Zahlungsvarianten streichen.
2. Anwaltliche Prüfung.
3. Dateien nach `website/` kopieren (`impressum.html` und `datenschutz.html` ersetzen die heutigen), Fußzeile aller Seiten nach `footer-vorschlag.html` angleichen, `kuendigen.html` und `widerrufen.html` nach `checkout-vorgabe.md` bauen.
4. `node website/tools/check-site.mjs`, dann `node website/tools/paket-bauen.mjs` → `website/upload/vereinsflow-website.zip`.
5. Zip und `entpacken.php` bei IONOS in `/public` hochladen, `entpacken.php` im Browser aufrufen, danach Live-Prüfung (siehe `website/README.md`, „Website hochladen“).

Die Entwürfe liegen bewusst außerhalb von `website/`: Das Upload-Paket (`tools/paket.mjs`) nimmt alles aus `website/` mit.
