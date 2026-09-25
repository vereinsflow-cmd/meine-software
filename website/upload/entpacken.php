<?php
// Einmal-Helfer für Webspace ohne „Entpacken“-Knopf (z. B. IONOS): packt vereinsflow-website.zip im selben Ordner aus
// und löscht sich danach selbst. Ablauf: diese Datei und vereinsflow-website.zip nach /public hochladen, dann
// https://vereins-flow.com/entpacken.php im Browser aufrufen. Die ZIP-Datei danach im Webspace Explorer löschen.

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

function antwort($titel, $text)
{
    echo '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>' . htmlspecialchars($titel) . '</title></head>'
        . '<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;line-height:1.5">'
        . '<h1>' . htmlspecialchars($titel) . '</h1><p>' . $text . '</p></body></html>';
    exit;
}

$ordner = __DIR__;

// Safari hängt bei doppelten Downloads „ (1)“ oder „-2“ an – deshalb die neueste passende ZIP-Datei nehmen.
$archive = glob($ordner . '/vereinsflow-website*.zip');
if (!$archive) {
    antwort('ZIP-Datei fehlt', 'Bitte <code>vereinsflow-website.zip</code> in denselben Ordner wie diese Datei hochladen '
        . '(<code>/public</code>) und diese Seite neu laden.');
}
usort($archive, function ($a, $b) {
    return filemtime($b) - filemtime($a);
});
$zip = $archive[0];

$fehler = '';
if (class_exists('ZipArchive')) {
    $archiv = new ZipArchive();
    $status = $archiv->open($zip);
    if ($status !== true) {
        $fehler = 'Die ZIP-Datei lässt sich nicht öffnen (Code ' . $status . ') – vielleicht unvollständig hochgeladen?';
    } else {
        if (!$archiv->extractTo($ordner)) {
            $fehler = 'Das Auspacken ist fehlgeschlagen.';
        }
        $archiv->close();
    }
} elseif (class_exists('PharData')) {
    try {
        $archiv = new PharData($zip);
        $archiv->extractTo($ordner, null, true);
    } catch (Exception $e) {
        $fehler = 'Das Auspacken ist fehlgeschlagen: ' . $e->getMessage();
    }
} else {
    $fehler = 'Auf diesem Server fehlt die PHP-Erweiterung zum Entpacken.';
}

if ($fehler === '' && !is_file($ordner . '/index.html')) {
    $fehler = 'Nach dem Auspacken fehlt index.html.';
}
if ($fehler !== '') {
    antwort('Nicht geklappt', htmlspecialchars($fehler));
}

@unlink(__FILE__);
antwort('Fertig – die Website ist online', 'Alle Dateien sind ausgepackt, dieser Helfer hat sich selbst gelöscht. '
    . '<a href="/">Zur Startseite</a>. Die ZIP-Datei kannst du jetzt im Webspace Explorer löschen.');
