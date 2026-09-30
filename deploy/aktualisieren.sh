#!/usr/bin/env bash
# VereinsFlow – Update: Sicherung, neuen Stand holen, neu bauen und starten, Gesundheit prüfen.
#
#   bash /opt/vereinsflow/deploy/aktualisieren.sh [--erzwingen] [--ohne-konfigpruefung]
#
#   --erzwingen            auch dann bauen und starten, wenn es keinen neuen Stand gibt (z. B. nach einer Änderung an
#                          .env.production; der Neustart ist nötig, weil "docker compose restart" die Konfiguration nicht neu liest)
#   --ohne-konfigpruefung  überspringt die Prüfung von .env.production (nur im Notfall, falls sie fälschlich meckert)
#   --hilfe                diese Hilfe
#
# Ablauf – bei jedem Fehler bricht das Skript ab und macht nicht einfach weiter:
#   1. Prüfen, ob es auf GitHub einen neuen Stand gibt, und die Konfiguration .env.production prüfen (dieselbe Prüfung wie
#      "server-einrichten.sh --nur-pruefen"). So legt ein Tippfehler – etwa im Fingerabdruck der Android-App – die Anwendung
#      beim Neustart nicht lahm. Noch wird nichts verändert.
#   2. Sicherung (deploy/sicherung.sh). Ohne erfolgreiche Sicherung gibt es kein Update: Migrationen laufen nur vorwärts, ein
#      Rückgang auf eine ältere Version bedeutet Wiederherstellung (docs/OPERATIONS.md, Abschnitt „Updates“).
#   3. Code aktualisieren (git, nur vorwärts).
#   4. docker compose up -d --build. Die Migrationen laufen vor dem Start der neuen Version.
#   5. Warten, bis /api/health antwortet; sonst das Anwendungsprotokoll zeigen und sagen, was zu tun ist.
# Während des Neustarts (etwa eine Minute) ist VereinsFlow nicht erreichbar – am besten abends oder nachts aktualisieren.
#
# Branch: der, auf dem der Server steht (Standard: main). VF_BRANCH überschreibt ihn.
# Hat sich etwas im Ordner deploy/ geändert (Caddyfile, Skripte), sagt das Skript am Ende, dass server-einrichten.sh erneut
# laufen soll – das Skript ist dafür gedacht und gefahrlos wiederholbar.
#
# Für Tests überschreibbar: VF_PROJEKT_DIR, VF_BRANCH, VF_HEALTH_URL (Standard http://127.0.0.1:3000/api/health),
# VF_HEALTH_TIMEOUT (Sekunden, Standard 240), VF_SPERRDATEI.
set -euo pipefail
export LC_ALL=C.UTF-8

SKRIPT=$(readlink -f "${BASH_SOURCE[0]}")
PROJEKT_DIR=${VF_PROJEKT_DIR:-$(dirname "$(dirname "$SKRIPT")")}
HEALTH_URL=${VF_HEALTH_URL:-http://127.0.0.1:3000/api/health}
HEALTH_TIMEOUT=${VF_HEALTH_TIMEOUT:-240}
SPERRDATEI=${VF_SPERRDATEI:-/run/lock/vereinsflow.lock}

info() { printf '\n==> %s\n' "$*"; }
fehler() {
  printf '\nFEHLER: %s\n' "$*" >&2
  exit 1
}

# Docker Compose mit der Produktionsdatei und der Konfiguration – wie in docs/OPERATIONS.md.
compose() { docker compose -f docker-compose.prod.yml --env-file .env.production "$@"; }

ERZWINGEN=0
KONFIG_PRUEFEN=1
for argument in "$@"; do
  case $argument in
    --erzwingen) ERZWINGEN=1 ;;
    --ohne-konfigpruefung) KONFIG_PRUEFEN=0 ;;
    -h | --hilfe | --help)
      sed -n '2,/^set -euo/p' "$SKRIPT" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) fehler "Unbekannte Option: $argument (erlaubt: --erzwingen, --ohne-konfigpruefung, --hilfe)" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || fehler "Bitte als root ausführen (sudo bash $SKRIPT)."
for programm in docker git curl flock; do
  command -v "$programm" >/dev/null || fehler "'$programm' fehlt. Zuerst deploy/server-einrichten.sh ausführen."
done
[ -f "$PROJEKT_DIR/docker-compose.prod.yml" ] || fehler "docker-compose.prod.yml nicht gefunden in $PROJEKT_DIR."
[ -f "$PROJEKT_DIR/.env.production" ] || fehler ".env.production nicht gefunden in $PROJEKT_DIR."
cd "$PROJEKT_DIR"

# Nur ein Lauf gleichzeitig (Sicherung, Update). Die Sicherung, die dieses Skript startet, bekommt die Sperre weitergereicht.
mkdir -p "$(dirname "$SPERRDATEI")"
exec 9>"$SPERRDATEI"
if ! flock -n 9; then
  echo "Ein anderer Lauf (Sicherung oder Update) ist gerade aktiv – ich warte bis zu 10 Minuten."
  flock -w 600 9 || fehler "Der andere Lauf ist auch nach 10 Minuten nicht fertig. Läuft noch etwas? (ps aux | grep -E 'sicherung|aktualisieren')"
fi
export VF_SPERRE_GEHALTEN=1

# --- 1. Gibt es etwas Neues? --------------------------------------------------------------------------------------------
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fehler "$PROJEKT_DIR ist kein Git-Ordner. Der Code muss mit git clone auf den Server gekommen sein."
[ -z "$(git status --porcelain --untracked-files=no)" ] ||
  fehler "Im Ordner gibt es lokale Änderungen an versionierten Dateien (git status). Das Update würde daran scheitern. Auf dem Server gehört nur .env.production angepasst, sonst nichts."
BRANCH=${VF_BRANCH:-$(git symbolic-ref --short -q HEAD || true)}
[ -n "$BRANCH" ] || fehler "Es ist kein Branch ausgecheckt (git status). Zurück auf den Hauptzweig: git checkout main"

ALT=$(git rev-parse HEAD)
info "Suche einen neuen Stand auf GitHub (Branch $BRANCH) …"
git fetch --quiet origin "$BRANCH" || fehler "git fetch ist fehlgeschlagen (Netzwerk? GitHub erreichbar?)."
NEU=$(git rev-parse FETCH_HEAD)

if [ "$ALT" = "$NEU" ] && [ "$ERZWINGEN" -eq 0 ]; then
  echo "Bereits aktuell: $(git log -1 --format='%h  %s' HEAD)"
  echo "Nur die Konfiguration (.env.production) übernehmen oder neu bauen: bash $SKRIPT --erzwingen"
  exit 0
fi
if [ "$ALT" != "$NEU" ]; then
  git merge-base --is-ancestor "$ALT" "$NEU" ||
    fehler "Der Stand auf dem Server ist nicht nur älter als der auf GitHub, sondern weicht davon ab (git log). Abbruch, es wurde nichts verändert."
  echo "Neu seit dem letzten Stand ($(git rev-list --count "$ALT..$NEU") Änderung(en)):"
  git log --format='  %h  %s' "$ALT..$NEU" | head -n 15
fi

# Konfiguration prüfen, bevor etwas verändert wird. Die Prüfung ist die des Einrichtungsskripts; Warnungen zeigt sie, hält aber nur bei Fehlern an.
if [ "$KONFIG_PRUEFEN" -eq 1 ]; then
  info "Prüfe die Konfiguration (.env.production) …"
  if ! PRUEFUNG=$(VF_DIR="$PROJEKT_DIR" bash "$PROJEKT_DIR/deploy/server-einrichten.sh" --nur-pruefen 2>&1); then
    printf '%s\n' "$PRUEFUNG" >&2
    fehler "Die Konfiguration ist nicht in Ordnung – das Update wurde NICHT durchgeführt (es wurde nichts verändert). Erst .env.production korrigieren."
  fi
  if [[ $PRUEFUNG == *WARNUNG:* ]]; then grep 'WARNUNG:' <<<"$PRUEFUNG" || true; else echo "Konfiguration in Ordnung."; fi
fi

# Der Build braucht einige Gigabyte (Abhängigkeiten, Zwischenschichten, zwei Images).
FREI_MB=$(df -Pm /var/lib/docker 2>/dev/null | awk 'NR==2 {print $4}' || true)
[ -n "$FREI_MB" ] || FREI_MB=$(df -Pm / | awk 'NR==2 {print $4}')
[ "$FREI_MB" -ge 4096 ] ||
  fehler "Zu wenig freier Speicherplatz für den Build (frei: $FREI_MB MB, nötig: etwa 4 GB). Aufräumen: docker system df, docker image prune -f"

# --- 2. Sicherung ---------------------------------------------------------------------------------------------------------
info "Sicherung vor dem Update …"
SICHERUNG_LOG=$(mktemp)
trap 'rm -f "$SICHERUNG_LOG"' EXIT
bash "$PROJEKT_DIR/deploy/sicherung.sh" 2>&1 | tee "$SICHERUNG_LOG" ||
  fehler "Die Sicherung ist fehlgeschlagen – das Update wurde NICHT durchgeführt (es wurde nichts verändert)."
DB_SICHERUNG=$(sed -n 's/.*Datenbank gesichert: \([^ ]*\) .*/\1/p' "$SICHERUNG_LOG" | tail -n 1)

# --- 3. Code aktualisieren -------------------------------------------------------------------------------------------------
if [ "$ALT" != "$NEU" ]; then
  info "Aktualisiere den Code …"
  git merge --ff-only --quiet "$NEU" || fehler "git merge (nur vorwärts) ist fehlgeschlagen. Der Code auf dem Server ist unverändert."
  DEPLOY_GEAENDERT=$(git diff --name-only "$ALT" "$NEU" -- deploy | wc -l)
else
  DEPLOY_GEAENDERT=0
fi

# --- 4. Bauen und starten ---------------------------------------------------------------------------------------------------
info "Baue und starte VereinsFlow (das dauert einige Minuten; die Datenbank-Migrationen laufen vor dem Start) …"
if ! compose up -d --build --remove-orphans; then
  echo
  echo "--- Protokoll der Migration (letzte Zeilen) ---"
  compose logs --tail 40 migrate 2>&1 || true
  fehler "Bauen oder Starten ist fehlgeschlagen (Meldungen oben). Sicherung von vorhin: ${DB_SICHERUNG:-siehe Ausgabe oben}. Alter Stand: $ALT"
fi

# --- 5. Gesundheit prüfen ---------------------------------------------------------------------------------------------------
neustarts_von() {
  local id
  id=$(compose ps -a -q app 2>/dev/null | head -n 1 || true)
  [ -n "$id" ] && docker inspect -f '{{.RestartCount}}' "$id" 2>/dev/null || echo 0
}
info "Warte auf die Anwendung ($HEALTH_URL, höchstens $HEALTH_TIMEOUT s) …"
START_NEUSTARTS=$(neustarts_von)
ende=$((SECONDS + HEALTH_TIMEOUT))
GESUND=0
while [ "$SECONDS" -lt "$ende" ]; do
  antwort=$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)
  if [[ $antwort == *'"ok":true'* ]]; then
    GESUND=1
    break
  fi
  # Startet die Anwendung immer wieder neu, ist meist die Konfiguration schuld – nicht bis zum Ende warten.
  if [ $(($(neustarts_von) - START_NEUSTARTS)) -ge 3 ]; then break; fi
  sleep 3
done

if [ "$GESUND" -ne 1 ]; then
  echo
  echo "--- Anwendungsprotokoll (letzte Zeilen) ---"
  compose logs --tail 40 app 2>&1 || true
  {
    echo
    echo "FEHLER: Die neue Version antwortet nicht auf $HEALTH_URL."
    echo
    echo "Was jetzt?"
    echo "  1. Die Meldung im Protokoll oben lesen (später: docker compose -f docker-compose.prod.yml --env-file .env.production logs -f app)."
    echo "     Häufigste Ursache ist die Konfiguration (Meldung 'Unsichere Produktionskonfiguration'): .env.production korrigieren, dann"
    echo "       bash $SKRIPT --erzwingen"
    if [ "$ALT" != "$NEU" ]; then
      echo "  2. Zurück zum alten Stand geht nur, solange die neue Version die Datenbank noch nicht umgebaut hat:"
      echo "       git checkout $ALT && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build"
      echo "     (danach wieder: git checkout $BRANCH). Migrationen laufen nur vorwärts – hat die neue Version die Datenbank schon"
      echo "     verändert, hilft nur die Wiederherstellung der Sicherung ${DB_SICHERUNG:-vom Beginn dieses Updates} (deploy/README.md,"
      echo "     Abschnitt 'Sicherung')."
    fi
  } >&2
  exit 1
fi

# --- Aufräumen und Ergebnis ---------------------------------------------------------------------------------------------------
# Jeder Build lässt verwaiste Images und Zwischenschichten zurück (das Werkzeug-Image ist über 2 GB groß). Nur Unbenutztes wird entfernt.
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -f --filter until=336h >/dev/null 2>&1 || true

echo
echo "=================================================================="
if [ "$ALT" != "$NEU" ]; then
  echo " Aktualisiert: $(git log -1 --format='%h' "$ALT") -> $(git log -1 --format='%h  %s' HEAD)   (Branch $BRANCH)"
else
  echo " Neu gebaut und gestartet (Stand $(git log -1 --format='%h  %s' HEAD), Branch $BRANCH)"
fi
echo " Anwendung: gesund ($HEALTH_URL)"
echo " Sicherung vom Beginn: ${DB_SICHERUNG:-(siehe Ausgabe oben)}"
echo "=================================================================="
echo
compose ps
if [ "$DEPLOY_GEAENDERT" -gt 0 ]; then
  echo
  echo "Hinweis: Im Ordner deploy/ hat sich etwas geändert (Caddyfile, Skripte). Übernimm es auf den Server mit:"
  echo "  bash $PROJEKT_DIR/deploy/server-einrichten.sh"
fi
echo
echo "Stichprobe: Im Browser anmelden, Dashboard und Helferplan ansehen."
