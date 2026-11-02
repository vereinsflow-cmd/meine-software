import { BadgeCheckIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompactEmpty } from "@/components/shared/compact-empty";
import { ToneBadge } from "@/components/shared/status-badge";
import { calendarDateToInputValue, formatCalendarDate, todayCalendarDate } from "@/lib/dates";
import {
  qualificationName,
  qualificationValidity,
  qualificationValidityText,
} from "../qualification-schemas";
import type { MemberQualifications } from "../qualifications";
import { QualificationDialog, RemoveQualificationButton } from "./qualification-dialogs";

/**
 * Karte „Qualifikationen“ auf der Seite eines Mitglieds: Lizenzen und Nachweise mit Nummer, Aussteller und Gültigkeit –
 * abgelaufene rot, bald ablaufende (90 Tage) bernsteinfarben, immer auch im Text. Pflegen nur mit `members:update`.
 */
export function QualificationCard({
  memberId,
  memberName,
  info,
}: {
  memberId: string;
  memberName: string;
  info: MemberQualifications;
}) {
  const today = todayCalendarDate();
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Qualifikationen
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {info.items.length === 0 ? (
          <CompactEmpty icon={<BadgeCheckIcon />} accent="blue" title="Noch keine Qualifikationen">
            Lizenzen und Nachweise wie Übungsleiterlizenz oder Erste Hilfe – mit Ablaufdatum.
          </CompactEmpty>
        ) : (
          <ul className="divide-y" aria-label="Qualifikationen">
            {info.items.map((item) => {
              const name = qualificationName(item);
              const validity = qualificationValidity(item.validUntil, today);
              const hint = qualificationValidityText(validity);
              const details = [
                item.number && `Nr. ${item.number}`,
                item.issuer,
                item.issuedOn && `ausgestellt am ${formatCalendarDate(item.issuedOn)}`,
                item.validUntil && `gültig bis ${formatCalendarDate(item.validUntil)}`,
              ].filter(Boolean);
              return (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {name}
                      {hint && (
                        <ToneBadge tone={validity.state === "expired" ? "danger" : "warning"}>
                          {hint}
                        </ToneBadge>
                      )}
                    </p>
                    {details.length > 0 && (
                      <p className="text-xs text-muted-foreground">{details.join(" · ")}</p>
                    )}
                    {item.note && (
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.note}</p>
                    )}
                  </div>
                  {info.canManage && (
                    <span className="flex shrink-0 gap-1">
                      <QualificationDialog
                        memberId={memberId}
                        memberName={memberName}
                        qualification={{
                          id: item.id,
                          name,
                          values: {
                            kind: item.kind,
                            title: item.title ?? "",
                            number: item.number ?? "",
                            issuedOn: calendarDateToInputValue(item.issuedOn),
                            validUntil: calendarDateToInputValue(item.validUntil),
                            issuer: item.issuer ?? "",
                            note: item.note ?? "",
                          },
                        }}
                      />
                      <RemoveQualificationButton id={item.id} name={name} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {info.canManage && (
          <div>
            <QualificationDialog memberId={memberId} memberName={memberName} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
