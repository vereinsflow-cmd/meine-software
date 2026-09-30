import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "next-themes";
import { ServiceWorkerRegistration } from "@/components/layout/service-worker";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VereinsFlow", template: "%s · VereinsFlow" },
  description: "Vereinsverwaltung für Mitglieder, Veranstaltungen und Helferplanung.",
  applicationName: "VereinsFlow",
  // Name unter dem Symbol, wenn man VereinsFlow auf iPhone oder iPad zum Home-Bildschirm hinzufügt (sonst der Seitentitel,
  // etwa „Dashboard · VereinsFlow“). Die App-Ansicht selbst schaltet allein das Manifest ein (`display: "standalone"`, siehe
  // manifest.ts – so verlangt es iOS ab 16.4 auch für Web-Push); `appleWebApp` bräuchte es dafür nicht, es ergänzte nur ältere
  // Apple-Meta-Angaben. Die Statusleiste bleibt dadurch undurchsichtig über der Seite (Stil „default“).
  // Die Symbole selbst sind Dateien in diesem Ordner (favicon.ico, icon.svg, apple-icon.png) und in public/ (app-icon-*.png).
  other: { "apple-mobile-web-app-title": "VereinsFlow" },
  // Interne Anwendung mit personenbezogenen Daten: nicht von Suchmaschinen indexieren lassen.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Die Seite reicht bis an den Bildschirmrand – auch hinter Kamera-Aussparung und Home-Indikator. Was dort nicht verdeckt werden
  // darf, rückt über die sicheren Bereiche (`--safe-*` in globals.css) ein; im normalen Browser sind sie 0, dort ändert sich nichts.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Der Nonce der Content-Security-Policy (siehe proxy.ts) erlaubt das kleine Inline-Skript von next-themes,
  // das die Farbdarstellung vor dem ersten Zeichnen setzt (verhindert Aufblitzen des falschen Themes).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <a
          href="#inhalt"
          className="sr-only focus:not-sr-only focus:fixed focus:top-[calc(0.5rem+var(--safe-top))] focus:left-[calc(0.5rem+var(--safe-left))] focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          Zum Inhalt springen
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster richColors closeButton position="top-right" />
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
