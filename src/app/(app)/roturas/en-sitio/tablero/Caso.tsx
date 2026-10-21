"use client";

/**
 * EL CASO SELECCIONADO — el panel que se abre AL LADO de la tabla.
 *
 * «Quiero poder seleccionar el caso y que la foto salga al lado, no como ahora que me toca
 *  bajar para poder verla.» Antes el detalle se abría como una fila debajo de toda la tabla.
 *
 * Arriba la foto, luego los datos del caso, y para el administrador las dos cantidades que se
 * pueden corregir (rotas y contaminadas). Anterior / Siguiente (o las flechas ↑ ↓) pasan de
 * un caso al otro sin soltar la foto: revisar cada caso uno por uno.
 */
import type { Rotura } from "@/modulos/roturas/datos";
import type { Etiqueta } from "@/modulos/roturas/cierre";
import { Evidencia } from "../../Evidencia";
import { Corregir } from "./Corregir";

export type Corr = {
  antes_rotas: number; antes_contaminadas: number | null;
  despues_rotas: number; despues_contaminadas: number | null;
  motivo: string; por: string; en: string;
};

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const cuando = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function Caso({ r, etiqueta, nombres, historial, manda, guardando, pos, total, anterior, siguiente, cerrar, corregir }: {
  r: Rotura; etiqueta: Etiqueta; nombres: Record<string, string>;
  historial: Corr[]; manda: boolean; guardando: boolean;
  pos: number; total: number;
  anterior: (() => void) | null; siguiente: (() => void) | null;
  cerrar: () => void;
  corregir: (rotas: number, contaminadas: number, motivo: string) => void;
}) {
  const decidida = r.estado !== "esperando" || Boolean(r.ol_respuesta);
  const eer = r.tipo === "eer";
  return (
    <aside className="tb-caso" aria-label={`Caso ${r.codigo}`}>
      <header className="tb-caso-cab">
        <div>
          <b>{r.codigo}</b> <span className={"tb-eti " + etiqueta.clase}>{etiqueta.txt}</span>
          <small>{r.material_nombre}</small>
        </div>
        <div className="tb-caso-nav">
          <button type="button" className="btn" disabled={!anterior} onClick={() => anterior?.()} aria-label="Caso anterior" title="Anterior (↑)">‹</button>
          <span>{pos} / {total}</span>
          <button type="button" className="btn" disabled={!siguiente} onClick={() => siguiente?.()} aria-label="Caso siguiente" title="Siguiente (↓)">›</button>
          <button type="button" className="btn" onClick={cerrar} aria-label="Cerrar el caso" title="Cerrar (Esc)">✕</button>
        </div>
      </header>

      <Evidencia id={r.id} key={r.id} />

      <div className="tb-datos tb-caso-datos">
        <div><b>Se perdió</b>{" "}
          {`${r.unidades} caja${r.unidades === 1 ? "" : "s"} ${eer ? "de envase" : "rotas"}`
            + (r.contaminadas ? ` y ${r.contaminadas} contaminada${r.contaminadas === 1 ? "" : "s"}` : "")
            + (r.factor_caja ? ` · ${r.factor_caja} por caja` : " · sin unid. por caja en el maestro")}
        </div>
        <div><b>Cobro</b>{" "}
          {r.cobro_total != null ? cop.format(Number(r.cobro_total)) : "sin precio o sin factor"}
        </div>
        <div><b>Causa</b> {r.causa_nombre}</div>
        <div><b>Proceso</b> {r.proceso_nombre}</div>
        <div><b>Área</b> {r.area_nombre ?? "—"}</div>
        <div><b>Quién</b> {nombres[r.reportada_por ?? ""] ?? "—"}</div>
        {r.ol_nota && <div><b>Dice el OL</b> «{r.ol_nota}»</div>}
        {r.nota_decision && <div><b>Decisión</b> {r.nota_decision}</div>}
        {r.motivo_anulacion && <div><b>Anulada porque</b> {r.motivo_anulacion}</div>}
        {r.descripcion && <div><b>Qué pasó</b> {r.descripcion}</div>}
      </div>

      {manda && r.estado !== "anulada" && (
        <Corregir key={`${r.id}-${r.unidades}-${r.contaminadas ?? 0}`} r={r} decidida={decidida}
                  guardando={guardando} guardar={corregir} />
      )}

      {historial.length > 0 && (
        <section className="co-hist" aria-label="Correcciones anteriores">
          <h3>Correcciones ({historial.length})</h3>
          <ul>
            {historial.map((h, i) => (
              <li key={i}>
                <b>{h.antes_rotas}{h.antes_contaminadas ? ` + ${h.antes_contaminadas} contam.` : ""}</b>
                {" → "}
                <b>{h.despues_rotas}{h.despues_contaminadas ? ` + ${h.despues_contaminadas} contam.` : ""}</b>
                <span>«{h.motivo}» · {h.por} · {cuando(h.en)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
