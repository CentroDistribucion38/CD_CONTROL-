"use client";

import { PantallaError } from "@/components/PantallaError";

/* Si una pantalla se cae, el menú y la barra siguen ahí y esta ocupa su lugar. */
export default function ErrorDePantalla({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PantallaError error={error} reset={reset} />;
}
