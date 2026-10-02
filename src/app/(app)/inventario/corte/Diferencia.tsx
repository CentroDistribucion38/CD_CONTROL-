"use client";

import { Fragment, useMemo } from "react";
import {
  envaseDelRenglon,
  armarTabla, cruzar, diaColombia, duracion,
  type Analisis, type ConteoRef, type Corte as CorteT, type FilaTabla, type GrupoTabla, type LineaConteo, type TablaLinea,
} from "@/modulos/inventario/corte";
import type { MatC, LineaC } from "./Corte";

/* ===================================================================
   LA DIFERENCIA DE UN PAR DE CORTES (inicial → final), una tarjeta por línea.

   Cada tarjeta es UNA tabla: las filas son lo que se mide (la depa, y por cada
   lado «según el corte» y «según el inventario») y las columnas van en cuatro
   bloques —Corte inicial, Corte final, Se movió, Diferencia con la depa— cada
   uno en estibas, cajas y unidades. Las estibas y las unidades salen de las
   cajas con el factor de cada material (cajas por estiba, unidades por caja).

   La cuenta está en modulos/inventario/corte.ts (armarTabla): aquí solo se pinta.
   =================================================================== */

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const signo = (n: number, f: Intl.NumberFormat) => (n > 0 ? "+" : n < 0 ? "−" : "") + f.format(Math.abs(n));
const dia = (f: string) => f.slice(0, 10).split("-").reverse().join("/");
const diaCorto = (f: string) => dia(f).slice(0, 5);

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).replace(", ", " ");
const soloHora = (iso: string) => hora(iso).slice(11);

type Factores = { porEstiba: number | null; porCaja: number | null };

/** Las tres celdas de un bloque: estibas, cajas y unidades de una misma cantidad de cajas. */
function Tres({ bloque, cajas, f, conSigno }: {
  bloque: string; cajas: number | null; f: Factores; conSigno?: boolean;
}) {
  const fmtN = (n: number, fm: Intl.NumberFormat) => (conSigno ? signo(n, fm) : fm.format(n));
  const est = cajas === null || !(f.porEstiba && f.porEstiba > 0) ? null : cajas / f.porEstiba;
  const uni = cajas === null || !(f.porCaja && f.porCaja > 0) ? null : cajas * f.porCaja;
  const celda = (n: number | null, fm: Intl.NumberFormat, k: string, clase: string) =>
    <td data-k={k} data-b={k === "Estibas" ? bloque : undefined} className={clase + (n === null ? " nd" : "")}>{n === null ? "—" : fmtN(n, fm)}</td>;
  return <>{celda(est, nf1, "Estibas", "x")}{celda(cajas, nf, "Cajas", "c")}{celda(uni, nf, "Unidades", "")}</>;
}

function FilaT({ fila, f, dz }: { fila: FilaTabla; f: Factores; dz?: boolean }) {
  const tono = fila.tono ?? "";
  return (
    <tr className={"r-" + fila.clase}>
      <td className="q" data-k="Qué se mide">{fila.etiqueta}{fila.clase === "depa" && <small>contador · la referencia</small>}</td>
      <Tres bloque="Corte inicial" cajas={fila.ini} f={f} />
      <Tres bloque="Corte final" cajas={fila.fin} f={f} />
      <Tres bloque="Se movió" cajas={fila.mov} f={f} conSigno />
      {fila.clase === "depa"
        ? <><td className="x nd dz" data-k="Estibas" data-b="Diferencia con la depa">—</td><td className="nd dz" data-k="Cajas">—</td><td className="nd dz" data-k="Unidades">—</td></>
        : <DifT fila={fila} f={f} dz={dz} />}
      <td className={"lec " + tono} data-k="Lectura">{fila.lectura}{(fila.aparte ?? 0) > 0 && <small>+ {nf.format(fila.aparte!)} en avería/PNC (no se suma)</small>}</td>
    </tr>
  );
}

function DifT({ fila, f }: { fila: FilaTabla; f: Factores; dz?: boolean }) {
  const t = fila.dif === null ? "nd" : Math.abs(fila.dif) < 0.5 ? "ok" : "rojo";
  const est = fila.dif === null || !(f.porEstiba && f.porEstiba > 0) ? null : fila.dif / f.porEstiba;
  const uni = fila.dif === null || !(f.porCaja && f.porCaja > 0) ? null : fila.dif * f.porCaja;
  const c = (n: number | null, fm: Intl.NumberFormat, k: string, clase: string) =>
    <td data-k={k} data-b={k === "Estibas" ? "Diferencia con la depa" : undefined} className={`${clase} dz ${n === null ? "nd" : t}`}>{n === null ? "—" : signo(Math.abs(n) < 0.5 ? 0 : n, fm)}</td>;
  return <>{c(est, nf1, "Estibas", "x")}{c(fila.dif, nf, "Cajas", "c")}{c(uni, nf, "Unidades", "")}</>;
}

/** Las tablas de un par contra un conteo (o sin conteo si id es null). */
export function tablasDelPar(a: Analisis, id: string | null, lineasPorConteo: Map<string, LineaConteo[]>, nombreUbi: (id: string) => string): TablaLinea[] {
  return cruzar(a, id ?? "", id ? lineasPorConteo.get(id) ?? [] : []).map((c) => armarTabla(c, id !== null, nombreUbi));
}

export function ParDiferencia({ a, ini, fin, conteos, lineasPorConteo, conteoId, onConteo, soloLinea, lineas, mat, nombreUbi, manda, borrar, ocupado, onBorrar, onConfirmar, sinTitulo }: {
  a: Analisis; ini: CorteT; fin: CorteT;
  conteos: ConteoRef[]; lineasPorConteo: Map<string, LineaConteo[]>;
  /** El conteo con el que se compara (null = ninguno) y cómo cambiarlo. */
  conteoId: string | null; onConteo: (id: string) => void;
  /** Si viene, solo se pinta la tarjeta de esa línea. */
  soloLinea?: string;
  lineas: LineaC[]; mat: Map<string, MatC>; nombreUbi: (id: string) => string;
  manda: boolean; borrar: string | null; ocupado: boolean;
  onBorrar: (id: string | null) => void; onConfirmar: (id: string) => void;
  /** El título del par ya lo pone quien lo contiene (la fila del historial). */
  sinTitulo?: boolean;
}) {
  const id = conteoId;
  const conteo = conteos.find((c) => c.id === id) ?? null;
  const tablas = useMemo(
    () => tablasDelPar(a, id, lineasPorConteo, nombreUbi),
    // nombreUbi cambia de identidad en cada pintada pero no de resultado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a, id, lineasPorConteo],
  );
  const nombreLinea = (c: string) => lineas.find((l) => l.clave === c)?.nombre ?? c;
  const factores = (mid: string | null): Factores => {
    const m = mid ? mat.get(mid) : undefined;
    return { porEstiba: m?.cajas_por_estiba ?? null, porCaja: m?.unidades_por_caja ?? null };
  };

  /* El conteo tiene que haberse hecho ENTRE los dos cortes para que la comparación sirva. */
  const d1 = diaColombia(ini.cortado_en), d2 = diaColombia(fin.cortado_en);
  const fueraDeRango = !a.fefo && conteo !== null && (conteo.fecha < d1 || conteo.fecha > d2);
  const cortesDe = d1 === d2 ? `del ${diaCorto(d1)}` : `del ${diaCorto(d1)} al ${diaCorto(d2)}`;

  return (
    <div className="dq-cuerpo">
      <div className="dq-barra">
        {!sinTitulo && <h3>{hora(ini.cortado_en)} → {hora(fin.cortado_en)}<small>{duracion(a.horas)} · {nf.format(a.totalPasadas)} cajas por la depa</small></h3>}
        <div className="dq-der">
          {conteos.length > 0 && (
            <label>
              <span className="dq-eti">{a.fefo ? "FEFO de después" : "Conteo"}</span>
              <select value={id ?? ""} onChange={(e) => onConteo(e.target.value)} aria-label="Conteo del inventario con el que se compara">
                {id === null && <option value="" disabled>— escoge uno —</option>}
                {conteos.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {dia(c.fecha)}</option>)}
              </select>
            </label>
          )}
          {manda && (borrar === ini.id ? (
            <span className="cl-conf">¿Eliminar el inicial y el final?
              <button type="button" className="btn plano mal" disabled={ocupado} onClick={() => onConfirmar(ini.id)}>Sí, eliminar</button>
              <button type="button" className="btn plano" onClick={() => onBorrar(null)}>No</button>
            </span>
          ) : (
            <button type="button" className="btn plano" onClick={() => onBorrar(ini.id)}>Eliminar el par</button>
          ))}
        </div>
      </div>

      {a.fefo && (
        <p className={"dq-aviso" + (a.fefo.falta ? "" : " gris")} role="status">
          <span>
            <b>De dónde tomaba el envase sale del FEFO</b>
            {a.fefo.antes && a.fefo.despues
              ? <>: lo que bajó entre <b>{a.fefo.antes.codigo}</b> ({dia(a.fefo.antes.fecha)}) y <b>{a.fefo.despues.codigo}</b> ({dia(a.fefo.despues.fecha)}). Solo cuenta el envase; el producto y dónde se ubica no entran.</>
              : <>. {a.fefo.falta}</>}
          </span>
        </p>
      )}
      {conteos.length === 0 && <p className="dq-aviso gris">No hay conteos enviados de esta bodega: solo se compara el corte con la depa.</p>}
      {fueraDeRango && conteo && (
        <p className="dq-aviso" role="status">
          El conteo es del {dia(conteo.fecha)} y los cortes {cortesDe}: escoge un conteo hecho entre los dos cortes para que la comparación sirva.
        </p>
      )}

      {tablas.filter((t) => !soloLinea || t.linea === soloLinea).map((t) => <TarjetaLinea key={t.linea} t={t} nombre={nombreLinea(t.linea)} mat={mat} a={a} factores={factores} />)}

      {(a.soloInicial.length > 0 || a.soloFinal.length > 0) && (
        <p className="cl-nota">
          {a.soloInicial.length > 0 && <>Solo se cortó en el inicial: <b>{a.soloInicial.join(", ")}</b>. </>}
          {a.soloFinal.length > 0 && <>Solo se cortó en el final: <b>{a.soloFinal.join(", ")}</b>. </>}
          Esas líneas no se pueden restar.
        </p>
      )}
      {(ini.nota || fin.nota) && <p className="cl-nota">{[ini.nota, fin.nota].filter(Boolean).join(" · ")}</p>}
    </div>
  );
}

function TarjetaLinea({ t, nombre, mat, a, factores }: {
  t: TablaLinea; nombre: string; mat: Map<string, MatC>; a: Analisis; factores: (id: string | null) => Factores;
}) {
  const f = a.filas.find((x) => x.linea === t.linea)!;
  const fDepa = factores(f.material_id ?? f.envase_id);
  const fOrigen = factores(f.envase_id), fDestino = factores(f.material_id);
  const chip = { cuadra: "CUADRA", no_cuadra: "NO CUADRA", incompleto: "INCOMPLETO" }[t.estado];
  const nombreMat = (id: string | null) => { const m = id ? mat.get(id) : undefined; return m ? `${m.sku} · ${m.nombre}` : null; };
  const nombreEnvase = () => { const e = envaseDelRenglon(f.envase_id, f.material_id, [...mat.values()]); return e.m ? `${e.m.sku} · ${e.m.nombre}${e.delMaestro ? " (del maestro)" : ""}${f.material_id && mat.get(f.material_id) ? ` · para ${mat.get(f.material_id)!.sku} · ${mat.get(f.material_id)!.nombre}` : ""}` : null; };
  const txtFactor = (x: Factores) => [x.porEstiba ? `${nf.format(x.porEstiba)} cajas por estiba` : null, x.porCaja ? `${nf.format(x.porCaja)} unidades por caja` : null].filter(Boolean).join(" · ");
  const fo = txtFactor(fOrigen), fd = f.soloEnvase ? "" : txtFactor(fDestino);

  return (
    <section className={"dq-card " + t.estado} aria-label={nombre}>
      <header className="dq-cab">
        <span className="dq-lin">{t.linea}</span>
        <h4>{nombre}
          <small>
            {t.contadorAtras
              ? <>El contador <b>retrocedió</b> ({nf.format(f.ini)} → {nf.format(f.fin)}): revisa si se reinició o se digitó mal</>
              : <><b>{nf.format(f.pasadas)}</b> cajas por la depa ({nf.format(f.ini)} → {nf.format(f.fin)})</>}
          </small>
        </h4>
        <span className={"dq-chip " + t.estado}>{chip}</span>
      </header>

      <div className="tw">
        <table>
          <thead>
            <tr className="g">
              <th />
              <th colSpan={3}>Corte inicial</th><th colSpan={3}>Corte final</th><th colSpan={3}>Se movió</th>
              <th colSpan={3} className="dif">Diferencia con la depa</th><th />
            </tr>
            <tr className="s">
              <th>Qué se mide</th>
              {[0, 1, 2, 3].map((g) => <Fragment key={g}><th>Estibas</th><th>Cajas</th><th>Unidades</th></Fragment>)}
              <th className="lec">Lectura</th>
            </tr>
          </thead>
          <tbody>
            <FilaT fila={t.depa} f={fDepa} />
            {t.grupos.map((g) => <Grupo key={g.titulo} g={g} f={g.titulo === "Tomando de" ? fOrigen : fDestino} material={g.titulo === "Tomando de" ? nombreEnvase() : nombreMat(g.material_id)} />)}
          </tbody>
        </table>
      </div>

      <footer className="dq-pie">
        <span><b>Diferencia con la depa</b> = lo que se movió − lo que debía moverse</span>
        {fo || fd ? (
          <span>
            Factores:{" "}
            {fo && fd && fo === fd ? <b>{fo}</b> : <>{fo && <>Tomando de <b>{fo}</b></>}{fo && fd && " · "}{fd && <>Ubicados en <b>{fd}</b></>}</>}
          </span>
        ) : <span>Sin factor de estibado: las estibas y las unidades no se calculan.</span>}
      </footer>
    </section>
  );
}

function Grupo({ g, f, material }: { g: GrupoTabla; f: Factores; material: string | null }) {
  return (
    <>
      <tr className="grp">
        <td colSpan={14}>
          {g.titulo}{g.donde && <> · {g.donde}</>}
          <span>{material ? `${material} · ` : ""}debe {g.debe} lo mismo que pasó por la depa</span>
        </td>
      </tr>
      {g.filas.map((fila, i) => <FilaT key={i} fila={fila} f={f} />)}
      {g.nota && <tr className="nota"><td colSpan={14}>{g.nota}</td></tr>}
    </>
  );
}
