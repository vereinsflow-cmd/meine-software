import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/shared/back-link";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { PrintButton } from "@/components/shared/print-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildPosterPageStyle } from "@/lib/print";
import { getSimplifiedProof } from "@/modules/donations/service";
import { canFinance } from "@/modules/finance/access";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Beleg bis 300 €" };

/**
 * Beleg für den vereinfachten Zuwendungsnachweis (§ 50 Abs. 4 EStDV, Entwurf 9.7 – aus Teil 2 vorgezogen): Bei Überweisungen
 * bis 300 € genügt dem Spender sein Kontoauszug, aber nur zusammen mit diesem vom Verein hergestellten Beleg (Zweck,
 * Freistellung, „Spende, kein Mitgliedsbeitrag“). Er gilt für alle solchen Spenden gleich – kein Name, kein Betrag, nichts wird
 * gespeichert. Druckansicht wie der Aushang „Mitglied werden“: Bedienelemente `print:hidden`, auf dem Bildschirm ein weißes
 * Blatt (auch im Dunkeln). Ansehen und drucken mit `finance:read`.
 */
export default async function SimplifiedProofPage() {
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const proof = await getSimplifiedProof(ctx);
  const canManage = canFinance(ctx, "finance:manage");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="print:hidden">
        <BackLink href="/finanzen/spenden">Spenden</BackLink>
        <PageHeader
          title="Beleg bis 300 €"
          description="Für Spenden per Überweisung bis 300 €: Zusammen mit dem Kontoauszug ersetzt dieser Beleg die Zuwendungsbestätigung."
          actions={proof.ready ? <PrintButton label="Beleg drucken" /> : undefined}
        />
        {proof.blockers.length > 0 && (
          <Card className="mb-6 ring-amber-300 dark:ring-amber-400/40">
            <CardContent className="grid gap-3">
              <h2 className="font-semibold">Noch nicht druckbar</h2>
              <ul className="grid gap-1 text-sm">
                {proof.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
              <Button asChild variant="outline" className="justify-self-start">
                <Link href="/finanzen/einstellungen#finanzamt">
                  {canManage ? "Finanzamt-Angaben eintragen" : "Finanzamt-Angaben ansehen"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
        {proof.hints.length > 0 && (
          <ul className="mb-6 grid gap-1 text-sm text-muted-foreground">
            {proof.hints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        )}
      </div>

      {proof.ready && (
        <article
          aria-label={proof.title}
          className="mx-auto max-w-[210mm] rounded-xl bg-white px-6 py-10 font-print text-[11pt] leading-relaxed text-neutral-950 shadow-sm ring-1 ring-foreground/10 sm:px-12 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0"
        >
          <style>{buildPosterPageStyle()}</style>
          <header className="mb-8">
            <p className="text-[13pt] font-bold break-words">{proof.issuer.name}</p>
            {proof.issuer.addressLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </header>
          <h2 className="mb-6 text-[14pt] font-bold">{proof.title}</h2>
          <div className="grid gap-4">
            {proof.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <p className="mt-10 text-[9pt] text-neutral-600">{proof.footnote}</p>
        </article>
      )}
    </div>
  );
}
