# Betrieb

Anleitung, um VereinsFlow produktiv zu betreiben. Für die lokale Entwicklung genügt der [Schnellstart in der README](../README.md#schnellstart).

> **Wichtig vorab:** Das Docker-Image und `docker-compose.prod.yml` sind sorgfältig gebaut, wurden aber in der Entwicklungsumgebung
> (ohne Docker) **nicht gestartet**. Bitte führe vor dem Produktiveinsatz einmal die Schritte unter [Erste Inbetriebnahme](#erste-inbetriebnahme)
> auf einem Testserver aus. Der Produktions-Build und der Produktionsstart selbst (`next build`, `next start` mit sicherer Konfiguration) sind
> getestet.

## Bausteine

```text
Internet ──► Reverse-Proxy (TLS, Größenlimit) ──► VereinsFlow (Next.js, Port 3000) ──► PostgreSQL 18
                                                     │
                                                     ├──► Dateiablage (Verzeichnis / Volume)
                                                     └──► SMTP-Server (Einladungen, Passwort-Reset, Erinnerungen)
Cron (alle 15 Minuten) ──► POST /api/cron/run
```

- **Ein** Anwendungsprozess reicht für Vereinsgrößen bis in die Tausende Mitglieder. Mehrere Instanzen sind möglich (Sitzungen,
  Rate-Limits und Job-Sperren liegen in der Datenbank) – dann muss die **Dateiablage gemeinsam** genutzt werden (gemeinsames Volume).
- Es gibt **keinen** getrennten Worker: Hintergrundjobs starten per Cron über den HTTP-Endpunkt.

## Konfiguration

Alle Einstellungen sind Umgebungsvariablen (Vorlage: [`.env.example`](../.env.example), Produktion: [`.env.production.example`](../.env.production.example)).

| Variable                 | Pflicht     | Bedeutung                                                                                                            |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                | ja          | Öffentliche Adresse, **muss mit `https://` beginnen** (Links in Mails, Herkunftsprüfung)                             |
| `DATABASE_URL`           | ja          | PostgreSQL-Verbindung der Anwendung                                                                                  |
| `MIGRATION_DATABASE_URL` | nein        | Getrennte Verbindung für Migrationen (z. B. Besitzer-Rolle), sonst `DATABASE_URL`                                    |
| `APP_SECRET`             | ja          | Zufällig, mindestens 32 Zeichen – `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`   |
| `CRON_SECRET`            | ja          | Zufällig, mindestens 16 Zeichen – schützt den Cron-Endpunkt                                                          |
| `MAIL_TRANSPORT`         | ja          | In Produktion **`smtp`** (`log`/`file` sind nur für Entwicklung und Tests und lassen den Start scheitern)            |
| `MAIL_FROM`, `SMTP_*`    | bei `smtp`  | Absender und Zugang des Mailservers                                                                                  |
| `TRUST_PROXY`            | bei Proxy   | `true`, wenn ein vertrauenswürdiger Reverse-Proxy `X-Forwarded-For` setzt (sonst zählt das Rate-Limit falsch)        |
| `SESSION_IDLE_MINUTES`   | nein (60)   | Abmeldung nach Inaktivität                                                                                           |
| `SESSION_MAX_DAYS`       | nein (14)   | Höchstdauer einer Sitzung                                                                                            |
| `STORAGE_DIR`            | nein        | Dateiablage, **außerhalb** von `public/`; im Container `/data/storage`                                               |
| `MAX_UPLOAD_MB`          | nein (10)   | Größe je Datei                                                                                                       |
| `CLUB_STORAGE_QUOTA_MB`  | nein (1024) | Speicherplatz für Dokumente je Verein                                                                                |
| `SUPPORT_EMAIL`          | nein        | Technischer Support des Betreibers: erscheint unter „Hilfe & Support“ (für Fragen, die der Verein nicht klären kann) |

**Der Server startet nicht**, wenn `APP_SECRET`/`CRON_SECRET` noch Platzhalter (`dev-only`, `change-me`) enthalten, `APP_URL` kein `https://` hat
oder `MAIL_TRANSPORT` nicht `smtp` ist. Die Meldung im Protokoll nennt jeden Fehler. `SEED_PASSWORD` gehört **nicht** in die Produktion.

## Erste Inbetriebnahme

Mit Docker Compose (empfohlen):

1. Server mit Docker vorbereiten; **Domain** auf den Server zeigen lassen; **Reverse-Proxy** mit TLS einrichten (siehe unten).
2. Projekt auf den Server bringen, dann Konfiguration anlegen:

   ```bash
   cp .env.production.example .env.production
   # Werte eintragen: APP_URL, POSTGRES_PASSWORD, APP_SECRET, CRON_SECRET, SMTP_* – Secrets zufällig erzeugen!
   ```

3. Bauen und starten (die Migrationen laufen automatisch vor der Anwendung):

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
   docker compose -f docker-compose.prod.yml logs -f app
   ```

4. **Ersten Plattform-Administrator anlegen** (siehe [unten](#ersten-plattform-administrator-anlegen)); Demo-Daten (`db:seed`) gibt es in Produktion bewusst nicht.
5. Anmelden, in der „Systemadministration“ den ersten Verein anlegen und dessen Administrator einladen. Der Vereinsadministrator füllt Impressum
   und Datenschutzerklärung aus (Platzhalter in eckigen Klammern) und prüft die Vereinseinstellungen (Aufbewahrungsfristen!).
6. Prüfen: `https://<domain>/api/health` liefert `{"ok":true}`; eine Test-E-Mail (z. B. „Passwort vergessen“) kommt an; der Cron-Aufruf funktioniert (siehe unten).

### Ersten Plattform-Administrator anlegen

Die Anwendung ist eine **geschlossene Plattform**: Konten entstehen nur durch Einladung eines Vereins – es gibt keine offene Registrierung. Der allererste
Benutzer (Plattform-Administrator, der Vereine anlegt, aber **keine Mitgliederdaten sieht**) wird deshalb auf dem Server angelegt:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm tools \
  npm run admin:create -- --email deine@adresse.de --first-name Vorname --last-name Nachname
```

Der Befehl legt das Konto an und gibt **einmalig einen Link** aus (24 Stunden gültig), über den du dein Passwort festlegst. Der Link wird
nicht per E-Mail verschickt – so klappt der Start auch, bevor der Mailserver eingerichtet ist. Behandle die Ausgabe wie ein Passwort.
Der Befehl ist wiederholbar: Für ein bestehendes Konto erzeugt er einen neuen Link (z. B. nach vergessenem Passwort vor dem Mailversand).

## Reverse-Proxy

Die Anwendung spricht HTTP auf Port 3000 (im Compose nur an `127.0.0.1` gebunden). TLS und Größenlimits übernimmt der Proxy.

**Caddy** (holt Zertifikate selbst):

```caddyfile
verein.example.org {
    encode zstd gzip
    request_body {
        max_size 12MB          # MAX_UPLOAD_MB + Spielraum
    }
    reverse_proxy 127.0.0.1:3000
}
```

**nginx:**

```nginx
server {
    listen 443 ssl http2;
    server_name verein.example.org;
    # ssl_certificate ... (z. B. über certbot)

    client_max_body_size 12m;            # MAX_UPLOAD_MB + Spielraum, sonst scheitern Uploads mit 413
    proxy_read_timeout   60s;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $remote_addr;   # überschreibt Fremdwerte – wichtig für TRUST_PROXY=true
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

Mit `TRUST_PROXY=true` vertraut die Anwendung dem ersten Wert von `X-Forwarded-For`. Der Proxy **muss** diesen Header selbst setzen
(nicht weiterreichen), sonst kann ein Angreifer sein Rate-Limit umgehen.

## Hintergrundjobs (Cron)

Alle **15 Minuten** aufrufen (Erinnerungen, Mail-Warteschlange, Aufbewahrung, Aufräumen, Löschanträge):

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://verein.example.org/api/cron/run
```

- Im Compose übernimmt das der Dienst `cron` (`docker-compose.prod.yml`). Alternativ Crontab, `systemd`-Timer oder der Aufgabenplaner.
- Der Aufruf ist **idempotent** und durch eine Datenbank-Sperre geschützt: doppelte oder gleichzeitige Läufe schaden nicht.
- Einzelne Jobs: `?jobs=reminders,mail` (unbekannte Namen werden abgelehnt). Antwort: Zahlen und Jobnamen, nie Personendaten.
- Bleibt der Aufruf aus, passiert nichts Schlimmes, aber: keine Erinnerungen, E-Mails bleiben in der Warteschlange, Fristen werden nicht angewendet.
  Überwache den Aufruf (z. B. mit einem Dienst wie _Healthchecks_).

## Datensicherung

Gesichert werden müssen **zwei** Dinge, möglichst zeitnah zueinander:

1. **Datenbank:** täglich `pg_dump`, mindestens 7–30 Tage aufbewahren.

   ```bash
   docker compose -f docker-compose.prod.yml exec -T db pg_dump -U vereinsflow -Fc vereinsflow > sicherung-$(date +%F).dump
   ```

2. **Dateiablage** (`STORAGE_DIR`, im Compose das Volume `storage`): Volume-Snapshot oder `rsync`/`restic`.

Hinweise:

- **Sicherung wiederherstellen testen** – eine ungeprüfte Sicherung ist keine. Wiederherstellung: `pg_restore -d vereinsflow --clean --if-exists sicherung.dump`.
- Ein Datenbank-Eintrag ohne Datei führt beim Download zu „nicht gefunden“ (kein Serverfehler); eine Datei ohne Eintrag ist harmlos und wird nicht ausgeliefert.
- **Datenschutz:** Gelöschte Daten leben in Sicherungen bis zu deren Ablauf weiter. Begrenze die Aufbewahrungsdauer der Sicherungen (empfohlen ≤ 30 Tage),
  **verschlüssele** sie und schütze sie wie die Live-Daten. Nach einer Wiederherstellung sind bereits ausgeführte Löschanträge erneut auszuführen.
- Migrationen sind **nur vorwärts**. Erstelle vor jedem Update eine Sicherung; ein Rückgang auf eine ältere Version bedeutet Wiederherstellung.

## Updates

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build   # Migrationen laufen vor dem Start der neuen Version
```

Ablauf: Sicherung → Update → Log prüfen → Stichprobe (Anmelden, Dashboard, Helferplan). Die CI führt bei jeder Änderung Typprüfung,
Lint, alle Tests und den Produktions-Build aus; halte dich an getaggte, grüne Stände. Halte Betriebssystem, Docker, PostgreSQL (Nebenversionen) und
Node-Abhängigkeiten (`npm audit`) aktuell.

## Überwachung und Protokolle

- Die Anwendung schreibt nach **stdout/stderr** (Docker: `docker compose logs`). Fehler enthalten den Fehlertyp, nie Personendaten oder Geheimnisse.
- `GET /api/health` prüft Anwendung und Datenbankverbindung (Antwort ohne Details) – für Docker-`HEALTHCHECK`, Proxy und Überwachung.
- Beobachtenswert: Anteil 5xx-Antworten, Zeitpunkt des letzten Cron-Laufs, freier Speicher (Datenbank und Dateiablage), Größe der Mail-Warteschlange
  (Benachrichtigungen mit E-Mail-Status `PENDING`/`FAILED`).
- Hinweis zum Virenscan: Ist kein Scanner registriert, steht beim ersten Upload eine Warnung im Protokoll (siehe [SECURITY.md](SECURITY.md#uploads)).

## Härtung des Servers (Empfehlung)

- Datenbank nicht ins Netz veröffentlichen (im Compose gibt es keinen veröffentlichten Port); eigene Datenbank-Rolle mit minimalen Rechten für die Laufzeit
  (`DATABASE_URL`), Besitzer-Rolle nur für Migrationen (`MIGRATION_DATABASE_URL`).
- Festplattenverschlüsselung, automatische Sicherheitsupdates, Firewall (nur 80/443 offen), SSH nur mit Schlüssel.
- Dateiablage nicht für andere Dienste lesbar; Container läuft als unprivilegierter Benutzer (im Dockerfile so gebaut).

## Fehlersuche

| Symptom                                                    | Ursache / Lösung                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Server startet nicht: „Unsichere Produktionskonfiguration“ | Die Meldung nennt jeden Punkt (Platzhalter-Secret, `http://`, `MAIL_TRANSPORT`). Werte in `.env.production` korrigieren    |
| Upload scheitert mit 413                                   | Proxy-Limit (`client_max_body_size` / `max_size`) kleiner als `MAX_UPLOAD_MB`                                              |
| Alle Anmeldungen „zu viele Versuche“                       | `TRUST_PROXY` fehlt: alle Anfragen erscheinen als eine IP. `TRUST_PROXY=true` setzen (Proxy muss `X-Forwarded-For` setzen) |
| Keine E-Mails / Erinnerungen                               | Cron läuft nicht? `MAIL_TRANSPORT=smtp` und `SMTP_*` korrekt? Benachrichtigungen mit `emailStatus=FAILED` prüfen           |
| Sonderzeichen „→“, „Ş“ kaputt (nur Windows-Entwicklung)    | Datenbank nicht in UTF-8 angelegt – siehe [ADR-0008](adr/0008-utf8-ueberall.md)                                            |
| `EPERM`/Symlink-Fehler beim Docker-Build unter Windows     | Standalone-Build braucht Symlink-Rechte; im Container (Linux) tritt das nicht auf                                          |
