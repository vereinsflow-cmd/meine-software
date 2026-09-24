// Läuft vor dem ersten Zeichnen (nicht verzögert eingebunden): Mit JavaScript bekommen die Vorführungen ihre lange
// Scrollstrecke (.js .showcase in site.css). Steht die Klasse schon jetzt, stimmt die Seitenhöhe, wenn der Browser beim
// Neuladen oder Zurückgehen die Scrollposition wiederherstellt – sonst landete man kurz an einer falschen Stelle.
document.documentElement.classList.add("js");
