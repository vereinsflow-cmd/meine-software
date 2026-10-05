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
 * Zahlweg, Ermäßigungen und Befreiungen. Das Geburtsdatum steht hier nie – nur, was daraus folgt.
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
          ) : (
            <p className="font-medium">{info.exempt ?? "kein Beitrag"}</p>
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
            <dd>{PAYMENT_METHOD_LABEL[info.charge?.paymentMethod ?? info.paymentMethod]}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Zahler</dt>
            <dd className="text-right">
              {info.payer ? (
                <Link
                  href={`/mitglieder/${info.payer.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {info.payer.name}
                </Link>
              ) : (
                "selbst"
              )}
            </dd>
          </div>
          {info.paysFor.length > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Zahlt für</dt>
              <dd className="text-right">
                {info.paysFor.map((person, index) => (
                  <span key={person.id}>
                    {index > 0 && ", "}
                    <Link
                      href={`/mitglieder/${person.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {person.name}
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
