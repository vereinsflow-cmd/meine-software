import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Zentrierte Karte für Anmelde- und Hinweisseiten. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle role="heading" aria-level={1} className="text-xl">
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {children && <CardContent className="grid gap-4">{children}</CardContent>}
      {footer && (
        <div className="px-4 pb-4 text-center text-sm text-muted-foreground">{footer}</div>
      )}
    </Card>
  );
}
