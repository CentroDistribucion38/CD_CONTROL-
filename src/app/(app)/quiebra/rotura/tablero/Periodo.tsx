"use client";

import { useRouter } from "next/navigation";
import type { Linea } from "@/modulos/rotlinea/datos";

/**
 * EL PERÍODO Y LA LÍNEA.
 *
 * VIVEN EN LA DIRECCIÓN, no en el estado de la pantalla. Es lo que
 * permite mandar por chat «mira la línea 2 de agosto» y que al otro le
 * abra exactamente eso, y lo que hace que el botón de atrás deshaga el
 * filtro en vez de salirse del módulo.
 *
 * LOS ATAJOS ANTES QUE LAS FECHAS. «Lo que va del año» es lo que se
 * mira nueve de cada diez veces; las dos fechas sueltas están para la
 * décima. Al revés, todo el mundo teclearía dos fechas para pedir lo
 * que hay un botón que pide.
 */
export function Periodo({ desde, hasta, linea, hoy, lineas }: {
  desde: string; hasta: string; linea?: number; hoy: string; lineas: Linea[];
}) {
  const router = useRouter();

  const ir = (d: string, h: string, l?: number) => {
    const p = new URLSearchParams({ desde: d, hasta: h });
    if (l) p.set("linea", String(l));
    router.push(`/quiebra/rotura/tablero?${p.toString()}`);
  };

  const menos = (n: number) =>
    new Date(Date.parse(hoy + "T12:00:00") - n * 86400_000).toISOString().slice(0, 10);

  const anio = hoy.slice(0, 4);
  const mes = hoy.slice(0, 7);
  const ATAJOS: [string, string, string][] = [
    [`Lo que va de ${anio}`, `${anio}-01-01`, hoy],
    ["Este mes", `${mes}-01`, hoy],
    ["Últimos 30 días", menos(29), hoy],
    ["Últimos 7 días", menos(6), hoy],
    [`Todo ${Number(anio) - 1}`, `${Number(anio) - 1}-01-01`, `${Number(anio) - 1}-12-31`],
  ];

  return (
    <div className="rl-periodo">
      <div className="rl-atajos">
        {ATAJOS.map(([r, d, h]) => (
          <button key={r} type="button"
                  className={desde === d && hasta === h ? "on" : ""}
                  onClick={() => ir(d, h, linea)}>{r}</button>
        ))}
      </div>

      <div className="rl-fechas">
        <label>
          <span>Desde</span>
          <input type="date" value={desde} max={hasta}
                 onChange={(e) => e.target.value && ir(e.target.value, hasta, linea)} />
        </label>
        <label>
          <span>Hasta</span>
          <input type="date" value={hasta} min={desde}
                 onChange={(e) => e.target.value && ir(desde, e.target.value, linea)} />
        </label>
        <label>
          <span>Línea</span>
          <select value={linea ?? ""}
                  onChange={(e) => ir(desde, hasta, Number(e.target.value) || undefined)}>
            <option value="">Todas las líneas</option>
            {lineas.map((l) => (
              <option key={l.linea} value={l.linea}>Línea {l.linea} · {l.tren}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
