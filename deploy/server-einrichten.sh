#!/usr/bin/env bash
# VereinsFlow – Server einrichten: Ubuntu 24.04 LTS, als root. Idempotent – kann gefahrlos erneut ausgeführt werden.
#
#   bash /opt/vereinsflow/deploy/server-einrichten.sh [Optionen]
#
# Voraussetzungen (Schritt für Schritt: deploy/README.md):
#   - Der DNS-A-Eintrag von app.vereins-flow.com zeigt auf diesen Server.
#   - Die fertig ausgefüllte Konfiguration liegt unter /opt/vereinsflow/.env.production (per scp vom Mac kopiert; SMTP_PASSWORD gesetzt).
#
# Was das Skript tut (jeder Schritt prüft zuerst, ob er schon erledigt ist):
#    1. Konfiguration prüfen: Fehlt .env.production, enthält sie noch Platzhalter („change-me“) oder ist SMTP_PASSWORD leer, hält
#       das Skript an und sagt, was zu tun ist. Außerdem: Zeigt der DNS-Eintrag auf diesen Server?
#    2. System aktualisieren (apt update, dist-upgrade) und Grundwerkzeuge installieren (curl, git, gnupg, age, ufw). Die
#       System-Updates gibt es nur beim ersten Lauf: Ein erneuter Lauf würde sonst auch Docker mitten im Betrieb neu starten.
#    3. Automatische Sicherheitsupdates (unattended-upgrades).
#    4. Swap-Datei anlegen, falls keine vorhanden ist (4 GB Arbeitsspeicher reichen für „next build“ im Docker-Build nicht sicher).
#    5. Firewall (ufw): nur SSH, 80/tcp, 443/tcp und 443/udp (HTTP/3) sind offen.
#    6. Docker Engine und Compose-Plugin aus Dockers offizieller apt-Quelle.
#    7. Caddy (Reverse-Proxy mit automatischem HTTPS) aus Caddys offizieller apt-Quelle.
#    8. SSH: Nur mit --ssh-passwort-login-aus wird die Passwort-Anmeldung abgeschaltet (sonst gibt es am Ende nur eine Empfehlung).
#    9. Code holen: VereinsFlow aus dem Git-Repository nach /opt/vereinsflow. Ist der Ordner schon ein Repository, wird der Code nur
#       aktualisiert, solange VereinsFlow noch nie gestartet wurde (kein Datenbank-Volume); danach macht das aktualisieren.sh
#       (es sichert vorher) und dieses Skript nennt nur, ob es Neues gibt.
#   10. Caddyfile (deploy/Caddyfile) nach /etc/caddy/Caddyfile kopieren, prüfen und laden.
#   11. VereinsFlow bauen und starten (docker compose up -d --build) und warten, bis /api/health antwortet.
#   12. Tägliche Datensicherung einrichten (systemd-Timer, deploy/sicherung.sh) und einmal ausprobieren.
#   13. Abschlussprüfung über HTTPS und Zusammenfassung mit den nächsten Schritten.
#
# Optionen:
#   --nur-pruefen              Nur Schritt 1 (Konfiguration und DNS prüfen); es wird nichts installiert.
#   --ssh-passwort-login-aus   SSH-Anmeldung nur noch mit Schlüssel. Wirkt nur, wenn /root/.ssh/authorized_keys einen Schlüssel
#                              enthält. VORHER in einem zweiten Terminal prüfen, dass die Anmeldung mit dem Schlüssel klappt!
#   --auto-neustart            Der Server startet nach Sicherheitsupdates, die einen Neustart brauchen, nachts um 04:30 Uhr
#                              (Server-Zeit) selbst neu. Docker, Caddy und VereinsFlow starten von allein wieder (kurze Unterbrechung).
#   --hilfe                    Diese Hilfe.
#
# Umgebungsvariablen (alle optional):
#   VF_REPO_URL   Git-Adresse (Standard: https://github.com/vereinsflow-cmd/meine-software.git)
#   VF_BRANCH     Branch beim ersten Holen des Codes (Standard: main)
#   VF_DIR        Installationsordner (Standard: /opt/vereinsflow)
#   VF_SWAP_MB    Größe der Swap-Datei in MB (Standard: 4096; 0 = keine anlegen)
#   Nur für Tests: VF_HEALTH_URL, VF_HEALTH_TIMEOUT, VF_LOGDATEI, VF_SPERRDATEI.
#
# Das Protokoll steht zusätzlich in /var/log/vereinsflow-einrichten.log. Das Skript läuft auch weiter, wenn die SSH-Verbindung
# abbricht: Mit „tail -f /var/log/vereinsflow-einrichten.log“ zuschauen und es danach erneut starten, um das Ergebnis zu sehen.
set -Eeuo pipefail
export LC_ALL=C.UTF-8
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_SUSPEND=1
export UCF_FORCE_CONFFOLD=1

SKRIPT=$(readlink -f "${BASH_SOURCE[0]}")
REPO_URL=${VF_REPO_URL:-https://github.com/vereinsflow-cmd/meine-software.git}
BRANCH=${VF_BRANCH:-main}
DIR=${VF_DIR:-/opt/vereinsflow}
# Muss zum Caddyfile (deploy/Caddyfile) und zu APP_URL in .env.production passen.
DOMAIN=app.vereins-flow.com
SWAP_MB=${VF_SWAP_MB:-4096}
HEALTH_URL=${VF_HEALTH_URL:-http://127.0.0.1:3000/api/health}
HEALTH_TIMEOUT=${VF_HEALTH_TIMEOUT:-300}
LOGDATEI=${VF_LOGDATEI:-/var/log/vereinsflow-einrichten.log}
SPERRDATEI=${VF_SPERRDATEI:-/run/lock/vereinsflow.lock}
ENV_DATEI="$DIR/.env.production"
# Wird am Ende eines erfolgreichen Laufs angelegt; ab dann spielt ein erneuter Lauf keine System-Updates mehr ein.
MARKE=/etc/vereinsflow/eingerichtet

NUR_PRUEFEN=0
SSH_HAERTEN=0
AUTO_NEUSTART=0
SCHRITT=0
SCHRITTE=13
WARNUNGEN=()
MAIN_PID=
IP_ANZEIGE=
KONFIG_OK=1
DNS_OK=0
HTTPS_OK=0

# --- Kleine Helfer ---------------------------------------------------------------------------------------------------------
schritt() {
  SCHRITT=$((SCHRITT + 1))
  printf '\n[%d/%d] %s\n' "$SCHRITT" "$SCHRITTE" "$*"
}
info() { printf '      %s\n' "$*"; }
warnung() {
  WARNUNGEN+=("$*")
  printf '      WARNUNG: %s\n' "$*"
}
abbruch() {
  printf '\nABBRUCH: %s\n' "$*" >&2
  exit 1
}
# Bei einem unerwarteten Fehler (set -e) sagen, wo er auftrat und dass ein erneuter Start gefahrlos ist.
bei_fehler() {
  local zeile=$1 befehl=$2
  # Nur im Hauptprozess melden, nicht zusätzlich in jeder Unterschale.
  [ "$BASHPID" = "$MAIN_PID" ] || return 0
  printf '\nABBRUCH: Unerwarteter Fehler in Zeile %s (Befehl: %s).\n' "$zeile" "$befehl" >&2
  printf 'Die Meldung davor nennt meist die Ursache. Das Skript ist wiederholbar: Problem beheben und es erneut starten.\n' >&2
  printf 'Protokoll: %s\n' "$LOGDATEI" >&2
}
trap 'bei_fehler "$LINENO" "$BASH_COMMAND"' ERR

apt_get() {
  apt-get -o DPkg::Lock::Timeout=300 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold -y -q "$@"
}
hat_systemd() { [ -d /run/systemd/system ]; }
# Docker Compose mit der Produktionsdatei und der Konfiguration – wie in docs/OPERATIONS.md.
compose() { docker compose -f docker-compose.prod.yml --env-file .env.production "$@"; }
# Wert aus /etc/os-release (ohne die Datei einzulesen), z. B. os_wert VERSION_ID.
os_wert() { sed -n "s/^$1=//p" /etc/os-release | tr -d '"' | head -n 1; }
# Öffentliche IPv4-Adresse dieses Servers (bei IONOS liegt sie direkt auf der Netzwerkschnittstelle).
server_ip() {
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }'
}
# Schreibt stdin nach $1 (Rechte $2, Standard 644). Rückgabe 0 = Inhalt geändert, 1 = war schon so (deshalb nur in if/|| verwenden).
schreibe_datei() {
  local ziel=$1 modus=${2:-644} tmp
  tmp=$(mktemp "$ziel.XXXXXX")
  cat >"$tmp"
  if [ -f "$ziel" ] && cmp -s "$tmp" "$ziel"; then
    rm -f "$tmp"
    return 1
  fi
  chmod "$modus" "$tmp"
  mv "$tmp" "$ziel"
}
hilfe() {
  # Der Kopfkommentar dieser Datei ist die Hilfe.
  sed -n '2,/^set -Eeuo/p' "$SKRIPT" | sed '$d' | sed 's/^# \{0,1\}//'
}

# --- Konfiguration (.env.production) lesen und prüfen ------------------------------------------------------------------------
# Die Datei wird nie als Shell-Skript ausgeführt, und ihre Werte werden nie ausgegeben – nur die Namen der Variablen.

# Roher Wert (alles hinter dem Gleichheitszeichen) der letzten Zuweisung von $1; Kommentarzeilen zählen nicht.
env_zeile() {
  awk -v key="$1" '
    { sub(/\r$/, "") }
    /^[ \t]*#/ { next }
    {
      z = $0
      sub(/^[ \t]*(export[ \t]+)?/, "", z)
      if (index(z, key "=") == 1) { w = substr(z, length(key) + 2); g = 1 }
    }
    END { if (g) print w }
  ' "$ENV_DATEI"
}
# Wert ohne umschließende Anführungszeichen und ohne nachgestellten Kommentar.
env_wert() {
  local w
  w=$(env_zeile "$1")
  w=${w#"${w%%[![:space:]]*}"}
  case $w in
    \"*)
      w=${w#\"}
      w=${w%%\"*}
      ;;
    \'*)
      w=${w#\'}
      w=${w%%\'*}
      ;;
    *) w=${w%%[[:space:]]#*} ;;
  esac
  w=${w%"${w##*[![:space:]]}"}
  printf '%s' "$w"
}

# Setzt KONFIG_OK=0 und erklärt, was fehlt. Ändert nichts außer den Rechten der Datei (nur root darf sie lesen).
pruefe_konfiguration() {
  local probleme=() wert roh name platzhalter host smtp_user position falsche rest eintrag vapid_angaben
  KONFIG_OK=1

  if [ ! -f "$ENV_DATEI" ]; then
    KONFIG_OK=0
    {
      echo
      echo "Die Konfigurationsdatei fehlt: $ENV_DATEI"
      echo
      echo "Kopiere sie von deinem Mac auf den Server. Der Befehl gehört in ein Terminal auf dem MAC (nicht hierher):"
      echo
      echo "    scp ~/VereinsFlow-Schluessel/env.production root@${IP_ANZEIGE:-DEINE-SERVER-IP}:$ENV_DATEI"
      echo
      echo "Danach denselben Befehl erneut ausführen."
    } >&2
    return 0
  fi
  chown root:root "$ENV_DATEI"
  chmod 600 "$ENV_DATEI"

  # Platzhalter der Vorlage. Kommentarzeilen zählen nicht (die Vorlage erwähnt „change-me“ selbst).
  platzhalter=$(awk '
    /^[ \t]*#/ { next }
    /change-me/ { z = $0; sub(/^[ \t]*(export[ \t]+)?/, "", z); n = index(z, "="); print (n > 0 ? substr(z, 1, n - 1) : "(Zeile ohne Namen)") }
  ' "$ENV_DATEI" | sort -u | tr '\n' ' ')
  [ -z "${platzhalter// /}" ] || probleme+=("Es stehen noch Platzhalter ('change-me') in: ${platzhalter% }")

  for name in POSTGRES_PASSWORD APP_SECRET CRON_SECRET APP_URL MAIL_FROM SMTP_HOST SMTP_USER SMTP_PASSWORD; do
    roh=$(env_zeile "$name")
    roh=${roh#"${roh%%[![:space:]]*}"}
    if [ -z "$(env_wert "$name")" ]; then
      probleme+=("$name ist leer oder fehlt.")
    elif [[ $roh == '#'* ]]; then
      # Docker Compose liest „NAME=   # Hinweis“ als Wert „# Hinweis“, nicht als leeren Wert mit Kommentar.
      probleme+=("$name ist leer oder fehlt (hinter dem Gleichheitszeichen steht nur ein Kommentar, und den würde Docker Compose als Wert lesen).")
    fi
  done

  [ "$(env_wert MAIL_TRANSPORT)" = smtp ] || probleme+=("MAIL_TRANSPORT muss smtp sein (in Produktion startet der Server sonst nicht).")

  wert=$(env_wert APP_SECRET)
  [ -z "$wert" ] || [ "${#wert}" -ge 32 ] || probleme+=("APP_SECRET ist zu kurz (mindestens 32 Zeichen).")
  wert=$(env_wert CRON_SECRET)
  [ -z "$wert" ] || [ "${#wert}" -ge 16 ] || probleme+=("CRON_SECRET ist zu kurz (mindestens 16 Zeichen).")

  wert=$(env_wert APP_URL)
  if [ -n "$wert" ]; then
    case $wert in
      https://*)
        host=${wert#https://}
        host=${host%%[/:]*}
        [ "$host" = "$DOMAIN" ] ||
          probleme+=("APP_URL zeigt auf '$host', das mitgelieferte Caddyfile bedient aber $DOMAIN. Beides muss zusammenpassen.")
        ;;
      *) probleme+=("APP_URL muss mit https:// beginnen.") ;;
    esac
  fi

  # Docker Compose setzt das Datenbank-Passwort in eine Adresse ein (postgresql://benutzer:PASSWORT@db/…). Diese Zeichen brechen sie
  # oder das Einlesen der Datei (Node, Prisma, Compose getestet); alles andere geht.
  wert=$(env_wert POSTGRES_PASSWORD)
  case $wert in
    *[/?#%\\\$\'\"\`[:space:]]* | *'['* | *']'*)
      probleme+=("POSTGRES_PASSWORD enthält Zeichen, die in der Datenbank-Adresse oder beim Einlesen der Datei Fehler auslösen (nicht erlaubt: / ? # % [ ] Rückwärtsschrägstrich \$ ' \" Gravis und Leerzeichen). Neu erzeugen mit: openssl rand -hex 24 – möglich nur, solange die Datenbank noch nie gestartet wurde.")
      ;;
  esac

  # Ohne einfache Anführungszeichen liest Docker Compose ein $ im Passwort als Variable und verstümmelt es.
  roh=$(env_zeile SMTP_PASSWORD)
  roh=${roh#"${roh%%[![:space:]]*}"}
  if [[ $roh != \'* && $roh == *'$'* ]]; then
    probleme+=("SMTP_PASSWORD enthält ein Dollarzeichen, steht aber nicht in einfachen Anführungszeichen. Schreibe: SMTP_PASSWORD='dein-passwort'")
  fi

  # Hinter Caddy sieht die Anwendung sonst alle Besucher als eine Adresse: Das Rate-Limit sperrt dann schnell alle aus.
  [ "$(env_wert TRUST_PROXY)" = true ] ||
    probleme+=("TRUST_PROXY muss true sein: Hinter Caddy sähen sonst alle Besucher für das Rate-Limit wie eine einzige Adresse aus.")

  # Ab hier Regeln, die auch die Anwendung beim Start prüft (src/server/env.ts): Bei einem Fehler startet sie nicht. Nennen
  # darf das Skript nur die Stelle, nie den Wert.
  wert=$(env_wert ANDROID_APP_PACKAGE)
  if [ -n "$wert" ] && [[ ! $wert =~ ^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$ ]]; then
    probleme+=("ANDROID_APP_PACKAGE ist kein Paketname (z. B. com.vereinsflow.app).")
  fi
  wert=$(env_wert ANDROID_APP_CERT_SHA256)
  if [ -n "$wert" ]; then
    position=0
    falsche=""
    # Wie die Anwendung an den Kommas trennen (auch ein leerer Eintrag, etwa nach einem Komma am Ende, zählt und ist ungültig).
    rest="$wert,"
    while [ -n "$rest" ]; do
      eintrag=${rest%%,*}
      rest=${rest#*,}
      position=$((position + 1))
      eintrag=${eintrag#"${eintrag%%[![:space:]]*}"}
      eintrag=${eintrag%"${eintrag##*[![:space:]]}"}
      [[ ${eintrag^^} =~ ^[0-9A-F]{2}(:[0-9A-F]{2}){31}$ ]] || falsche="$falsche $position"
    done
    [ -z "$falsche" ] ||
      probleme+=("ANDROID_APP_CERT_SHA256: Eintrag${falsche} ist kein SHA-256-Fingerabdruck (32 Hex-Paare mit Doppelpunkten, z. B. AB:12:…; mehrere durch Kommas getrennt).")
  fi
  wert=$(env_wert SUPPORT_EMAIL)
  if [ -n "$wert" ] && [[ ! $wert =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
    probleme+=("SUPPORT_EMAIL ist keine E-Mail-Adresse.")
  fi
  vapid_angaben=0
  for name in VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT; do
    if [ -n "$(env_wert "$name")" ]; then vapid_angaben=$((vapid_angaben + 1)); fi
  done
  if [ "$vapid_angaben" -gt 0 ]; then
    [ "$vapid_angaben" -eq 3 ] ||
      probleme+=("Web-Push braucht VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY und VAPID_SUBJECT gemeinsam – oder keine der drei.")
    wert=$(env_wert VAPID_PUBLIC_KEY)
    if [ -n "$wert" ] && [[ ! $wert =~ ^[A-Za-z0-9_-]{87}$ ]]; then probleme+=("VAPID_PUBLIC_KEY ist kein gültiger öffentlicher Schlüssel."); fi
    wert=$(env_wert VAPID_PRIVATE_KEY)
    if [ -n "$wert" ] && [[ ! $wert =~ ^[A-Za-z0-9_-]{43}$ ]]; then probleme+=("VAPID_PRIVATE_KEY ist kein gültiger privater Schlüssel."); fi
    wert=$(env_wert VAPID_SUBJECT)
    if [ -n "$wert" ] && [[ ! $wert =~ ^(mailto:[^[:space:]@]+@[^[:space:]@]+|https://[^[:space:]]+)$ ]]; then
      probleme+=("VAPID_SUBJECT muss mailto:name@beispiel.de oder eine https://-Adresse sein.")
    fi
  fi

  # Caddy lässt Anfragen nur bis 12 MB durch (deploy/Caddyfile, request_body). Die Anwendung erlaubt MAX_UPLOAD_MB plus 256 KB.
  wert=$(env_wert MAX_UPLOAD_MB)
  if [[ $wert =~ ^[0-9]+$ ]] && [ "$wert" -gt 11 ]; then
    warnung "MAX_UPLOAD_MB ist $wert: Caddy lässt aber höchstens 12 MB je Anfrage zu (deploy/Caddyfile, max_size). Größere Uploads scheitern mit 413 – max_size dort anheben."
  fi

  if [ "${#probleme[@]}" -gt 0 ]; then
    KONFIG_OK=0
    smtp_user=$(env_wert SMTP_USER)
    {
      echo
      echo "Die Konfiguration ist noch nicht fertig ($ENV_DATEI):"
      for wert in "${probleme[@]}"; do echo "  - $wert"; done
      echo
      case " ${probleme[*]} " in
        *"SMTP_PASSWORD ist leer"*)
          echo "SMTP_PASSWORD eintragen: das Passwort des E-Mail-Postfachs${smtp_user:+ $smtp_user} (das Postfach legst du bei IONOS an)."
          echo "Die Datei öffnest du mit:  nano $ENV_DATEI"
          echo "Suche die Zeile SMTP_PASSWORD= und schreibe das Passwort in einfachen Anführungszeichen dahinter, zum Beispiel"
          echo "    SMTP_PASSWORD='mein-passwort'"
          echo "Speichern: Strg+O, dann Enter. Beenden: Strg+X."
          echo
          ;;
      esac
      echo "Danach denselben Befehl erneut ausführen. Es wurde nichts installiert oder verändert."
    } >&2
  fi
}

# Warnt, wenn der DNS-Eintrag nicht auf diesen Server zeigt (ohne ihn bekommt Caddy kein Zertifikat).
pruefe_dns() {
  local dns_ip eigene_ip
  dns_ip=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR == 1 { print $1 }' || true)
  eigene_ip=$(server_ip || true)
  if [ -z "$dns_ip" ]; then
    warnung "Für $DOMAIN gibt es (noch) keinen DNS-Eintrag. Lege bei IONOS einen A-Eintrag 'app' mit der Adresse ${eigene_ip:-dieses Servers} an. Bis er wirkt, bekommt Caddy kein Zertifikat – danach genügt: systemctl restart caddy"
  elif [ -n "$eigene_ip" ] && [ "$dns_ip" != "$eigene_ip" ]; then
    case $eigene_ip in
      10.* | 192.168.* | 172.1[6-9].* | 172.2[0-9].* | 172.3[01].*)
        info "DNS: $DOMAIN zeigt auf $dns_ip (dieser Server hat die interne Adresse $eigene_ip, ein Vergleich ist nicht möglich)."
        ;;
      *)
        warnung "$DOMAIN zeigt auf $dns_ip, dieser Server hat aber die Adresse $eigene_ip. Prüfe den A-Eintrag bei IONOS oder warte, bis er überall gilt. Bis dahin bekommt Caddy kein Zertifikat – danach genügt: systemctl restart caddy"
        ;;
    esac
  else
    DNS_OK=1
    info "DNS in Ordnung: $DOMAIN zeigt auf $dns_ip."
  fi
}

# --- Schritte --------------------------------------------------------------------------------------------------------------------
voraussetzungen_pruefen() {
  [ "$(id -u)" -eq 0 ] || abbruch "Dieses Skript muss als root laufen (als root anmelden oder: sudo bash $SKRIPT)."
  [ -r /etc/os-release ] || abbruch "/etc/os-release fehlt – das ist kein Ubuntu."
  [ "$(os_wert ID)" = ubuntu ] ||
    abbruch "Dieses Skript ist für Ubuntu geschrieben (gefunden: $(os_wert PRETTY_NAME)). Bestelle den Server mit Ubuntu 24.04."
  if [ "$(os_wert VERSION_ID)" != 24.04 ]; then
    warnung "Getestet ist Ubuntu 24.04, dieser Server hat $(os_wert VERSION_ID). Es geht weiter, aber ohne Gewähr."
  fi
  info "System: $(os_wert PRETTY_NAME), $(dpkg --print-architecture), $(awk '/MemTotal/ { printf "%.1f GB Arbeitsspeicher", $2 / 1048576 }' /proc/meminfo)"

  # Der Ordner wird früh angelegt, damit „scp … root@…:$ENV_DATEI“ auch vor dem ersten Holen des Codes klappt.
  mkdir -p "$DIR"
  IP_ANZEIGE=$(server_ip || true)
  pruefe_konfiguration
  [ "$KONFIG_OK" -eq 1 ] || exit 1
  info "Konfiguration: vollständig (ihre Werte zeigt das Skript nie an)."
  pruefe_dns
}

system_aktualisieren() {
  apt_get update
  if [ -e "$MARKE" ]; then
    info "System-Updates werden bei einem erneuten Lauf nicht eingespielt (sonst würde Docker mitten im Betrieb neu starten)."
    info "Einmal im Monat von Hand: apt-get update && apt-get upgrade – siehe deploy/README.md, 'Server pflegen'."
  else
    apt_get dist-upgrade
  fi
  apt_get install --no-upgrade ca-certificates curl gnupg git ufw unattended-upgrades
  # age (Verschlüsselung der Sicherungen) liegt in "universe"; fehlt es, ist das kein Grund zum Abbrechen.
  apt_get install --no-upgrade age || warnung "age konnte nicht installiert werden – Sicherungen lassen sich dann nur mit einer gpg-Passphrase verschlüsseln."
  if [ -f /var/run/reboot-required ]; then
    warnung "Ein Neustart des Servers ist nötig, damit Systemupdates (z. B. ein neuer Kernel) wirksam werden. Am Ende des Skripts: reboot"
  fi
}

automatische_updates() {
  if schreibe_datei /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'; then
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
    info "Automatische Sicherheitsupdates eingeschaltet."
  else
    info "Automatische Sicherheitsupdates waren schon eingeschaltet."
  fi
  if [ "$AUTO_NEUSTART" -eq 1 ]; then
    schreibe_datei /etc/apt/apt.conf.d/52vereinsflow-neustart <<'EOF' || true
// VereinsFlow (server-einrichten.sh --auto-neustart): nach Sicherheitsupdates, die einen Neustart brauchen, nachts neu starten.
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF
    info "Automatischer Neustart nachts um 04:30 Uhr (Server-Zeit), aber nur, wenn ein Update ihn braucht."
  else
    info "Kein automatischer Neustart (Option --auto-neustart). Nach Kernel-Updates meldet der Server beim Anmelden 'System restart required' – dann: reboot"
  fi
}

# Legt die Swap-Datei $1 mit der Methode $2 (fallocate oder dd) an und schaltet sie ein.
swap_anlegen() {
  local datei=$1
  rm -f "$datei"
  case $2 in
    fallocate) fallocate -l "${SWAP_MB}M" "$datei" 2>/dev/null ;;
    dd) dd if=/dev/zero of="$datei" bs=1M count="$SWAP_MB" status=none ;;
  esac || return 1
  chmod 600 "$datei" && mkswap "$datei" >/dev/null && swapon "$datei"
}
swap_einrichten() {
  local datei=/swapfile frei_mb
  if [ "$SWAP_MB" -le 0 ]; then
    info "Swap: übersprungen (VF_SWAP_MB=0)."
    return 0
  fi
  if [ -n "$(swapon --show --noheadings 2>/dev/null)" ]; then
    info "Swap ist schon aktiv: $(swapon --show --noheadings | awk '{ printf "%s (%s)  ", $1, $3 }')"
    return 0
  fi
  if [ -e "$datei" ]; then
    warnung "$datei existiert, ist aber nicht aktiv – ich fasse sie nicht an. Prüfen: ls -l $datei; swapon --show"
    return 0
  fi
  frei_mb=$(df -Pm / | awk 'NR == 2 { print $4 }')
  if [ "$frei_mb" -lt $((SWAP_MB + 4096)) ]; then
    warnung "Zu wenig freier Platz für eine Swap-Datei von $SWAP_MB MB (frei: $frei_mb MB). Der Build kann bei knappem Arbeitsspeicher scheitern."
    return 0
  fi
  info "Lege $datei mit $SWAP_MB MB an …"
  # fallocate ist schnell, erzeugt aber auf manchen Dateisystemen eine unbrauchbare Datei – dann der Umweg über dd.
  if ! swap_anlegen "$datei" fallocate && ! { swapoff "$datei" 2>/dev/null; swap_anlegen "$datei" dd; }; then
    swapoff "$datei" 2>/dev/null || true
    rm -f "$datei"
    warnung "Die Swap-Datei ließ sich nicht einschalten (auf manchen virtuellen Servern nicht erlaubt). Der Build kann bei knappem Arbeitsspeicher scheitern."
    return 0
  fi
  grep -qsF "$datei" /etc/fstab || echo "$datei none swap sw 0 0" >>/etc/fstab
  # Swap nur bei echtem Speichermangel nutzen (Ubuntus Standard wäre 60).
  if schreibe_datei /etc/sysctl.d/99-vereinsflow.conf <<'EOF'; then
# VereinsFlow: Swap nur bei echtem Speichermangel verwenden.
vm.swappiness = 10
EOF
    sysctl -q -w vm.swappiness=10 2>/dev/null || true
  fi
  info "Swap aktiv: $(swapon --show --noheadings | awk '{ printf "%s (%s)", $1, $3 }')"
}

firewall_einrichten() {
  local ssh_frei=0 port
  ufw default deny incoming || return 1
  ufw default allow outgoing || return 1
  if ufw app info OpenSSH >/dev/null 2>&1; then
    ufw allow OpenSSH && ssh_frei=1
  else
    ufw allow 22/tcp && ssh_frei=1
  fi
  # Läuft SSH auf einem anderen Port (oder wurde diese Sitzung über einen anderen aufgebaut), diesen ebenfalls offenhalten –
  # sonst sperrt man sich mit dem Einschalten der Firewall aus.
  for port in $({
    if command -v sshd >/dev/null; then sshd -T 2>/dev/null | awk '$1 == "port" { print $2 }'; fi
    awk '{ print $4 }' <<<"${SSH_CONNECTION:-}"
  } | sort -un); do
    if [[ $port =~ ^[0-9]+$ ]] && [ "$port" != 22 ]; then
      ufw allow "$port/tcp" && ssh_frei=1
      info "SSH-Port $port ebenfalls freigegeben."
    fi
  done
  if [ "$ssh_frei" -ne 1 ]; then
    info "Es ist keine SSH-Freigabe eingetragen – die Firewall wird deshalb NICHT eingeschaltet."
    return 1
  fi
  ufw allow 80/tcp || return 1
  ufw allow 443/tcp || return 1
  ufw allow 443/udp || return 1
  ufw --force enable || return 1
  ufw status | sed 's/^/      /'
}

docker_installieren() {
  local konflikte=() paket codename
  if dpkg -s docker-ce >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    info "Docker ist schon installiert: $(docker --version)"
  else
    # Nach Dockers Anleitung zuerst entfernen: inoffizielle und konkurrierende Pakete.
    for paket in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
      if dpkg -s "$paket" >/dev/null 2>&1; then konflikte+=("$paket"); fi
    done
    if [ "${#konflikte[@]}" -gt 0 ]; then
      info "Entferne konkurrierende Pakete: ${konflikte[*]}"
      apt_get remove "${konflikte[@]}"
    fi
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL --retry 3 https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    codename=$(os_wert UBUNTU_CODENAME)
    [ -n "$codename" ] || codename=$(os_wert VERSION_CODENAME)
    # Quelle im deb822-Format, wie es Dockers Anleitung für Ubuntu beschreibt.
    schreibe_datei /etc/apt/sources.list.d/docker.sources <<EOF || true
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $codename
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
    apt_get update
    # Container-Protokolle drehen: Standardmäßig wachsen sie ohne Grenze (Treiber „local“: höchstens 5 Dateien à 20 MB je Container).
    # Nur bei der Erstinstallation und nur, wenn es noch keine eigene Einstellung gibt.
    mkdir -p /etc/docker
    if [ ! -e /etc/docker/daemon.json ]; then
      schreibe_datei /etc/docker/daemon.json <<'EOF' || true
{
  "log-driver": "local"
}
EOF
    fi
    apt_get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    info "Docker installiert: $(docker --version)"
  fi
  if hat_systemd; then
    systemctl enable --now docker containerd >/dev/null 2>&1 || warnung "Der Docker-Dienst ließ sich nicht starten (systemctl status docker)."
  else
    warnung "systemd läuft hier nicht – der Docker-Dienst wird nicht aktiviert (auf einem echten Server kommt das nicht vor)."
  fi
  docker compose version | sed 's/^/      /'
}

caddy_installieren() {
  local tmp
  if dpkg -s caddy >/dev/null 2>&1; then
    info "Caddy ist schon installiert: $(caddy version | cut -d' ' -f1)"
  else
    # Die Schritte der offiziellen Anleitung (caddyserver.com/docs/install, „Debian, Ubuntu, Raspbian“).
    tmp=$(mktemp)
    curl -fsSL --retry 3 https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o "$tmp"
    gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg "$tmp"
    curl -fsSL --retry 3 https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o "$tmp"
    cat "$tmp" >/etc/apt/sources.list.d/caddy-stable.list
    rm -f "$tmp"
    chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
    apt_get update
    apt_get install caddy
    info "Caddy installiert: $(caddy version | cut -d' ' -f1)"
  fi
  if hat_systemd; then
    systemctl enable caddy >/dev/null 2>&1 || true
  fi
}

ssh_absichern() {
  local schluessel=/root/.ssh/authorized_keys datei=/etc/ssh/sshd_config.d/00-vereinsflow.conf effektiv
  if [ "$SSH_HAERTEN" -ne 1 ]; then
    info "SSH bleibt unverändert. Empfehlung nach dem ersten Erfolg: Option --ssh-passwort-login-aus (siehe Zusammenfassung)."
    return 0
  fi
  if ! grep -Eqv '^[[:space:]]*(#|$)' "$schluessel" 2>/dev/null; then
    warnung "Die SSH-Passwort-Anmeldung bleibt an: In $schluessel steht kein Schlüssel, du würdest dich aussperren."
    return 0
  fi
  if ! command -v sshd >/dev/null; then
    warnung "sshd nicht gefunden – SSH-Einstellung übersprungen."
    return 0
  fi
  # Die erste Angabe gewinnt, und Dateien aus sshd_config.d werden alphabetisch gelesen: „00-“ schlägt z. B. 50-cloud-init.conf.
  schreibe_datei "$datei" <<'EOF' || true
# VereinsFlow (deploy/server-einrichten.sh --ssh-passwort-login-aus): Anmeldung nur mit SSH-Schlüssel.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  effektiv=$(sshd -T 2>/dev/null || true)
  if ! sshd -t 2>/dev/null || ! grep -qx 'passwordauthentication no' <<<"$effektiv"; then
    rm -f "$datei"
    warnung "Die SSH-Einstellung ließ sich nicht wirksam setzen (sshd -t, sshd -T) und wurde zurückgenommen."
    return 0
  fi
  if hat_systemd; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || warnung "sshd ließ sich nicht neu laden: systemctl reload ssh"
  fi
  info "Die SSH-Passwort-Anmeldung ist jetzt AUS. Prüfe in einem NEUEN Terminal, dass die Anmeldung mit deinem Schlüssel klappt, bevor du dieses Fenster schließt."
}

# Wurde VereinsFlow schon einmal gestartet? Dann existiert das Datenbank-Volume des Compose-Projekts (möglicherweise mit echten Daten).
bereits_gestartet() {
  [ -n "$(docker volume ls -q --filter label=com.docker.compose.volume=db-data 2>/dev/null | head -n 1)" ]
}

code_holen() {
  local zweig neu
  if [ -d "$DIR/.git" ]; then
    # Rechteänderungen (chmod +x) sollen das Update später nicht als "lokale Änderung" ablehnen.
    git -C "$DIR" config core.fileMode false
    zweig=$(git -C "$DIR" symbolic-ref --short -q HEAD || true)
    info "Der Code ist schon da: $(git -C "$DIR" log -1 --format='%h  %s' 2>/dev/null || echo unbekannt) (Branch ${zweig:-ohne})."
    if [ -z "$zweig" ] || ! git -C "$DIR" fetch -q origin "$zweig" 2>/dev/null; then
      warnung "Ob es neuen Code gibt, ließ sich nicht prüfen (kein Branch ausgecheckt oder GitHub nicht erreichbar). Der Code bleibt, wie er ist."
      return 0
    fi
    neu=$(git -C "$DIR" rev-list --count HEAD..FETCH_HEAD 2>/dev/null || echo 0)
    if [ "$neu" -eq 0 ]; then
      info "Der Stand entspricht GitHub."
    elif bereits_gestartet; then
      info "Auf GitHub gibt es $neu neue Änderung(en). VereinsFlow lief schon, deshalb wird der Code hier nicht verändert:"
      info "Übernehmen mit  bash $DIR/deploy/aktualisieren.sh  (es sichert vorher)."
    elif git -C "$DIR" merge --ff-only -q FETCH_HEAD 2>/dev/null; then
      info "VereinsFlow wurde noch nie gestartet – der Code ist auf den neuesten Stand gebracht: $(git -C "$DIR" log -1 --format='%h  %s')"
    else
      warnung "Es gibt neuen Code auf GitHub, er ließ sich aber nicht übernehmen (lokale Änderungen?). Prüfen: git -C $DIR status"
    fi
    return 0
  fi
  info "Hole den Code aus $REPO_URL (Branch $BRANCH) nach $DIR …"
  # Der Ordner kann schon .env.production enthalten (per scp hochgeladen) – dann ginge "git clone" nicht.
  git init -q "$DIR"
  git -C "$DIR" config core.fileMode false
  git -C "$DIR" remote add origin "$REPO_URL" 2>/dev/null || git -C "$DIR" remote set-url origin "$REPO_URL"
  git -C "$DIR" fetch -q origin "$BRANCH" ||
    abbruch "git fetch ist fehlgeschlagen (Netzwerk? Gibt es den Branch '$BRANCH'? Adresse: $REPO_URL)."
  git -C "$DIR" checkout -q -B "$BRANCH" "origin/$BRANCH" ||
    abbruch "Der Code ließ sich nicht auschecken. Liegen fremde Dateien in $DIR? Nur .env.production darf dort schon liegen."
  info "Stand: $(git -C "$DIR" log -1 --format='%h  %s')"
}

caddy_konfigurieren() {
  local quelle="$DIR/deploy/Caddyfile" ziel=/etc/caddy/Caddyfile geaendert=0 meldung
  [ -f "$quelle" ] || abbruch "$quelle fehlt – ist der Code vollständig? (git -C $DIR status)"
  # Erst prüfen, damit eine fehlerhafte Datei die laufende Konfiguration nie ersetzt. Der Benutzer caddy prüft, damit keine
  # Dateien mit root als Besitzer in seinem Ordner entstehen.
  meldung=$(mktemp)
  if id caddy >/dev/null 2>&1; then
    runuser -u caddy -- caddy validate --config "$quelle" --adapter caddyfile >/dev/null 2>"$meldung" || {
      tail -n 15 "$meldung" >&2
      rm -f "$meldung"
      abbruch "Das Caddyfile ist ungültig (Meldung oben)."
    }
  else
    caddy validate --config "$quelle" --adapter caddyfile >/dev/null 2>"$meldung" || {
      tail -n 15 "$meldung" >&2
      rm -f "$meldung"
      abbruch "Das Caddyfile ist ungültig (Meldung oben)."
    }
  fi
  rm -f "$meldung"

  if [ -f "$ziel" ] && cmp -s "$quelle" "$ziel"; then
    info "Das Caddyfile ist schon aktuell."
  else
    # Die Beispieldatei des Pakets einmal aufheben.
    if [ -f "$ziel" ] && [ ! -e "$ziel.vor-vereinsflow" ]; then cp -p "$ziel" "$ziel.vor-vereinsflow"; fi
    install -m 0644 "$quelle" "$ziel"
    geaendert=1
    info "Caddyfile nach $ziel kopiert."
  fi

  if ! hat_systemd; then
    warnung "systemd läuft hier nicht – Caddy wurde nicht (neu) geladen."
    return 0
  fi
  if ! systemctl is-active --quiet caddy; then
    systemctl restart caddy ||
      abbruch "Caddy startet nicht. Ursache: journalctl -u caddy -n 50 --no-pager – häufig belegt schon ein anderes Programm Port 80 oder 443: ss -ltnp | grep -E ':(80|443) '"
    info "Caddy gestartet."
  elif [ "$geaendert" -eq 1 ]; then
    systemctl reload caddy || systemctl restart caddy || abbruch "Caddy lässt sich nicht neu laden. Ursache: journalctl -u caddy -n 50 --no-pager"
    info "Caddy hat die neue Konfiguration geladen."
  else
    info "Caddy läuft."
  fi
}

# Wie oft die Anwendung schon neu gestartet wurde (0, wenn es den Container nicht gibt).
neustarts_von() {
  local id
  id=$(compose ps -a -q app 2>/dev/null | head -n 1 || true)
  if [ -n "$id" ]; then docker inspect -f '{{.RestartCount}}' "$id" 2>/dev/null || echo 0; else echo 0; fi
}
# Wartet, bis /api/health {"ok":true} liefert. Rückgabe: 0 = gesund, 1 = Zeit abgelaufen, 2 = die Anwendung startet dauernd neu.
warte_auf_gesundheit() {
  local ende=$((SECONDS + HEALTH_TIMEOUT)) antwort start_neustarts
  start_neustarts=$(neustarts_von)
  while [ "$SECONDS" -lt "$ende" ]; do
    antwort=$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)
    [[ $antwort == *'"ok":true'* ]] && return 0
    # Startet die Anwendung immer wieder neu, ist meist die Konfiguration schuld – dann nicht bis zum Ende warten.
    [ $(($(neustarts_von) - start_neustarts)) -lt 3 ] || return 2
    sleep 3
  done
  return 1
}

anwendung_starten() {
  local ergebnis=0
  cd "$DIR"
  info "Baue die Images und starte VereinsFlow. Beim ersten Mal dauert das 5 bis 15 Minuten (Abhängigkeiten laden, Anwendung bauen)."
  if ! compose up -d --build; then
    echo >&2
    echo "--- Protokoll der Datenbank-Migration (letzte Zeilen) ---" >&2
    compose logs --tail 30 migrate >&2 2>&1 || true
    abbruch "Bauen oder Starten ist fehlgeschlagen (Meldungen oben). Häufige Ursachen:
  (a) Dem Build ging der Arbeitsspeicher aus: Mit 'free -h' prüfen, ob Swap aktiv ist, und das Skript erneut starten.
  (b) POSTGRES_PASSWORD wurde geändert, nachdem die Datenbank schon einmal gestartet war: Das Passwort gilt nur bei der ersten Anlage.
      Nur bei einer noch leeren Installation ohne echte Daten hilft: cd $DIR && docker compose -f docker-compose.prod.yml --env-file .env.production down -v
Danach dieses Skript erneut starten."
  fi
  info "Warte, bis die Anwendung antwortet ($HEALTH_URL, höchstens $HEALTH_TIMEOUT s) …"
  warte_auf_gesundheit || ergebnis=$?
  if [ "$ergebnis" -ne 0 ]; then
    echo >&2
    echo "--- Anwendungsprotokoll (letzte Zeilen) ---" >&2
    compose logs --tail 40 app >&2 2>&1 || true
    if [ "$ergebnis" -eq 2 ]; then
      abbruch "Die Anwendung startet immer wieder neu und antwortet nicht auf $HEALTH_URL.
Die Ursache steht im Protokoll oben. Meist ist es die Konfiguration ('Unsichere Produktionskonfiguration'): .env.production korrigieren
und dieses Skript erneut starten."
    fi
    abbruch "Die Anwendung antwortet innerhalb von $HEALTH_TIMEOUT s nicht auf $HEALTH_URL.
Prüfe das Protokoll oben und mit 'docker compose -f docker-compose.prod.yml --env-file .env.production ps'. Danach dieses Skript erneut starten."
  fi
  info "Die Anwendung ist gesund."
  compose ps | sed 's/^/      /'
}

sicherung_einrichten() {
  local einheit=/etc/systemd/system/vereinsflow-sicherung.service timer=/etc/systemd/system/vereinsflow-sicherung.timer geaendert=0
  install -d -m 700 /etc/vereinsflow /var/backups/vereinsflow
  if [ ! -e /etc/vereinsflow/sicherung.conf ]; then
    schreibe_datei /etc/vereinsflow/sicherung.conf 600 <<'EOF' || true
# VereinsFlow – Einstellungen der Datensicherung (wird von deploy/sicherung.sh eingelesen; nur für root lesbar).
# Ohne Angaben: unverschlüsselt in /var/backups/vereinsflow, 14 Tage aufbewahrt. Alles Weitere: deploy/README.md, Abschnitt „Sicherung“.

#SICHERUNG_ZIEL="/var/backups/vereinsflow"
#SICHERUNG_TAGE=14

# Verschlüsselung mit age (empfohlen): Hier steht nur der ÖFFENTLICHE Schlüssel („age1…“). Entschlüsseln kann nur, wer den privaten
# Schlüssel hat – der bleibt auf deinem Mac und in deinem Passwortmanager, NICHT auf dem Server. Ohne ihn sind die Sicherungen unlesbar!
# Schlüssel erzeugen (auf dem Mac):  brew install age  &&  age-keygen -o ~/VereinsFlow-Schluessel/sicherung-age-schluessel.txt
# (age-keygen nennt danach den öffentlichen Schlüssel: „Public key: age1…“)
#SICHERUNG_AGE_EMPFAENGER="age1…"

# Alternative: Passphrase (gpg, AES-256). Die Datei enthält nur die Passphrase; sie gehört root, chmod 600.
# Gilt nur, wenn oben kein age-Schlüssel eingetragen ist.
#SICHERUNG_PASSPHRASE_DATEI="/etc/vereinsflow/sicherung.passphrase"
EOF
    info "Vorlage für die Einstellungen angelegt: /etc/vereinsflow/sicherung.conf (Verschlüsselung: siehe deploy/README.md)."
  fi

  if schreibe_datei "$einheit" <<EOF; then
[Unit]
Description=VereinsFlow: Datenbank und Dateiablage sichern
Documentation=file://$DIR/deploy/README.md
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
ExecStart=/bin/bash $DIR/deploy/sicherung.sh
Nice=10
IOSchedulingClass=idle
TimeoutStartSec=2h
EOF
    geaendert=1
  fi
  if schreibe_datei "$timer" <<'EOF'; then
[Unit]
Description=VereinsFlow: tägliche Sicherung

[Timer]
OnCalendar=*-*-* 03:15:00
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF
    geaendert=1
  fi
  if hat_systemd; then
    if [ "$geaendert" -eq 1 ]; then systemctl daemon-reload; fi
    systemctl enable --now vereinsflow-sicherung.timer >/dev/null 2>&1 ||
      warnung "Der Sicherungs-Timer ließ sich nicht aktivieren (systemctl status vereinsflow-sicherung.timer)."
    info "Tägliche Sicherung eingerichtet: $(systemctl list-timers vereinsflow-sicherung.timer --no-legend 2>/dev/null | awk '{ print "nächster Lauf " $1 " " $2 " " $3 }')"
  else
    warnung "systemd läuft hier nicht – der Sicherungs-Timer ist geschrieben, aber nicht aktiviert."
  fi

  # Einmal jetzt ausprobieren – dann zeigt sich sofort, ob sie funktioniert.
  info "Probelauf der Sicherung …"
  if ! VF_SPERRE_GEHALTEN=1 bash "$DIR/deploy/sicherung.sh" 2>&1 | sed 's/^/      /'; then
    warnung "Der Probelauf der Sicherung ist fehlgeschlagen (Meldung oben). Später wiederholen: bash $DIR/deploy/sicherung.sh"
  fi
}

abschluss_pruefung() {
  local i antwort versuche=12
  info "Prüfe, ob https://$DOMAIN erreichbar ist (beim ersten Mal holt Caddy dafür das Zertifikat) …"
  # Zeigt der DNS-Eintrag noch nicht auf diesen Server, gibt es auch kein Zertifikat – dann nicht lange warten.
  [ "$DNS_OK" -eq 1 ] || versuche=1
  for i in $(seq 1 "$versuche"); do
    antwort=$(curl -fsS --max-time 10 "https://$DOMAIN/api/health" 2>/dev/null || true)
    if [[ $antwort == *'"ok":true'* ]]; then
      HTTPS_OK=1
      break
    fi
    sleep 5
  done
  if [ "$HTTPS_OK" -eq 1 ]; then
    info "https://$DOMAIN/api/health antwortet: gesund, mit gültigem Zertifikat."
  else
    warnung "https://$DOMAIN ist von diesem Server aus noch nicht erreichbar. Meist fehlt der DNS-Eintrag oder er wirkt noch nicht (A-Eintrag 'app' auf ${IP_ANZEIGE:-die Adresse dieses Servers}). Stimmt er: systemctl restart caddy und nach einer Minute im Browser probieren. Die Ursache steht im Protokoll: journalctl -u caddy -n 50 --no-pager"
  fi
}

zusammenfassung() {
  local i
  echo
  echo "=================================================================="
  echo " VereinsFlow ist eingerichtet."
  echo "=================================================================="
  echo "  Adresse:    https://$DOMAIN  $([ "$HTTPS_OK" -eq 1 ] && echo '(erreichbar)' || echo '(noch nicht erreichbar – siehe Warnungen unten)')"
  echo "  Anwendung:  läuft (Übersicht: cd $DIR && docker compose -f docker-compose.prod.yml --env-file .env.production ps)"
  echo "  Sicherung:  täglich gegen 03:15 Uhr (Server-Zeit) nach /var/backups/vereinsflow, 14 Tage aufbewahrt"
  echo "  Protokoll:  $LOGDATEI"
  echo
  echo "Nächste Schritte:"
  echo
  echo "  1. Ersten Plattform-Administrator anlegen (hier auf dem Server, mit deinen Angaben):"
  echo
  echo "       cd $DIR"
  echo "       docker compose -f docker-compose.prod.yml --env-file .env.production run --rm tools \\"
  echo "         npm run admin:create -- --email DEINE@ADRESSE --first-name VORNAME --last-name NACHNAME"
  echo
  echo "     Die Ausgabe enthält einmalig einen Link (24 Stunden gültig), über den du dein Passwort festlegst. Behandle ihn wie ein Passwort."
  echo "  2. Prüfen: https://$DOMAIN/api/health (zeigt {\"ok\":true}), die Anmeldeseite, /.well-known/assetlinks.json und eine Test-Mail"
  echo "     über 'Passwort vergessen' (Einzelheiten: deploy/README.md, Abschnitt 'Prüfen')."
  echo "  3. Sicherung verschlüsseln und eine Kopie außerhalb des Servers anlegen (deploy/README.md, Abschnitt 'Sicherung')."
  echo "  4. Nach dem ersten Hochladen der Android-App: den Fingerabdruck aus der Play Console in ANDROID_APP_CERT_SHA256 eintragen"
  echo "     und mit 'bash $DIR/deploy/aktualisieren.sh --erzwingen' übernehmen."
  if [ "$SSH_HAERTEN" -ne 1 ]; then
    echo "  5. Empfohlen, sobald die Anmeldung mit deinem SSH-Schlüssel klappt (in einem zweiten Terminal ausprobieren!):"
    echo "       bash $DIR/deploy/server-einrichten.sh --ssh-passwort-login-aus"
  fi
  if [ -f /var/run/reboot-required ]; then
    echo
    echo "Ein Neustart ist nötig (Systemupdates): reboot – nach ein bis zwei Minuten wieder anmelden. Docker, Caddy und VereinsFlow starten von allein."
  fi
  if [ "${#WARNUNGEN[@]}" -gt 0 ]; then
    echo
    echo "Warnungen dieses Laufs – bitte lesen:"
    for i in "${!WARNUNGEN[@]}"; do echo "  - ${WARNUNGEN[$i]}"; done
  fi
  echo
}

main() {
  MAIN_PID=$BASHPID
  if [ "$NUR_PRUEFEN" -eq 1 ]; then
    echo "VereinsFlow – Konfiguration prüfen (es wird nichts installiert oder verändert)"
  else
    echo "VereinsFlow – Server einrichten ($(date '+%F %T'))"
    echo "Protokoll: $LOGDATEI"
    echo "Das dauert etwa 10 bis 20 Minuten. Bei einem Abbruch oder Fehler: Ursache beheben und das Skript einfach erneut starten."
    schritt "Voraussetzungen und Konfiguration prüfen"
  fi
  voraussetzungen_pruefen
  if [ "$NUR_PRUEFEN" -eq 1 ]; then
    echo
    echo "Prüfung beendet: Es wurde nichts installiert."
    if [ "${#WARNUNGEN[@]}" -gt 0 ]; then echo "Warnungen: ${#WARNUNGEN[@]} (siehe oben)."; fi
    return 0
  fi

  # Nur ein Lauf gleichzeitig (Einrichtung, Sicherung, Update).
  mkdir -p "$(dirname "$SPERRDATEI")"
  exec 9>"$SPERRDATEI"
  flock -n 9 || abbruch "Ein anderer Lauf (Einrichtung, Sicherung oder Update) ist gerade aktiv. Bitte später noch einmal versuchen."
  export VF_SPERRE_GEHALTEN=1

  schritt "System aktualisieren und Grundwerkzeuge installieren"
  system_aktualisieren
  schritt "Automatische Sicherheitsupdates"
  automatische_updates
  schritt "Swap-Datei"
  swap_einrichten || warnung "Die Swap-Datei konnte nicht eingerichtet werden."
  schritt "Firewall (ufw)"
  if hat_systemd; then
    firewall_einrichten || warnung "Die Firewall konnte nicht (vollständig) eingerichtet werden. Prüfe: ufw status – und die Firewall-Richtlinie im IONOS Cloud Panel."
  else
    warnung "systemd läuft hier nicht – die Firewall wird nicht angefasst."
  fi
  schritt "Docker"
  docker_installieren
  schritt "Caddy (Reverse-Proxy mit HTTPS)"
  caddy_installieren
  schritt "SSH-Zugang"
  ssh_absichern
  schritt "VereinsFlow-Code"
  code_holen
  schritt "Caddy konfigurieren"
  caddy_konfigurieren
  schritt "VereinsFlow bauen und starten"
  anwendung_starten
  schritt "Tägliche Datensicherung"
  sicherung_einrichten
  schritt "Abschlussprüfung"
  abschluss_pruefung
  date '+%F %T' >"$MARKE"
  zusammenfassung
}

# --- Start -----------------------------------------------------------------------------------------------------------------------
for argument in "$@"; do
  case $argument in
    --nur-pruefen) NUR_PRUEFEN=1 ;;
    --ssh-passwort-login-aus) SSH_HAERTEN=1 ;;
    --auto-neustart) AUTO_NEUSTART=1 ;;
    -h | --hilfe | --help)
      hilfe
      exit 0
      ;;
    *)
      echo "Unbekannte Option: $argument" >&2
      echo "Erlaubt: --nur-pruefen, --ssh-passwort-login-aus, --auto-neustart, --hilfe" >&2
      exit 2
      ;;
  esac
done
[[ $SWAP_MB =~ ^[0-9]+$ ]] || {
  echo "VF_SWAP_MB muss eine ganze Zahl sein (MB, 0 = keine Swap-Datei)." >&2
  exit 2
}

if [ "$(id -u)" -ne 0 ] || [ "$NUR_PRUEFEN" -eq 1 ]; then
  main
  exit
fi
# Das Protokoll läuft mit. Ein Abbruch der SSH-Verbindung beendet das Skript nicht mitten in apt oder Docker: SIGHUP wird
# ignoriert, tee schreibt weiter in die Datei, auch wenn das Terminal weg ist, und Eingaben gibt es ohnehin keine.
mkdir -p "$(dirname "$LOGDATEI")"
[ -e "$LOGDATEI" ] || install -m 600 /dev/null "$LOGDATEI"
trap '' HUP
main </dev/null 2>&1 | tee --output-error=warn -a "$LOGDATEI"
