import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCalendarDate,
  formatEuroFromCents,
  toDateInputValue,
  todayCalendarDate,
} from "@/lib/dates";
import { PAYMENT_METHOD_LABEL } from "../schemas";
import type { MemberFeeInfo } from "../service";
import {
  AssignmentDialog,
  EndAssignmentDialog,
  MemberFinanceDialog,
  RemoveAssignmentButton,
} from "./member-fee-dialogs";

/**
 * Karte „Beitrag“ auf der Seite eines Mitglieds (nur mit Finanzrecht): Betrag im laufenden Zeitraum mit Erklärung, Zahler,
 * Zahlweg, Familie, Ermäßigungen und Befreiungen. Das Geburtsdatum steht hier nie – nur, was daraus folgt.
 */
export function MemberFeeCard({
  memberId,
  memberName,
  info,
  options,
}: {
  memberId: string;
  memberName: string;
  info: MemberFeeInfo;
  options: {
    payers: { value: string; label: string }[];
    feeTypes: { value: string; label: string }[];
  } | null;
}) {
  const today = toDateInputValue(todayCalendarDate());
  // Wer zahlt, sagt die Rechnung selbst (eigener Beitrag, sonst der Familienbeitrag) – ohne Beitrag die Einstellung: ein
  // gewählter Zahler, sonst in einer Familie deren Zahler.
  const source = info.charge ?? info.familyCharges[0] ?? null;
  const familyPayer = info.family && info.family.payer.id !== memberId ? info.family.payer : null;
  const payer = source
    ? source.payerMemberId === memberId
      ? null
      : { id: source.payerMemberId, name: source.payerName }
    : (info.payer ?? familyPayer);
  const viaFamily = payer !== null && payer.id !== info.payer?.id;
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Beitrag
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">{info.period.label}</p>
          {info.charge ? (
            <>
              <p className="text-xl font-bold tabular-nums">
                {formatEuroFromCents(info.charge.amountCents)}
              </p>
              <p className="text-muted-foreground">{info.charge.explanation}</p>
            </>
          ) : info.familyCharges.length > 0 ? (
            <p className="font-medium">über den Familienbeitrag</p>
          ) : (
            <p className="font-medium">{info.exempt ?? "kein Beitrag"}</p>
          )}
          {info.familyCharges.map(
            (charge) =>
              charge.family && (
                <p key={charge.key} className="mt-1 text-muted-foreground">
                  <Link
                    href={`/finanzen/beitraege/familien#familie-${charge.family.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {charge.family.name}
                  </Link>
                  : {formatEuroFromCents(charge.amountCents)} –{" "}
                  {charge.explanation.replace(/ → [^→]+$/, "")}, zahlt {charge.payerName}
                </p>
              ),
          )}
          {info.warnings.map((warning) => (
            <p key={warning} className="mt-1 text-amber-700 dark:text-amber-400">
              {warning}
            </p>
          ))}
        </div>

        <dl className="grid gap-1">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Zahlweg</dt>
            <dd>{PAYMENT_METHOD_LABEL[source?.paymentMethod ?? info.paymentMethod]}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Zahler</dt>
            <dd className="text-right">
              {payer ? (
                <Link
                  href={`/mitglieder/${payer.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {payer.name}
                </Link>
              ) : (
                "selbst"
              )}
              {viaFamily && (
                <span className="block text-xs text-muted-foreground">als Zahler der Familie</span>
              )}
            </dd>
          </div>
          {info.family && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Familie</dt>
              <dd className="text-right">
                <Link
                  href={`/finanzen/beitraege/familien#familie-${info.family.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {info.family.name}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {info.family.validFrom.getTime() > todayCalendarDate().getTime() ? "ab" : "seit"}{" "}
                  {formatCalendarDate(info.family.validFrom)}
                  {info.family.validTo && ` bis ${formatCalendarDate(info.family.validTo)}`}
                </span>
              </dd>
            </div>
          )}
          {(info.paysFor.length > 0 || info.paysForFamilies.length > 0) && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Zahlt für</dt>
              <dd className="text-right">
                {[
                  ...info.paysForFamilies.map((family) => ({
                    key: `f:${family.id}`,
                    href: `/finanzen/beitraege/familien#familie-${family.id}`,
                    name: family.name,
                  })),
                  ...info.paysFor.map((person) => ({
                    key: `m:${person.id}`,
                    href: `/mitglieder/${person.id}`,
                    name: person.name,
                  })),
                ].map((item, index) => (
                  <span key={item.key}>
                    {index > 0 && ", "}
                    <Link href={item.href} className="underline-offset-4 hover:underline">
                      {item.name}
                    </Link>
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>

        {info.assignments.length > 0 && (
          <ul className="grid gap-1.5" aria-label="Ermäßigungen und Befreiungen">
            {info.assignments.map((assignment) => (
              <li key={assignment.id} className="flex items-start justify-between gap-2">
                <span>
                  {assignment.text}
                  <span className="block text-xs text-muted-foreground">
                    ab {formatCalendarDate(assignment.validFrom)}
                    {assignment.validTo && ` bis ${formatCalendarDate(assignment.validTo)}`}
                  </span>
                </span>
                {info.canManage && (assignment.open || assignment.removable) && (
                  <span className="flex shrink-0 gap-1">
                    {assignment.open && !assignment.removable && (
                      <EndAssignmentDialog
                        id={assignment.id}
                        text={assignment.text}
                        today={today}
                      />
                    )}
                    {assignment.removable && (
                      <RemoveAssignmentButton id={assignment.id} text={assignment.text} />
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {info.canManage && options && (
          <div className="flex flex-wrap gap-2">
            <MemberFinanceDialog
              memberId={memberId}
              memberName={memberName}
              familyPayerName={familyPayer?.name ?? null}
              defaults={{
                payerMemberId: info.payer?.id ?? "",
                paymentMethod: info.paymentMethod,
                note: info.note ?? "",
              }}
              payers={options.payers}
            />
            <AssignmentDialog
              memberId={memberId}
              memberName={memberName}
              feeTypes={options.feeTypes}
              today={today}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
