"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ToneBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/dates";
import { CONSENT_TYPE_LABEL } from "@/lib/labels";
import type { ConsentType } from "@/generated/prisma/enums";
import { recordConsentAction } from "../actions";

interface ConsentRow {
  type: ConsentType;
  granted: boolean | null;
  recordedAt: string | null;
  source: string | null;
}

/**
 * Einwilligungen (DSGVO): Jede Änderung wird als neuer Eintrag protokolliert – so lässt sich später nachweisen,
 * wann was erteilt oder widerrufen wurde.
 */
export function ConsentPanel({
  memberId,
  rows,
  canEdit,
}: {
  memberId: string;
  rows: ConsentRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function record(type: ConsentType, granted: boolean) {
    startTransition(async () => {
      const result = await recordConsentAction({ memberId, type, granted, source: "paper" });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(granted ? "Einwilligung erfasst." : "Widerruf erfasst.");
      router.refresh();
    });
  }

  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((row) => (
        <li
          key={row.type}
          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">{CONSENT_TYPE_LABEL[row.type]}</p>
            <p className="text-xs text-muted-foreground">
              {row.granted === null
                ? "Noch nicht erfasst"
                : `${row.granted ? "Erteilt" : "Widerrufen"} am ${formatDate(row.recordedAt)}${row.source === "paper" ? " (schriftlich)" : row.source === "app" ? " (online)" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ToneBadge tone={row.granted === null ? "neutral" : row.granted ? "success" : "danger"}>
              {row.granted === null ? "offen" : row.granted ? "erteilt" : "widerrufen"}
            </ToneBadge>
            {canEdit && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || row.granted === true}
                  onClick={() => record(row.type, true)}
                >
                  Erteilt
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || row.granted !== true}
                  onClick={() => record(row.type, false)}
                >
                  Widerrufen
                </Button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
