"use client";

import { PantallaError } from "@/components/PantallaError";

/* El último recurso: si falla hasta la estructura de la app, esto sale en vez del cartel en inglés de Next. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, minHeight: "100vh", background: "#eef1f5" }}>
        <PantallaError error={error} reset={reset} />
      </body>
    </html>
  );
}
