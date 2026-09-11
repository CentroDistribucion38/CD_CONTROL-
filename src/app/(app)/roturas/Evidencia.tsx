"use client";

import { useEffect, useState } from "react";
import { fecha } from "./comunes";

/**
 * LAS FOTOS DE UNA ROTURA.
 *
 * Se piden al ABRIRLA y no con la lista: firmar quinientas URL para que
 * alguien mire una es trabajo que se paga en espera, y las firmas vencen
 * en minutos.
 *
 * Lo que se muestra debajo de cada foto es la hora y el punto DE LA
 * FOTO, no de la fila: entre tomarla en un pasillo sin señal y subirla
 * pueden pasar veinte minutos, y esa diferencia es justamente lo que
 * hace que la evidencia valga o no valga.
 */

type FotoFirmada = {
  ruta: string; url: string | null; tomada_en: string | null;
  lat: number | null; lng: number | null; precision_m: number | null;
  subida_en: string;
};

export function Evidencia({ id }: { id: string }) {
  const [fotos, setFotos] = useState<FotoFirmada[] | null>(null);
  const [mal, setMal] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/roturas/evidencia/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j.error) setMal(j.error); else setFotos(j.fotos ?? []);
      })
      .catch(() => vivo && setMal("No se pudieron traer las fotos. Vuelve a intentar."));
    return () => { vivo = false };
  }, [id]);

  if (mal) return <div className="panel"><div className="aviso rojo">{mal}</div></div>;
  if (!fotos) return <div className="panel">Trayendo las fotos…</div>;
  if (!fotos.length) {
    return (
      <div className="panel">
        <div className="aviso">
          Esta rotura no tiene foto. Si la causa la exige, ABI no la puede marcar como
          que cuenta hasta que alguien suba una.
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      {fotos.map((f) => (
        <figure key={f.ruta} style={{ margin: 0 }}>
          {f.url
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={f.url} alt="La rotura" style={{ width: "100%", borderRadius: 8, display: "block" }} />
            : <div className="aviso rojo">Esta foto no se pudo abrir.</div>}
          <figcaption style={{ fontSize: 11.5, color: "var(--rt-gris)", marginTop: 6, lineHeight: 1.45 }}>
            Tomada {fecha(f.tomada_en) || "sin hora"}
            {f.lat != null && f.lng != null && <> · {Number(f.lat).toFixed(5)}, {Number(f.lng).toFixed(5)}</>}
            {f.precision_m != null && <> · ±{Math.round(Number(f.precision_m))} m</>}
            {f.tomada_en && f.tomada_en.slice(0, 16) !== f.subida_en.slice(0, 16) && (
              <> · subida {fecha(f.subida_en)}</>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
