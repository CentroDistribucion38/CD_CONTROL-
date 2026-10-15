"use client";

import { useRouter } from "next/navigation";
import { sumarDias, type Proceso } from "@/modulos/gestion/semaforo";

/** La barra de las dos pantallas del mapa: el día, el proceso y el botón de imprimir. */
export function BarraMapa({ base, fecha, hoy, proceso, procesos, conProceso }: {
  base: string; fecha: string; hoy: string; proceso: string; procesos: Proceso[]; conProceso: boolean;
}) {
  const router = useRouter();
  const ir = (f: string, p: string) => {
    const q = new URLSearchParams();
    if (f !== hoy) q.set("fecha", f);
    if (conProceso && p !== "todos") q.set("proceso", p);
    router.push(q.size ? `${base}?${q}` : base);
  };
  return (
    <div className="gs-barra gm-barra">
      <div className="gs-fecha">
        <button type="button" onClick={() => ir(sumarDias(fecha, -1), proceso)} aria-label="Día anterior">‹</button>
        <input type="date" value={fecha} max={hoy} onChange={(e) => e.target.value && ir(e.target.value, proceso)} aria-label="Día" />
        <button type="button" onClick={() => ir(sumarDias(fecha, 1), proceso)} disabled={fecha >= hoy} aria-label="Día siguiente">›</button>
        {fecha !== hoy && <button type="button" className="gs-hoy" onClick={() => ir(hoy, proceso)}>Hoy</button>}
      </div>
      <div className="gs-filtros">
        {conProceso && (
          <label>Proceso
            <select value={proceso} onChange={(e) => ir(fecha, e.target.value)}>
              <option value="todos">Todos</option>
              {procesos.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              <option value="ninguno">Sin proceso</option>
            </select>
          </label>
        )}
        <button type="button" className="gm-imprimir" onClick={() => window.print()}>Imprimir</button>
      </div>
    </div>
  );
}
