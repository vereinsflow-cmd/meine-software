#!/bin/bash
# Speichert den ElevenLabs-API-Schlüssel nur auf diesem Mac: ~/.config/elevenlabs/api-key (nur für dich lesbar).
# Der Schlüssel wird beim Einfügen nicht angezeigt und landet in keinem Projektordner.
#
#   bash werbevideo/werkzeuge/elevenlabs-schluessel.sh            # Eingabe im Terminal
#   bash werbevideo/werkzeuge/elevenlabs-schluessel.sh --fenster  # Eingabe in einem Mac-Fenster
#
# Schlüssel anlegen: https://elevenlabs.io/app/developers/api-keys → „Create API Key“; nötige Rechte:
# „Text to Speech“ (Access) und „Voices“ (Write, damit eine Stimme aus der Bibliothek hinzugefügt werden kann).
set -euo pipefail
ordner="$HOME/.config/elevenlabs"
mkdir -p "$ordner"
chmod 700 "$ordner"
if [ "${1:-}" = "--fenster" ]; then
  if ! schluessel=$(osascript \
    -e 'set r to display dialog "ElevenLabs-API-Schlüssel hier einfügen (Cmd + V), dann OK.\n\nEr bleibt unsichtbar und wird nur auf diesem Mac gespeichert." default answer "" with hidden answer with title "VereinsFlow – ElevenLabs" buttons {"Abbrechen", "OK"} default button "OK" with icon note giving up after 1800' \
    -e 'text returned of r'); then
    echo "Abgebrochen – nichts gespeichert."
    exit 1
  fi
else
  read -rsp "ElevenLabs-API-Schlüssel einfügen (bleibt unsichtbar), dann Enter: " schluessel
  echo
fi
schluessel=$(printf '%s' "$schluessel" | tr -d '[:space:]')
if [ -z "$schluessel" ]; then
  echo "Kein Schlüssel eingegeben – nichts gespeichert."
  exit 1
fi
umask 077
printf '%s' "$schluessel" > "$ordner/api-key"
unset schluessel
echo "Gespeichert in ~/.config/elevenlabs/api-key."
[ "${1:-}" = "--fenster" ] && osascript -e 'display notification "Schlüssel gespeichert – es geht weiter." with title "VereinsFlow – ElevenLabs"' || true
