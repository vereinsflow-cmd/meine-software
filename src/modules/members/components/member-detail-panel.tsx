import Link from "next/link";
import {
  ArrowUpRightIcon,
  CakeIcon,
  KeyRoundIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
} from "lucide-react";
import { ACCENT } from "@/components/shared/accent";
import { CopyButton } from "@/components/shared/copy-button";
import { IconButton } from "@/components/shared/icon-button";
import { MemberStatusBadge, ToneBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { SOFT_CARD_SURFACE } from "@/components/ui/surface";
import { formatCalendarDate, formatEuroFromCents } from "@/lib/dates";
import { phoneHref } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_LABEL } from "@/modules/fees/schemas";
import type { MemberFeeInfo } from "@/modules/fees/service";
import { birthdayText, membershipDuration, safeColor, tint } from "../display";
import type { MemberDetail } from "../types";
import { MemberAvatar } from "./member-avatar";

/**
 * Detailbereich rechts neben der Mitgliederliste (ab `lg`) – wie in der Kontakte- oder Mail-App. Oben ein Band in der Farbe
 * der (ersten) Abteilung als ruhiger Anker, darunter Kontakt, Mitgliedschaft und Benutzerkonto. Alles aus `getMember` und
 * `getMemberFee` – dieselben Dienste wie die Seite des Mitglieds: Was die Rolle dort nicht sieht (Kontakt und Anschrift,
 * Geburtstag, Beitrag), fehlt hier genauso, denn die Dienste schwärzen es bzw. liefern `null`. Alles Weitere (Notizen,
 * Einwilligungen, Verlauf, Archivieren …) steht auf der Seite des Mitglieds („Profil öffnen“).
 */
export function MemberDetailPanel({
  member,
  fee,
  colorOf,
  profileHref = `/mitglieder/${member.id}`,
  className,
}: {
  member: MemberDetail;
  fee: MemberFeeInfo | null;
  colorOf: ReadonlyMap<string, string | null>;
  /** Ziel von „Profil öffnen“ (die Liste gibt ihre Adresse als Rückweg mit). */
  profileHref?: string;
  className?: string;
}) {
  const name = `${member.firstName} ${member.lastName}`;
  const mainColor = safeColor(colorOf.get(member.departments[0]?.id ?? ""));
  const address = member.contact
    ? [
        member.contact.street,
        [member.contact.postalCode, member.contact.city].filter(Boolean).join(" "),
        member.contact.country && member.contact.country !== "DE" ? member.contact.country : null,
      ].filter((line): line is string => Boolean(line))
    : [];
  // Nach dem Austritt nur bis zum Austrittstag; ausgetreten oder archiviert ohne Austrittsdatum gar nicht (Ende unbekannt).
  const duration = membershipDuration(member.joinedAt, {
    leftAt: member.leftAt,
    ended: member.status === "LEFT" || member.archivedAt !== null,
  });

  return (
    // `id` und `tabIndex`: Ziel des Sprunglinks „Zum ausgewählten Mitglied“ über der Liste (der Fokus landet hier).
    <section
      id="mitglied-detail"
      tabIndex={-1}
      aria-labelledby="mitglied-detail-name"
      className={cn(
        SOFT_CARD_SURFACE,
        "overflow-hidden outline-none lg:min-h-0 lg:overflow-y-auto",
        className,
      )}
    >
      {/* Band in der Abteilungsfarbe – reine Fläche, kein Text darauf. */}
      <div
        aria-hidden="true"
        className="h-20 bg-linear-120 from-muted to-card"
        style={
          mainColor
            ? {
                backgroundImage: `linear-gradient(120deg, ${tint(mainColor, 34)} 0%, ${tint(mainColor, 14)} 55%, var(--card) 100%)`,
              }
            : undefined
        }
      />

      <div className="px-5 pb-6 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-start gap-4">
            <MemberAvatar
              firstName={member.firstName}
              lastName={member.lastName}
              color={mainColor}
              className="-mt-10 size-20 text-2xl ring-4 ring-card"
            />
            <div className="min-w-0 pt-3">
              <h2
                id="mitglied-detail-name"
                className="text-2xl font-bold tracking-tight break-words"
              >
                {name}
              </h2>
              {member.clubFunction && (
                <p className="text-muted-foreground">{member.clubFunction}</p>
              )}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <MemberStatusBadge status={member.status} />
                {member.archivedAt && !member.deletedAt && (
                  <ToneBadge tone="neutral">Archiviert</ToneBadge>
                )}
                {member.deletedAt && <ToneBadge tone="danger">Im Papierkorb</ToneBadge>}
                {member.private?.birthDate && (
                  <ToneBadge tone="neutral" className="gap-1">
                    <CakeIcon aria-hidden="true" className="size-3.5" />
                    <span className="sr-only">Geburtstag: </span>
                    {birthdayText(member.private.birthDate)}
                  </ToneBadge>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-3">
            {/* Wie auf der Seite des Mitglieds: Im Papierkorb lässt sich nichts bearbeiten. */}
            {member.can.update && !member.deletedAt && (
              <Button asChild variant="outline">
                <Link href={`/mitglieder/${member.id}/bearbeiten`}>
                  <PencilIcon /> Bearbeiten
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link href={profileHref}>
                Profil öffnen <ArrowUpRightIcon />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Block title="Kontakt">
            {!member.contact ? (
              <p className="text-sm text-muted-foreground">
                Für dieses Mitglied darfst du keine Kontaktdaten sehen.
              </p>
            ) : !member.email && !member.phone && address.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Kontaktdaten hinterlegt.</p>
            ) : (
              <ul className="-my-1.5 divide-y divide-foreground/[0.07]">
                {member.email && (
                  <ContactRow icon={<MailIcon />} accent="blue" label="E-Mail" value={member.email}>
                    <CopyButton value={member.email} label="E-Mail-Adresse kopieren" />
                    <IconButton
                      asChild
                      label="E-Mail schreiben"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <a href={`mailto:${member.email}`}>
                        <MailIcon />
                      </a>
                    </IconButton>
                  </ContactRow>
                )}
                {member.phone && (
                  <ContactRow
                    icon={<PhoneIcon />}
                    accent="emerald"
                    label="Telefon"
                    value={member.phone}
                  >
                    <CopyButton value={member.phone} label="Telefonnummer kopieren" />
                    <IconButton
                      asChild
                      label="Anrufen"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <a href={phoneHref(member.phone)}>
                        <PhoneIcon />
                      </a>
                    </IconButton>
                  </ContactRow>
                )}
                {address.length > 0 && (
                  <ContactRow
                    icon={<MapPinIcon />}
                    accent="amber"
                    label="Anschrift"
                    value={address.join(", ")}
                    multiline
                  >
                    <CopyButton value={address.join("\n")} label="Anschrift kopieren" />
                  </ContactRow>
                )}
              </ul>
            )}
          </Block>

          {/* Bezeichnung über dem Wert wie beim Kontakt – so bleibt der Wert breit genug. */}
          <Block title="Mitgliedschaft">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-sm">
              <Field label="Mitgliedsnr.">
                <span className="tabular-nums">{member.memberNumber ?? "–"}</span>
              </Field>
              <Field label="Eintritt">
                <span className="tabular-nums">{formatCalendarDate(member.joinedAt)}</span>
                {duration && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {duration}
                  </span>
                )}
              </Field>
              {member.leftAt && (
                <Field label="Austritt" wide>
                  <span className="tabular-nums">{formatCalendarDate(member.leftAt)}</span>
                </Field>
              )}
              <Field label="Abteilungen" wide>
                {member.departments.length === 0 ? (
                  <span className="font-normal text-muted-foreground">keine</span>
                ) : (
                  <ul className="mt-0.5 flex flex-wrap gap-1.5">
                    {member.departments.map((department) => {
                      const color = safeColor(colorOf.get(department.id));
                      return (
                        <li
                          key={department.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-card py-0.5 pr-2.5 pl-2 text-xs font-medium ring-1 ring-foreground/10"
                        >
                          <span
                            aria-hidden="true"
                            className="size-2 rounded-full bg-muted-foreground"
                            style={color ? { backgroundColor: color } : undefined}
                          />
                          {department.name}
                          {department.isLeader && (
                            <span className="font-normal text-muted-foreground">· Leitung</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Field>
              {/* Nur mit Finanz-Leserecht (sonst liefert `getMemberFee` `null`) – wie die Karte „Beitrag“ der Mitgliedsseite. */}
              {fee && (
                <Field label={`Beitrag ${fee.period.label}`} wide>
                  {fee.charge ? (
                    <>
                      <span className="font-semibold tabular-nums">
                        {formatEuroFromCents(fee.charge.amountCents)}
                      </span>
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {fee.charge.mainFeeTypeName} ·{" "}
                        {PAYMENT_METHOD_LABEL[fee.charge.paymentMethod]}
                      </span>
                    </>
                  ) : fee.familyCharges.length > 0 ? (
                    "über den Familienbeitrag"
                  ) : (
                    (fee.exempt ?? "kein Beitrag")
                  )}
                  {fee.openCharges.count > 0 && (
                    <span className="block text-xs text-amber-800 dark:text-amber-300">
                      {fee.openCharges.count} offen · {formatEuroFromCents(fee.openCharges.cents)}
                    </span>
                  )}
                </Field>
              )}
            </dl>
          </Block>
        </div>

        {/* Benutzerkonto: eine flache Zeile – hier gibt es nur einen Zustand zu zeigen. */}
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-muted/70 px-4 py-3 text-sm sm:px-5 dark:bg-muted/50">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4",
              member.accountStatus === "ACTIVE"
                ? ACCENT.emerald.tile
                : member.accountStatus === "SUSPENDED"
                  ? ACCENT.rose.tile
                  : ACCENT.slate.tile,
            )}
          >
            <KeyRoundIcon />
          </span>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Benutzerkonto
            </h3>
            {member.accountStatus === null ? (
              <p className="text-muted-foreground">Kein Benutzerkonto verknüpft.</p>
            ) : member.accountStatus === "ACTIVE" ? (
              <p>
                <span className="font-medium">Konto aktiv</span>
                <span className="text-muted-foreground">
                  {" "}
                  – kann sich bei VereinsFlow anmelden.
                </span>
              </p>
            ) : (
              <p>
                <span className="font-medium">Konto gesperrt</span>
                <span className="text-muted-foreground"> – kein Zugang zu diesem Verein.</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Ein Wert der Mitgliedschaft: Bezeichnung klein darüber. `wide` nimmt die ganze Breite. */
function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** Grauer Bereich im Detail (wie die grauen Flächen im Dashboard) – ohne Rand, mit kleiner Überschrift. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/70 p-4 sm:p-5 dark:bg-muted/50">
      <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ContactRow({
  icon,
  accent,
  label,
  value,
  multiline = false,
  children,
}: {
  icon: React.ReactNode;
  accent: keyof typeof ACCENT;
  label: string;
  value: string;
  multiline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
          ACCENT[accent].tile,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {/* Gekürzte Werte (lange E-Mail-Adresse) stehen beim Überfahren ganz da; kopieren geht immer vollständig. */}
        <p
          className={cn("text-sm font-medium", multiline ? "break-words" : "truncate")}
          title={multiline ? undefined : value}
        >
          {value}
        </p>
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </li>
  );
}
