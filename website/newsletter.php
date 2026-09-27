<?php
// VereinsFlow – Benachrichtigung per E-Mail zum Start und bei wichtigen Neuigkeiten (Double-Opt-in).
//
// Ablauf: Das Formular auf der Startseite schickt die Adresse hierher (POST aktion=anmelden). Gespeichert wird sie als
// „offen“, und es geht eine E-Mail mit Bestätigungslink hinaus. Erst mit dem Klick auf „Anmeldung bestätigen“ (auf der
// Seite hinter dem Link, per POST – Link-Vorschauen von Mailprogrammen und Virenscannern bestätigen so nicht von selbst)
// ist die Adresse eingetragen. Jede E-Mail enthält einen persönlichen Abmeldelink; er wird aus der Adresse und einem
// geheimen Schlüssel berechnet und steht für Rundschreiben auch in der CSV-Liste (Spalte „Abmeldelink“).
//
// Die Daten liegen außerhalb des öffentlichen Ordners (/public) in /vereinsflow-daten – über das Internet sind sie nicht
// abrufbar. Dort liegen:
//   anmeldungen.json              alle Einträge (Status offen, bestätigt oder abgemeldet) mit Zeit und IP-Adresse von
//                                 Anmeldung und Bestätigung als Nachweis der Einwilligung
//   anmeldungen-bestaetigt.csv    die bestätigten Adressen mit persönlichem Abmeldelink (für den Versand, Excel)
//   schluessel.txt                geheimer Schlüssel für die Abmeldelinks – NIE löschen, beim Umzug mitnehmen
//   .sperre                       Dateisperre gegen gleichzeitiges Schreiben
// Unbestätigte Anmeldungen werden nach VF_FRIST_TAGE Tagen gelöscht, Abmeldungen (nur noch als Nachweis) nach
// VF_NACHWEIS_JAHRE Jahren. Aufgeräumt wird bei jedem Aufruf dieses Skripts und, falls eingerichtet, per Cronjob:
//   php newsletter.php aufraeumen
//
// Schutz vor Missbrauch (das Formular darf keine Spam-Schleuder werden): höchstens VF_MAX_JE_IP Anmeldungen je IP-Adresse
// (IPv6: je /64-Netz) und Stunde, höchstens VF_MAX_JE_ADRESSE Bestätigungs-E-Mails je Postfach in VF_FRIST_TAGE Tagen
// (Plus-Adressen und Gmail-Punkte zählen als dasselbe Postfach), höchstens VF_MAX_GESAMT Bestätigungs-E-Mails je Stunde
// insgesamt, höchstens VF_MAX_OFFEN offene Anmeldungen, Formulare nur von der eigenen Website (Origin/Sec-Fetch-Site),
// ein unsichtbares Fangfeld. Nach außen verrät keine Antwort, ob eine Adresse schon eingetragen ist.
//
// Läuft ab PHP 7.4. Keine Datenbank, keine Bibliotheken. Ausgaben sind reines HTML mit dem Stylesheet der Website (die
// Content-Security-Policy verbietet Inline-Stile und -Skripte).

declare(strict_types=1);

ini_set('display_errors', '0'); // nie Warnungen mit Serverpfaden in die Seite schreiben
ini_set('log_errors', '1');

const VF_BASIS_URL = 'https://vereins-flow.com';
const VF_ABSENDER = 'kontakt@vereins-flow.com';
const VF_ABSENDER_NAME = 'VereinsFlow';
const VF_HINWEIS_AN = 'kontakt@vereins-flow.com'; // bekommt je bestätigter Anmeldung eine kurze Nachricht (ohne Adresse)
const VF_STYLESHEET = '/assets/css/site.css?v=20260927-2';
const VF_EINWILLIGUNG = 'formular-2026-09-27'; // Fassung des Einwilligungstextes am Formular (Wortlaut: README.md)
const VF_FRIST_TAGE = 7;
const VF_NACHWEIS_JAHRE = 3;
const VF_MAX_JE_IP = 20;
const VF_MAX_JE_ADRESSE = 3;
const VF_MAX_GESAMT = 40;
const VF_MAX_OFFEN = 500;
const VF_ERNEUT_NACH = 900; // frühestens nach 15 Minuten eine weitere Bestätigungs-E-Mail an dieselbe Adresse
const VF_MAX_DATEI = 2000000; // Byte; darüber keine neuen Anmeldungen mehr (Bestätigen und Abmelden gehen weiter)
const VF_FUSS = "-- \nVereinsFlow GbR, vertreten durch die Gesellschafter Ben Bleckert und Luis Heidecker\n"
    . "Oberschlesienstraße 6a · 45711 Datteln · kontakt@vereins-flow.com\n"
    . "Impressum: https://vereins-flow.com/impressum.html\n"
    . "Datenschutz: https://vereins-flow.com/datenschutz.html#benachrichtigung\n";

// ---------- Ausgabe ----------

function vf_h(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Eine Seite im Stil der Fehlerseite (404.html): Kopfzeile mit Logo, Meldung in der Mitte, kurze Fußzeile. */
function vf_seite(int $status, string $titel, string $text, string $zusatz = ''): void
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
    echo '<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>' . vf_h($titel) . ' – VereinsFlow</title>
  <meta name="robots" content="noindex">
  <meta name="color-scheme" content="light">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="' . vf_h(VF_STYLESHEET) . '">
</head>
<body>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="VereinsFlow – zur Startseite">
      <picture>
        <img src="/assets/img/logo.svg" alt="" width="174" height="28">
      </picture>
    </a>
  </div>
</header>
<main class="not-found notify-page">
  <h1>' . vf_h($titel) . '</h1>
  <p class="lead">' . $text . '</p>
  ' . $zusatz . '
</main>

<footer class="site-footer compact">
  <div class="container">
    <div class="footer-bottom">
      <span>© 2026 VereinsFlow</span>
      <span><a href="/impressum.html">Impressum</a> · <a href="/datenschutz.html">Datenschutz</a></span>
    </div>
  </div>
</footer>
</body>
</html>
';
    exit;
}

/** Nach einer Änderung auf eine Ergebnisseite umleiten – ein Neuladen schickt das Formular dann nicht erneut ab. */
function vf_weiter(string $status): void
{
    header('Location: /newsletter.php?status=' . rawurlencode($status), true, 303);
    header('Cache-Control: no-store');
    exit;
}

function vf_start_link(): string
{
    return '<p><a class="btn btn-primary btn-lg" href="/">Zur Startseite</a></p>';
}

function vf_mail_link(): string
{
    return '<a href="mailto:' . VF_ABSENDER . '">' . VF_ABSENDER . '</a>';
}

function vf_fehlerseite(): void
{
    vf_seite(500, 'Das hat leider nicht geklappt',
        'Ein technischer Fehler ist aufgetreten. Bitte versuchen Sie es später noch einmal oder schreiben Sie uns an '
            . vf_mail_link() . '.',
        vf_start_link());
}

/** Formularfelder und Adressparameter nur als Text lesen (email[]=… o. Ä. wird zu einem leeren Wert). */
function vf_eingabe(array $quelle, string $name): string
{
    $wert = $quelle[$name] ?? '';
    return is_string($wert) ? $wert : '';
}

// ---------- Daten ----------

function vf_datenordner(): string
{
    $ordner = getenv('VF_NEWSLETTER_DATEN') ?: dirname(__DIR__) . '/vereinsflow-daten';
    if (!@is_dir($ordner) && !@mkdir($ordner, 0700, true) && !@is_dir($ordner)) {
        throw new RuntimeException('Datenordner lässt sich nicht anlegen: ' . $ordner);
    }
    if (!@is_writable($ordner)) {
        throw new RuntimeException('Datenordner ist nicht beschreibbar: ' . $ordner);
    }
    // Falls der Ordner doch einmal im Web erreichbar wäre: Apache liefert nichts daraus aus
    if (!is_file($ordner . '/.htaccess')) {
        @file_put_contents($ordner . '/.htaccess', "Require all denied\n");
    }
    return $ordner;
}

/**
 * Geheimer Schlüssel für Abmeldelinks und für die Zählung je IP. Er entsteht nur ganz am Anfang (solange es noch keine
 * Anmeldungen gibt). Fehlt er später oder ist er unlesbar, bricht das Skript ab: Ein neuer Schlüssel machte alle
 * verschickten Abmeldelinks wertlos, und Abmeldungen liefen still ins Leere.
 */
function vf_schluessel(string $ordner): string
{
    $datei = $ordner . '/schluessel.txt';
    if (!file_exists($datei)) {
        if (file_exists($ordner . '/anmeldungen.json')) {
            throw new RuntimeException('schluessel.txt fehlt, obwohl es Anmeldungen gibt – Sicherung zurückspielen');
        }
        $schluessel = bin2hex(random_bytes(32));
        vf_schreiben($datei, $schluessel . "\n");
        return $schluessel;
    }
    $roh = @file_get_contents($datei);
    $schluessel = $roh === false ? '' : trim($roh, " \t\r\n\0\x0B\xEF\xBB\xBF");
    if (!preg_match('/^[a-f0-9]{64}$/D', $schluessel)) {
        throw new RuntimeException('schluessel.txt ist unlesbar oder beschädigt – nicht löschen, bitte prüfen');
    }
    return $schluessel;
}

/** Schreibt erst in eine Zwischendatei und benennt sie dann um – so ist eine Datei nie halb geschrieben. */
function vf_schreiben(string $datei, string $inhalt): void
{
    $zwischen = $datei . '.neu';
    if (@file_put_contents($zwischen, $inhalt, LOCK_EX) === false || !@rename($zwischen, $datei)) {
        throw new RuntimeException('Datei lässt sich nicht schreiben: ' . $datei);
    }
    @chmod($datei, 0600);
}

/**
 * Liest die Anmeldungen unter einer Dateisperre (höchstens etwa 4 Sekunden warten), lässt $aendern sie verändern, räumt
 * auf und schreibt sie nur zurück, wenn sich etwas geändert hat. Eine vorhandene, aber unlesbare Datei wird nie
 * überschrieben (lieber ein Fehler als verlorene Anmeldungen).
 */
function vf_mit_daten(callable $aendern)
{
    $ordner = vf_datenordner();
    $sperre = @fopen($ordner . '/.sperre', 'c');
    if ($sperre === false) {
        throw new RuntimeException('Sperrdatei lässt sich nicht öffnen');
    }
    $gesperrt = false;
    for ($i = 0; $i < 40 && !$gesperrt; $i++) {
        $gesperrt = flock($sperre, LOCK_EX | LOCK_NB);
        if (!$gesperrt) {
            usleep(100000);
        }
    }
    if (!$gesperrt) {
        fclose($sperre);
        throw new RuntimeException('Dateisperre nicht frei geworden');
    }
    try {
        $datei = $ordner . '/anmeldungen.json';
        $roh = '';
        $daten = ['eintraege' => [], 'versuche' => [], 'versand' => []];
        if (is_file($datei)) {
            $roh = (string) @file_get_contents($datei);
            $gelesen = json_decode($roh, true);
            if (!is_array($gelesen) || !isset($gelesen['eintraege']) || !is_array($gelesen['eintraege'])) {
                throw new RuntimeException('anmeldungen.json ist beschädigt – bitte prüfen');
            }
            $daten = $gelesen + ['versuche' => [], 'versand' => []];
        }
        $schluessel = vf_schluessel($ordner);
        $ergebnis = $aendern($daten, $schluessel);
        vf_aufraeumen($daten);

        $json = json_encode($daten, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('Anmeldungen lassen sich nicht speichern');
        }
        if ($json . "\n" !== $roh) {
            vf_schreiben($datei, $json . "\n");
            vf_schreiben($ordner . '/anmeldungen-bestaetigt.csv', vf_csv($daten['eintraege'], $schluessel));
        }
        return $ergebnis;
    } finally {
        flock($sperre, LOCK_UN);
        fclose($sperre);
    }
}

/** Fristen: unbestätigt nach VF_FRIST_TAGE Tagen weg, Abmeldungen nach VF_NACHWEIS_JAHRE Jahren, Zähler nach Ablauf. */
function vf_aufraeumen(array &$daten): void
{
    $jetzt = time();
    foreach ($daten['eintraege'] as $email => $eintrag) {
        $offenAbgelaufen = $eintrag['status'] === 'offen' && $eintrag['angelegt_ts'] < $jetzt - VF_FRIST_TAGE * 86400;
        $nachweisAbgelaufen = $eintrag['status'] === 'abgemeldet'
            && ($eintrag['abgemeldet_ts'] ?? 0) < $jetzt - VF_NACHWEIS_JAHRE * 365 * 86400;
        if ($offenAbgelaufen || $nachweisAbgelaufen) {
            unset($daten['eintraege'][$email]);
        }
    }
    foreach (['versuche' => 3600, 'versand' => VF_FRIST_TAGE * 86400] as $art => $dauer) {
        foreach ($daten[$art] as $wer => $zeiten) {
            $zeiten = vf_juenger($zeiten, $jetzt - $dauer);
            if ($zeiten) {
                $daten[$art][$wer] = $zeiten;
            } else {
                unset($daten[$art][$wer]);
            }
        }
    }
}

function vf_juenger(array $zeiten, int $grenze): array
{
    return array_values(array_filter($zeiten, function ($t) use ($grenze) {
        return is_int($t) && $t > $grenze;
    }));
}

/** Bestätigte Adressen als CSV für Excel (Semikolon, UTF-8 mit BOM), mit persönlichem Abmeldelink für Rundschreiben.
 *  Zellen, die wie eine Formel beginnen, bekommen ein vorangestelltes Hochkomma – sonst könnte ein eingetragener
 *  Vereinsname in Excel eine Formel ausführen. */
function vf_csv(array $eintraege, string $schluessel): string
{
    $zelle = function (string $wert): string {
        if ($wert !== '' && strpos("=+-@\t\r", $wert[0]) !== false) {
            $wert = "'" . $wert;
        }
        return '"' . str_replace('"', '""', $wert) . '"';
    };
    $zeilen = ["\xEF\xBB\xBF" . 'E-Mail;Verein;Angemeldet;Bestätigt;Abmeldelink'];
    foreach ($eintraege as $eintrag) {
        if ($eintrag['status'] !== 'bestaetigt') {
            continue;
        }
        $zeilen[] = implode(';', array_map($zelle, [
            $eintrag['email'], $eintrag['verein'], $eintrag['angelegt'], $eintrag['bestaetigt'],
            vf_abmelde_link($eintrag['email'], $schluessel),
        ]));
    }
    return implode("\r\n", $zeilen) . "\r\n";
}

function vf_abmelde_token(string $email, string $schluessel): string
{
    return hash_hmac('sha256', 'abmelden|' . $email, $schluessel);
}

function vf_abmelde_link(string $email, string $schluessel): string
{
    return VF_BASIS_URL . '/newsletter.php?abmelden=' . vf_abmelde_token($email, $schluessel);
}

function vf_ip(): string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '';
}

/** Schlüssel für die Zählung je Anschluss: IPv4-Adresse, bei IPv6 das /64-Netz (sonst hätte jeder Anschluss Milliarden). */
function vf_ip_gruppe(string $ip): string
{
    $binaer = $ip !== '' ? @inet_pton($ip) : false;
    if (is_string($binaer) && strlen($binaer) === 16) {
        return bin2hex(substr($binaer, 0, 8)) . '/64';
    }
    return $ip;
}

/** Dasselbe Postfach unter verschiedenen Schreibweisen: „+Zusatz“ weg, bei Gmail auch die Punkte. */
function vf_postfach(string $email): string
{
    $teile = explode('@', $email, 2);
    $lokal = preg_replace('/\+.*$/', '', $teile[0]) ?? $teile[0];
    $domain = $teile[1] ?? '';
    if ($domain === 'gmail.com' || $domain === 'googlemail.com') {
        $lokal = str_replace('.', '', $lokal);
        $domain = 'gmail.com';
    }
    return $lokal . '@' . $domain;
}

function vf_zeit(int $ts): string
{
    return gmdate('Y-m-d\TH:i:s\Z', $ts);
}

/** Prüft und vereinheitlicht die Adresse: Kleinbuchstaben, Umlaut-Domains als Punycode, nur übliche Zeichen (keine
 *  Anführungszeichen, Steuerzeichen oder IP-Adressen als Domain – FILTER_VALIDATE_EMAIL allein lässt das zu). */
function vf_adresse(string $eingabe): ?string
{
    $email = strtolower(trim($eingabe));
    $teile = explode('@', $email, 2);
    if (count($teile) === 2 && preg_match('/[^\x20-\x7E]/', $teile[1]) && function_exists('idn_to_ascii')
        && defined('INTL_IDNA_VARIANT_UTS46')) {
        $ascii = idn_to_ascii($teile[1], IDNA_NONTRANSITIONAL_TO_ASCII, INTL_IDNA_VARIANT_UTS46);
        if (is_string($ascii) && $ascii !== '') {
            $email = $teile[0] . '@' . strtolower($ascii);
        }
    }
    if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return null;
    }
    $muster = '/^[a-z0-9.!#$%&\'*+\/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/D';
    return preg_match($muster, $email) ? $email : null;
}

// ---------- E-Mail ----------

function vf_betreff(string $betreff): string
{
    if (function_exists('mb_encode_mimeheader')) {
        return mb_encode_mimeheader($betreff, 'UTF-8', 'B', "\r\n");
    }
    return '=?UTF-8?B?' . base64_encode($betreff) . '?='; // Betreffe hier sind kurz genug für ein einzelnes Wort
}

function vf_mail(string $an, string $betreff, string $text): bool
{
    // Nur für Tests auf dem eigenen Rechner: E-Mails in eine Datei schreiben statt zu verschicken
    $testdatei = getenv('VF_NEWSLETTER_MAILTEST');
    if ($testdatei) {
        return file_put_contents($testdatei, json_encode(['an' => $an, 'betreff' => $betreff, 'text' => $text],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX) !== false;
    }
    $kopf = implode("\r\n", [
        'From: ' . VF_ABSENDER_NAME . ' <' . VF_ABSENDER . '>',
        'Reply-To: ' . VF_ABSENDER,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: quoted-printable',
        'Auto-Submitted: auto-generated',
    ]);
    $text = quoted_printable_encode(str_replace("\n", "\r\n", $text));
    // Mit Absenderadresse der eigenen Domain für Rückläufer und SPF (-f); nur ein Versuch, damit nichts doppelt ankommt
    $ok = @mail($an, vf_betreff($betreff), $text, $kopf, '-f' . VF_ABSENDER);
    if (!$ok) {
        error_log('VereinsFlow newsletter.php: mail() fehlgeschlagen');
    }
    return $ok;
}

function vf_mail_bestaetigen(string $email, string $token, string $abmeldelink): bool
{
    $text = "Guten Tag,\n\n"
        . "Sie haben sich auf vereins-flow.com angemeldet, um zum Start von VereinsFlow und bei wichtigen Neuigkeiten "
        . "eine E-Mail zu bekommen.\n\n"
        . "Bitte bestätigen Sie Ihre Anmeldung über diesen Link:\n"
        . VF_BASIS_URL . '/newsletter.php?bestaetigen=' . $token . "\n\n"
        . "Erst nach der Bestätigung nehmen wir Sie in die Liste auf. Waren Sie das nicht, ignorieren Sie diese E-Mail "
        . 'einfach – ohne Bestätigung löschen wir Ihre Angaben nach ' . VF_FRIST_TAGE . " Tagen automatisch.\n\n"
        . "Abmelden können Sie sich jederzeit über diesen Link:\n" . $abmeldelink . "\n\n"
        . "Viele Grüße\nIhr VereinsFlow-Team\n\n" . VF_FUSS;
    return vf_mail($email, 'Bitte bestätigen: Anmeldung bei VereinsFlow', $text);
}

/** Kurze Nachricht ans Team – bewusst ohne Adresse und Verein, damit nach einer Abmeldung keine Kopie im Postfach liegt. */
function vf_mail_hinweis(int $anzahl): void
{
    $text = "Eine neue Anmeldung für Neuigkeiten zu VereinsFlow wurde bestätigt.\n\n"
        . 'Bestätigte Adressen insgesamt: ' . $anzahl . "\n\n"
        . "Die Liste steht in /vereinsflow-daten/anmeldungen-bestaetigt.csv (Webspace Explorer). Heruntergeladene Kopien "
        . "nach dem Versand bitte wieder löschen.\n";
    vf_mail(VF_HINWEIS_AN, 'Neue Anmeldung für Neuigkeiten', $text); // ein Fehler hier bricht die Bestätigung nicht ab
}

// ---------- Abläufe ----------

/** Nach außen gleich lange Antworten, ob eine E-Mail verschickt wurde oder nicht (sonst verriete die Zeit etwas). */
function vf_warten(): void
{
    if (!getenv('VF_NEWSLETTER_MAILTEST')) {
        usleep(random_int(250000, 700000));
    }
}

function vf_anmelden(): void
{
    // Unsichtbares Fangfeld: Menschen lassen es leer, viele Programme füllen es aus – dann so tun, als wäre alles gut
    if (trim(vf_eingabe($_POST, 'vf_feld')) !== '') {
        vf_warten();
        vf_weiter('gesendet');
    }
    $email = vf_adresse(vf_eingabe($_POST, 'email'));
    if ($email === null) {
        vf_seite(422, 'Bitte prüfen Sie die E-Mail-Adresse',
            'Die eingegebene Adresse sieht nicht wie eine gültige E-Mail-Adresse aus.',
            '<p><a class="btn btn-primary btn-lg" href="/#benachrichtigen">Zurück zum Formular</a></p>');
    }
    $verein = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', vf_eingabe($_POST, 'verein')) ?? '');
    $verein = function_exists('mb_substr') ? mb_substr($verein, 0, 120, 'UTF-8') : substr($verein, 0, 120);

    $datei = vf_datenordner() . '/anmeldungen.json';
    if (is_file($datei) && (int) @filesize($datei) > VF_MAX_DATEI) {
        error_log('VereinsFlow newsletter.php: anmeldungen.json zu groß, neue Anmeldungen gesperrt');
        vf_seite(503, 'Gerade nicht möglich',
            'Anmeldungen sind im Moment nicht möglich. Bitte versuchen Sie es später noch einmal oder schreiben Sie uns an '
                . vf_mail_link() . '.', vf_start_link());
    }

    // Gespeichert wird unter der Sperre; verschickt wird danach. Schlägt das Verschicken fehl, wird der vorige Stand
    // des Eintrags wiederhergestellt, damit keine Adresse ohne Bestätigungs-E-Mail zurückbleibt.
    $ergebnis = vf_mit_daten(function (array &$daten, string $schluessel) use ($email, $verein) {
        $jetzt = time();
        $wer = hash_hmac('sha256', 'ip|' . vf_ip_gruppe(vf_ip()), $schluessel);
        $versuche = vf_juenger($daten['versuche'][$wer] ?? [], $jetzt - 3600);
        if (count($versuche) >= VF_MAX_JE_IP) {
            return 'zu-viele';
        }
        $versuche[] = $jetzt;
        $daten['versuche'][$wer] = $versuche;

        $vorhanden = $daten['eintraege'][$email] ?? null;
        $status = $vorhanden['status'] ?? '';
        if ($status === 'bestaetigt') {
            return 'nichts'; // schon angemeldet – nach außen dieselbe Antwort, damit niemand Adressen ausprobieren kann
        }
        if ($status === 'offen' && $vorhanden['gesendet_ts'] > $jetzt - VF_ERNEUT_NACH) {
            return 'nichts'; // Bestätigungs-E-Mail gerade erst verschickt
        }
        $postfach = hash_hmac('sha256', 'postfach|' . vf_postfach($email), $schluessel);
        $versand = vf_juenger($daten['versand'][$postfach] ?? [], $jetzt - VF_FRIST_TAGE * 86400);
        if (count($versand) >= VF_MAX_JE_ADRESSE) {
            return 'nichts'; // dieses Postfach hat schon genug Bestätigungs-E-Mails bekommen
        }
        $gesamt = vf_juenger($daten['versuche']['*'] ?? [], $jetzt - 3600);
        $offen = count(array_filter($daten['eintraege'], function ($e) {
            return $e['status'] === 'offen';
        }));
        if (count($gesamt) >= VF_MAX_GESAMT || ($status !== 'offen' && $offen >= VF_MAX_OFFEN)) {
            error_log('VereinsFlow newsletter.php: Obergrenze für Bestätigungs-E-Mails erreicht');
            return 'voll';
        }

        $token = bin2hex(random_bytes(32));
        if ($status === 'offen') {
            // Erneut angefordert: Zeitpunkt und Nachweis der ersten Anmeldung bleiben (die Frist läuft weiter), die
            // Links der bisherigen E-Mails gelten weiter (bis zu drei)
            $eintrag = $vorhanden;
            $eintrag['tokens'] = array_slice(array_merge([hash('sha256', $token)], $vorhanden['tokens']), 0, 3);
            $eintrag['gesendet_ts'] = $jetzt;
            if ($eintrag['verein'] === '') {
                $eintrag['verein'] = $verein;
            }
        } else {
            $eintrag = [
                'email' => $email,
                'verein' => $verein,
                'status' => 'offen',
                'tokens' => [hash('sha256', $token)],
                'einwilligung' => VF_EINWILLIGUNG,
                'angelegt' => vf_zeit($jetzt),
                'angelegt_ts' => $jetzt,
                'angelegt_ip' => vf_ip(),
                'gesendet_ts' => $jetzt,
                'bestaetigt' => '',
                'bestaetigt_ip' => '',
            ];
            if ($vorhanden) {
                // Früher abgemeldet: den Nachweis der früheren Einwilligung behalten
                $eintrag['frueher'] = array_slice(array_merge([array_intersect_key($vorhanden, array_flip([
                    'einwilligung', 'angelegt', 'angelegt_ip', 'bestaetigt', 'bestaetigt_ip', 'abgemeldet',
                ]))], $vorhanden['frueher'] ?? []), 0, 3);
            }
        }
        $daten['eintraege'][$email] = $eintrag;
        $versand[] = $jetzt;
        $daten['versand'][$postfach] = $versand;
        $gesamt[] = $jetzt;
        $daten['versuche']['*'] = $gesamt;
        return ['token' => $token, 'abmeldelink' => vf_abmelde_link($email, $schluessel), 'vorher' => $vorhanden];
    });

    if ($ergebnis === 'zu-viele' || $ergebnis === 'voll') {
        vf_seite(429, 'Gerade zu viele Anmeldungen',
            'In der letzten Stunde kamen sehr viele Anmeldungen. Bitte versuchen Sie es später noch einmal oder schreiben '
                . 'Sie uns an ' . vf_mail_link() . '.', vf_start_link());
    }
    if (!is_array($ergebnis)) {
        vf_warten();
        vf_weiter('gesendet');
    }
    try {
        $verschickt = vf_mail_bestaetigen($email, $ergebnis['token'], $ergebnis['abmeldelink']);
    } catch (Throwable $fehler) {
        $verschickt = false;
    }
    if (!$verschickt) {
        $vorher = $ergebnis['vorher'];
        vf_mit_daten(function (array &$daten) use ($email, $vorher) {
            if ($vorher === null) {
                unset($daten['eintraege'][$email]);
            } else {
                $daten['eintraege'][$email] = $vorher;
            }
        });
        vf_fehlerseite();
    }
    vf_weiter('gesendet');
}

/** Sucht den Eintrag zu einem Bestätigungslink (verglichen werden die Hashes der bis zu drei gültigen Tokens). */
function vf_finde_token(array $eintraege, string $token): ?string
{
    $hash = hash('sha256', $token);
    foreach ($eintraege as $email => $eintrag) {
        foreach ($eintrag['tokens'] ?? [] as $gespeichert) {
            if (hash_equals($gespeichert, $hash)) {
                return (string) $email;
            }
        }
    }
    return null;
}

function vf_bestaetigen(string $token): void
{
    $ergebnis = vf_mit_daten(function (array &$daten) use ($token) {
        $email = vf_finde_token($daten['eintraege'], $token);
        if ($email === null) {
            return 'ungueltig';
        }
        $eintrag = &$daten['eintraege'][$email];
        if ($eintrag['status'] === 'bestaetigt') {
            return 'schon';
        }
        if ($eintrag['status'] !== 'offen' || $eintrag['angelegt_ts'] < time() - VF_FRIST_TAGE * 86400) {
            return 'ungueltig';
        }
        $eintrag['status'] = 'bestaetigt';
        $eintrag['bestaetigt'] = vf_zeit(time());
        $eintrag['bestaetigt_ip'] = vf_ip();
        return count(array_filter($daten['eintraege'], function ($e) {
            return $e['status'] === 'bestaetigt';
        }));
    });
    if (is_int($ergebnis)) {
        vf_mail_hinweis($ergebnis);
        vf_weiter('bestaetigt');
    }
    vf_weiter($ergebnis === 'schon' ? 'bestaetigt' : 'ungueltig');
}

/** Abmelden: Die Adresse bekommt keine E-Mails mehr. Aufbewahrt werden nur noch Adresse, Zeiten und IP-Adressen als
 *  Nachweis der früheren Einwilligung (VF_NACHWEIS_JAHRE Jahre); Vereinsname und Links werden gelöscht. */
function vf_abmelden(string $token): void
{
    $getroffen = vf_mit_daten(function (array &$daten, string $schluessel) use ($token) {
        foreach ($daten['eintraege'] as $email => $eintrag) {
            if ($eintrag['status'] !== 'abgemeldet' && hash_equals(vf_abmelde_token((string) $email, $schluessel), $token)) {
                $daten['eintraege'][$email] = array_merge($eintrag, [
                    'status' => 'abgemeldet',
                    'verein' => '',
                    'tokens' => [],
                    'abgemeldet' => vf_zeit(time()),
                    'abgemeldet_ts' => time(),
                ]);
                return true;
            }
        }
        return false;
    });
    if (!$getroffen) {
        error_log('VereinsFlow newsletter.php: Abmeldelink ohne passenden Eintrag (schon abgemeldet oder unbekannt)');
    }
    vf_weiter('abgemeldet'); // nach außen dieselbe Antwort, auch wenn es die Adresse nicht (mehr) gibt
}

/** Seite hinter einem Link aus der E-Mail: erst ein Klick auf den Knopf löst die Aktion aus (POST). */
function vf_knopfseite(string $aktion, string $token, string $titel, string $text, string $knopf): void
{
    vf_seite(200, $titel, $text,
        '<form class="notify-confirm" action="/newsletter.php" method="post">'
        . '<input type="hidden" name="aktion" value="' . vf_h($aktion) . '">'
        . '<input type="hidden" name="token" value="' . vf_h($token) . '">'
        . '<button class="btn btn-primary btn-lg" type="submit">' . vf_h($knopf) . '</button>'
        . '</form>');
}

function vf_token(string $wert): ?string
{
    return preg_match('/^[a-f0-9]{64}$/D', $wert) ? $wert : null;
}

/** Formulare nur von der eigenen Website annehmen: Fremde Seiten könnten sonst über die Browser ihrer Besucher
 *  Anmeldungen auslösen. Fehlen die Angaben (ältere Browser), wird das Formular angenommen. */
function vf_herkunft_ok(): bool
{
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $site = (string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
    if ($origin !== '' && $origin !== VF_BASIS_URL) {
        return false;
    }
    return $site === '' || $site === 'same-origin' || $site === 'none';
}

// ---------- Einstieg ----------

// Für einen Cronjob: php newsletter.php aufraeumen
if (PHP_SAPI === 'cli' && !isset($_SERVER['REQUEST_METHOD'])) {
    if (($argv[1] ?? '') === 'aufraeumen') {
        vf_mit_daten(function () {
            return null;
        });
        echo "aufgeräumt\n";
    }
    exit(0);
}

try {
    $methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($methode === 'POST') {
        if (!vf_herkunft_ok()) {
            vf_seite(403, 'Nicht erlaubt', 'Bitte nutzen Sie das Formular auf unserer Website.', vf_start_link());
        }
        $aktion = vf_eingabe($_POST, 'aktion');
        $token = vf_token(vf_eingabe($_POST, 'token'));
        if ($aktion === 'anmelden') {
            vf_anmelden();
        } elseif ($aktion === 'bestaetigen' && $token) {
            vf_bestaetigen($token);
        } elseif ($aktion === 'abmelden' && $token) {
            vf_abmelden($token);
        }
        vf_weiter('ungueltig');
    }
    if ($methode !== 'GET' && $methode !== 'HEAD') {
        header('Allow: GET, POST');
        vf_seite(405, 'Nicht erlaubt', 'Diese Adresse nimmt nur Formulare der Website entgegen.', vf_start_link());
    }

    // Bei jedem Aufruf aufräumen – so gelten die Löschfristen auch, wenn eine Weile niemand das Formular abschickt.
    // Dabei nachsehen, ob ein Bestätigungslink noch gilt: Abgelaufene oder schon bestätigte Links zeigen keinen Knopf.
    $token = isset($_GET['bestaetigen']) ? vf_token(vf_eingabe($_GET, 'bestaetigen')) : null;
    $linkstand = vf_mit_daten(function (array &$daten) use ($token) {
        $email = $token === null ? null : vf_finde_token($daten['eintraege'], $token);
        if ($email === null) {
            return 'ungueltig';
        }
        $eintrag = $daten['eintraege'][$email];
        if ($eintrag['status'] === 'offen' && $eintrag['angelegt_ts'] >= time() - VF_FRIST_TAGE * 86400) {
            return 'offen';
        }
        return $eintrag['status'] === 'bestaetigt' ? 'bestaetigt' : 'ungueltig';
    });

    if (isset($_GET['bestaetigen'])) {
        if ($linkstand !== 'offen') {
            vf_weiter($linkstand);
        }
        vf_knopfseite('bestaetigen', $token, 'Anmeldung bestätigen',
            'Ein Klick noch: Bestätigen Sie, dass Sie zum Start von VereinsFlow und bei wichtigen Neuigkeiten eine '
                . 'E-Mail bekommen möchten.',
            'Anmeldung bestätigen');
    }
    if (isset($_GET['abmelden'])) {
        $token = vf_token(vf_eingabe($_GET, 'abmelden'));
        if (!$token) {
            vf_weiter('ungueltig');
        }
        vf_knopfseite('abmelden', $token, 'Abmelden',
            'Möchten Sie keine E-Mails mehr zu VereinsFlow bekommen? Dann melden Sie sich hier ab.',
            'Jetzt abmelden');
    }

    $status = vf_eingabe($_GET, 'status');
    if ($status === 'gesendet') {
        vf_seite(200, 'Fast geschafft',
            'Wir haben Ihnen eine E-Mail mit einem Bestätigungslink geschickt. Bitte klicken Sie darauf – erst dann '
                . 'ist Ihre Anmeldung gültig. Keine E-Mail bekommen? Sehen Sie bitte auch im Spam-Ordner nach, oder '
                . 'schreiben Sie uns an ' . vf_mail_link() . '.',
            vf_start_link());
    }
    if ($status === 'bestaetigt') {
        vf_seite(200, 'Danke – Sie sind angemeldet',
            'Wir melden uns, sobald VereinsFlow startet, und bei wichtigen Neuigkeiten. Abmelden können Sie sich '
                . 'jederzeit über den Link in unseren E-Mails.',
            vf_start_link());
    }
    if ($status === 'abgemeldet') {
        vf_seite(200, 'Sie sind abgemeldet',
            'Sie bekommen keine E-Mails mehr von uns. Mehr dazu in der <a href="/datenschutz.html#benachrichtigung">'
                . 'Datenschutzerklärung</a>.', vf_start_link());
    }
    if ($status === 'ungueltig') {
        vf_seite(410, 'Dieser Link ist nicht mehr gültig',
            'Der Link ist abgelaufen oder wurde schon verwendet. Haben Sie sich mehrmals angemeldet, nutzen Sie bitte '
                . 'den Link aus der neuesten E-Mail. Sonst können Sie sich einfach neu anmelden.',
            '<p><a class="btn btn-primary btn-lg" href="/#benachrichtigen">Neu anmelden</a></p>');
    }
    header('Location: /#benachrichtigen', true, 302);
    exit;
} catch (Throwable $fehler) {
    error_log('VereinsFlow newsletter.php: ' . $fehler->getMessage());
    vf_fehlerseite();
}
