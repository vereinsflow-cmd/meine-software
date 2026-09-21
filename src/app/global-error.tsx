"use client";

/** Letzte Auffanglinie, falls sogar das Grundgerüst der Anwendung nicht dargestellt werden kann. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100dvh",
          margin: 0,
        }}
      >
        <main style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22 }}>VereinsFlow ist im Moment nicht erreichbar</h1>
          <p>Bitte versuche es in ein paar Minuten erneut.</p>
          <button onClick={reset} style={{ padding: "8px 16px", fontSize: 16, cursor: "pointer" }}>
            Erneut versuchen
          </button>
        </main>
      </body>
    </html>
  );
}
