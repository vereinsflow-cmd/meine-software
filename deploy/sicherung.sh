#!/usr/bin/env bash
# VereinsFlow – Datensicherung: Datenbank (pg_dump) und Dateiablage (Volume "storage").
#
#   /opt/vereinsflow/deploy/sicherung.sh          (als root)
#
# Läuft täglich per systemd-Timer (vereinsflow-sicherung.timer, eingerichtet von server-einrichten.sh) und wird von
# aktualisieren.sh vor jedem Update aufgerufen. Von Hand jederzeit möglich.
#
# Ergebnis in /var/backups/vereinsflow (Ordner 700, Dateien 600, nur für root lesbar) – je Lauf zwei zusammengehörige Dateien:
#   vereinsflow-db-2026-09-30_03-15-02.dump           PostgreSQL-Dump (pg_dump -Fc, mit pg_restore einspielbar)
#   vereinsflow-dateien-2026-09-30_03-15-02.tar.gz    Dateiablage (hochgeladene Dokumente und Logos)
# Mit Verschlüsselung tragen sie zusätzlich die Endung .age bzw. .gpg. Der Dump wird nach dem Anlegen mit pg_restore --list
# geprüft. Sicherungen, die älter als 14 Tage sind, werden gelöscht – aber erst, nachdem der neue Lauf erfolgreich war.
# docs/OPERATIONS.md: höchstens 30 Tage aufbewahren (gelöschte Daten leben in Sicherungen weiter), verschlüsseln, wie Live-Daten schützen.
#
# Einstellungen (alle optional) in /etc/vereinsflow/sicherung.conf – die Vorlage legt server-einrichten.sh an:
#   SICHERUNG_ZIEL=/var/backups/vereinsflow    Zielordner
#   SICHERUNG_TAGE=14                          Aufbewahrung in Tagen (ganze Zahl, mindestens 1)
#   SICHERUNG_AGE_EMPFAENGER="age1..."         Verschlüsselung mit age (empfohlen): NUR der öffentliche Schlüssel liegt auf dem Server,
#                                              entschlüsseln kann nur, wer den privaten hat (z. B. dein Mac). Mehrere: durch Leerzeichen.
#   SICHERUNG_PASSPHRASE_DATEI=/pfad/datei     Alternative: Verschlüsselung mit einer Passphrase (gpg, AES-256); die Datei enthält nur
#                                              die Passphrase, gehört root und ist nicht für andere lesbar (chmod 600). Ist beides
#                                              gesetzt, gilt age. Ohne beides bleiben die Sicherungen unverschlüsselt (Warnung im Protokoll).
#   Entschlüsseln und Wiederherstellen: deploy/README.md, Abschnitt „Sicherung“.
#
# WICHTIG: Diese Sicherungen liegen auf DEMSELBEN Server wie die Daten. Fällt der Server aus oder wird er gelöscht, sind sie mit weg.
# Eine Kopie AUSSERHALB des Servers bleibt nötig (z. B. IONOS S3 Object Storage oder regelmäßig auf den eigenen Mac – siehe
# deploy/README.md). Die Kopie gehört verschlüsselt und darf nicht länger als 30 Tage aufbewahrt werden.
#
# Für Tests überschreibbar: VF_PROJEKT_DIR (Ordner mit docker-compose.prod.yml), VF_SICHERUNG_KONFIG, VF_SPERRDATEI.
set -euo pipefail
umask 077
export LC_ALL=C.UTF-8

SKRIPT=$(readlink -f "${BASH_SOURCE[0]}")
PROJEKT_DIR=${VF_PROJEKT_DIR:-$(dirname "$(dirname "$SKRIPT")")}
KONFIG=${VF_SICHERUNG_KONFIG:-/etc/vereinsflow/sicherung.conf}
SPERRDATEI=${VF_SPERRDATEI:-/run/lock/vereinsflow.lock}

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }
fehler() {
  printf '%s  FEHLER: %s\n' "$(date '+%F %T')" "$*" >&2
  exit 1
}

# Docker Compose mit der Produktionsdatei und der Konfiguration – wie in docs/OPERATIONS.md.
compose() { docker compose -f docker-compose.prod.yml --env-file .env.production "$@"; }

[ "$(id -u)" -eq 0 ] || fehler "Bitte als root ausführen (sudo bash $SKRIPT)."

# --- Einstellungen ------------------------------------------------------------------------------------------------------
if [ -f "$KONFIG" ]; then
  # Die Datei wird als Shell-Skript gelesen, deshalb nur, wenn sie root gehört und sonst niemand sie ändern darf.
  [ "$(stat -c '%u' "$KONFIG")" = 0 ] && [ $((8#$(stat -c '%a' "$KONFIG") & 8#022)) -eq 0 ] ||
    fehler "$KONFIG muss root gehören und darf für andere nicht schreibbar sein (chown root:root, chmod 600)."
  # shellcheck source=/dev/null
  . "$KONFIG"
fi
ZIEL=${SICHERUNG_ZIEL:-/var/backups/vereinsflow}
TAGE=${SICHERUNG_TAGE:-14}
AGE_EMPFAENGER=${SICHERUNG_AGE_EMPFAENGER:-}
PASSPHRASE_DATEI=${SICHERUNG_PASSPHRASE_DATEI:-}

[[ $TAGE =~ ^[1-9][0-9]*$ ]] || fehler "SICHERUNG_TAGE muss eine ganze Zahl ab 1 sein (aktuell: $TAGE)."
case $ZIEL in /?*) ;; *) fehler "SICHERUNG_ZIEL muss ein absoluter Pfad sein (aktuell: $ZIEL)." ;; esac

MODUS=klartext
ENDUNG=
AGE_ARGUMENTE=()
if [ -n "$AGE_EMPFAENGER" ]; then
  command -v age >/dev/null || fehler "SICHERUNG_AGE_EMPFAENGER ist gesetzt, aber age fehlt (apt-get install age)."
  for empfaenger in $AGE_EMPFAENGER; do
    [[ $empfaenger =~ ^age1[0-9a-z]{58}$ ]] ||
      fehler "SICHERUNG_AGE_EMPFAENGER: '$empfaenger' ist kein age-Schlüssel (öffentlicher Schlüssel: 62 Zeichen, beginnt mit age1)."
    AGE_ARGUMENTE+=(-r "$empfaenger")
  done
  MODUS=age
  ENDUNG=.age
elif [ -n "$PASSPHRASE_DATEI" ]; then
  command -v gpg >/dev/null || fehler "SICHERUNG_PASSPHRASE_DATEI ist gesetzt, aber gpg fehlt (apt-get install gnupg)."
  [ -s "$PASSPHRASE_DATEI" ] || fehler "Passphrase-Datei fehlt oder ist leer: $PASSPHRASE_DATEI"
  [ "$(stat -c '%u' "$PASSPHRASE_DATEI")" = 0 ] && [ $((8#$(stat -c '%a' "$PASSPHRASE_DATEI") & 8#077)) -eq 0 ] ||
    fehler "$PASSPHRASE_DATEI muss root gehören und darf für andere nicht lesbar sein (chown root:root, chmod 600)."
  MODUS=gpg
  ENDUNG=.gpg
fi

# --- Voraussetzungen ----------------------------------------------------------------------------------------------------
command -v docker >/dev/null || fehler "Docker ist nicht installiert."
[ -f "$PROJEKT_DIR/docker-compose.prod.yml" ] || fehler "docker-compose.prod.yml nicht gefunden in $PROJEKT_DIR."
[ -f "$PROJEKT_DIR/.env.production" ] || fehler ".env.production nicht gefunden in $PROJEKT_DIR."
cd "$PROJEKT_DIR"

# Nur ein Lauf gleichzeitig (Sicherung, Update). aktualisieren.sh hält die Sperre selbst und ruft dieses Skript dann mit
# VF_SPERRE_GEHALTEN=1 auf.
if [ -z "${VF_SPERRE_GEHALTEN:-}" ]; then
  mkdir -p "$(dirname "$SPERRDATEI")"
  exec 9>"$SPERRDATEI"
  flock -w 900 9 || fehler "Ein anderer Lauf (Update oder Sicherung) blockiert seit 15 Minuten. Läuft noch etwas? (ps aux | grep -E 'sicherung|aktualisieren')"
fi

DB_CONTAINER=$(compose ps -q db 2>/dev/null | head -n 1 || true)
[ -n "$DB_CONTAINER" ] && [ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || true)" = true ] ||
  fehler "Der Datenbank-Container läuft nicht. Prüfen: cd $PROJEKT_DIR && docker compose -f docker-compose.prod.yml --env-file .env.production ps"

# Das Volume "storage" gehört zum selben Compose-Projekt wie die Datenbank (Bezeichnungen setzt Docker Compose).
PROJEKT_NAME=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$DB_CONTAINER")
SPEICHER_VOLUME=$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJEKT_NAME" --filter "label=com.docker.compose.volume=storage" | head -n 1 || true)
[ -n "$SPEICHER_VOLUME" ] || fehler "Das Volume 'storage' des Projekts $PROJEKT_NAME wurde nicht gefunden (docker volume ls)."
# Ein Hilfs-Container mit demselben Image wie die Datenbank (Debian mit tar) liest das Volume nur lesend; so hängt die Sicherung
# weder von Pfaden auf dem Host noch vom Zustand der Anwendung ab.
HILFS_IMAGE=$(docker inspect -f '{{.Config.Image}}' "$DB_CONTAINER")

# --- Vorbereitung -------------------------------------------------------------------------------------------------------
install -d -m 700 "$ZIEL"
# Überbleibsel eines abgebrochenen Laufs (z. B. Stromausfall) aufräumen; ein laufender Lauf ist nie älter als ein paar Stunden.
find "$ZIEL" -maxdepth 1 -type d -name '.laeuft-*' -mmin +1440 -exec rm -rf {} + 2>/dev/null || true
STEMPEL=$(date +%Y-%m-%d_%H-%M-%S)
ARBEIT="$ZIEL/.laeuft-$STEMPEL-$$"
mkdir -m 700 "$ARBEIT"
cleanup() {
  # gpg startet ggf. einen Agenten im temporären Ordner – vor dem Löschen beenden.
  if [ -d "$ARBEIT/gnupg" ]; then GNUPGHOME="$ARBEIT/gnupg" gpgconf --kill gpg-agent >/dev/null 2>&1 || true; fi
  rm -rf "$ARBEIT"
}
trap cleanup EXIT
trap 'exit 1' INT TERM HUP

# Liest von stdin, schreibt (je nach Einstellung verschlüsselt) nach stdout.
verschluesseln() {
  case $MODUS in
    age) age "${AGE_ARGUMENTE[@]}" ;;
    # Dateideskriptor 9 (Sperre) für gpg schließen, damit ein Agent im Hintergrund sie nicht festhält.
    gpg)
      install -d -m 700 "$ARBEIT/gnupg"
      GNUPGHOME="$ARBEIT/gnupg" gpg --batch --yes --quiet --no-tty --pinentry-mode loopback --no-symkey-cache \
        --passphrase-file "$PASSPHRASE_DATEI" --symmetric --cipher-algo AES256 --compress-algo none 9>&-
      ;;
    *) cat ;;
  esac
}

log "Sicherung beginnt (Projekt $PROJEKT_NAME, Ziel $ZIEL, Verschlüsselung: $MODUS)."
[ "$MODUS" != klartext ] || log "WARNUNG: Die Sicherung wird NICHT verschlüsselt (Einstellung in $KONFIG, siehe deploy/README.md)."

# --- 1. Datenbank -------------------------------------------------------------------------------------------------------
# Benutzer und Datenbankname stammen aus der Umgebung des Datenbank-Containers (docker-compose.prod.yml), nicht von hier.
# shellcheck disable=SC2016  # $POSTGRES_USER und $POSTGRES_DB sollen erst im Container ersetzt werden
compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' >"$ARBEIT/db.roh" ||
  fehler "pg_dump ist fehlgeschlagen."
[ -s "$ARBEIT/db.roh" ] || fehler "Der Datenbank-Dump ist leer."
# Lesbarkeit prüfen: Das Inhaltsverzeichnis des Dumps muss sich mit pg_restore auflisten lassen.
INHALT=$(compose exec -T db pg_restore --list <"$ARBEIT/db.roh") || fehler "Der Datenbank-Dump ist nicht lesbar (pg_restore --list)."
[[ $INHALT == *'Archive created at'* ]] || fehler "Der Datenbank-Dump ist unvollständig (pg_restore --list ohne Kopfzeile)."
verschluesseln <"$ARBEIT/db.roh" >"$ARBEIT/db.fertig" || fehler "Verschlüsseln des Datenbank-Dumps ist fehlgeschlagen."
[ -s "$ARBEIT/db.fertig" ] || fehler "Die Datei mit dem Datenbank-Dump ist leer."
DB_DATEI="vereinsflow-db-$STEMPEL.dump$ENDUNG"
mv "$ARBEIT/db.fertig" "$ZIEL/$DB_DATEI"
chmod 600 "$ZIEL/$DB_DATEI"
rm -f "$ARBEIT/db.roh"
log "Datenbank gesichert: $DB_DATEI ($(du -h "$ZIEL/$DB_DATEI" | cut -f1))"

# --- 2. Dateiablage -----------------------------------------------------------------------------------------------------
# tar läuft im Hilfs-Container und schreibt das Archiv nach stdout. Dateien, die sich währenddessen ändern, sind kein Fehler.
docker run --rm --network none --mount "type=volume,src=$SPEICHER_VOLUME,dst=/data,readonly" --entrypoint tar "$HILFS_IMAGE" \
  --numeric-owner --warning=no-file-changed -C /data -czf - . |
  verschluesseln >"$ARBEIT/dateien.fertig" ||
  fehler "Die Dateiablage konnte nicht gesichert werden (tar). Die Datenbank-Sicherung $DB_DATEI ist vorhanden, der Lauf ist aber UNVOLLSTÄNDIG."
[ -s "$ARBEIT/dateien.fertig" ] || fehler "Das Archiv der Dateiablage ist leer. Der Lauf ist UNVOLLSTÄNDIG (nur $DB_DATEI vorhanden)."
if [ "$MODUS" = klartext ]; then
  gzip -t "$ARBEIT/dateien.fertig" || fehler "Das Archiv der Dateiablage ist beschädigt. Der Lauf ist UNVOLLSTÄNDIG (nur $DB_DATEI vorhanden)."
fi
DATEIEN_DATEI="vereinsflow-dateien-$STEMPEL.tar.gz$ENDUNG"
mv "$ARBEIT/dateien.fertig" "$ZIEL/$DATEIEN_DATEI"
chmod 600 "$ZIEL/$DATEIEN_DATEI"
log "Dateiablage gesichert: $DATEIEN_DATEI ($(du -h "$ZIEL/$DATEIEN_DATEI" | cut -f1))"

# --- 3. Alte Sicherungen löschen (erst jetzt, nach einem erfolgreichen Lauf) ---------------------------------------------
GELOESCHT=$(find "$ZIEL" -maxdepth 1 -type f \( -name 'vereinsflow-db-*' -o -name 'vereinsflow-dateien-*' \) \
  -mmin +$((TAGE * 24 * 60)) -print -delete) || log "WARNUNG: Alte Sicherungen konnten nicht gelöscht werden."
if [ -n "$GELOESCHT" ]; then
  while IFS= read -r alt; do
    log "Alte Sicherung gelöscht: $(basename "$alt")"
  done <<<"$GELOESCHT"
fi

ANZAHL=$(find "$ZIEL" -maxdepth 1 -type f -name 'vereinsflow-db-*' | wc -l)
FREI=$(df -h --output=avail "$ZIEL" | tail -n 1 | tr -d ' ')
log "Fertig. Vorhanden: $ANZAHL Datenbank-Sicherung(en) der letzten $TAGE Tage in $ZIEL, frei auf dem Datenträger: $FREI."
if [ -t 1 ]; then
  echo
  echo "Hinweis: Diese Sicherungen liegen auf demselben Server wie die Daten. Eine Kopie außerhalb des Servers bleibt nötig"
  echo "(verschlüsselt, höchstens 30 Tage aufbewahrt) – siehe deploy/README.md, Abschnitt 'Sicherung'."
fi
