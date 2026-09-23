---
name: datenschutz-check
description: Prüft Änderungen an VereinsFlow darauf, ob neue oder geänderte personenbezogene Daten in allen Datenschutz-Stellen mitgezogen wurden (Datenexport, Anonymisierung, Kontolöschung, Änderungsprotokoll, Aufbewahrung, Rechte, Logs, Doku, Tests). Verwende diesen Skill IMMER, wenn prisma/schema.prisma geändert wird, ein neues Modell oder Feld mit Bezug zu Personen entsteht (Name, Kontakt, Adresse, Geburtsdatum, Notiz, Freitext, Kommentar, Upload, IBAN, IP, Gerät), ein neuer Fachbereich Daten über Mitglieder oder Benutzer speichert, oder wenn der Nutzer nach Datenschutz, DSGVO, Löschung, Anonymisierung, Datenexport oder Aufbewahrung fragt – auch bei Formulierungen wie „hab ich was vergessen?“ nach einer Schema-Änderung.
---

# Datenschutz-Check für VereinsFlow

In VereinsFlow muss jedes personenbezogene Datum an mehreren, weit verstreuten Stellen berücksichtigt werden. Wer ein Feld
hinzufügt, denkt meist an Formular, Service und Migration – vergisst aber leicht Datenexport, Anonymisierung oder Maskierung im
Änderungsprotokoll. Dieser Skill prüft genau diese Lücken systematisch.

Die Prüfung ist **technisch**, keine Rechtsberatung (wie `docs/PRIVACY.md`). Rechtsgrundlagen bewertet der Verein.

## Ablauf

### 1. Umfang bestimmen
- Nennt der Nutzer Dateien, Modelle oder Felder, prüfe genau diese.
- Sonst: `git diff HEAD` (ungestagt + gestagt). Ist das leer: `git diff main...HEAD`.
- Führe im Projekt-Root das Hilfsskript aus diesem Skill-Ordner aus, um neue Schema-Felder und ihre Abdeckung zu finden:
  `node <skill-ordner>/scripts/schema-diff.mjs [basis]` (Basis Standard `HEAD`, z. B. `main`).
  Das Skript ist ein **Vorfilter**: Es findet Kandidaten per Namensmuster und sucht die Feldnamen in den Datenschutz-Dateien.
  Bewerte jeden Kandidaten selbst – Namen täuschen (`title` einer Veranstaltung ist harmlos, `note` einer Schicht nicht).

### 2. Personenbezug einordnen
Ordne jedes neue oder geänderte Feld bzw. Modell einer Klasse zu:

| Klasse | Beispiele | Konsequenz |
|---|---|---|
| **Geheimnis** | Passwort, Token, TOTP-Secret, IBAN | nie im Klartext, nie im Export, nie im Log; hashen (Token) oder verschlüsseln |
| **Sensibel** | Geburtsdatum, interne Notizen, Einwilligungen, Gesundheitsbezug | Recht `members:read_private`, im Protokoll maskiert |
| **Kontakt** | E-Mail, Telefon, Adresse | Recht `members:read_contact`, im Protokoll maskiert |
| **Personenbezogen** | Name, Teilnahme, Schicht, Freitext mit möglichem Personenbezug, Upload der Person | Export, Anonymisierung/Löschung, Aufbewahrung |
| **Kein Personenbezug** | Veranstaltungstitel, Abteilungsname, Einstellungen | nichts weiter nötig – kurz begründen |

**Freitext immer als personenbezogen behandeln** (Notizen, Kommentare, Beschreibungen, Antworten): Menschen schreiben Namen
und Gesundheitsangaben hinein.

### 3. Berührungspunkte prüfen
Lies `references/beruehrungspunkte.md` und gehe **jeden** Punkt für jedes relevante Feld/Modell durch. Die Datei nennt die
konkreten Dateien und worauf zu achten ist. Pfade stammen aus dem Stand beim Bau des Skills – finde verschobene Stellen per
`grep` (z. B. nach `anonymizeMemberData`, `buildUserDataExport`, `MASKED_AUDIT_FIELDS`), statt aufzugeben.

Lies den Code wirklich, statt nur nach dem Feldnamen zu suchen: Ein Feld kann im Export über ein `include` enthalten sein,
ohne dass sein Name auftaucht, und `onDelete: Cascade` im Schema kann eine Löschung bereits erledigen.

### 4. Tests
- Fehlende Tests benennen (siehe Abschnitt L in der Referenz).
- Wenn eine Datenbank verfügbar ist, `npm run test:integration -- privacy` ausführen, sonst mindestens `npm run typecheck`.
  Schlägt etwas fehl, weil die Datenbank fehlt, notiere das, statt es als Befund zu werten.

### 5. Bericht schreiben
Ändere keinen Code, außer der Nutzer bittet ausdrücklich darum. Dann: kleinste Änderung je Lücke, passender Test dazu,
`docs/PRIVACY.md` mitpflegen.

## Berichtsformat

```markdown
# Datenschutz-Check: <Umfang>

## Ergebnis
<1–2 Sätze> · **Status:** ✅ vollständig | ⚠️ Lücken | ❌ kritische Lücken

## Neue/geänderte Daten
| Modell.Feld | Klasse | Begründung |
|---|---|---|

## Abdeckung
| Modell.Feld | Export | Anonym. | Löschung | Protokoll | Aufbew. | Rechte | Doku | Test |
|---|---|---|---|---|---|---|---|---|
(✅ erledigt · ❌ fehlt · ➖ nicht nötig · ❓ unklar)

## Lücken
### 🔴 Kritisch   (Geheimnis/sensibles Datum offen, fremde Daten im Export, Löschung lässt Personenbezug zurück)
- **<Stelle>** – <Problem>. **Vorschlag:** <konkreter Code oder Schritt>
### 🟠 Wichtig    (Feld fehlt in Export/Anonymisierung/Maskierung, keine Aufbewahrungsregel, kein Test)
### 🟡 Hinweis    (Doku, Benennung, Datensparsamkeit)
### ❓ Zu klären  (Fachliche Entscheidung nötig, z. B. Aufbewahrungspflicht vs. Löschung)

## Geprüft
- Dateien / ausgeführte Befehle
```

Leere Abschnitte weglassen. Status: eine 🔴-Lücke → ❌; nur 🟠 → ⚠️; sonst ✅.
