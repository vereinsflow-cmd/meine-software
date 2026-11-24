/**
 * Zeiten der Szene „mitglieder“ – alles aus der Stimme (Abschnitt 3) bzw. den Szenengrenzen abgeleitet.
 * „Mit VereinsFlow sind alle Mitglieder an einem Ort. Ihre Excel-Liste nehmen Sie mit. Fehler fallen schon vor dem
 * Speichern auf.“
 */
import { S } from "../../film";
import { cue, cueEnd } from "../../lib/timeline";

const w = (key: string, nth = 0) => cue(key, { section: 3, nth });

/** Wortanfänge (absolute Frames) */
export const W3 = {
  from: S.mitglieder.from,
  to: S.mitglieder.to,
  vereinsflow: w("vereinsflow"),
  vereinsflowEnd: cueEnd("vereinsflow", { section: 3 }),
  sind: w("sind"),
  alle: w("alle"),
  mitglieder: w("mitglieder"),
  an: w("an"),
  einem: w("einem"),
  ort: w("ort"),
  ihre: w("ihre"),
  excel: w("excel-liste"),
  nehmen: w("nehmen"),
  mit2: w("mit", 1),
  fehler: w("fehler"),
  fallen: w("fallen"),
  schon: w("schon"),
  vor: w("vor"),
  dem: w("dem"),
  speichern: w("speichern"),
  auf: w("auf"),
};

/** Ablauf der Szene (absolute Frames, aus den Wörtern) */
export const T = {
  /** Punkt schießt mit dem Lichtstreif herein … */
  dotStart: W3.from - 7,
  /** … und landet kurz nach dessen Höhepunkt (= Grenze) als Punkt im V. Das Logo zündet im Höhepunkt des Streifs, damit
   *  das Bild an der Anfangsgrenze gefüllt ist (V-Striche ab der Grenze, Wortmarke ab ~Grenze + 3); die Wortmarke ist
   *  auf „VereinsFlow“ (W3.vereinsflow … vereinsflowEnd) eng und fertig, das Glanzlicht läuft noch vor dem Abgang durch. */
  dotLand: W3.from + 3,
  logoStart: W3.from - 3,
  /** Logo geht (schnell), die Bühne mit dem Mitglieder-Bildschirm kommt */
  logoOut: W3.alle - 4,
  panelIn: W3.alle - 3,
  rowsAt: W3.mitglieder,
  countAt: W3.alle,
  countEnd: W3.ort,
  /** Punkt parkt an der Glaskante, gleitet auf „Ihre“ zum Knopf „Import“ */
  dotLeave: W3.alle + 4,
  dotPark: W3.alle + 20,
  dotToImport: W3.ihre - 2,
  /** … und tippt ihn auf „Excel-Liste“ an (dann kommt die Datei-Karte; der Punkt sinkt in den Knopf) */
  dotTap: W3.excel,
  /** Datei-Karte fliegt auf „Excel-Liste“ groß vor den Bildschirm (lesbar bis chipDrop), schrumpft dann auf „Import“ und
   *  landet auf „nehmen“ */
  chipIn: W3.excel - 4,
  chipShow: W3.excel + 4,
  chipDrop: W3.excel + 12,
  chipLand: W3.nehmen + 2,
  /** nach dem Haken saugt der Knopf die Karte ein (endet genau, wenn der Wechsel beginnt) */
  chipAbsorb: W3.fehler - 30,
  /** Wechsel zur Import-Vorschau: Mitglieder-Bildschirm tritt zurück, Vorschau schiebt sich nach vorn */
  swap: W3.fehler - 22,
  summaryAt: W3.fehler - 4,
  importRowsAt: W3.fehler - 6,
  rowRed: W3.fallen + 2,
  /** fehlerhafte Zeile hebt sich heraus (Schärfe wandert mit), Hinweis klappt auf */
  lift: W3.schon + 2,
  hint: W3.vor + 2,
};
