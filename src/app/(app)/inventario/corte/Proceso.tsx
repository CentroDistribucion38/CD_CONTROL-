"use client";

import { useMemo, useState } from "react";
import {
  armarPar, conteoDelPar, sinModulos, envaseDelRenglon, type Analisis, type ConteoRef, type Corte as CorteT, type FilaCorte,
  type LineaConteo, type RenglonCorte, type Sitio,
} from "@/modulos/inventario/corte";
import { tablasDelPar } from "./Diferencia";
import type { LineaC, MatC, UbiC } from "./Corte";

/* ===================================================================
   EL PROCESO, CORTE POR CORTE (solo para quien administra)

   «Quería verlo como flujo, por proceso, por estas etapas: Corte 1, la tarjeta con la
   info; si tiene corte final lo muestra… Si hicieron el inicial y el final, ya se guarda y
   debe generar el análisis solo.»

   Cada corte inicial es un «Corte N» (el 1 es el primero que se hizo). Su tarjeta cuenta el proceso
   de izquierda a derecha, igual que la maqueta (corte-flujo.html):

       ① Corte inicial  →  ② Corte final  →  ③ Cruce con la depa (CUADRA / NO CUADRA / INCOMPLETO)

   y, por cada línea:  [así estaba] → [lo que pasó por la depa] → [así quedó] → [resultado].

   EL ANÁLISIS SALE SOLO: en cuanto hay corte final, el par ya está guardado y se cruza con la depa
   y con el conteo que le toca; no hay botón de «generar». Sin corte final la tarjeta lo dice.
   Solo se mira: aquí no se toca nada.
   =================================================================== */

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).replace(", ", " ");
const soloHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
const conSigno = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + nf.format(Math.abs(n));
const corto = (s: string) => s.replace(/ · /g, "·");
const duracion = (a: string, b: string) => {
  const m = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));
  return m < 60 ? `${m} MIN` : `${Math.floor(m / 60)} H ${String(m % 60).padStart(2, "0")} MIN`;
};

type Estado = "cuadra" | "no_cuadra" | "incompleto";
const TXT: Record<Estado, string> = { cuadra: "CUADRA", no_cuadra: "NO CUADRA", incompleto: "INCOMPLETO" };
const peor = (l: Estado[]): Estado => (l.includes("no_cuadra") ? "no_cuadra" : l.includes("incompleto") ? "incompleto" : "cuadra");

/** Un módulo ya traducido a lo que se dibuja: cuántas estibas (si se pueden contar), cuántas cajas (si se pueden) y la unidad en que se anotó. */
type Bloque = { id: string; est: number | null; cajas: number | null; cant: number; unidad: Sitio["unidad"] };
function bloque(s: Sitio, porEstiba: number | null): Bloque {
  const ok = porEstiba != null && porEstiba > 0;
  return {
    id: s.ubicacion_id, cant: s.cant, unidad: s.unidad,
    est: s.unidad === "estibas" ? s.cant : ok ? s.cant / (porEstiba as number) : null,
    cajas: s.unidad === "cajas" ? s.cant : ok ? s.cant * (porEstiba as number) : null,
  };
}

export function Proceso({ cortes, lineas, ubicaciones, materiales, conteos, lineasConteo, nombres }: {
  cortes: CorteT[]; lineas: LineaC[]; ubicaciones: UbiC[]; materiales: MatC[];
  conteos: ConteoRef[]; lineasConteo: LineaConteo[]; nombres: Record<string, string>;
}) {
  /* Primero el más viejo (el Corte 1) o primero el más nuevo: el número del corte no cambia. */
  const [nuevoPrimero, setNuevoPrimero] = useState(false);

  const mat = useMemo(() => new Map(materiales.map((m) => [m.id, m])), [materiales]);
  const ubi = useMemo(() => new Map(ubicaciones.map((u) => [u.id, u])), [ubicaciones]);
  const nombreUbi = useMemo(() => (id: string) => {
    const u = ubi.get(id);
    return u ? `${u.calle} · ${u.modulo} · ${u.lado ?? "—"}` : "—";
  }, [ubi]);
  const porConteo = useMemo(() => {
    const m = new Map<string, LineaConteo[]>();
    for (const l of lineasConteo) { const x = m.get(l.conteo_id); if (x) x.push(l); else m.set(l.conteo_id, [l]); }
    return m;
  }, [lineasConteo]);
  const nombreLinea = (c: string) => lineas.find((l) => l.clave === c)?.nombre ?? c;
  const porEstiba = (id: string | null) => (id ? mat.get(id)?.cajas_por_estiba ?? null : null);

  const ctx = useMemo(() => ({
    conteos, lineasPorConteo: porConteo,
    envaseDe: (r: RenglonCorte) => envaseDelRenglon(r.envase_id, r.material_id, materiales).m?.id ?? null,
  }), [conteos, porConteo, materiales]);
  const items = useMemo(() => {
    const finalDe = new Map(cortes.filter((c) => c.tipo === "final").map((c) => [c.inicial_id!, c]));
    const iniciales = cortes.filter((c) => c.tipo === "inicial").sort((a, b) => a.cortado_en.localeCompare(b.cortado_en));
    return iniciales.map((ini, i) => {
      const fin = finalDe.get(ini.id) ?? null;
      const conFinal = fin ? ini.renglones.filter((r) => fin.renglones.some((x) => x.linea === r.linea)).length : 0;
      const total = ini.renglones.length;
      const pct = total === 0 ? 0 : Math.round((conFinal / total) * 100);
      let a: Analisis | null = null;
      const estados = new Map<string, Estado>();
      let estado: Estado | null = null;
      let iniV = ini, finV = fin;
      if (fin) {
        const cid = conteoDelPar(ini, fin, conteos);
        const par = armarPar(ini, fin, porEstiba, nombreUbi, ctx, cid);
        a = par.a; iniV = par.ini; finV = par.fin;
        const t = tablasDelPar(a, cid, porConteo, nombreUbi);
        for (const x of t) estados.set(x.linea, x.estado as Estado);
        estado = t.length === 0 ? "incompleto" : peor(t.map((x) => x.estado as Estado));
      }
      return { n: i + 1, ini: iniV, fin: finV, conFinal, total, pct, a, estados, estado };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cortes, mat, nombreUbi, conteos, porConteo, ctx]);

  const lista = nuevoPrimero ? [...items].reverse() : items;
  const completos = items.filter((x) => x.pct === 100).length;

  /* ---------- las piezas de la tarjeta ---------- */
  const valor = (b: Bloque) => b.est != null
    ? <div className="pr-v">{nf1.format(b.est)}<small>est{b.cajas != null ? ` · ${nf.format(b.cajas)} cj` : ""}</small></div>
    : <div className="pr-v">{nf.format(b.cant)}<small>{b.unidad}</small></div>;

  const modulo = (rol: "Tomando de" | "Ubicados en", b: Bloque, nombreMat: string | undefined, prev?: Bloque | null) => {
    let mv: React.ReactNode = null;
    if (prev !== undefined) {
      if (prev === null) mv = <span className="pr-mv up">APARECIÓ EN EL FINAL</span>;
      else {
        const d = b.est != null && prev.est != null ? b.est - prev.est : b.cant - prev.cant;
        const u = b.est != null && prev.est != null ? "ESTIBAS" : b.unidad.toUpperCase();
        if (Math.abs(d) > 1e-9) mv = <span className={"pr-mv " + (d > 0 ? "up" : "dn")}>{d > 0 ? "+" : "−"}{nf1.format(Math.abs(d))} {u} · {d > 0 ? "SUBIÓ" : "BAJÓ"}</span>;
        else mv = <span className="pr-mv ig">IGUAL</span>;
      }
    }
    return (
      <div className="pr-mod" key={rol + b.id}>
        <span className="eti">{rol}</span><b>{corto(nombreUbi(b.id))}</b>
        {valor(b)}{mv}
        {nombreMat ? <div className="pr-m">{nombreMat}</div> : <div className="pr-m sin">{rol === "Tomando de" ? "Sin envase anotado" : "Sin producto anotado"}</div>}
      </div>
    );
  };
  /* Lo que estaba en el inicial y ya no está en el final. */
  const moduloIdo = (rol: "Tomando de" | "Ubicados en", b: Bloque, nombreMat: string | undefined) => (
    <div className="pr-mod" key={"ido" + rol + b.id}>
      <span className="eti">{rol}</span><b>{corto(nombreUbi(b.id))}</b>
      <span className="pr-mv dn">NO ESTÁ EN EL FINAL</span>
      {nombreMat ? <div className="pr-m">{nombreMat}</div> : <div className="pr-m sin">{rol === "Tomando de" ? "Sin envase anotado" : "Sin producto anotado"}</div>}
    </div>
  );

  const lados = (r: RenglonCorte | undefined, previo?: RenglonCorte, fefo = false) => {
    if (!r) return null;
    const pe = porEstiba(r.envase_id), pp = porEstiba(r.material_id);
    const bo = r.origenes.map((s) => bloque(s, pe)), bd = fefo ? [] : r.destinos.map((s) => bloque(s, pp));
    const po = previo ? new Map(previo.origenes.map((s) => [s.ubicacion_id, bloque(s, porEstiba(previo.envase_id))])) : null;
    const pd = previo && !fefo ? new Map(previo.destinos.map((s) => [s.ubicacion_id, bloque(s, porEstiba(previo.material_id))])) : null;
    const et = (id: string | null) => { const m = id ? mat.get(id) : undefined; return m ? `${m.sku} · ${m.nombre}` : undefined; };
    const env = envaseDelRenglon(r.envase_id, r.material_id, materiales);
    const nEnv = env.m ? `${env.m.sku} · ${env.m.nombre}${env.delMaestro ? " (del maestro)" : ""}` : undefined, nPro = et(r.material_id);
    return (
      <div className="pr-mods">
        {bo.map((b) => modulo("Tomando de", b, nEnv, po ? po.get(b.id) ?? null : undefined))}
        {po && [...po.values()].filter((b) => !bo.some((x) => x.id === b.id)).map((b) => moduloIdo("Tomando de", b, nEnv))}
        {bd.map((b) => modulo("Ubicados en", b, nPro, pd ? pd.get(b.id) ?? null : undefined))}
        {pd && [...pd.values()].filter((b) => !bd.some((x) => x.id === b.id)).map((b) => moduloIdo("Ubicados en", b, nPro))}
        {bo.length === 0 && bd.length === 0 && <p className="pr-vacio">{fefo || sinModulos(r) ? "De dónde toma el envase se lee del FEFO." : "No anotaron módulos."}</p>}
      </div>
    );
  };

  const carril = (x: (typeof items)[number], r: RenglonCorte) => {
    const f = x.fin?.renglones.find((q) => q.linea === r.linea);
    const fila: FilaCorte | undefined = x.a?.filas.find((q) => q.linea === r.linea);
    const est = x.estados.get(r.linea) ?? null;
    const pasadas = f ? f.cajas_depa - r.cajas_depa : null;
    const cpe = porEstiba(f?.material_id ?? r.material_id);
    const nom = nombreLinea(r.linea);
    const deFefo = !!x.a?.fefo?.lineas.includes(r.linea);
    return (
      <div className="pr-carril" key={r.linea}>
        <div className="pr-lnm">{r.linea}<small>{nom !== r.linea ? nom.toUpperCase() : "LÍNEA"}</small></div>

        <div className="pr-foto">
          <div className="pr-fh"><span className="eti">① Así estaba</span><span className="pr-h">{soloHora(x.ini.cortado_en)}</span></div>
          <div className="pr-dep"><b>{nf.format(r.cajas_depa)}</b><span>cajas en el contador de la depa</span></div>
          {lados(r, undefined, deFefo)}
          {r.nota && <p className="pr-nota-l">{r.nota}</p>}
        </div>

        <div className="pr-depa">
          <span className="eti">Pasó por la depa</span>
          {f && pasadas != null ? (
            <>
              <b>{conSigno(pasadas)}</b>
              <small>cajas{cpe && cpe > 0 ? ` · ${nf.format(Math.abs(pasadas) / cpe)} estibas` : ""}</small>
              <span className="pr-tm">{nf.format(r.cajas_depa)} → {nf.format(f.cajas_depa)}</span>
              <div className="pr-banda" aria-hidden="true"><div className="pr-cajas">{Array.from({ length: 11 }, (_, i) => <i key={i} />)}</div></div>
            </>
          ) : (
            <>
              <b className="pr-espera">—</b>
              <small>{x.fin ? "Esta línea no se cortó al final" : "Falta el corte final"}</small>
            </>
          )}
        </div>

        <div className={"pr-foto" + (f ? "" : " pr-pend")}>
          <div className="pr-fh"><span className="eti">② Así quedó</span>{x.fin && <span className="pr-h">{soloHora(x.fin.cortado_en)}</span>}</div>
          {f ? (
            <>
              <div className="pr-dep"><b>{nf.format(f.cajas_depa)}</b><span>cajas en el contador de la depa</span></div>
              {lados(f, r, deFefo)}
              {f.nota && <p className="pr-nota-l">{f.nota}</p>}
            </>
          ) : (
            <p className="pr-vacio">{x.fin ? "Esta línea se cortó al empezar y no se cortó al final." : "Todavía no se hace el corte final de esta línea."}</p>
          )}
        </div>

        <div className={"pr-res " + (est ?? "espera")}>
          {f && est ? (
            <>
              <span className="pr-big"><span className="pr-x">{est === "cuadra" ? "✓" : est === "no_cuadra" ? "✕" : "!"}</span>{est === "cuadra" ? "Cuadra" : est === "no_cuadra" ? "No cuadra" : "Incompleto"}</span>
              <div className="pr-ln"><span>Pasó por la depa</span><b>{nf.format(pasadas ?? 0)}</b></div>
              <div className="pr-ln"><span>Surte (debía bajar)</span><b>{fila?.origen.dif != null ? conSigno(fila.origen.dif) : "—"}</b></div>
              {!deFefo && <div className="pr-ln"><span>Recibe (debía subir)</span><b>{fila?.destino.dif != null ? conSigno(fila.destino.dif) : "—"}</b></div>}
              {(fila?.origen.motivo || (!deFefo && fila?.destino.motivo)) && est === "incompleto" && <p className="pr-mot">{fila?.origen.motivo ?? fila?.destino.motivo}</p>}
              <a href="#cl-diferencia">VER LA DIFERENCIA →</a>
            </>
          ) : (
            <>
              <span className="pr-big">Esperando</span>
              <p className="pr-mot">{x.fin ? "Esta línea no tiene corte final: no se puede cruzar." : "Cuando se haga el corte final, el análisis sale solo."}</p>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pr">
      <div className="pr-barra">
        <span className="pr-resumen">{completos} de {items.length} {items.length === 1 ? "corte completo" : "cortes completos"}</span>
        <button type="button" className="btn plano" aria-pressed={nuevoPrimero} onClick={() => setNuevoPrimero((x) => !x)}>
          {nuevoPrimero ? "Ver del primero al último" : "Ver del último al primero"}
        </button>
      </div>
      {lista.length === 0 && <p className="fe-vacio">Todavía no se ha hecho ningún corte.</p>}
      {lista.map((x, k) => {
        const nMal = x.fin ? [...x.estados.values()].filter((e) => e === "no_cuadra").length : 0;
        const nInc = x.fin ? [...x.estados.values()].filter((e) => e === "incompleto").length : 0;
        const linea = (n: number) => `${n} ${n === 1 ? "línea" : "líneas"}`;
        const detalle = !x.fin ? "falta el corte final"
          : nMal + nInc === 0 ? "todas las líneas cuadran"
          : [nMal ? `${linea(nMal)} con diferencia` : "", nInc ? `${linea(nInc)} sin poder cruzar` : ""].filter(Boolean).join(" · ");
        return (
          <details key={x.ini.id} className="pr-corte">
            <summary className="pr-cab">
              <span className="pr-t">
                <span className="pr-h2">CORTE <b>{x.n}</b></span>
                {x.n === 1 && <em className="pr-pri">EL PRIMERO</em>}
                <span className="pr-q">{hora(x.ini.cortado_en)} · {x.ini.creado_por ? nombres[x.ini.creado_por] ?? "—" : "—"} · {x.conFinal} de {x.total} {x.total === 1 ? "línea" : "líneas"} · {x.pct}%</span>
              </span>
              <span className={"pr-est " + (x.estado ?? "espera")}>
                <span className="pr-x">{x.estado === "cuadra" ? "✓" : x.estado === "no_cuadra" ? "✕" : x.estado === "incompleto" ? "!" : "…"}</span>
                <span><b>{x.estado ? TXT[x.estado] : "ESPERANDO EL FINAL"}</b>
                  <small>{detalle}</small></span>
              </span>
            </summary>

            <div className="pr-proc">
              <div className="pr-nodo"><span className="pr-bol">1</span><div><b>Corte inicial</b><small>{soloHora(x.ini.cortado_en)}</small></div></div>
              <div className="pr-tramo"><span>{x.fin ? `${duracion(x.ini.cortado_en, x.fin.cortado_en)} · LÍNEA TRABAJANDO` : "ESPERANDO EL CORTE FINAL"}</span></div>
              <div className={"pr-nodo" + (x.fin ? "" : " pend")}><span className={"pr-bol" + (x.fin ? "" : " pend")}>2</span><div><b>Corte final</b><small>{x.fin ? soloHora(x.fin.cortado_en) : "pendiente"}</small></div></div>
              <div className={"pr-tramo" + (x.estado === "no_cuadra" ? " r" : "") + (x.fin ? "" : " pend")}><span>CRUCE CON LA DEPA</span></div>
              <div className={"pr-nodo " + (x.estado ?? "pend")}>
                <span className={"pr-bol " + (x.estado ?? "pend")}>{x.estado === "cuadra" ? "✓" : x.estado === "no_cuadra" ? "!" : x.estado === "incompleto" ? "?" : "3"}</span>
                <div><b>{x.estado === "cuadra" ? "Cuadra" : x.estado === "no_cuadra" ? "No cuadra" : x.estado === "incompleto" ? "Incompleto" : "Diferencia"}</b><small>{x.estado === "no_cuadra" ? "revisar" : x.estado ? "análisis hecho" : "sale sola"}</small></div>
              </div>
            </div>

            {[...x.ini.renglones].sort((a, b) => a.linea.localeCompare(b.linea, "es", { numeric: true })).map((r) => carril(x, r))}
            {(x.ini.nota || x.fin?.nota) && (
              <p className="pr-nota">
                {x.ini.nota ? `Nota del inicial: ${x.ini.nota}` : ""}{x.ini.nota && x.fin?.nota ? " · " : ""}{x.fin?.nota ? `Nota del final: ${x.fin.nota}` : ""}
              </p>
            )}
            <p className="pr-nota">{(() => { const f = porEstiba(x.ini.renglones[0]?.material_id ?? null); return f ? `${f} cajas por estiba` : ""; })()}</p>
          </details>
        );
      })}
    </div>
  );
}
