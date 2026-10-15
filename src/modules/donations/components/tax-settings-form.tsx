"use client";

import Link from "next/link";
import { useWatch } from "react-hook-form";
import { CircleCheckIcon, PrinterIcon, TriangleAlertIcon } from "lucide-react";
import { DescriptionList } from "@/components/shared/description-list";
import { CheckboxField, FormError, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { calendarDateToInputValue, formatCalendarDate, parseCalendarDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { updateTaxSettingsAction } from "../actions";
import { EXEMPTION_KIND_LABEL } from "../format";
import { EXEMPTION_KINDS, taxSettingsSchema, type TaxSettingsInput } from "../schemas";
import type { TaxSettingsDto } from "../service";
import { taxValidity, taxWarnings, type TaxSettings, type TaxValidity } from "../tax-validity";
import { ChoiceField, type Choice } from "./form-parts";

/**
 * Finanzamt-Angaben (Einstellungen → Finanzamt): Finanzamt, Steuernummer, Art und Datum des Bescheids, letzter
 * Veranlagungszeitraum und die begünstigten Zwecke – genau so, wie sie im Bescheid stehen. Sie stehen auf jeder
 * Zuwendungsbestätigung und auf dem Beleg für Spenden bis 300 €. Oben steht, bis wann der Bescheid gilt (taggenau,
 * § 63 Abs. 5 AO); darunter der Satz, wie er gedruckt wird. Keine Steuerberatung – nur die Angaben aus dem Bescheid.
 */

const KIND_CHOICES: Choice[] = EXEMPTION_KINDS.map((value) => ({
  value,
  label: EXEMPTION_KIND_LABEL[value],
  description:
    value === "FINDING_60A"
      ? "gilt 3 Jahre – nur, solange es noch keinen Freistellungsbescheid gibt"
      : "gilt 5 Jahre",
}));

/** Druckansicht „Beleg für den vereinfachten Zuwendungsnachweis“ (bis 300 €). */
const BELEG_HREF = "/finanzen/spenden/beleg";

export function TaxSettingsForm({
  settings,
  today,
}: {
  settings: TaxSettingsDto;
  /** Heute in Berlin, „JJJJ-MM-TT“ (von der Seite, damit Server und Browser gleich rechnen). */
  today: string;
}) {
  const values = settings.values;
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: taxSettingsSchema,
    defaultValues: {
      taxOffice: values.taxOffice ?? "",
      taxNumber: values.taxNumber ?? "",
      exemptionKind: values.exemptionKind ?? "",
      exemptionDate: values.exemptionDate ? calendarDateToInputValue(values.exemptionDate) : "",
      exemptionLastYear: values.exemptionLastYear != null ? String(values.exemptionLastYear) : "",
      taxPurposes: values.taxPurposes ?? "",
      taxPurposesStatute: values.taxPurposesStatute ?? "",
      membershipFeesDeductible: values.membershipFeesDeductible,
    } satisfies TaxSettingsInput,
    action: updateTaxSettingsAction,
    successMessage: "Finanzamt-Angaben gespeichert.",
  });
  const [
    taxOffice,
    taxNumber,
    exemptionKind,
    exemptionDate,
    exemptionLastYear,
    taxPurposes,
    taxPurposesStatute,
    membershipFeesDeductible,
  ] = useWatch({
    control: form.control,
    name: [
      "taxOffice",
      "taxNumber",
      "exemptionKind",
      "exemptionDate",
      "exemptionLastYear",
      "taxPurposes",
      "taxPurposesStatute",
      "membershipFeesDeductible",
    ],
  });
  // Stand so, wie gerade eingetragen (dieselben Regeln wie auf dem Server).
  const kind =
    exemptionKind === "EXEMPTION_NOTICE" ||
    exemptionKind === "KST_ANNEX" ||
    exemptionKind === "FINDING_60A"
      ? exemptionKind
      : null;
  const live: TaxSettings = {
    taxOffice: taxOffice?.trim() || null,
    taxNumber: taxNumber?.trim() || null,
    exemptionKind: kind,
    exemptionDate: exemptionDate ? parseCalendarDate(exemptionDate) : null,
    exemptionLastYear: /^\d{4}$/.test(exemptionLastYear ?? "") ? Number(exemptionLastYear) : null,
    taxPurposes: taxPurposes?.trim() || null,
    taxPurposesStatute: taxPurposesStatute?.trim() || null,
    membershipFeesDeductible: Boolean(membershipFeesDeductible),
  };
  const todayDate = parseCalendarDate(today) ?? new Date(0);
  const sixtyA = kind === "FINDING_60A";

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-5">
      <TaxStatus validity={taxValidity(live, todayDate)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          form={form}
          name="taxOffice"
          label="Finanzamt (nur der Ort)"
          placeholder="z. B. Musterstadt"
          hint="So, wie es im Satz „des Finanzamtes …“ steht."
          autoComplete="off"
        />
        <TextField
          form={form}
          name="taxNumber"
          label="Steuernummer"
          placeholder="z. B. 12/345/67890"
          hint="Die Steuernummer des Vereins, wie im Bescheid."
          autoComplete="off"
          inputClassName="sm:max-w-56"
        />
      </div>

      <ChoiceField
        form={form}
        name="exemptionKind"
        legend="Art des Bescheids"
        choices={KIND_CHOICES}
        onValue={(value) => {
          // Bei § 60a gibt es keinen Veranlagungszeitraum – ein alter Wert würde sonst als Fehler gemeldet.
          if (value === "FINDING_60A") form.setValue("exemptionLastYear", "");
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          form={form}
          name="exemptionDate"
          label="Datum des Bescheids"
          type="date"
          inputClassName="sm:max-w-48"
        />
        {!sixtyA && (
          <TextField
            form={form}
            name="exemptionLastYear"
            label="Letzter Veranlagungszeitraum"
            placeholder="z. B. 2022"
            inputMode="numeric"
            hint="Das Jahr, für das der Bescheid gilt – steht im Bescheid."
            inputClassName="sm:max-w-32"
          />
        )}
      </div>

      <TextField
        form={form}
        name="taxPurposes"
        label="Begünstigte Zwecke"
        placeholder="z. B. des Sports"
        hint="Genau so, wie es im Bescheid steht – passend hinter „Förderung“."
      />
      {sixtyA && (
        <TextField
          form={form}
          name="taxPurposesStatute"
          label="Zwecke laut Satzung"
          placeholder="z. B. den Sport"
          hint="Passend hinter „Wir fördern nach unserer Satzung“ – also „den Sport“, nicht „des Sports“."
        />
      )}

      <SentencePreview settings={live} />

      <CheckboxField
        form={form}
        name="membershipFeesDeductible"
        label="Mitgliedsbeiträge sind steuerlich abziehbar"
        hint="Bei Sportvereinen nie (§ 10b Abs. 1 Satz 8 EStG) – dann bleibt das Kästchen leer."
      />
      {taxWarnings(live).map((warning) => (
        <p key={warning} className="text-sm text-amber-800 dark:text-amber-300">
          {warning}
        </p>
      ))}

      <FormError message={formError} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SubmitButton pending={isPending} className="w-full sm:w-auto">
          Speichern
        </SubmitButton>
        <ProofLink />
      </div>
    </form>
  );
}

/** Dieselben Angaben als Text – für alle, die die Finanzen nur ansehen dürfen. */
export function TaxSettingsSummary({ settings }: { settings: TaxSettingsDto }) {
  const v = settings.values;
  const sixtyA = v.exemptionKind === "FINDING_60A";
  return (
    <div className="grid gap-5">
      <TaxStatus validity={settings.validity} />
      <DescriptionList
        items={[
          { label: "Finanzamt", value: v.taxOffice },
          { label: "Steuernummer", value: v.taxNumber },
          {
            label: "Bescheid",
            value: v.exemptionKind
              ? `${EXEMPTION_KIND_LABEL[v.exemptionKind]}${
                  v.exemptionDate ? ` vom ${formatCalendarDate(v.exemptionDate)}` : ""
                }`
              : null,
          },
          ...(sixtyA
            ? [{ label: "Zwecke laut Satzung", value: v.taxPurposesStatute }]
            : [{ label: "Letzter Veranlagungszeitraum", value: v.exemptionLastYear }]),
          { label: "Begünstigte Zwecke", value: v.taxPurposes },
          {
            label: "Mitgliedsbeiträge abziehbar",
            value: v.membershipFeesDeductible ? "ja" : "nein",
          },
        ]}
      />
      {settings.warnings.map((warning) => (
        <p key={warning} className="text-sm text-amber-800 dark:text-amber-300">
          {warning}
        </p>
      ))}
      <ProofLink />
    </div>
  );
}

function ProofLink() {
  return (
    <Link
      href={BELEG_HREF}
      className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
    >
      <PrinterIcon className="size-4" aria-hidden="true" />
      Beleg für Spenden bis 300 € ansehen und drucken
    </Link>
  );
}

/** Ob und bis wann der Verein Zuwendungsbestätigungen ausstellen darf (§ 63 Abs. 5 AO, taggenau). */
function TaxStatus({ validity }: { validity: TaxValidity }) {
  let tone: "ok" | "warning" | "danger" | "neutral";
  let text: string;
  if (validity.state === "MISSING") {
    tone = "neutral";
    text =
      validity.missing.length >= 4
        ? "Noch keine vollständigen Angaben – ohne sie kann der Verein keine Zuwendungsbestätigungen ausstellen und keinen Beleg bis 300 € drucken."
        : `Es fehlt noch: ${validity.missing.join(", ")}.`;
  } else {
    const until = formatCalendarDate(validity.validUntil);
    const dayAfter = new Date(validity.validUntil.getTime() + 86_400_000);
    if (validity.state === "EXPIRED") {
      tone = "danger";
      text = `Abgelaufen seit ${formatCalendarDate(dayAfter)} – der Verein darf keine Zuwendungsbestätigungen mehr ausstellen (§ 63 Abs. 5 AO). Neuen Bescheid beim Finanzamt beantragen.`;
    } else if (validity.state === "EXPIRING") {
      tone = "warning";
      const left =
        validity.daysLeft === 0
          ? "Heute ist der letzte Tag"
          : validity.daysLeft === 1
            ? "Läuft morgen ab"
            : `Läuft in ${validity.daysLeft} Tagen ab`;
      text = `${left} – gültig für Bestätigungen nur noch bis ${until}. Bitte rechtzeitig einen neuen Bescheid beantragen.`;
    } else {
      tone = "ok";
      text = `Gültig für Bestätigungen bis ${until}.`;
    }
  }
  const Icon = tone === "ok" ? CircleCheckIcon : TriangleAlertIcon;
  return (
    <div className="grid gap-1">
      <p
        className={cn(
          "flex items-start gap-2 text-sm font-medium",
          tone === "ok" && "text-emerald-700 dark:text-emerald-400",
          tone === "warning" && "text-amber-800 dark:text-amber-300",
          tone === "danger" && "text-destructive",
        )}
      >
        {tone !== "neutral" && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
        <span>{text}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Keine Steuerberatung – im Zweifel Steuerberater fragen.
      </p>
    </div>
  );
}

/** Der Satz, wie er auf der Zuwendungsbestätigung steht – mit den eigenen Angaben fett (fehlende als „…“). */
function SentencePreview({ settings: s }: { settings: TaxSettings }) {
  const part = (value: string | number | null | undefined) =>
    value === null || value === undefined || value === "" ? (
      <span className="text-muted-foreground">…</span>
    ) : (
      <strong className="font-semibold">{value}</strong>
    );
  const date = s.exemptionDate ? formatCalendarDate(s.exemptionDate) : null;
  return (
    <figure className="grid gap-1.5 rounded-md bg-muted/60 px-3 py-2 text-sm">
      <figcaption className="text-xs text-muted-foreground">
        So steht es auf der Zuwendungsbestätigung:
      </figcaption>
      {s.exemptionKind === "FINDING_60A" ? (
        <p>
          Die Einhaltung der satzungsmäßigen Voraussetzungen nach den §§ 51, 59, 60 und 61 AO wurde
          vom Finanzamt {part(s.taxOffice)}, StNr. {part(s.taxNumber)} mit Bescheid vom {part(date)}{" "}
          nach § 60a AO gesondert festgestellt. Wir fördern nach unserer Satzung{" "}
          {part(s.taxPurposesStatute)}.
        </p>
      ) : (
        <p>
          Wir sind wegen Förderung {part(s.taxPurposes)} nach dem Freistellungsbescheid bzw. nach
          der Anlage zum Körperschaftsteuerbescheid des Finanzamtes {part(s.taxOffice)} StNr.{" "}
          {part(s.taxNumber)}, vom {part(date)} für den letzten Veranlagungszeitraum{" "}
          {part(s.exemptionLastYear)} nach § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes von der
          Körperschaftsteuer und nach § 3 Nr. 6 des Gewerbesteuergesetzes von der Gewerbesteuer
          befreit.
        </p>
      )}
      <p>
        Es wird bestätigt, dass die Zuwendung nur zur Förderung {part(s.taxPurposes)} verwendet
        wird.
      </p>
    </figure>
  );
}
