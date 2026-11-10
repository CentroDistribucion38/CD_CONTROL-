"use client";

/**
 * EL DÍA DEL ANÁLISIS — el mismo calendario de Base y del tablero diario (botón con el día
 * y un panel con atajos y el mes), en vez del selector que trae el navegador.
 * Con `rango` elige un período (Recurrencia); sin él, un solo día.
 */
import { Calendario, aTexto, partes, type Atajo } from "@/components/CalendarioRango";

const MIN = "2025-01-01";
const dia = (f: string, n: number) => {
  const { a, m, d } = partes(f);
  const x = new Date(Date.UTC(a, m, d + n));
  return aTexto(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
};

export function SelectorDia({ valor, hoy, alCambiar }: { valor: string; hoy: string; alCambiar: (f: string) => void }) {
  const atajos: Atajo[] = [
    { t: "Hoy", d: () => [hoy, hoy] },
    { t: "Ayer", d: () => [dia(hoy, -1), dia(hoy, -1)] },
    { t: "Hace 2 días", d: () => [dia(hoy, -2), dia(hoy, -2)] },
    { t: "Hace una semana", d: () => [dia(hoy, -7), dia(hoy, -7)] },
  ];
  return (
    <div className="ad-cal">
      <Calendario desde={valor} hasta={valor} minF={MIN < valor ? MIN : valor} maxF={hoy} atajos={atajos} unDia
                  aplicar={(d) => { if (d && d !== valor) alCambiar(d); }} />
    </div>
  );
}

export function SelectorRango({ desde, hasta, hoy, alCambiar }: { desde: string; hasta: string; hoy: string; alCambiar: (d: string, h: string) => void }) {
  const atajos: Atajo[] = [
    { t: "Últimos 7 días", d: () => [dia(hoy, -6), hoy] },
    { t: "Últimos 14 días", d: () => [dia(hoy, -13), hoy] },
    { t: "Últimos 30 días", d: () => [dia(hoy, -29), hoy] },
    { t: "Este mes", d: () => { const { a, m } = partes(hoy); return [aTexto(a, m, 1), hoy]; } },
  ];
  return (
    <div className="ad-cal">
      <Calendario desde={desde} hasta={hasta} minF={MIN < desde ? MIN : desde} maxF={hoy} atajos={atajos} aplicar={alCambiar} />
    </div>
  );
}
