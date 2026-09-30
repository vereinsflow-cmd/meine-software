# Server-Tag: VereinsFlow auf den eigenen Server bringen

Anleitung, um VereinsFlow auf einem gemieteten Server (IONOS VPS) unter **https://app.vereins-flow.com** in Betrieb zu nehmen – vom leeren Server bis zur ersten Anmeldung. Hintergrund und Einzelheiten zu Konfiguration, Reverse-Proxy, Cron und Datensicherung stehen in [docs/OPERATIONS.md](../docs/OPERATIONS.md); hier steht der Weg für den Server-Tag.

> **Stand der Prüfung:** Die Skripte dieses Ordners sind in einem Ubuntu-24.04-Container und gegen den echten Docker-Stack getestet (Einrichtung, Sicherung, Wiederherstellung, Update, Fehlerfälle). Firewall, Swap, systemd-Dienste und die Zertifikatsbeschaffung von Caddy konnten dort nur mit Attrappen oder gar nicht geprüft werden. Auf einem echten IONOS-Server sind die Skripte noch nicht gelaufen – der erste Durchlauf ist der Praxistest. Deshalb: Terminal offen lassen, Meldungen lesen, bei einem Fehler nicht raten. **Jedes Skript lässt sich gefahrlos erneut starten.**

## Überblick

### Was am Ende läuft

```text
Internet ──► Caddy (Ports 80/443, HTTPS von allein) ──► VereinsFlow (nur 127.0.0.1:3000) ──► PostgreSQL 18
                                                             │
                                                             ├──► Dateiablage (Docker-Volume "storage")
                                                             └──► E-Mail über smtp.ionos.de
Cron-Dienst (alle 15 Minuten, Docker)     Sicherung (täglich, systemd-Timer)     Firewall (ufw): nur SSH, 80, 443
```

Alles Weitere (Docker, Caddy, Firewall, Swap, automatische Sicherheitsupdates, Sicherung) richtet ein einziges Skript ein: `server-einrichten.sh`.

### Was in diesem Ordner liegt

| Datei                  | Wofür                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`            | Diese Anleitung                                                                                                                                |
| `server-einrichten.sh` | Richtet einen frischen Ubuntu-24.04-Server komplett ein (wiederholbar). `--hilfe` zeigt alle Optionen                                          |
| `Caddyfile`            | Konfiguration des Reverse-Proxys (HTTPS, 12-MB-Limit, weitergeleitete Header); wird vom Einrichtungsskript nach `/etc/caddy/Caddyfile` kopiert |
| `sicherung.sh`         | Tägliche Sicherung von Datenbank und Dateiablage nach `/var/backups/vereinsflow` (14 Tage, optional verschlüsselt)                             |
| `aktualisieren.sh`     | Update: erst Sicherung, dann neuer Code, neu bauen, Gesundheit prüfen                                                                          |

### Was du brauchst

- Zugang zu **IONOS** (Kundenkonto, Zahlungsmittel) und zur DNS-Verwaltung von `vereins-flow.com`.
- Einen **Mac** mit Terminal (Programme → Dienstprogramme → Terminal).
- Die vorbereitete Konfiguration `~/VereinsFlow-Schluessel/env.production` (Geheimnisse sind erzeugt, `SMTP_PASSWORD` ist noch leer).
- Den aktuellen Stand im Zweig **`main`** auf GitHub – mit den Handy-App-Änderungen **und** dem Ordner `deploy/`. Der Server holt den Code von [github.com/vereinsflow-cmd/meine-software](https://github.com/vereinsflow-cmd/meine-software). Ist `handy-app` noch nicht in `main` gemergt, fehlen dem Server die Skripte.
- Etwa **anderthalb Stunden**, davon rund eine halbe Stunde Warten (Server bereitstellen, DNS, erster Build).

## Die Schritte im Überblick

1. [ ] SSH-Schlüssel auf dem Mac anlegen
2. [ ] Server bei IONOS bestellen (VPS M+, Ubuntu 24.04, Deutschland)
3. [ ] Firewall im IONOS Cloud Panel prüfen
4. [ ] Zum ersten Mal mit dem Server verbinden
5. [ ] DNS-Eintrag `app` bei IONOS anlegen
6. [ ] E-Mail-Postfach `benachrichtigung@vereins-flow.com` anlegen
7. [ ] Code auf den Server holen
8. [ ] Konfiguration hochladen, SMTP-Passwort eintragen, prüfen
9. [ ] Einrichtungsskript ausführen
10. [ ] Ersten Plattform-Administrator anlegen
11. [ ] Prüfen: Health, Anmeldeseite, assetlinks.json, Test-Mail, Push, Cron
12. [ ] Sicherung prüfen, verschlüsseln, Kopie außerhalb des Servers anlegen
13. [ ] Android-App: Fingerabdruck eintragen, geschlossener Test
14. [ ] SSH absichern (Passwort-Anmeldung abschalten)

## Schritt für Schritt

Befehle mit der Überschrift **Mac** gibst du im Terminal auf deinem Mac ein, Befehle mit **Server** nach der Anmeldung per `ssh root@SERVER-IP` auf dem Server. `SERVER-IP` ersetzt du überall durch die IPv4-Adresse deines Servers (Schritt 2).

### 1. SSH-Schlüssel auf dem Mac anlegen

Ein SSH-Schlüssel ersetzt das Passwort bei der Anmeldung am Server. Das Schlüsselpaar besteht aus einer **privaten** Datei (bleibt auf dem Mac, niemals weitergeben) und einer **öffentlichen** (kommt zu IONOS und auf den Server).

**Mac** – gibt es schon einen Schlüssel?

```bash
ls ~/.ssh/id_ed25519.pub
```

- Zeigt der Befehl den Dateinamen, hast du schon einen Schlüssel: weiter mit „Öffentlichen Schlüssel kopieren“.
- Meldet er „No such file“, lege einen an:

  ```bash
  ssh-keygen -t ed25519 -C "vereinsflow-server"
  ```

  Enter drücken für den vorgeschlagenen Speicherort, dann eine **Passphrase** vergeben (sie schützt den Schlüssel, falls jemand an deinen Mac kommt). Damit der Mac sie sich merkt: `ssh-add --apple-use-keychain ~/.ssh/id_ed25519`.

**Öffentlichen Schlüssel kopieren** (Mac):

```bash
pbcopy < ~/.ssh/id_ed25519.pub
```

Er liegt jetzt in der Zwischenablage (Anzeigen mit `cat ~/.ssh/id_ed25519.pub`; er beginnt mit `ssh-ed25519`). Speicherst du den Schlüssel unter einem anderen Namen, musst du bei `ssh` und `scp` immer `-i ~/.ssh/DATEINAME` mitgeben.

### 2. Server bei IONOS bestellen

Bestelle beim Anbieter einen **VPS**. Im Cloud Panel (Menü → Server & Cloud → Infrastruktur → Server → **Erstellen**) wählst du:

| Feld                  | Wert                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                  | frei, z. B. `vereinsflow`                                                                                                                                                                            |
| Konfiguration         | **VPS M+** (2 vCores, 4 GB RAM, 120 GB NVMe)                                                                                                                                                         |
| Image                 | Reiter **IONOS Images** → **Ubuntu 24.04** (nicht der Reiter mit den fertigen Anwendungen, kein Plesk)                                                                                               |
| Rechenzentrum         | **Deutschland**                                                                                                                                                                                      |
| Weitere Einstellungen | Ein **Passwort** für `root` setzen (IONOS verlangt es; ablegen im Passwortmanager). Bietet das Formular ein Feld **SSH-Schlüssel** an: den öffentlichen Schlüssel aus Schritt 1 wählen oder einfügen |
| Firewall-Richtlinie   | die Standardrichtlinie für Linux (siehe Schritt 3)                                                                                                                                                   |

Wird beim Erstellen kein SSH-Schlüssel angeboten, kannst du ihn vorher unter **Sicherheit → SSH-Schlüssel** hinterlegen (Erstellen → vorhandenen Schlüssel importieren → einfügen) oder ihn in Schritt 4 nachträglich mit `ssh-copy-id` auf den Server bringen. Die Bezeichnungen im IONOS-Panel ändern sich gelegentlich; sinngemäß findest du sie immer.

Nach dem Erstellen dauert die Bereitstellung einige Minuten. In der Detailansicht des Servers steht die **öffentliche IPv4-Adresse** (z. B. `203.0.113.10`) – **notiere sie**, sie ist dein `SERVER-IP`. Die IPv6-Adresse brauchst du nicht.

### 3. Firewall im IONOS Cloud Panel prüfen

IONOS schaltet dem Server eine eigene Firewall vor (Menü → Netzwerk → **Firewall-Richtlinien**). Die Standardrichtlinie für Linux lässt TCP **22, 80, 443** (sowie 8443 und 8447) durch – das genügt. Hast du eine eigene Richtlinie gewählt, müssen dort mindestens **TCP 22, 80 und 443** erlaubt sein. Ohne 80 und 443 bekommt Caddy kein Zertifikat.

Optional: **UDP 443** zusätzlich erlauben, dann funktioniert HTTP/3. Notwendig ist das nicht – die Browser fallen sonst auf HTTP/2 zurück.

### 4. Zum ersten Mal mit dem Server verbinden

**Mac:**

```bash
ssh root@SERVER-IP
```

Auf die Frage „Are you sure you want to continue connecting?“ antwortest du mit `yes` (der Mac merkt sich den Server damit). Danach erscheint eine Eingabezeile wie `root@vereinsflow:~#` – du bist auf dem Server.

- **„Permission denied (publickey)“:** Der Schlüssel ist dem Server nicht zugeordnet. Melde dich mit dem Passwort aus Schritt 2 an (`ssh -o PubkeyAuthentication=no root@SERVER-IP`) und richte den Schlüssel von einem zweiten Terminal aus ein: `ssh-copy-id root@SERVER-IP`.
- **Ganz ohne Schlüssel** geht es zunächst auch mit dem Passwort; den Schlüssel richtest du dann mit `ssh-copy-id` ein, bevor du Schritt 14 machst.

Mit `exit` verlässt du den Server wieder.

### 5. DNS-Eintrag `app` bei IONOS anlegen

Damit `app.vereins-flow.com` auf den Server zeigt, braucht es einen **A-Eintrag**:

1. IONOS-Konto → **Domains & SSL** → bei `vereins-flow.com` in der Spalte „Aktionen“ das Drei-Punkte-Menü → **DNS**.
2. **Eintrag hinzufügen** → Typ **A**.
3. Hostname: `app` (nur das Kürzel, nicht die ganze Domain) · Zeigt auf: `SERVER-IP` · TTL: die kleinste angebotene (oder 1 Stunde).
4. **Speichern**.

> **Fasse die anderen Einträge nicht an** (`@`, `www` und alles andere). Sie gehören zur Werbe-Website `vereins-flow.com` auf dem IONOS-Webspace, die bleibt unverändert.

Prüfen auf dem **Mac** (kann einige Minuten bis eine Stunde dauern):

```bash
dig +short app.vereins-flow.com
```

Sobald dort deine `SERVER-IP` steht, ist der Eintrag wirksam. Das Einrichtungsskript prüft ihn noch einmal und warnt, wenn er fehlt.

### 6. E-Mail-Postfach `benachrichtigung@vereins-flow.com` anlegen

VereinsFlow verschickt Einladungen, Passwort-Zurücksetzen und Erinnerungen über dieses Postfach.

1. Lege in deinem IONOS-Konto das Postfach `benachrichtigung@vereins-flow.com` an (im Bereich **E-Mail** des Vertrags, zu dem `vereins-flow.com` gehört) und vergib ein **starkes Passwort**.
2. Lege das Passwort im Passwortmanager ab – du trägst es gleich in Schritt 8 auf dem Server ein.
3. Melde dich einmal im Webmail an, damit das Postfach sicher aktiv ist.

In deiner vorbereiteten Konfiguration stehen der Mailserver `smtp.ionos.de` und der Benutzername (die vollständige Adresse) schon; es fehlt nur das Passwort. IONOS empfiehlt für den Versand Port 587 mit STARTTLS (`SMTP_PORT=587`, `SMTP_SECURE=false`).

### 7. Code auf den Server holen

**Server** (`ssh root@SERVER-IP`):

```bash
apt-get update && apt-get install -y git
git clone https://github.com/vereinsflow-cmd/meine-software.git /opt/vereinsflow
ls /opt/vereinsflow/deploy
```

Die letzte Zeile muss die Dateien dieses Ordners zeigen (`server-einrichten.sh` usw.). Fehlt der Ordner `deploy`, ist der Zweig `main` noch nicht auf dem neuesten Stand (siehe „Was du brauchst“).

### 8. Konfiguration hochladen, SMTP-Passwort eintragen, prüfen

**Mac** – die vorbereitete Datei auf den Server kopieren:

```bash
scp ~/VereinsFlow-Schluessel/env.production root@SERVER-IP:/opt/vereinsflow/.env.production
```

Den Ordner `/opt/vereinsflow` hat Schritt 7 angelegt; fehlt er, erzeugst du ihn vorher mit `ssh root@SERVER-IP mkdir -p /opt/vereinsflow`. Auf dem Server heißt die Datei `.env.production` (mit Punkt am Anfang; Dateien mit Punkt zeigt `ls` erst mit `ls -a`). Sie enthält Geheimnisse: Das Skript setzt sie auf „nur root darf lesen“. Behalte die Datei auf deinem Mac auch weiterhin – sie ist deine Sicherung der Konfiguration.

**Server** – das SMTP-Passwort eintragen:

```bash
nano /opt/vereinsflow/.env.production
```

Suche die Zeile `SMTP_PASSWORD=` und schreibe das Passwort aus Schritt 6 **in einfachen Anführungszeichen** dahinter:

```text
SMTP_PASSWORD='mein-passwort'
```

Speichern mit **Strg+O**, dann Enter; beenden mit **Strg+X**. Die Anführungszeichen sind wichtig: Sonderzeichen wie `$` oder `#` würden sonst falsch gelesen. Enthält das Passwort selbst ein einfaches Anführungszeichen `'`, schreibe es in doppelte Anführungszeichen und ein Dollarzeichen doppelt (`$$`) – oder vergib bei IONOS ein Passwort ohne `'`.

**Server** – jetzt die Konfiguration prüfen, ohne etwas zu installieren:

```bash
bash /opt/vereinsflow/deploy/server-einrichten.sh --nur-pruefen
```

Erwartet wird „Konfiguration: vollständig“. Fehlt etwas (Platzhalter „change-me“, leeres `SMTP_PASSWORD`, `APP_URL` ohne `https://`, unpassende Zeichen im Datenbank-Passwort …), nennt das Skript die Variable und was zu tun ist – Werte zeigt es nie an. Eine DNS-Warnung ist an dieser Stelle noch in Ordnung, wenn du Schritt 5 gerade erst erledigt hast.

### 9. Einrichtungsskript ausführen

**Server:**

```bash
bash /opt/vereinsflow/deploy/server-einrichten.sh
```

Das dauert **10 bis 20 Minuten**, der erste Docker-Build davon allein 5 bis 15. Das Skript nummeriert seine 13 Schritte (`[3/13] …`) und erledigt der Reihe nach:

1. Konfiguration und DNS prüfen
2. System aktualisieren (nur beim ersten Lauf), Grundwerkzeuge installieren
3. automatische Sicherheitsupdates einschalten
4. eine Swap-Datei (4 GB) anlegen, damit der Build bei 4 GB Arbeitsspeicher nicht abbricht
5. Firewall einrichten (nur SSH, 80, 443)
6. Docker installieren
7. Caddy installieren
8. SSH (bleibt ohne Option unverändert)
9. Code prüfen (ist schon da)
10. Caddyfile einspielen und Caddy laden
11. VereinsFlow bauen und starten, warten bis `/api/health` antwortet
12. tägliche Sicherung einrichten und einmal ausprobieren
13. Abschlussprüfung über HTTPS

Gut zu wissen:

- Bricht deine Verbindung ab, läuft das Skript weiter. Zuschauen kannst du mit `tail -f /var/log/vereinsflow-einrichten.log` (Beenden mit Strg+C).
- Am Ende steht eine **Zusammenfassung mit Warnungen**. Lies sie. Steht dort „Neustart nötig“, gib `reboot` ein und melde dich nach ein bis zwei Minuten wieder an; Docker, Caddy und VereinsFlow starten von allein.
- Bei einem Fehler nennt das Skript die Ursache und die nächsten Schritte. Behebe sie und starte das Skript **einfach erneut**.
- Optionen (mehr mit `--hilfe`): `--ssh-passwort-login-aus` (Schritt 14) und `--auto-neustart` (der Server startet nach Sicherheitsupdates, die einen Neustart brauchen, nachts um 04:30 Uhr Server-Zeit selbst neu – kurze Unterbrechung, dafür immer aktuell).

### 10. Ersten Plattform-Administrator anlegen

VereinsFlow ist eine geschlossene Plattform: Es gibt keine Registrierung, der erste Benutzer wird auf dem Server angelegt. Er legt später die Vereine an, sieht aber keine Mitgliederdaten.

**Server:**

```bash
cd /opt/vereinsflow
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm tools \
  npm run admin:create -- --email DEINE@ADRESSE --first-name VORNAME --last-name NACHNAME
```

Die Ausgabe enthält **einmalig einen Link** (24 Stunden gültig), etwa `https://app.vereins-flow.com/passwort-zuruecksetzen?token=…`. Öffne ihn im Browser und lege dein Passwort fest. Der Link kommt bewusst nicht per E-Mail; **behandle ihn wie ein Passwort**. Der Befehl ist wiederholbar: Für ein bestehendes Konto erzeugt er einen neuen Link.

Danach: anmelden, in der „Systemadministration“ den ersten Verein anlegen und dessen Administrator einladen (siehe [docs/OPERATIONS.md](../docs/OPERATIONS.md#erste-inbetriebnahme)).

### 11. Prüfen

| Was                  | Wie                                                                                                                                                                                                         | Erwartet                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Health               | Im Browser <https://app.vereins-flow.com/api/health> öffnen – oder auf dem Mac `curl -i https://app.vereins-flow.com/api/health`                                                                            | `200` und `{"ok":true}`                                                                |
| HTTPS-Weiterleitung  | `curl -I http://app.vereins-flow.com/`                                                                                                                                                                      | `308` mit `Location: https://app.vereins-flow.com/`                                    |
| Sicherheits-Header   | `curl -sI https://app.vereins-flow.com/anmelden`                                                                                                                                                            | u. a. `strict-transport-security` und `content-security-policy` (kommen von der App)   |
| Anmeldeseite         | <https://app.vereins-flow.com/anmelden> öffnen, mit dem Plattform-Administrator anmelden                                                                                                                    | Seite lädt mit Schloss-Symbol, Anmeldung klappt                                        |
| App-Verknüpfung      | `curl -i https://app.vereins-flow.com/.well-known/assetlinks.json`                                                                                                                                          | `200`, `application/json`, **ohne** Weiterleitung; enthält Paketname und Fingerabdruck |
| Test-Mail            | <https://app.vereins-flow.com/passwort-vergessen> öffnen, die Adresse des Administrators eingeben                                                                                                           | Die Mail kommt binnen weniger Minuten (auch im Spam-Ordner schauen)                    |
| Push (nur mit VAPID) | Angemeldet unter Profil → Benachrichtigungen den Schalter „Push-Benachrichtigungen auf diesem Gerät“ einschalten, mit einem zweiten Konto eine Nachricht senden                                             | Meldung „Neue Nachricht“ erscheint auch bei geschlossener App                          |
| Cron-Dienst          | `cd /opt/vereinsflow`, dann `docker compose -f docker-compose.prod.yml --env-file .env.production exec cron sh -c 'curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://app:3000/api/cron/run'` | Antwort mit `"ok":true` je Job                                                         |

Kommt keine Test-Mail: `docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail 50 app` zeigt Zeilen `[mail] Versand fehlgeschlagen: …`; meist ist das `SMTP_PASSWORD` falsch oder das Postfach nicht aktiv (Schritt 6 und 8). Fehlt der Push-Schalter im Profil, sind in `.env.production` die drei VAPID-Angaben nicht (vollständig) gesetzt – siehe [Push-Benachrichtigungen](../docs/OPERATIONS.md#push-benachrichtigungen). Nach jeder Änderung an `.env.production` gilt: **`docker compose … restart` liest die Datei nicht neu ein** – nimm `bash /opt/vereinsflow/deploy/aktualisieren.sh --erzwingen`.

### 12. Sicherung prüfen, verschlüsseln, Kopie außerhalb des Servers anlegen

Das Einrichtungsskript hat die tägliche Sicherung schon eingerichtet und einmal ausprobiert. Kontrolliere es und mache sie **jetzt** sicher (Einzelheiten im Abschnitt [Sicherung und Wiederherstellung](#sicherung-und-wiederherstellung)):

**Server:**

```bash
systemctl list-timers vereinsflow-sicherung.timer   # wann läuft sie das nächste Mal?
ls -lh /var/backups/vereinsflow                      # gibt es Dateien?
```

1. **Verschlüsseln** (empfohlen): einen age-Schlüssel auf dem Mac erzeugen, den öffentlichen Teil in `/etc/vereinsflow/sicherung.conf` eintragen – siehe [Verschlüsseln](#verschlüsseln).
2. **Kopie außerhalb des Servers**: Die Sicherungen liegen auf demselben Server wie die Daten. Geht der Server verloren, sind sie mit weg. Lege regelmäßig eine (verschlüsselte) Kopie an einem anderen Ort ab – siehe [Kopie außerhalb des Servers](#kopie-außerhalb-des-servers).
3. **Wiederherstellung einmal üben**, bevor du sie brauchst – siehe [Wiederherstellen](#wiederherstellen).

### 13. Android-App: Fingerabdruck eintragen, geschlossener Test

Die Android-App ist eine Trusted Web Activity (Projekt: [android/README.md](../android/README.md)). Damit sie **ohne Adresszeile** läuft, muss der Server ihr Signaturzertifikat kennen (Digital Asset Links, Hintergrund: [docs/OPERATIONS.md](../docs/OPERATIONS.md#app-ansicht-android-app-und-iphone)). In deiner Konfiguration steht schon der Fingerabdruck des **Upload-Schlüssels**; nach dem ersten Hochladen kommt der des **App-Signaturschlüssels** von Google dazu:

1. **Play Console:** die App wählen → **App-Integrität** (je nach Version unter „Einrichten“ bzw. „Test und Veröffentlichung“) → Reiter **App-Signatur** → den **SHA-256-Zertifikatfingerabdruck** des App-Signaturschlüssels kopieren (`AB:12:…`, 32 Paare).
2. **Server:** `nano /opt/vereinsflow/.env.production`. Die Zeile `ANDROID_APP_CERT_SHA256=` **behält den vorhandenen Wert** und bekommt den neuen dahinter, getrennt durch ein Komma:

   ```text
   ANDROID_APP_CERT_SHA256=AB:12:…(Upload-Schlüssel),CD:34:…(App-Signaturschlüssel)
   ```

   Setze bei der Gelegenheit `SUPPORT_EMAIL=` auf eine Adresse, unter der du für technische Fragen und Löschanfragen ohne Zugang erreichbar bist (für die Play-Store-Fassung empfohlen: Sonst fehlt auf der Löschseite die Anlaufstelle).

3. **Übernehmen** (nicht `restart`, das liest die Datei nicht neu ein):

   ```bash
   bash /opt/vereinsflow/deploy/aktualisieren.sh --erzwingen
   ```

4. **Prüfen** (Mac): `curl -i https://app.vereins-flow.com/.well-known/assetlinks.json` muss mit `200` antworten und beide Fingerabdrücke enthalten.
5. Trage `https://app.vereins-flow.com/konto-loeschen` in der Play Console ein (Löschanfragen für die App). Die Seite ist ohne Anmeldung und ohne Weiterleitung erreichbar: `curl -i https://app.vereins-flow.com/konto-loeschen` muss mit `200` antworten.

**Geschlossener Test** in der Play Console (je nach Version unter „Test und Veröffentlichung“ → „Tests“ → „Geschlossener Test“):

1. Einen Test-Track anlegen und die Tester (E-Mail-Adressen mit Google-Konto) eintragen.
2. Das mit dem Upload-Schlüssel signierte App Bundle hochladen (Bauen und Signieren: [android/README.md](../android/README.md)) und zur Prüfung einreichen.
3. Den Test-Link an die Tester schicken. Prüfen: Installation, Anmeldung, **Vollbild ohne Adresszeile** (das bestätigt die Verknüpfung), Push.
4. Google verlangt bei neuen privaten Entwicklerkonten vor der Veröffentlichung einen geschlossenen Test mit einer Mindestzahl Testern über mehrere Wochen. Die aktuellen Vorgaben zeigt dir die Play Console.

### 14. SSH absichern (Passwort-Anmeldung abschalten)

Solange die Anmeldung per Passwort erlaubt ist, kann jeder im Internet das Root-Passwort durchprobieren. Sobald dein SSH-Schlüssel funktioniert, schalte sie ab:

1. Öffne ein **zweites** Terminal auf dem Mac und prüfe: `ssh root@SERVER-IP` klappt **ohne Passwortabfrage des Servers** (eine Passphrase deines Schlüssels ist etwas anderes). Lass das erste Fenster offen.
2. **Server:** `bash /opt/vereinsflow/deploy/server-einrichten.sh --ssh-passwort-login-aus`
3. Das Skript schaltet es nur ab, wenn in `/root/.ssh/authorized_keys` ein Schlüssel steht, prüft die Einstellung mit `sshd -t` und nimmt sie sonst zurück.
4. Prüfe wieder in einem **neuen** Terminal, dass die Anmeldung mit dem Schlüssel klappt, bevor du das alte Fenster schließt.

Kommst du trotzdem nicht mehr auf den Server, hilft die Konsole im IONOS Cloud Panel (Server öffnen → Konsole starten), an der du dich mit dem Root-Passwort anmeldest.

## Im Alltag

### Aktualisieren

**Server:**

```bash
bash /opt/vereinsflow/deploy/aktualisieren.sh
```

Das Skript prüft zuerst, ob es auf GitHub etwas Neues gibt (sonst passiert nichts), **sichert** dann Datenbank und Dateiablage, holt den neuen Code, baut neu (die Datenbank-Migrationen laufen vor dem Start der neuen Version) und wartet, bis `/api/health` antwortet. Während des Neustarts ist VereinsFlow etwa eine Minute nicht erreichbar – aktualisiere am besten abends oder nachts. Danach eine Stichprobe: anmelden, Dashboard und Helferplan ansehen.

- Das Skript prüft vorher `.env.production` (dieselbe Prüfung wie `server-einrichten.sh --nur-pruefen`): Ein Tippfehler, etwa im Fingerabdruck der Android-App oder in den Push-Schlüsseln, wird gemeldet, **bevor** etwas neu gestartet wird – die Anwendung würde sonst mit einer solchen Konfiguration nicht hochfahren. (`--ohne-konfigpruefung` überspringt die Prüfung, nur für den Notfall.)
- Schlägt die **Sicherung** fehl, wird das Update gar nicht erst durchgeführt.
- Antwortet die neue Version nicht, zeigt das Skript das Protokoll und was zu tun ist. Migrationen laufen nur vorwärts: Ein Zurück auf den alten Stand geht nur, solange die neue Version die Datenbank noch nicht umgebaut hat; sonst hilft die Wiederherstellung der Sicherung.
- Hat sich im Ordner `deploy/` etwas geändert (Caddyfile, Skripte), weist das Skript am Ende darauf hin, dass `server-einrichten.sh` erneut laufen soll, um es zu übernehmen – das ist gefahrlos.
- `--erzwingen` baut und startet auch ohne neuen Code (nach einer Änderung an `.env.production`).

### Server pflegen (einmal im Monat)

Sicherheitsupdates des Betriebssystems spielt der Server selbst ein. **Docker und Caddy** stammen aus eigenen Paketquellen und gehören zur monatlichen Pflege:

```bash
apt-get update && apt-get -y -o Dpkg::Options::=--force-confold upgrade   # confold: eigene Konfigurationsdateien (Caddyfile) bleiben, es kommt keine Rückfrage
ls /var/run/reboot-required 2>/dev/null && echo "Neustart nötig: reboot"
df -h /                                  # freier Speicher
```

**Basis-Images auffrischen (alle paar Monate):** Die Images für Node (Anwendung) und PostgreSQL bleiben so, wie sie beim Bauen geladen wurden; ihre Sicherheitskorrekturen kommen sonst nicht an. Das Update sichert vorher und startet danach alles neu (kurze Unterbrechung):

```bash
cd /opt/vereinsflow
docker compose -f docker-compose.prod.yml --env-file .env.production pull db
docker compose -f docker-compose.prod.yml --env-file .env.production build --pull
bash /opt/vereinsflow/deploy/aktualisieren.sh --erzwingen
```

Nach einem `reboot` starten Docker, Caddy, VereinsFlow und der Sicherungs-Timer von allein; kontrollieren mit `docker compose -f docker-compose.prod.yml --env-file .env.production ps` im Ordner `/opt/vereinsflow`. Ein zusätzlicher Überwachungsdienst (z. B. UptimeRobot oder Healthchecks), der <https://app.vereins-flow.com/api/health> regelmäßig abfragt, meldet Ausfälle, bevor Vereine sie bemerken (siehe [Überwachung](../docs/OPERATIONS.md#überwachung-und-protokolle)).

### Protokolle und Status

Alle Docker-Befehle im Ordner `/opt/vereinsflow` ausführen. Für die laufende Sitzung genügt ein Kurzbefehl:

```bash
cd /opt/vereinsflow
alias vf='docker compose -f docker-compose.prod.yml --env-file .env.production'
```

| Was                                             | Befehl                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Läuft alles?                                    | `vf ps` (die Dienste `db`, `app`, `cron` müssen „Up“ sein, `app` und `db` „healthy“)                         |
| Anwendung, live mitlesen (Strg+C beendet)       | `vf logs -f app`                                                                                             |
| Letzte Zeilen von Anwendung, Cron, Datenbank    | `vf logs --tail 100 app` · `vf logs --tail 50 cron` · `vf logs --tail 50 db`                                 |
| Caddy (HTTPS, Zertifikate)                      | `journalctl -u caddy -n 100 --no-pager`                                                                      |
| Sicherung                                       | `journalctl -u vereinsflow-sicherung -n 50 --no-pager` · `systemctl list-timers vereinsflow-sicherung.timer` |
| Einrichtung                                     | `less /var/log/vereinsflow-einrichten.log`                                                                   |
| Anwendung neu starten (ohne neue Konfiguration) | `vf restart app`                                                                                             |
| Neue `.env.production` übernehmen               | `bash /opt/vereinsflow/deploy/aktualisieren.sh --erzwingen`                                                  |
| Speicher und Datenträger                        | `free -h` · `df -h /` · `docker system df`                                                                   |

## Sicherung und Wiederherstellung

### Was gesichert wird

Das Skript `sicherung.sh` läuft **täglich gegen 03:15 Uhr Server-Zeit** (Standard ist UTC, also 05:15 Uhr im deutschen Sommer; `timedatectl` zeigt die Zeitzone) als systemd-Timer und vor jedem Update. Es legt in `/var/backups/vereinsflow` (Ordner 700, Dateien 600, nur für root) je Lauf **zwei zusammengehörige Dateien** ab:

| Datei                                            | Inhalt                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `vereinsflow-db-2026-09-30_03-15-02.dump`        | PostgreSQL-Dump (`pg_dump -Fc`), nach dem Anlegen mit `pg_restore --list` geprüft |
| `vereinsflow-dateien-2026-09-30_03-15-02.tar.gz` | Dateiablage (hochgeladene Dokumente, Logos) aus dem Volume `storage`              |

Sicherungen, die **älter als 14 Tage** sind, werden gelöscht – erst nachdem ein neuer Lauf gelungen ist. (Einstellbar; [docs/OPERATIONS.md](../docs/OPERATIONS.md#datensicherung) empfiehlt höchstens 30 Tage: Gelöschte Daten leben in Sicherungen weiter.) Nicht gesichert wird `.env.production` – sie liegt bei dir auf dem Mac (`~/VereinsFlow-Schluessel/env.production`), bewahre sie zusätzlich im Passwortmanager auf. Ohne sie lässt sich ein neuer Server nicht einrichten, und der private VAPID-Schlüssel (Push) wäre verloren.

Von Hand jederzeit: `bash /opt/vereinsflow/deploy/sicherung.sh`.

### Prüfen

```bash
cd /opt/vereinsflow
ls -lh /var/backups/vereinsflow                                   # sind die neuesten Dateien von heute?
journalctl -u vereinsflow-sicherung -n 30 --no-pager              # Meldungen des letzten Laufs (FEHLER = etwas ist schiefgegangen)
systemctl --failed                                                # steht die Sicherung dort, ist der letzte Lauf fehlgeschlagen
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db pg_restore --list < /var/backups/vereinsflow/vereinsflow-db-DATUM.dump | head
```

**Eine ungeprüfte Sicherung ist keine.** Sieh einmal pro Woche nach, ob die Dateien aktuell sind, und übe die Wiederherstellung mindestens einmal (am besten auf einem Testserver oder auf dem Mac mit Docker).

### Verschlüsseln

Die Sicherungen enthalten alle Daten im Klartext. Verschlüssele sie – besonders, wenn du Kopien anfertigst. Das geht mit [age](https://github.com/FiloSottile/age) und braucht auf dem Server **nur den öffentlichen Schlüssel**; den privaten behältst du (Mac, Passwortmanager). Ohne ihn sind die Sicherungen **unlesbar** – sichere ihn wie ein Passwort.

**Mac** – Schlüssel erzeugen:

```bash
brew install age
age-keygen -o ~/VereinsFlow-Schluessel/sicherung-age-schluessel.txt
```

`age-keygen` schreibt den privaten Schlüssel in die Datei und nennt den öffentlichen: `Public key: age1…`. Kopiere die Datei zusätzlich in den Passwortmanager.

**Server** – den öffentlichen Schlüssel eintragen:

```bash
nano /etc/vereinsflow/sicherung.conf
```

```text
SICHERUNG_AGE_EMPFAENGER="age1…dein-öffentlicher-schlüssel"
```

Die Vorlage enthält die Zeile schon, auskommentiert mit `#` am Anfang: Entferne das `#` und ersetze den Wert durch deinen öffentlichen Schlüssel (62 Zeichen, beginnt mit `age1`). Danach einmal `bash /opt/vereinsflow/deploy/sicherung.sh` – die neuen Dateien enden auf `.age`. Ältere unverschlüsselte Sicherungen löschst du von Hand, sobald die verschlüsselten da sind: `rm /var/backups/vereinsflow/vereinsflow-*.dump /var/backups/vereinsflow/vereinsflow-*.tar.gz` (die verschlüsselten enden auf `.age` und bleiben unberührt).

**Alternative Passphrase:** In `sicherung.conf` `SICHERUNG_PASSPHRASE_DATEI="/etc/vereinsflow/sicherung.passphrase"` setzen; die Datei enthält nur die Passphrase und gehört root (`chmod 600`). Die Dateien enden dann auf `.gpg`. Das schützt Kopien außerhalb des Servers, aber nicht vor jemandem, der den Server selbst übernimmt (dort liegt die Passphrase auch). Sind beide Einstellungen gesetzt, gilt age.

### Kopie außerhalb des Servers

Ohne eine Kopie an anderer Stelle ist die Sicherung bei Serverausfall oder -verlust mit weg. Zwei Wege:

**Auf den Mac holen** (Mac; einfach, kostet nichts) – am besten wöchentlich, und **nur verschlüsselte** Sicherungen:

```bash
mkdir -p ~/VereinsFlow-Sicherungen
rsync -av root@SERVER-IP:/var/backups/vereinsflow/ ~/VereinsFlow-Sicherungen/
find ~/VereinsFlow-Sicherungen -type f -name 'vereinsflow-*' -mtime +30 -delete   # älter als 30 Tage: löschen
```

**IONOS S3 Object Storage** (regelmäßig und automatisch): einen Bucket in der Region Deutschland anlegen, im Bucket eine Lebenszyklusregel „Objekte nach 30 Tagen löschen“ einrichten und die Dateien nach der Sicherung mit einem S3-Werkzeug wie `rclone` hochladen. Dieses Kit richtet das nicht ein; es ist der nächste sinnvolle Ausbau. IONOS bietet für Server außerdem Snapshots bzw. Backups an (Umfang und Preis je Tarif im Cloud Panel prüfen) – sie ersetzen die Sicherung von VereinsFlow nicht, ergänzen sie aber vor größeren Eingriffen.

Gelöschte Daten leben in jeder Kopie bis zu deren Ablauf weiter: **höchstens 30 Tage aufbewahren, verschlüsseln, wie die Live-Daten schützen** (siehe [docs/PRIVACY.md](../docs/PRIVACY.md)).

### Wiederherstellen

Nur im Ernstfall – die Schritte **ersetzen den Datenbestand** durch den der Sicherung. Daten, die seit der Sicherung dazukamen, sind danach weg. Nach einer Wiederherstellung sind bereits ausgeführte Löschanträge erneut auszuführen ([docs/OPERATIONS.md](../docs/OPERATIONS.md#datensicherung)). Nimm immer **Datenbank und Dateien desselben Laufs** (gleicher Zeitstempel im Dateinamen).

**Vorbereiten (Server):** die Anwendung anhalten, die Datenbank läuft weiter, und die Dateinamen festlegen.

```bash
cd /opt/vereinsflow
docker compose -f docker-compose.prod.yml --env-file .env.production stop app cron
DB=/var/backups/vereinsflow/vereinsflow-db-2026-09-30_03-15-02.dump
DATEIEN=/var/backups/vereinsflow/vereinsflow-dateien-2026-09-30_03-15-02.tar.gz
```

**Unverschlüsselte Sicherung einspielen:**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < "$DB"
docker run --rm -i --mount type=volume,src=vereinsflow-prod_storage,dst=/data --entrypoint tar postgres:18 \
  -xzf - --numeric-owner -C /data < "$DATEIEN"
```

`--single-transaction` bricht bei einem Fehler alles ab und lässt die Datenbank unverändert. Das Einspielen der Dateien überschreibt gleichnamige, löscht aber keine: Dateien, die nur nach der Sicherung dazukamen, bleiben liegen. Das ist harmlos – eine Datei ohne Datenbankeintrag wird nicht ausgeliefert.

**Verschlüsselte Sicherung (`.age`):** zuerst auf dem Mac entschlüsseln (der private Schlüssel gehört nicht auf den Server), dann hochladen:

```bash
scp root@SERVER-IP:/var/backups/vereinsflow/vereinsflow-db-2026-09-30_03-15-02.dump.age ~/Downloads/
age -d -i ~/VereinsFlow-Schluessel/sicherung-age-schluessel.txt -o ~/Downloads/db.dump ~/Downloads/vereinsflow-db-2026-09-30_03-15-02.dump.age
scp ~/Downloads/db.dump root@SERVER-IP:/root/db.dump
```

Entsprechend für `vereinsflow-dateien-….tar.gz.age` (Ausgabe `dateien.tar.gz`, hochladen nach `/root/dateien.tar.gz`). Auf dem Server dann `DB=/root/db.dump` und `DATEIEN=/root/dateien.tar.gz` setzen, die Befehle oben ausführen und **danach die Klartextdateien löschen** (`rm /root/db.dump /root/dateien.tar.gz`, auf dem Mac `rm ~/Downloads/db.dump ~/Downloads/dateien.tar.gz`). Bei `.gpg`-Dateien: `gpg -d datei.gpg > datei` (fragt die Passphrase).

**Wieder starten und prüfen:**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
curl -fsS http://127.0.0.1:3000/api/health
```

**Auf einem neuen Server** (Serverausfall): Schritte 1–9 wie beim ersten Mal (mit derselben `env.production` vom Mac – vor allem `APP_SECRET` und die VAPID-Schlüssel dürfen sich nicht ändern), die Sicherungsdateien von deiner Kopie auf den neuen Server kopieren, wie oben wiederherstellen, dann den DNS-Eintrag `app` auf die neue IP umstellen. Den Plattform-Administrator brauchst du nicht neu anzulegen – er kommt aus der Datenbank.

## Fehlersuche

Die Docker-Befehle im Ordner `/opt/vereinsflow` ausführen (Kurzform `vf` wie oben). Weiteres: [docs/OPERATIONS.md](../docs/OPERATIONS.md#fehlersuche).

| Symptom                                                                          | Ursache und Lösung                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Das Einrichtungsskript hält an: „Die Konfiguration ist noch nicht fertig“        | Es nennt jede Variable, die fehlt oder falsch ist (nie den Wert). `nano /opt/vereinsflow/.env.production`, korrigieren, das Skript erneut starten. Ohne Installation prüfen: `bash /opt/vereinsflow/deploy/server-einrichten.sh --nur-pruefen`                                                                                                                     |
| Browser meldet „Verbindung nicht sicher“ oder das Zertifikat fehlt               | Caddy hat noch kein Zertifikat. Meist zeigt der DNS-Eintrag noch nicht auf den Server (`dig +short app.vereins-flow.com`), oder die IONOS-Firewall lässt 80/443 nicht durch (Schritt 3). Danach `systemctl restart caddy`; Ursache: `journalctl -u caddy -n 50 --no-pager`. Auch ein CAA-Eintrag der Domain, der Let's Encrypt ausschließt, verhindert Zertifikate |
| „502 Bad Gateway“                                                                | Caddy läuft, aber die Anwendung antwortet nicht: `vf ps`, `vf logs --tail 100 app`. Während eines Updates ist das für etwa eine Minute normal                                                                                                                                                                                                                      |
| Anwendung startet immer wieder neu, Meldung „Unsichere Produktionskonfiguration“ | Das Protokoll (`vf logs --tail 50 app`) nennt jeden Punkt: Platzhalter-Geheimnis, `APP_URL` ohne `https://`, `MAIL_TRANSPORT`, ungültiger Fingerabdruck. `.env.production` korrigieren, dann `bash /opt/vereinsflow/deploy/aktualisieren.sh --erzwingen`                                                                                                           |
| Bauen bricht mit „Killed“ oder Speichermangel ab                                 | Zu wenig Arbeitsspeicher beim Build. `free -h` muss eine Swap-Zeile mit rund 4 GB zeigen (`swapon --show`); wenn nicht, `bash /opt/vereinsflow/deploy/server-einrichten.sh` erneut ausführen                                                                                                                                                                       |
| `toomanyrequests` beim Herunterladen von Images                                  | Docker Hub begrenzt anonyme Abrufe je Adresse. Einige Stunden warten oder `docker login` mit einem kostenlosen Docker-Konto, dann den Befehl wiederholen                                                                                                                                                                                                           |
| Migration scheitert mit „password authentication failed“                         | `POSTGRES_PASSWORD` wurde geändert, nachdem die Datenbank schon einmal gestartet war – es gilt nur bei der ersten Anlage. Zurück zum alten Wert. **Nur bei einer leeren Installation ohne echte Daten** geht auch `vf down -v` (löscht die Datenbank!) und ein neuer Start                                                                                         |
| Keine E-Mails (Einladung, Passwort zurücksetzen)                                 | `vf logs --tail 100 app` nach `[mail] Versand fehlgeschlagen` durchsuchen. Meist `SMTP_PASSWORD` falsch (Anführungszeichen, siehe Schritt 8) oder Postfach nicht aktiv. Mails an Vereinsmitglieder und Erinnerungen laufen über die Warteschlange, die der Cron-Dienst alle 15 Minuten leert (`vf logs --tail 50 cron`)                                            |
| Alle Anmeldungen: „zu viele Versuche“                                            | Das Rate-Limit sieht alle Anfragen als eine Adresse. `TRUST_PROXY=true` muss in `.env.production` stehen, und der Proxy muss `X-Forwarded-For` selbst setzen (das mitgelieferte Caddyfile tut das). Das Caddyfile daher nicht um `trusted_proxies` erweitern                                                                                                       |
| Upload scheitert mit 413                                                         | Datei größer als das Limit: Caddy lässt höchstens 12 MB zu, die App `MAX_UPLOAD_MB` (10). Wer `MAX_UPLOAD_MB` erhöht, muss `max_size` im Caddyfile anheben und `server-einrichten.sh` erneut ausführen                                                                                                                                                             |
| Speicher voll                                                                    | `df -h /`, `docker system df`. Das Update räumt Verwaistes selbst auf; von Hand: `docker image prune -f` und `docker builder prune -f`. Alte Sicherungen liegen in `/var/backups/vereinsflow`                                                                                                                                                                      |
| Caddy meldet „failed to sufficiently increase receive buffer size“               | Harmlos: betrifft nur die Geschwindigkeit von HTTP/3                                                                                                                                                                                                                                                                                                               |
| HTTP/3 funktioniert nicht                                                        | UDP 443 fehlt in der IONOS-Firewall (Schritt 3). Nur optional; HTTP/2 läuft trotzdem                                                                                                                                                                                                                                                                               |
| Von SSH ausgesperrt                                                              | Im IONOS Cloud Panel den Server öffnen und die Konsole starten, mit dem Root-Passwort anmelden. Die Firewall des Servers: `ufw status`                                                                                                                                                                                                                             |
| Beim ersten Lauf brach etwas ab, und im Repository liegt inzwischen ein Fix      | Solange VereinsFlow noch nie gestartet wurde, holt das Einrichtungsskript neuen Code bei jedem Lauf selbst. Lief die Datenbank schon, `cd /opt/vereinsflow && git pull` (bei einer leeren Installation ohne echte Daten gefahrlos) und das Skript erneut starten; `aktualisieren.sh` bricht ohne laufende Datenbank bei der Sicherung ab                           |
| `aktualisieren.sh` meldet „lokale Änderungen an versionierten Dateien“           | Auf dem Server wurde im Ordner `/opt/vereinsflow` etwas außer `.env.production` verändert. Ansehen mit `git status`, Verwerfen mit `git checkout -- DATEI` (Änderungen an `.env.production` sind nicht gemeint, die Datei steht nicht in Git)                                                                                                                      |
| `aktualisieren.sh` meldet „weicht davon ab“                                      | Der Stand auf dem Server ist kein Vorgänger des Stands auf GitHub (z. B. nach umgeschriebener Historie). Liegt auf dem Server nichts Eigenes: `cd /opt/vereinsflow && git fetch origin && git reset --hard origin/main`, danach `aktualisieren.sh` erneut                                                                                                          |
| Die Sicherung meldet FEHLER                                                      | `journalctl -u vereinsflow-sicherung -n 50 --no-pager` nennt den Grund (Datenbank-Container aus? Datenträger voll? Verschlüsselung falsch konfiguriert?). Danach von Hand wiederholen: `bash /opt/vereinsflow/deploy/sicherung.sh`                                                                                                                                 |

## Was das Einrichtungsskript auf dem Server verändert

Zur Nachvollziehbarkeit – alles Genannte legt `server-einrichten.sh` an (und nur das):

- **Pakete:** Updates, dazu `ca-certificates curl gnupg git ufw unattended-upgrades age`; Docker (`docker-ce`, Compose- und Buildx-Plugin) aus `download.docker.com`; Caddy aus `dl.cloudsmith.io` (jeweils die offiziellen Paketquellen und Schlüssel).
- **Dateien:** `/etc/apt/apt.conf.d/20auto-upgrades`, `/etc/apt/sources.list.d/docker.sources`, `/etc/apt/keyrings/docker.asc`, `/etc/apt/sources.list.d/caddy-stable.list`, `/etc/docker/daemon.json` (Container-Protokolle begrenzen), `/swapfile` mit Eintrag in `/etc/fstab` und `/etc/sysctl.d/99-vereinsflow.conf`, `/etc/caddy/Caddyfile` (das Original des Pakets bleibt als `Caddyfile.vor-vereinsflow`), `/etc/systemd/system/vereinsflow-sicherung.service` und `.timer`, `/etc/vereinsflow/sicherung.conf`, `/etc/vereinsflow/eingerichtet` (Marke: Ab dem zweiten Lauf spielt das Skript keine System-Updates mehr ein, sonst würde Docker mitten im Betrieb neu starten – das gehört zur monatlichen Pflege von Hand), `/var/backups/vereinsflow`, `/var/log/vereinsflow-einrichten.log`.
- **Firewall (ufw):** Standard „eingehend gesperrt“, erlaubt sind SSH (auch ein abweichender Port), 80/tcp, 443/tcp und 443/udp.
- **Nur mit Option:** `--ssh-passwort-login-aus` schreibt `/etc/ssh/sshd_config.d/00-vereinsflow.conf`, `--auto-neustart` schreibt `/etc/apt/apt.conf.d/52vereinsflow-neustart`.
- **Nicht angefasst:** die Werbe-Website `vereins-flow.com` (sie liegt beim Webspace-Anbieter), der Code auf dem Server, sobald VereinsFlow einmal gestartet wurde (Updates macht `aktualisieren.sh`; das Einrichtungsskript sagt bei einem erneuten Lauf nur, ob es Neues gibt), die Passwort-Anmeldung per SSH (ohne Option).

Alle Docker-Container binden nur an `127.0.0.1` oder gar nicht: Die Datenbank ist von außen nicht erreichbar, die Anwendung nur über Caddy. Wer später weitere Container mit `ports:` veröffentlicht, sollte wissen, dass Docker die Firewall `ufw` dabei umgeht – Ports immer als `127.0.0.1:PORT:PORT` angeben.
