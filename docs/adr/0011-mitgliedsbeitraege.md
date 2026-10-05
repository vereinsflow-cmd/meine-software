# ADR-0011: Mitgliedsbeiträge – Regeln mit Verlauf, tagesgenau und exakt gerechnet

Status: gültig (Oktober 2026)

## Kontext

Vereine rechnen Beiträge nach ihrer Beitragsordnung: Grundbeitrag nach Status und Alter (Jugend, Erwachsene, Passive),
Zusatzbeiträge einzelner Abteilungen, Ermäßigungen (Übungsleiter, Härtefälle), abweichende Zahler (Eltern). Eintritt,
Austritt, Geburtstag und Statuswechsel fallen mitten in den Zeitraum. Kassenwarte sind Ehrenamtliche – jeder Betrag muss
sich in einem Satz erklären lassen, und frühere Zeiträume dürfen sich durch spätere Änderungen nicht verschieben.

## Entscheidung

- **Regeln statt Zuordnung von Hand:** Beitragsarten (`FeeType`) mit Status, Alter von/bis und optional Abteilung.
  Grundbeiträge werden in einer eindeutigen Reihenfolge geprüft (`priority`, eindeutig je Verein für aktive Grundbeiträge
  per Teilindex); die erste passende gilt. Ehrenmitglieder ohne eigene Beitragsart sind beitragsfrei.
- **Beträge mit „gilt ab“** (`FeeRate`): nie ändern, nur einen neuen Satz ab einem Tag anlegen; künftige lassen sich
  zurücknehmen (Trigger `fee_rate_guard`).
- **Ausnahmen mit Zeitraum** (`MemberFeeAssignment`): feste Beitragsart, beitragsfrei, Ermäßigung in Prozent, fester Betrag
  je Monat – mit Grund. Je Tag höchstens eine feste Beitragsart und eine weitere Regel (Ausschlussbedingung mit
  `btree_gist`). Regeln werden beendet, nicht umgeschrieben.
- **Zahler und Zahlweg** (`MemberFinance`): Der Zahlweg des Zahlers gilt; keine Ketten (Trigger).
- **Status-Verlauf** (`MemberStatusChange`): schreibt die Datenbank selbst bei Anlage und jedem Statuswechsel
  (Trigger `Member_status_history`), egal über welchen Weg (Formular, Import, Antrag, Anonymisierung).
- **Familien** (`FeeFamily`, `FeeFamilyMember`, Etappe 6): feste Gruppen, die der Kassenwart pflegt (keine Regel „wer
  wohnt zusammen“). Mitglieder mit Zeitraum (ab/bis), je Mitglied und Tag höchstens eine Familie (Ausschlussbedingung);
  austragen statt löschen (Trigger `fee_family_member_guard`). An jedem Tag, an dem mindestens so viele
  Familienmitglieder einen Grundbeitrag zahlen würden, wie der Familienbeitrag verlangt (`familyMinMembers`), zahlt die
  Familie einmal den Familienbeitrag statt dieser Grundbeiträge – sonst jedes einzeln. Zusatzbeiträge bleiben beim
  Mitglied. Der Zahler der Familie zahlt auch die übrigen Beiträge ihrer Mitglieder, solange beim Mitglied kein anderer
  Zahler eingestellt ist; er hat selbst keinen abweichenden Zahler (Trigger, gleiche Sperre wie bei „Zahler und
  Zahlweg“). Eltern, die nicht Mitglied sind, kommen mit der Lastschrift (Kontoinhaber im Mandat, Etappe 11).
- **Rechenkern rein und exakt** (`src/modules/fees/engine.ts`): Tag für Tag Status, Alter und Regel bestimmen, daraus
  Abschnitte bilden, je Monat anteilig (Tage/Monatstage) mit Brüchen rechnen, erst am Ende kaufmännisch runden und die
  Cent auf die Zeilen verteilen (größter Rest). Jede Zeile und jeder Betrag hat einen erklärenden Satz.

## Folgen

- „Wer zahlt was“ ist eine Vorschau; erstellt werden Beiträge erst mit dem Beitragslauf (Etappe 7), der dieselbe
  Rechnung nutzt und nie einen Tag doppelt berechnet.
- Vor Einführung gibt es nur den rückwirkend angelegten Verlauf (aktueller Status ab Eintritt); der Rechenkern weist auf
  Lücken hin.
- Geburtsdaten verlassen den Dienst nicht in die Oberfläche – angezeigt wird nur das Ergebnis (Beitragsart, Hinweis);
  eine Grenze, die auf den Geburtstag fällt, heißt nur „Geburtstag im November“.
- Status-Verlauf in der Reihenfolge der Erfassung: Ein späterer Eintrag ersetzt frühere, die ab demselben oder einem
  späteren Tag gelten sollten (zurückgenommene Kündigung).
- Abteilungen zählen ab „seit“, sonst ab dem Tag der Zuordnung. Wird ein Mitglied aus einer Abteilung genommen, ist die
  Zuordnung weg – im laufenden Zeitraum entfällt der Zusatzbeitrag dann ganz. Abgerechnete Zeiträume hält der Beitragslauf
  fest (Etappe 7); ein Ende je Abteilung kommt bei Bedarf dazu.
- Eine Beitragsart gilt erst mit ihrem ersten Betrag; bis dahin greift die nächste passende.
- Familien: Ob der Familienbeitrag gilt, hängt von allen Mitgliedern ab – die Karte „Beitrag“ eines Mitglieds rechnet
  deshalb mit der ganzen Familie. Ein Familienbeitrag kann teurer sein als die Einzelbeiträge; das entscheidet der Verein
  mit seiner Beitragsordnung, nicht die Software. Name, Familienbeitrag und Zahler einer Familie lassen sich ändern und
  wirken auf die Vorschau aller noch nicht abgerechneten Zeiträume; abgerechnete hält der Beitragslauf fest.
- Familien: Wer an einem Tag nichts zahlen würde (beitragsfrei, Ehrenmitglied, 100 % ermäßigt), zählt nicht mit. Der Zahler
  der Familie zahlt die übrigen Beiträge eines Mitglieds nur, wenn es am letzten Beitragstag des Zeitraums noch in der
  Familie ist. Auflösen zu einem künftigen Tag lässt die Familie bis dahin laufen; „aufgelöst“ ist sie danach. Beginnt oder
  endet der Familienbeitrag am Geburtstag eines Familienmitglieds, steht auch dort nur „Geburtstag im November“. Sind alle
  anonymisiert, heißt die Familie „Familie (anonymisiert)“ und ihre Einträge im Änderungsprotokoll werden geleert.
