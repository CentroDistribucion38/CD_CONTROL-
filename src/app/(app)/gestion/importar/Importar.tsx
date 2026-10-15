"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { armarImportacion, type Existentes, type Hoja, type Hojas, type Plan } from "@/modulos/gestion/importar";
import { SoloVer } from "../comunes";
import { generarDisparadores, importarEstructura, importarResultados } from "./actions";

const nf = new Intl.NumberFormat("es-CO");
const n = (v: number) => nf.format(v);
const TANDA = 1000;
const larga = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
type Fase = "inicio" | "previa" | "cargando" | "listo";
type Resumen = {
  turnos: { nuevos: number; cambian: number }; procesos: { nuevos: number; cambian: number }; indicadores: { nuevos: number; cambian: number };
  insertados: number; reemplazados: number; omitidos: number; abiertos: number;
};

export function Importar({ hoy, existentes, puedeEditar, puedeResultados }: {
  hoy: string; existentes: Existentes; puedeEditar: boolean; puedeResultados: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<Fase>("inicio");
  const [archivo, setArchivo] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [arrastra, setArrastra] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  const [disp, setDisp] = useState(true);
  const [avance, setAvance] = useState({ paso: "", hecho: 0, total: 1 });
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const leer = async (f: File) => {
    setFalla(null); setLeyendo(true);
    try {
      const XLSX = await import("xlsx");
      const libro = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const nombre = (k: string) => libro.SheetNames.find((s) => s.trim().toUpperCase() === k);
      const hoja = (k: string): Hoja | undefined => {
        const s = nombre(k);
        return s ? (XLSX.utils.sheet_to_json(libro.Sheets[s], { header: 1, raw: true, defval: null, blankrows: true }) as Hoja) : undefined;
      };
      const hojas: Hojas = { turnos: hoja("TURNOS"), procesos: hoja("PROCESOS"), indicadores: hoja("INDICADORES"), resultados: hoja("RESULTADOS") };
      setPlan(armarImportacion(hojas, existentes, hoy));
      setArchivo(f.name); setFase("previa");
    } catch (e) {
      setFalla(`No pude leer ese archivo: ${e instanceof Error ? e.message : "¿es un Excel (.xlsx)?"}`);
    } finally { setLeyendo(false); }
  };

  const hayAlgo = !!plan && (plan.turnos.length + plan.procesos.length + plan.indicadores.length + plan.resultados.length) > 0;
  const puedeImportar = puedeEditar && (puedeResultados || !plan?.resultados.length) && !!plan && !plan.errores.length && hayAlgo;

  const importar = async () => {
    if (!plan || !puedeImportar) return;
    setFase("cargando"); setFalla(null);
    try {
      setAvance({ paso: "Turnos, procesos e indicadores…", hecho: 0, total: 1 });
      const e = await importarEstructura({ turnos: plan.turnos, procesos: plan.procesos, indicadores: plan.indicadores });
      if ("error" in e && e.error) throw new Error(e.error);
      const est = e as unknown as Pick<Resumen, "turnos" | "procesos" | "indicadores">;

      let insertados = 0, reemplazados = 0, omitidos = 0;
      const tandas: typeof plan.resultados[] = [];
      for (let i = 0; i < plan.resultados.length; i += TANDA) tandas.push(plan.resultados.slice(i, i + TANDA));
      for (let i = 0; i < tandas.length; i++) {
        setAvance({ paso: "Resultados…", hecho: i * TANDA, total: plan.resultados.length });
        const r = await importarResultados(tandas[i]);
        if ("error" in r && r.error) throw new Error(`Se guardó la estructura y ${n(i * TANDA)} resultados; la tanda ${i + 1} falló: ${r.error}`);
        const ok = r as unknown as Pick<Resumen, "insertados" | "reemplazados" | "omitidos">;
        insertados += ok.insertados; reemplazados += ok.reemplazados; omitidos += ok.omitidos;
      }
      let abiertos = 0;
      if (disp && plan.resultados.length) {
        setAvance({ paso: "Revisando disparadores…", hecho: plan.resultados.length, total: plan.resultados.length });
        const d = await generarDisparadores([...new Set(plan.resultados.map((r) => r.codigo))]);
        if ("error" in d && d.error) throw new Error(`Se guardó todo, pero falló abrir los disparadores: ${d.error}`);
        abiertos = (d as unknown as { abiertos: number }).abiertos;
      }
      setResumen({ turnos: est.turnos, procesos: est.procesos, indicadores: est.indicadores, insertados, reemplazados, omitidos, abiertos });
      setFase("listo");
    } catch (x) {
      setFalla(x instanceof Error ? x.message : "No se pudo importar.");
      setFase("previa");
    }
  };

  const reiniciar = () => { setFase("inicio"); setPlan(null); setArchivo(""); setResumen(null); setFalla(null); if (entrada.current) entrada.current.value = ""; };
  const totalSem = plan ? plan.semaforo.verde + plan.semaforo.amarillo + plan.semaforo.rojo : 0;
  const pct = (v: number) => (totalSem ? `${(v * 100) / totalSem}%` : "0%");

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">GESTIÓN · IMPORTAR</p>
          <h1>Importación masiva</h1>
          <p className="sub">
            Procesos, indicadores (KPI y PI) con su meta y disparador, y los resultados por turno, todo desde un Excel.
            Antes de guardar ves qué se crea, qué se actualiza y los errores fila por fila.
          </p>
        </div>
      </section>

      {!puedeEditar && <SoloVer />}

      {/* ---- 1 · la plantilla ---- */}
      {fase === "inicio" && (
        <>
          <div className="gi-pasos">
            <article className="gi-paso">
              <span className="gi-n">1</span>
              <h3>Baja la plantilla</h3>
              <p>Trae las hojas <b>TURNOS</b>, <b>PROCESOS</b>, <b>INDICADORES</b> y <b>RESULTADOS</b>, con desplegables, notas en cada encabezado, una hoja <b>LEEME</b> y un <b>EJEMPLO</b> ya lleno.</p>
              <a className="btn gi-descarga" href="/gestion/importar/plantilla" download>Descargar plantilla Excel</a>
            </article>
            <article className="gi-paso">
              <span className="gi-n">2</span>
              <h3>Llénala</h3>
              <p>Una fila por indicador y una por resultado. <b>Mismo código = se actualiza.</b> Los resultados con la misma fecha, turno e indicador se reemplazan, así puedes corregir y volver a subir.</p>
            </article>
            <article className="gi-paso">
              <span className="gi-n">3</span>
              <h3>Súbela aquí</h3>
              <p>Se revisa en tu navegador y ves la vista previa: cuántos se crean, el semáforo de lo que cargas y los disparadores que saltarían. Nada se guarda hasta que confirmes.</p>
            </article>
          </div>

          <div
            className={"gi-zona" + (arrastra ? " on" : "")}
            onDragOver={(e) => { e.preventDefault(); setArrastra(true); }} onDragLeave={() => setArrastra(false)}
            onDrop={(e) => { e.preventDefault(); setArrastra(false); const f = e.dataTransfer.files?.[0]; if (f) void leer(f); }}
          >
            <b>{leyendo ? "Leyendo el archivo…" : "Arrastra aquí tu Excel"}</b>
            <span>o</span>
            <button type="button" className="btn" disabled={leyendo || !puedeEditar} onClick={() => entrada.current?.click()}>Escoger archivo .xlsx</button>
            <input ref={entrada} type="file" accept=".xlsx,.xlsm" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void leer(f); }} />
          </div>
          {falla && <p className="gi-error" role="alert">{falla}</p>}
        </>
      )}

      {/* ---- 2 · vista previa ---- */}
      {(fase === "previa" || fase === "cargando") && plan && (
        <>
          <div className="gi-archivo">
            <span><b>{archivo}</b> · hojas leídas: {plan.hojasLeidas.join(", ") || "ninguna"}</span>
            {fase === "previa" && <button type="button" className="btn plano" onClick={reiniciar}>Cambiar archivo</button>}
          </div>

          <div className="gs-cifras c4 gi-cifras">
            <div className="gs-cif"><span>Turnos</span><b>{n(plan.turnos.length)}</b><small>{plan.nuevos.turnos} nuevos · {plan.cambian.turnos} se actualizan</small></div>
            <div className="gs-cif"><span>Procesos</span><b>{n(plan.procesos.length)}</b><small>{plan.nuevos.procesos} nuevos · {plan.cambian.procesos} se actualizan</small></div>
            <div className="gs-cif"><span>Indicadores</span><b>{n(plan.indicadores.length)}</b>
              <small>{plan.indicadores.filter((i) => i.tipo === "kpi").length} KPI · {plan.indicadores.filter((i) => i.tipo === "pi").length} PI · {plan.nuevos.indicadores} nuevos · {plan.cambian.indicadores} se actualizan</small></div>
            <div className="gs-cif"><span>Resultados</span><b>{n(plan.resultados.length)}</b><small>{plan.rango ? `${larga(plan.rango.desde)} → ${larga(plan.rango.hasta)}` : "sin resultados"}</small></div>
          </div>

          {totalSem > 0 && (
            <section className="gi-card">
              <h3>Cumple / no cumple <small>según la meta de cada indicador</small></h3>
              <div className="gi-sem" role="img" aria-label="Distribución del semáforo">
                <i className="v" style={{ width: pct(plan.semaforo.verde) }} />
                <i className="r" style={{ width: pct(plan.semaforo.rojo + plan.semaforo.amarillo) }} />
              </div>
              <div className="gi-sem-ley">
                <span><i className="v" />Cumple · <b>{n(plan.semaforo.verde)}</b></span>
                <span><i className="r" />No cumple · <b>{n(plan.semaforo.rojo + plan.semaforo.amarillo)}</b></span>
              </div>
              {plan.dispararian.length > 0 && (
                <div className="gi-disp">
                  <b>{plan.dispararian.length} disparador{plan.dispararian.length === 1 ? "" : "es"} saltaría{plan.dispararian.length === 1 ? "" : "n"} al terminar:</b>
                  <ul>{plan.dispararian.slice(0, 12).map((d) => <li key={d.codigo}><span className="mono">{d.codigo}</span> {d.nombre} <em>{d.regla}</em></li>)}</ul>
                  {plan.dispararian.length > 12 && <small>y {plan.dispararian.length - 12} más</small>}
                </div>
              )}
            </section>
          )}

          {plan.errores.length > 0 ? (
            <section className="gi-card mal">
              <h3>{plan.errores.length} error{plan.errores.length === 1 ? "" : "es"} para corregir en el Excel <small>mientras haya errores no se puede importar</small></h3>
              <div className="gi-lista"><table>
                <thead><tr><th>Hoja</th><th className="n">Fila</th><th>Qué pasa</th></tr></thead>
                <tbody>{plan.errores.slice(0, 200).map((x, i) => <tr key={i}><td>{x.hoja}</td><td className="n">{x.fila}</td><td>{x.texto}</td></tr>)}</tbody>
              </table></div>
              {plan.errores.length > 200 && <p className="gi-mas">Y {n(plan.errores.length - 200)} errores más. Corrige estos y vuelve a subir el archivo.</p>}
            </section>
          ) : (
            <p className="gi-ok">{hayAlgo ? "Sin errores: el archivo está listo para importar." : "El archivo no trae filas para importar."}</p>
          )}

          {plan.avisos.length > 0 && (
            <details className="gi-card">
              <summary>{plan.avisos.length} aviso{plan.avisos.length === 1 ? "" : "s"} <small>no impiden importar</small></summary>
              <div className="gi-lista"><table>
                <thead><tr><th>Hoja</th><th className="n">Fila</th><th>Aviso</th></tr></thead>
                <tbody>{plan.avisos.slice(0, 200).map((x, i) => <tr key={i}><td>{x.hoja}</td><td className="n">{x.fila}</td><td>{x.texto}</td></tr>)}</tbody>
              </table></div>
            </details>
          )}

          {falla && <p className="gi-error" role="alert">{falla}</p>}

          {fase === "cargando" ? (
            <div className="gi-avance" role="status">
              <b>{avance.paso}</b>
              <div className="gi-barra"><i style={{ width: `${Math.min(100, (avance.hecho * 100) / Math.max(1, avance.total))}%` }} /></div>
              <small>{avance.total > 1 ? `${n(avance.hecho)} de ${n(avance.total)}` : "un momento…"} · no cierres esta pantalla</small>
            </div>
          ) : (
            <div className="gi-acciones">
              <label className="gi-check"><input type="checkbox" checked={disp} onChange={(e) => setDisp(e.target.checked)} />Abrir los disparadores que correspondan al terminar</label>
              <button type="button" className="btn grande" disabled={!puedeImportar} onClick={() => void importar()}>
                {plan.errores.length ? "Corrige los errores para importar" : !puedeEditar ? "No tienes permiso para importar" : `Importar todo (${n(plan.turnos.length + plan.procesos.length + plan.indicadores.length + plan.resultados.length)} filas)`}
              </button>
            </div>
          )}
        </>
      )}

      {/* ---- 3 · listo ---- */}
      {fase === "listo" && resumen && (
        <section className="gi-listo">
          <h2>Importación lista</h2>
          <div className="gs-cifras c4 gi-cifras">
            <div className="gs-cif bien"><span>Indicadores</span><b>{n(resumen.indicadores.nuevos + resumen.indicadores.cambian)}</b><small>{resumen.indicadores.nuevos} creados · {resumen.indicadores.cambian} actualizados</small></div>
            <div className="gs-cif"><span>Procesos y turnos</span><b>{n(resumen.procesos.nuevos + resumen.turnos.nuevos)}</b><small>{resumen.procesos.nuevos} procesos · {resumen.turnos.nuevos} turnos nuevos</small></div>
            <div className="gs-cif bien"><span>Resultados</span><b>{n(resumen.insertados + resumen.reemplazados)}</b><small>{n(resumen.insertados)} nuevos · {n(resumen.reemplazados)} reemplazados{resumen.omitidos ? ` · ${resumen.omitidos} omitidos` : ""}</small></div>
            <div className={"gs-cif" + (resumen.abiertos ? " mal" : "")}><span>Disparadores abiertos</span><b>{n(resumen.abiertos)}</b><small>{resumen.abiertos ? "piden su 5 Why" : "ninguno saltó"}</small></div>
          </div>
          <div className="gi-acciones">
            <Link href="/gestion" className="btn grande">Ver el tablero</Link>
            {resumen.abiertos > 0 && <Link href="/gestion/disparadores" className="btn">Ver los disparadores</Link>}
            <Link href="/gestion/maestro" className="btn plano">Revisar el maestro</Link>
            <button type="button" className="btn plano" onClick={reiniciar}>Importar otro archivo</button>
          </div>
        </section>
      )}
    </>
  );
}
