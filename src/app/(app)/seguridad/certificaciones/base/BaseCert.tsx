"use client";

/**
 * SEGURIDAD · CERTIFICACIONES · BASE — subir el Excel «Seguimiento VACA».
 *   1. Se suelta el archivo: se lee AQUÍ, en el navegador (no viaja el Excel, viajan las filas).
 *   2. Se muestra qué trae: personas, activos, empresas y qué departamentos quedan por fuera (Reglas del Maestro).
 *   3. «Cargar a la base» lo manda por tandas: persona nueva se crea, fecha de expedición nueva es una RENOVACIÓN
 *      (la anterior queda en el historial) y la misma fecha actualiza esa validación. Nada se borra.
 */
import { useRef, useState } from "react";
import { leerVaca, type LecturaVaca } from "@/modulos/seguridad/leer-vaca";
import { importarTanda } from "../actions";

const nf = new Intl.NumberFormat("es-CO");
const TANDA = 250;
type Fin = { nuevas: number; renovaciones: number; actualizadas: number; fuera: number };

export function BaseCert({ total, departamentos, vigencia, puedeEditar }: { total: number; departamentos: string[]; vigencia: number; puedeEditar: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [lect, setLect] = useState<LecturaVaca | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [prog, setProg] = useState<number | null>(null);
  const [fin, setFin] = useState<Fin | null>(null);
  const deptos = departamentos.map((d) => d.charAt(0) + d.slice(1).toLowerCase()).join(", ");

  async function leer(f: File | undefined) {
    if (!f) return;
    setError(null); setFin(null); setLect(null); setArchivo(f.name); setLeyendo(true);
    try {
      const X = await import("xlsx");
      setLect(await leerVaca(X, await f.arrayBuffer(), departamentos));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally { setLeyendo(false) }
  }

  async function cargar() {
    if (!lect) return;
    setError(null); setProg(0);
    const suma: Fin = { nuevas: 0, renovaciones: 0, actualizadas: 0, fuera: 0 };
    for (let i = 0; i < lect.filas.length; i += TANDA) {
      const r = await importarTanda(lect.filas.slice(i, i + TANDA), i + TANDA >= lect.filas.length);
      if (r.error) { setError(`Se cortó en la fila ${nf.format(i + 1)}: ${r.error}. Lo anterior ya quedó guardado; puedes volver a cargar el mismo archivo sin duplicar.`); setProg(null); return }
      suma.nuevas += r.nuevas ?? 0; suma.renovaciones += r.renovaciones ?? 0; suma.actualizadas += r.actualizadas ?? 0; suma.fuera += r.fuera ?? 0;
      setProg(Math.min(lect.filas.length, i + TANDA) / lect.filas.length);
    }
    setFin(suma); setProg(null);
  }

  return (
    <div className="sg">
      <header className="sg-cab">
        <div>
          <p className="sg-ojo">SEGURIDAD · CERTIFICACIONES</p>
          <h1>Base · importar <span className="sg-tag">{deptos}</span></h1>
          <p className="sg-sub">Hoy hay {nf.format(total)} personas con licencia en la base · el Excel actualiza sin borrar ni duplicar</p>
        </div>
      </header>

      {!puedeEditar && <p className="sg-aviso">Puedes ver esta pantalla pero no cargar: pide el permiso «Base · importar» en editar (Administración › Roles).</p>}

      <section className="sg-card sg-pad">
        <div className={"sg-subir" + (sobre ? " sobre" : "")} role="button" tabIndex={0}
          onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click() }}
          onDragOver={(e) => { e.preventDefault(); setSobre(true) }} onDragLeave={() => setSobre(false)}
          onDrop={(e) => { e.preventDefault(); setSobre(false); leer(e.dataTransfer.files[0]) }}>
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          <b>{leyendo ? "Leyendo…" : archivo ?? "Suelta aquí el Excel «Seguimiento VACA»"}</b>
          <span>o tócalo para escogerlo · .xlsx · se lee la hoja «Seguimiento»</span>
          <input ref={input} type="file" accept=".xlsx,.xlsm,.xls" hidden onChange={(e) => { leer(e.target.files?.[0]); e.target.value = "" }} />
        </div>
      </section>

      {error && <p className="sg-err" role="alert">{error}</p>}

      {lect && !fin && (
        <section className="sg-card">
          <h2>Lo que trae · hoja «{lect.hoja}»</h2>
          <div className="sg-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="sg-cifras">
              <div className="os"><b>{nf.format(lect.personas)}</b><span>personas de {deptos}</span></div>
              <div><b>{nf.format(lect.activos)}</b><span>activas</span></div>
              <div className="oc"><b>{nf.format(lect.empresas)}</b><span>empresas</span></div>
              <div className="cr"><b>{nf.format(lect.fuera)}</b><span>de otros departamentos · no entran</span></div>
            </div>
            <p className="sg-sm" style={{ margin: 0 }}>
              {nf.format(lect.leidas)} filas leídas · {lect.porDepto.map((d) => `${d.depto.charAt(0) + d.depto.slice(1).toLowerCase()} ${nf.format(d.n)}${d.entra ? " ✓" : ""}`).join(" · ")}
              {lect.repetidas > 0 && <> · {lect.repetidas} cédulas vienen dos veces (entra la más nueva y la otra queda de historial)</>}
              {lect.sinFecha > 0 && <> · {lect.sinFecha} sin fecha de expedición (no entran)</>}
              {lect.vencMalos.length > 0 && <> · vencimiento que no existe en el calendario, se calcula con expedición + {vigencia} días: {lect.vencMalos.map((v) => `${v.nombre} («${v.texto}»)`).join(", ")}</>}
            </p>
            <ol className="sg-pasos">
              <li><b>Persona nueva</b>: se crea con su licencia.</li>
              <li><b>Fecha de expedición nueva</b>: es una renovación; la licencia anterior queda en su historial.</li>
              <li><b>Misma fecha</b>: se actualizan permisos, nivel, estado y motivo. Si falta el vencimiento, se calcula: expedición + {vigencia} días.</li>
              <li>Las empresas que no estén en el Maestro se crean solas; luego se les asigna su Interventor ABI y Coordinador.</li>
            </ol>
            {prog != null && <div className="sg-prog" aria-label="Avance de la carga"><i style={{ width: `${Math.round(prog * 100)}%` }} /></div>}
            <div className="sg-acc">
              <button type="button" className="sg-bt" onClick={() => { setLect(null); setArchivo(null) }} disabled={prog != null}>Cambiar archivo</button>
              <button type="button" className="sg-bt osc" onClick={cargar} disabled={!puedeEditar || prog != null || !lect.filas.length}>
                {prog != null ? `Cargando… ${Math.round(prog * 100)}%` : `Cargar ${nf.format(lect.filas.length)} filas a la base`}
              </button>
            </div>
          </div>
        </section>
      )}

      {fin && (
        <section className="sg-card">
          <h2>Listo · la base quedó al día</h2>
          <div className="sg-pad">
            <div className="sg-cifras">
              <div className="os"><b>{nf.format(fin.nuevas)}</b><span>personas nuevas</span></div>
              <div className="oc"><b>{nf.format(fin.renovaciones)}</b><span>renovaciones</span></div>
              <div><b>{nf.format(fin.actualizadas)}</b><span>actualizadas</span></div>
              <div className="cr"><b>{nf.format(fin.fuera)}</b><span>no entraron</span></div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
