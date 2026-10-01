"use client";

import { useEffect, useRef, useState } from "react";

/**
 * LA FOTO DE LA ROTURA, EN MINIATURA.
 *
 * Antes la miniatura era un cuadro gris con «2 fotos»: había que abrir la
 * rotura para saber qué se rompió. Ahora se ve la foto —la primera que se
 * subió, que es la de la rotura— y al tocarla se abren todas, como siempre.
 *
 * SE TRAE SOLO CUANDO LA MINIATURA ENTRA EN PANTALLA, y se guarda un rato:
 * una lista larga no firma cuarenta fotos de golpe, y volver a pintar la
 * misma fila no la vuelve a pedir. La firma vence a los diez minutos; se
 * guarda ocho, para que nunca se muestre una ya vencida.
 *
 * SI LA FOTO NO LLEGA se queda el cuadro gris de siempre, con su cuenta:
 * la miniatura es una ayuda, y no puede ser lo que impida abrir la rotura.
 */
const guardadas = new Map<string, { url: string | null; hasta: number }>();
const ocho = 8 * 60 * 1000;

async function primeraFoto(id: string): Promise<string | null> {
  const g = guardadas.get(id);
  if (g && g.hasta > Date.now()) return g.url;
  try {
    const r = await fetch(`/api/roturas/evidencia/${id}`, { cache: "no-store" });
    const j = await r.json();
    const url = (j.fotos?.find((f: { url: string | null }) => f.url)?.url ?? null) as string | null;
    guardadas.set(id, { url, hasta: Date.now() + ocho });
    return url;
  } catch {
    return null;
  }
}

export function Miniatura({ id, cuantas, etiqueta }: { id: string; cuantas: number; etiqueta: string }) {
  const caja = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [rota, setRota] = useState(false);

  useEffect(() => {
    if (cuantas <= 0 || !caja.current) return;
    let vivo = true;
    const pedir = () => primeraFoto(id).then((u) => { if (vivo) setUrl(u) });
    if (typeof IntersectionObserver === "undefined") { pedir(); return () => { vivo = false } }
    const o = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) { o.disconnect(); pedir() }
    }, { rootMargin: "200px" });
    o.observe(caja.current);
    return () => { vivo = false; o.disconnect() };
  }, [id, cuantas]);

  return (
    <span ref={caja} className="vb-miniatura">
      {url && !rota && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={etiqueta} loading="lazy" onError={() => setRota(true)} />
      )}
    </span>
  );
}
