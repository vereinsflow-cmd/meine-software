@echo off
rem Startet die LEERE Version von VereinsFlow (ohne Demo-Daten, eigene Datenbank, Port 3001) neben der Vorschau.
rem Beim ersten Oeffnen legt man Verein und Administrator-Konto an, danach fuehrt ein Assistent durch die Einrichtung.
title VereinsFlow (leere Version)
cd /d "%~dp0"
echo.
echo  VereinsFlow (leere Version) wird gestartet. Das dauert beim ersten Mal etwas laenger.
echo  Sie beginnt bei jedem Start wieder ganz leer - alles vom letzten Mal wird geloescht.
echo  Dieses Fenster OFFEN lassen, solange du die leere Version benutzt.
echo  Beenden: Strg+C druecken (bei der Rueckfrage "J" eingeben).
echo.
call npm run dev:all -- --leer --open
echo.
echo  Fertig. Dieses Fenster kann geschlossen werden.
pause
