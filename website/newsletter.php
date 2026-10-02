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
// Unbestätigte Anmeldungen werden nach VF_FRIST_TAGE Tagen gelöscht (oder sofort, wenn sie abgemeldet werden; war die
// Adresse früher schon einmal bestätigt, bleibt deren Nachweis), Abmeldungen (nur noch als Nachweis) nach
// VF_NACHWEIS_JAHRE Jahren. Aufgeräumt wird bei jedem Aufruf dieses Skripts und, falls eingerichtet, per Cronjob:
//   php newsletter.php aufraeumen
//
// Schutz vor Missbrauch (das Formular darf keine Spam-Schleuder werden): höchstens VF_MAX_JE_IP Anmeldungen je IP-Adresse
// (IPv6: je /64-Netz) und Stunde, höchstens VF_MAX_JE_ADRESSE Bestätigungs-E-Mails je Postfach in VF_FRIST_TAGE Tagen
// (Plus-Adressen und Gmail-Punkte zählen als dasselbe Postfach), höchstens VF_MAX_GESAMT Bestätigungs-E-Mails je Stunde
// insgesamt, höchstens VF_MAX_OFFEN offene Anmeldungen, Formulare nur von der eigenen Website (Origin/Sec-Fetch-Site),
// ein unsichtbares Fangfeld. Nach außen verrät keine Antwort, ob eine Adresse schon eingetragen ist.
//
// Läuft ab PHP 7.4. Keine Datenbank, keine Bibliotheken. Seiten sind reines HTML mit dem Stylesheet der Website (die
// Content-Security-Policy verbietet Inline-Stile und -Skripte). Die Bestätigungs-E-Mail ist dagegen HTML mit Stilen direkt
// an den Elementen (E-Mail-Programme laden keine Stylesheets) und zusätzlich reiner Text.

declare(strict_types=1);

ini_set('display_errors', '0'); // nie Warnungen mit Serverpfaden in die Seite schreiben
ini_set('log_errors', '1');

const VF_BASIS_URL = 'https://vereins-flow.com';
const VF_ABSENDER = 'kontakt@vereins-flow.com';
const VF_ABSENDER_NAME = 'VereinsFlow';
const VF_HINWEIS_AN = 'kontakt@vereins-flow.com'; // bekommt je bestätigter Anmeldung eine kurze Nachricht (ohne Adresse)
const VF_STYLESHEET = '/assets/css/site.css?v=2026100301';
const VF_SKRIPT = '/assets/js/site.js?v=2026100301'; // Menü der Kopfzeile auf dem Smartphone
const VF_EINWILLIGUNG = 'formular-2026-09-27'; // Fassung des Einwilligungstextes am Formular (Wortlaut: README.md)
const VF_FRIST_TAGE = 7;
const VF_NACHWEIS_JAHRE = 3;
const VF_MAX_JE_IP = 20;
const VF_MAX_JE_ADRESSE = 3;
const VF_MAX_GESAMT = 40;
const VF_MAX_OFFEN = 500;
const VF_ERNEUT_NACH = 900; // frühestens nach 15 Minuten eine weitere Bestätigungs-E-Mail an dieselbe Adresse
const VF_MAX_DATEI = 2000000; // Byte; darüber keine neuen Anmeldungen mehr (Bestätigen und Abmelden gehen weiter)
const VF_ANBIETER = 'VereinsFlow GbR, vertreten durch die Gesellschafter Ben Bleckert und Luis Heidecker';
const VF_ANSCHRIFT = 'Oberschlesienstraße 6a · 45711 Datteln';
const VF_FUSS = "-- \n" . VF_ANBIETER . "\n" . VF_ANSCHRIFT . ' · ' . VF_ABSENDER . "\n"
    . 'Impressum: ' . VF_BASIS_URL . "/impressum.html\n"
    . 'Datenschutz: ' . VF_BASIS_URL . "/datenschutz.html#benachrichtigung\n";

// ---------- Ausgabe ----------

function vf_h(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Eine Seite im Stil der Fehlerseite (404.html): volle Kopf- und Fußzeile wie auf den übrigen Seiten, Meldung in der
 *  Mitte. $symbol (optional, „mail“ oder „circle-check“) setzt ein großes Zeichen über die Überschrift – Brief bei
 *  „Fast geschafft“, Häkchen bei erfolgreicher Anmeldung –, damit Ergebnisseiten nicht wie eine Fehlerseite aussehen. */
function vf_seite(int $status, string $titel, string $text, string $zusatz = '', string $symbol = ''): void
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
    $zeichen = $symbol === '' ? '' : '<span class="page-symbol page-symbol-' . vf_h($symbol) . '" aria-hidden="true">'
        . '<svg class="icon"><use href="#i-' . vf_h($symbol) . '"/></svg></span>
  ';
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
  <script src="' . vf_h(VF_SKRIPT) . '" defer></script>
</head>
<body class="subpage">
<a class="skip-link" href="#inhalt">Zum Inhalt springen</a>

<!-- Symbole: lucide (ISC-Lizenz), wie auf der Startseite -->
<svg class="sprite" aria-hidden="true" focusable="false">
  <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></symbol>
  <symbol id="i-mail" viewBox="0 0 24 24"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/></symbol>
  <symbol id="i-phone" viewBox="0 0 24 24"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></symbol>
  <symbol id="i-circle-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/></symbol>
</svg>

<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="VereinsFlow – zur Startseite">
      <picture>
        <img src="/assets/img/logo.svg" alt="" width="174" height="28">
      </picture>
    </a>
    <a class="btn btn-primary btn-sm header-cta" href="/#kontakt">Demo<span class="header-cta-more"> anfragen</span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menü öffnen">
      <svg class="icon icon-open" aria-hidden="true"><use href="#i-menu"/></svg>
      <svg class="icon icon-close" aria-hidden="true"><use href="#i-x"/></svg>
    </button>
    <nav class="nav" id="site-nav" aria-label="Hauptnavigation">
      <div class="nav-links">
        <ul>
          <li><a href="/#funktionen">Funktionen</a></li>
          <li><a href="/#helferschichten">Helferschichten</a></li>
          <li><a href="/#rollen">Rollen</a></li>
          <li><a href="/#sicherheit">Sicherheit</a></li>
          <li><a href="/#faq">Fragen</a></li>
        </ul>
      </div>
      <a class="btn btn-primary btn-sm btn-header" href="/#kontakt">Demo anfragen</a>
    </nav>
  </div>
</header>

<main id="inhalt" class="not-found notify-page">
  ' . $zeichen . '<h1>' . vf_h($titel) . '</h1>
  <p class="lead">' . $text . '</p>
  ' . $zusatz . '
</main>

<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <picture>
          <img src="/assets/img/logo.svg" alt="VereinsFlow" width="190" height="31">
        </picture>
        <p>Bringt Vereinsarbeit in Fluss. Vereinsverwaltung mit Helferplanung&nbsp;– für Vorstand, Abteilungen und Helfer.</p>
        <!-- Absender und Kontakt: dieselben Angaben wie im Impressum -->
        <address class="footer-contact">
          <span class="footer-sender">VereinsFlow GbR · Datteln (NRW)</span>
          <a href="mailto:kontakt@vereins-flow.com"><svg class="icon" aria-hidden="true"><use href="#i-mail"/></svg><span><span class="sr-only">E&#8209;Mail: </span>kontakt@vereins-flow.com</span></a>
          <a href="tel:+4917656792302"><svg class="icon" aria-hidden="true"><use href="#i-phone"/></svg><span><span class="sr-only">Telefon: </span>+49&nbsp;176&nbsp;56792302</span></a>
        </address>
      </div>
      <div>
        <h2>Produkt</h2>
        <ul>
          <li><a href="/#funktionen">Funktionen</a></li>
          <li><a href="/#helferschichten">Helferschichten</a></li>
          <li><a href="/#suche">Zentrale Suche</a></li>
          <li><a href="/#rollen">Rollen und Rechte</a></li>
          <li><a href="/#sicherheit">Sicherheit</a></li>
        </ul>
      </div>
      <div>
        <h2>Kontakt</h2>
        <ul>
          <li><a href="/#kontakt">Demo anfragen</a></li>
          <li><a href="/#benachrichtigen">Zum Start benachrichtigen</a></li>
          <li><a href="/#ablauf">So starten Sie</a></li>
          <li><a href="/#faq">Häufige Fragen</a></li>
        </ul>
      </div>
      <div>
        <h2>Rechtliches</h2>
        <ul>
          <li><a href="/impressum.html">Impressum</a></li>
          <li><a href="/datenschutz.html">Datenschutz</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 VereinsFlow GbR</span>
      <span>Diese Website setzt keine Cookies und lädt nichts von fremden Servern.</span>
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

/** Nach einer erfolgreichen Anmeldung (Moment des größten Interesses): neben dem Rückweg gleich die Demo-Anfrage */
function vf_start_demo_links(): string
{
    return '<p class="page-actions"><a class="btn btn-primary btn-lg" href="/">Zur Startseite</a>'
        . '<a class="btn btn-secondary btn-lg" href="/#kontakt">Demo anfragen</a></p>';
}

function vf_mail_link(): string
{
    return '<a href="mailto:' . VF_ABSENDER . '">' . VF_ABSENDER . '</a>';
}

/** „Fast geschafft“: woran man die Bestätigungs-E-Mail im Posteingang (oder im Spam-Ordner) erkennt und wie lange der
 *  Link gilt, dazu der Weg bei vertippter Adresse. Nur Anzeige – die Adresse selbst steht bewusst nirgends auf der Seite
 *  und nicht in der Adresszeile. Der Betreff hat denselben Wortlaut wie in vf_mail_bestaetigen (bei Änderung dort
 *  mitziehen); die Frist zählt wie dort ab der ersten Anmeldung. */
function vf_mail_hinweise(): string
{
    return '<dl class="mail-facts">'
        . '<div><dt>Absender</dt><dd>' . vf_h(VF_ABSENDER_NAME) . ' <span class="nowrap">' . vf_h('<' . VF_ABSENDER . '>')
        . '</span></dd></div>'
        . '<div><dt>Betreff</dt><dd>„Bitte bestätigen Sie Ihre Anmeldung bei VereinsFlow“</dd></div>'
        . '<div><dt>Link gültig</dt><dd>' . VF_FRIST_TAGE . '&nbsp;Tage ab Ihrer Anmeldung <small>(das genaue Ende steht in '
        . 'der E&#8209;Mail)</small></dd></div>'
        . '</dl>'
        . '<p class="mail-help">Keine E&#8209;Mail bekommen? Sehen Sie bitte auch im Spam- oder Werbeordner nach, oder '
        . 'schreiben Sie uns an ' . vf_mail_link() . '.</p>'
        . '<p class="mail-help">Adresse vertippt? Dann einfach <a href="/#benachrichtigen">neu eintragen</a>&nbsp;– eine '
        . 'nicht bestätigte Adresse löschen wir nach ' . VF_FRIST_TAGE . '&nbsp;Tagen von selbst.</p>';
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
 * Liest die Anmeldungen unter einer Dateisperre (höchstens etwa 4 Sekunden warten), räumt auf (abgelaufene Einträge gibt es
 * für $aendern also nicht mehr), lässt $aendern sie verändern und schreibt sie nur zurück, wenn sich etwas geändert hat. Eine vorhandene, aber unlesbare Datei wird nie
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
        vf_aufraeumen($daten);
        $ergebnis = $aendern($daten, $schluessel);

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
        if ($offenAbgelaufen) {
            vf_offen_entfernen($daten, (string) $email);
        } elseif ($nachweisAbgelaufen) {
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

/** Entfernt eine unbestätigte Anmeldung (abgelaufen oder abgemeldet). War die Adresse früher schon einmal bestätigt und
 *  abgemeldet, kommt der damalige Stand zurück – der Nachweis der früheren Einwilligung bleibt so seine volle Frist
 *  erhalten, von der unbestätigten Neuanmeldung (Zeit, IP-Adresse, Verein) bleibt nichts. */
function vf_offen_entfernen(array &$daten, string $email): void
{
    $frueher = $daten['eintraege'][$email]['frueher'] ?? [];
    if (!$frueher) {
        unset($daten['eintraege'][$email]);
        return;
    }
    $alt = $frueher[0];
    $wieder = [
        'email' => $email,
        'verein' => '',
        'status' => 'abgemeldet',
        'tokens' => [],
        'einwilligung' => $alt['einwilligung'] ?? '',
        'angelegt' => $alt['angelegt'] ?? '',
        'angelegt_ts' => (int) strtotime($alt['angelegt'] ?? ''),
        'angelegt_ip' => $alt['angelegt_ip'] ?? '',
        'gesendet_ts' => 0,
        'bestaetigt' => $alt['bestaetigt'] ?? '',
        'bestaetigt_ip' => $alt['bestaetigt_ip'] ?? '',
        'abgemeldet' => $alt['abgemeldet'] ?? vf_zeit(time()),
        'abgemeldet_ts' => (int) (strtotime($alt['abgemeldet'] ?? '') ?: time()),
    ];
    if (count($frueher) > 1) {
        $wieder['frueher'] = array_slice($frueher, 1);
    }
    $daten['eintraege'][$email] = $wieder;
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

/** Inhalt der E-Mail: nur Text oder – mit $html – Text und HTML als Alternativen (Programme ohne HTML zeigen den Text).
 *  Beide quoted-printable, also Zeilen mit höchstens 76 Zeichen, Zeilenenden CRLF. Liefert [Kopfzeilen, Inhalt]. */
function vf_mime(string $text, ?string $html): array
{
    $kodiert = function (string $inhalt): string {
        return quoted_printable_encode(str_replace(["\r\n", "\n"], ["\n", "\r\n"], $inhalt));
    };
    if ($html === null) {
        return [['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: quoted-printable'], $kodiert($text)];
    }
    $grenze = 'vf-' . bin2hex(random_bytes(12));
    $teil = function (string $typ, string $inhalt) use ($grenze, $kodiert): string {
        return '--' . $grenze . "\r\nContent-Type: " . $typ . "; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: quoted-printable\r\n\r\n" . $kodiert($inhalt) . "\r\n";
    };
    return [
        ['Content-Type: multipart/alternative; boundary="' . $grenze . '"'],
        $teil('text/plain', $text) . $teil('text/html', $html) . '--' . $grenze . "--\r\n",
    ];
}

function vf_mail(string $an, string $betreff, string $text, ?string $html = null): bool
{
    [$inhaltskopf, $nachricht] = vf_mime($text, $html);
    $kopf = implode("\r\n", array_merge([
        'From: ' . VF_ABSENDER_NAME . ' <' . VF_ABSENDER . '>',
        'Reply-To: ' . VF_ABSENDER,
        // Date und Message-ID selbst setzen: Nicht jeder Versandweg ergänzt sie, und Gmail lehnt Mails ohne Message-ID ab
        'Date: ' . gmdate(DATE_RFC2822),
        'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . substr((string) strrchr(VF_ABSENDER, '@'), 1) . '>',
        'MIME-Version: 1.0',
    ], $inhaltskopf, ['Auto-Submitted: auto-generated']));
    // Nur für Tests auf dem eigenen Rechner: E-Mails in eine Datei schreiben statt zu verschicken
    $testdatei = getenv('VF_NEWSLETTER_MAILTEST');
    if ($testdatei) {
        $eintrag = ['an' => $an, 'betreff' => $betreff, 'text' => $text, 'html' => $html, 'kopf' => $kopf,
            'nachricht' => $nachricht];
        return file_put_contents($testdatei, json_encode($eintrag, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n",
            FILE_APPEND | LOCK_EX) !== false;
    }
    // Mit Absenderadresse der eigenen Domain für Rückläufer und SPF (-f); nur ein Versuch, damit nichts doppelt ankommt
    $ok = @mail($an, vf_betreff($betreff), $nachricht, $kopf, '-f' . VF_ABSENDER);
    if (!$ok) {
        error_log('VereinsFlow newsletter.php: mail() fehlgeschlagen');
    }
    return $ok;
}

/** Ablauf des Bestätigungslinks in deutscher Zeit, z. B. „04.10.2026 um 16:39 Uhr“. */
function vf_frist_text(int $ts): string
{
    $zeit = (new DateTimeImmutable('@' . $ts))->setTimezone(new DateTimeZone('Europe/Berlin'));
    return $zeit->format('d.m.Y') . ' um ' . $zeit->format('H:i') . ' Uhr';
}

/** Bestätigungs-E-Mail. Enthält bewusst nichts, was im Formular eingegeben wurde (auch nicht den Vereinsnamen) – sonst
 *  ließen sich über das Formular E-Mails mit fremdem Text an beliebige Adressen schicken. */
function vf_mail_bestaetigen(string $email, string $token, string $abmeldelink, int $gueltigBis): bool
{
    $link = VF_BASIS_URL . '/newsletter.php?bestaetigen=' . $token;
    $frist = vf_frist_text($gueltigBis);
    $text = "Guten Tag,\n\n"
        . "vielen Dank für Ihr Interesse an VereinsFlow! Sie haben sich auf vereins-flow.com eingetragen, um zum Start "
        . "und bei wichtigen Neuigkeiten eine E-Mail von uns zu bekommen.\n\n"
        . "Bitte bestätigen Sie Ihre Anmeldung über diesen Link:\n" . $link . "\n\n"
        . 'Der Link ist bis zum ' . $frist . ' gültig. Erst nach Ihrer Bestätigung nehmen wir Sie in die Liste auf.'
        . "\n\n"
        . "Was Sie erwartet:\n"
        . "- eine E-Mail, sobald VereinsFlow startet\n"
        . "- wichtige Neuigkeiten – selten, höchstens etwa einmal im Monat\n"
        . "- Abmelden jederzeit über den Link in jeder E-Mail\n\n"
        . 'Sie haben sich nicht angemeldet? Dann ignorieren Sie diese E-Mail einfach – ohne Bestätigung löschen wir Ihre '
        . 'Angaben nach ' . VF_FRIST_TAGE . " Tagen automatisch.\n\n"
        . "Abmelden:\n" . $abmeldelink . "\n\n"
        . "Viele Grüße\nIhr VereinsFlow-Team\n\n" . VF_FUSS;
    return vf_mail($email, 'Bitte bestätigen Sie Ihre Anmeldung bei VereinsFlow', $text,
        vf_mail_bestaetigen_html($link, $abmeldelink, $frist));
}

/** Gestaltete Fassung der Bestätigungs-E-Mail. E-Mail-Programme verstehen nur einen Teil von HTML und CSS: deshalb Tabellen
 *  statt Flexbox, Stile direkt an den Elementen, das Logo als PNG (Gmail und Outlook zeigen kein SVG), Sonderregeln für
 *  Outlook unter Windows ([if mso]). Ohne Bilder bleibt alles lesbar (Alternativtext statt Logo). */
function vf_mail_bestaetigen_html(string $link, string $abmeldelink, string $frist): string
{
    $vorlage = <<<'HTML'
<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Bitte bestätigen Sie Ihre Anmeldung</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>body, table, td, p, a, h1 { font-family: 'Segoe UI', Arial, sans-serif !important; }</style>
<![endif]-->
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important;
    font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
  @media only screen and (max-width: 600px) {
    .vf-aussen { padding: 16px 8px !important; }
    .vf-karte { padding: 28px 22px 26px !important; }
    .vf-titel { font-size: 22px !important; }
    .vf-knopf { width: 100% !important; }
    .vf-knopf a { display: block !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f2f5f9;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Nur noch ein Schritt – dann sagen wir Ihnen Bescheid, sobald VereinsFlow startet.{{fuellung}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f2f5f9;">
<tr>
<td class="vf-aussen" align="center" style="padding:36px 16px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr>
<td class="vf-karte" style="background-color:#ffffff;border:1px solid #e1e7ef;border-radius:16px;padding:36px 40px 34px;font-family:{{schrift}};font-size:16px;line-height:1.6;color:#354559;">
<a href="{{start}}" style="text-decoration:none;"><img src="{{logo}}" width="190" height="29" alt="VereinsFlow" style="display:block;width:190px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;font-family:{{schrift}};font-size:22px;font-weight:700;line-height:29px;color:#1c4a7a;"></a>
<h1 class="vf-titel" style="margin:30px 0 14px;font-family:{{schrift}};font-size:24px;line-height:1.3;font-weight:700;color:#0e1a2b;">Bitte bestätigen Sie Ihre Anmeldung</h1>
<p style="margin:0 0 14px;">Guten Tag,</p>
<p style="margin:0 0 26px;">vielen Dank für Ihr Interesse an VereinsFlow! Sie haben sich auf <a href="{{start}}" target="_blank" style="color:#0555b7;text-decoration:none;white-space:nowrap;">vereins-flow.com</a> eingetragen, um zum Start und bei wichtigen Neuigkeiten eine <span style="white-space:nowrap;">E-Mail</span> von uns zu bekommen. Dafür brauchen wir noch Ihre Bestätigung:</p>
<table role="presentation" class="vf-knopf" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" bgcolor="#0555b7" style="background-color:#0555b7;border-radius:999px;mso-padding-alt:14px 32px;">
<a href="{{link}}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:{{schrift}};font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:999px;">Anmeldung bestätigen</a>
</td>
</tr>
</table>
<p style="margin:14px 0 28px;font-size:14px;line-height:1.5;color:#5a6a7e;">Der Link ist bis zum {{frist}} gültig. Erst nach Ihrer Bestätigung nehmen wir Sie in die Liste auf.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#edf3fc" style="background-color:#edf3fc;border-radius:12px;padding:18px 22px;font-family:{{schrift}};font-size:15px;line-height:1.5;color:#354559;">
<p style="margin:0 0 8px;font-weight:700;color:#0e1a2b;">Was Sie erwartet</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td valign="top" style="padding:3px 10px 3px 0;font-family:{{schrift}};font-size:15px;line-height:1.5;font-weight:700;color:#0555b7;">&#10003;</td><td style="padding:3px 0;font-family:{{schrift}};font-size:15px;line-height:1.5;color:#354559;">Eine <span style="white-space:nowrap;">E-Mail</span>, sobald VereinsFlow startet</td></tr>
<tr><td valign="top" style="padding:3px 10px 3px 0;font-family:{{schrift}};font-size:15px;line-height:1.5;font-weight:700;color:#0555b7;">&#10003;</td><td style="padding:3px 0;font-family:{{schrift}};font-size:15px;line-height:1.5;color:#354559;">Wichtige Neuigkeiten – selten, höchstens etwa einmal im Monat</td></tr>
<tr><td valign="top" style="padding:3px 10px 3px 0;font-family:{{schrift}};font-size:15px;line-height:1.5;font-weight:700;color:#0555b7;">&#10003;</td><td style="padding:3px 0;font-family:{{schrift}};font-size:15px;line-height:1.5;color:#354559;">Abmelden jederzeit über den Link in jeder <span style="white-space:nowrap;">E-Mail</span></td></tr>
</table>
</td>
</tr>
</table>
<p style="margin:28px 0 28px;">Viele Grüße<br>Ihr VereinsFlow-Team</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="border-top:1px solid #e1e7ef;font-size:1px;line-height:1px;">&nbsp;</td></tr>
</table>
<p style="margin:18px 0 0;font-size:13px;line-height:1.55;color:#5a6a7e;">Funktioniert der Knopf nicht? Dann kopieren Sie diesen Link in die Adresszeile Ihres Browsers:<br><a href="{{link}}" target="_blank" style="color:#0555b7;word-break:break-all;">{{link}}</a></p>
<p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:#5a6a7e;">Sie haben sich nicht angemeldet? Dann ignorieren Sie diese <span style="white-space:nowrap;">E-Mail</span> einfach – ohne Bestätigung löschen wir Ihre Angaben nach {{tage}} Tagen automatisch.</p>
</td>
</tr>
<tr>
<td align="center" style="padding:22px 16px 0;font-family:{{schrift}};font-size:12px;line-height:1.6;color:#5a6a7e;">
<p style="margin:0 0 6px;">{{anbieter}}<br>{{anschrift}} · <a href="mailto:{{absender}}" style="color:#5a6a7e;">{{absender}}</a></p>
<p style="margin:0;"><a href="{{impressum}}" target="_blank" style="color:#5a6a7e;">Impressum</a> &nbsp;·&nbsp; <a href="{{datenschutz}}" target="_blank" style="color:#5a6a7e;">Datenschutz</a> &nbsp;·&nbsp; <a href="{{abmelden}}" target="_blank" style="color:#5a6a7e;">Abmelden</a></p>
</td>
</tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td>
</tr>
</table>
</body>
</html>
HTML;
    return strtr($vorlage, [
        '{{schrift}}' => "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
        // Füllzeichen nach dem Vorschautext, damit die Vorschau im Posteingang nicht mit dem Seitentext weiterläuft
        '{{fuellung}}' => str_repeat('&#8199;&#65279;&#847;', 40),
        '{{start}}' => vf_h(VF_BASIS_URL . '/'),
        '{{logo}}' => vf_h(VF_BASIS_URL . '/assets/img/logo-mail.png'),
        '{{link}}' => vf_h($link),
        '{{frist}}' => vf_h($frist),
        '{{tage}}' => (string) VF_FRIST_TAGE,
        '{{anbieter}}' => vf_h(VF_ANBIETER),
        '{{anschrift}}' => vf_h(VF_ANSCHRIFT),
        '{{absender}}' => vf_h(VF_ABSENDER),
        '{{impressum}}' => vf_h(VF_BASIS_URL . '/impressum.html'),
        '{{datenschutz}}' => vf_h(VF_BASIS_URL . '/datenschutz.html#benachrichtigung'),
        '{{abmelden}}' => vf_h($abmeldelink),
    ]);
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
            'Die eingegebene Adresse sieht nicht wie eine gültige E&#8209;Mail-Adresse aus.',
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
        return ['token' => $token, 'abmeldelink' => vf_abmelde_link($email, $schluessel), 'vorher' => $vorhanden,
            'gueltig_bis' => $eintrag['angelegt_ts'] + VF_FRIST_TAGE * 86400];
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
        $verschickt = vf_mail_bestaetigen($email, $ergebnis['token'], $ergebnis['abmeldelink'], $ergebnis['gueltig_bis']);
    } catch (Throwable $fehler) {
        error_log('VereinsFlow newsletter.php: Bestätigungs-E-Mail nicht erzeugt: ' . $fehler->getMessage());
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
 *  Nachweis der früheren Einwilligung (VF_NACHWEIS_JAHRE Jahre); Vereinsname und Links werden gelöscht. Eine noch nicht
 *  bestätigte Anmeldung wird ganz entfernt (vf_offen_entfernen). */
function vf_abmelden(string $token): void
{
    $getroffen = vf_mit_daten(function (array &$daten, string $schluessel) use ($token) {
        foreach ($daten['eintraege'] as $email => $eintrag) {
            if ($eintrag['status'] !== 'abgemeldet' && hash_equals(vf_abmelde_token((string) $email, $schluessel), $token)) {
                if ($eintrag['status'] === 'offen') {
                    vf_offen_entfernen($daten, (string) $email); // nie bestätigt: keine Einwilligung nachzuweisen
                    return true;
                }
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
                . 'E&#8209;Mail bekommen möchten.',
            'Anmeldung bestätigen');
    }
    if (isset($_GET['abmelden'])) {
        $token = vf_token(vf_eingabe($_GET, 'abmelden'));
        if (!$token) {
            vf_weiter('ungueltig');
        }
        vf_knopfseite('abmelden', $token, 'Abmelden',
            'Möchten Sie keine E&#8209;Mails mehr zu VereinsFlow bekommen? Dann melden Sie sich hier ab.',
            'Jetzt abmelden');
    }

    $status = vf_eingabe($_GET, 'status');
    if ($status === 'gesendet') {
        vf_seite(200, 'Fast geschafft',
            'Wir haben Ihnen eine E&#8209;Mail mit einem Bestätigungslink geschickt. Bitte klicken Sie darauf&nbsp;– '
                . 'erst dann ist Ihre Anmeldung gültig.',
            vf_mail_hinweise() . vf_start_demo_links(), 'mail');
    }
    if ($status === 'bestaetigt') {
        vf_seite(200, 'Danke – Sie sind angemeldet',
            'Wir melden uns, sobald VereinsFlow startet, und bei wichtigen Neuigkeiten. Abmelden können Sie sich '
                . 'jederzeit über den Link in unseren E&#8209;Mails.',
            vf_start_demo_links(), 'circle-check');
    }
    if ($status === 'abgemeldet') {
        vf_seite(200, 'Sie sind abgemeldet',
            'Sie bekommen keine E&#8209;Mails mehr von uns. Mehr dazu in der <a href="/datenschutz.html#benachrichtigung">'
                . 'Datenschutzerklärung</a>.', vf_start_link());
    }
    if ($status === 'ungueltig') {
        vf_seite(410, 'Dieser Link ist nicht mehr gültig',
            'Der Link ist abgelaufen oder wurde schon verwendet. Haben Sie sich mehrmals angemeldet, nutzen Sie bitte '
                . 'den Link aus der neuesten E&#8209;Mail. Sonst können Sie sich einfach neu anmelden.',
            '<p><a class="btn btn-primary btn-lg" href="/#benachrichtigen">Neu anmelden</a></p>');
    }
    header('Location: /#benachrichtigen', true, 302);
    exit;
} catch (Throwable $fehler) {
    error_log('VereinsFlow newsletter.php: ' . $fehler->getMessage());
    vf_fehlerseite();
}
