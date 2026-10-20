"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import type { SitioCasco } from "@/modulos/casco/datos";
import { ejeNice, viajesSerpro, type Punto } from "@/modulos/casco/serie";
import { colorSitio, corta, enOrdenInforme, larga } from "@/modulos/casco/informe";
import { comparar, nombreEstado, valorDe, type FilaCmp, type Medida, type Unidad } from "@/modulos/casco/comparar";
import type { DatosComparativo } from "@/modulos/casco/foto-comparativo";
import { TablaUbicacion, useTablaUbicacion, type ConteoDia, type Factores } from "./TablaUbicacion";
import { BotonesComparativo } from "./BotonesComparativo";

/**
 * COMPARATIVO DE CASCO DE VIDRIO — qué cambió entre dos días.
 *
 *   DASHBOARD: el cambio total en grande, una tarjeta por almacén, la cascada que explica de dónde
 *   viene el cambio, lo que más se movió y la tabla por material (que se abre por almacén).
 *   TABLA: renglón por material y almacén, con las ubicaciones de antes y de ahora, como el Excel.
 *
 * Subir es más casco por partir y va en ROJO; bajar, en VERDE. Cada estado lleva siempre su palabra:
 * el color solo no basta. Todo se calcula en el navegador con los renglones del Tablero.
 */

const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const UNIDADES: { k: Unidad; t: string; largo: string }[] = [
  { k: "hl", t: "HL", largo: "HL" }, { k: "est", t: "Estibas", largo: "estibas" }, { k: "caj", t: "Cajas", largo: "cajas" },
];
const dec = (v: number, u: Unidad) => (u === "est" ? nf2 : u === "hl" ? nf0 : nf0).format(v);
const num = (v: number | null, u: Unidad) => (v == null ? "—" : dec(v, u));
/** Con signo y guion ASCII; cero sin signo. */
const conSigno = (v: number | null, u: Unidad) => (v == null ? "—" : Math.abs(v) < (u === "est" ? 0.005 : 0.5) ? "0" : (v > 0 ? "+" : "−") + dec(Math.abs(v), u));
const clase = (v: number | null, u: Unidad) => (v == null || Math.abs(v) < (u === "est" ? 0.005 : 0.5) ? "eq" : v > 0 ? "up" : "dn");
const flecha = (v: number | null, u: Unidad) => { const c = clase(v, u); return c === "up" ? "▲" : c === "dn" ? "▼" : "■" };

const sumaDias = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};

type Pestana = "dashboard" | "tabla";

export function Comparativo({ puntos, sitios, nombres, cajasPorEstiba, errorLectura, conteos }: {
  puntos: Punto[]; sitios: SitioCasco[]; nombres: Record<string, string>;
  cajasPorEstiba: Record<string, number | null>; errorLectura: string | null;
  /** Los conteos físicos cerrados (para la Tabla por ubicación). */
  conteos: ConteoDia[];
}) {
  const fechas = useMemo(() => [...new Set(puntos.map((p) => p.fecha))].sort(), [puntos]);
  const ultima = fechas[fechas.length - 1] ?? "";
  const primera = fechas[0] ?? "";
  const [diaA, setDiaA] = useState(fechas[fechas.length - 2] ?? ultima);
  const [diaB, setDiaB] = useState(ultima);
  const [unidad, setUnidad] = useState<Unidad>("hl");
  const [pestana, setPestana] = useState<Pestana>("dashboard");
  const [vis, setVis] = useState<string[]>(sitios.map((s) => s.clave));
  const [soloCambios, setSoloCambios] = useState(false);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "sube" | "baja">("todos");

  const nombreSitio = (k: string) => sitios.find((s) => s.clave === k)?.nombre ?? k;
  const centroSitio = (k: string) => sitios.find((s) => s.clave === k)?.centro ?? k;
  const nom = (sku: string) => nombres[sku] ?? sku;

  const cmp = useMemo(
    () => comparar(puntos.filter((p) => vis.includes(p.ubicacion)), diaA, diaB, cajasPorEstiba, enOrdenInforme),
    [puntos, vis, diaA, diaB, cajasPorEstiba]);

  /* Cuánto vale una estiba de cada material, en HL (sale del mismo casco registrado) y en cajas (del maestro):
     la Tabla viene del conteo en estibas y con esto sigue la unidad que se escoja arriba. */
  const factores = useMemo<Factores>(() => {
    const hl: Record<string, number> = {}, est: Record<string, number> = {};
    for (const p of puntos) { const e = (p.inventario ?? 0) + (p.baja ?? 0); if (e > 0) { hl[p.sku] = (hl[p.sku] ?? 0) + p.hl; est[p.sku] = (est[p.sku] ?? 0) + e } }
    const f: Factores = {};
    for (const sku of new Set([...Object.keys(est), ...Object.keys(cajasPorEstiba)])) {
      f[sku] = { hl: est[sku] ? hl[sku] / est[sku] : null, caj: cajasPorEstiba[sku] ?? null };
    }
    return f;
  }, [puntos, cajasPorEstiba]);
  /* Los datos de la Tabla (y su foto) viven aquí para poder sacar la foto desde cualquier pestaña. */
  const tabla = useTablaUbicacion(conteos, diaA, diaB, pestana === "tabla", unidad, factores);

  const atajos: { k: string; t: string; a: string; b: string }[] = ultima ? [
    { k: "ant", t: "Último vs anterior", a: fechas[fechas.length - 2] ?? ultima, b: ultima },
    { k: "ayer", t: "Hoy vs ayer", a: sumaDias(ultima, -1), b: ultima },
    { k: "7", t: "Hoy vs hace 7 días", a: sumaDias(ultima, -7), b: ultima },
    { k: "mes", t: "Hoy vs inicio de mes", a: ultima.slice(0, 8) + "01", b: ultima },
  ] : [];
  const atajoActivo = atajos.find((x) => x.a === diaA && x.b === diaB)?.k;
  const alternar = (k: string) => setVis((v) => (v.includes(k) ? (v.length > 1 ? v.filter((x) => x !== k) : v) : [...v, k]));

  if (errorLectura) return <p className="cvt-vacio">No se pudo leer el casco: {errorLectura}</p>;
  if (!ultima) return <p className="cvt-vacio">Todavía no hay registros de casco de vidrio para comparar.</p>;

  const u = unidad;
  const v = (m: Medida) => valorDe(m, u);
  const tot = { a: v(cmp.a), b: v(cmp.b), d: v(cmp.d) };
  const pct = u === "hl" ? cmp.pct : (tot.a ? ((tot.d ?? 0) / Math.abs(tot.a)) * 100 : null);
  const ud = UNIDADES.find((x) => x.k === u)!;
  const sinFactor = u === "caj" && cmp.filas.some((f) => f.d.caj == null);
  const mats = cmp.materiales.filter((m) => !soloCambios || m.estado !== "igual")
    .filter((m) => filtroEstado === "todos" || (filtroEstado === "sube" ? (v(m.d) ?? 0) > 0 : (v(m.d) ?? 0) < 0));
  const topes = cmp.materiales.filter((m) => (v(m.d) ?? 0) !== 0).sort((x, y) => Math.abs(v(y.d) ?? 0) - Math.abs(v(x.d) ?? 0)).slice(0, 8);
  const maxMov = Math.max(1e-9, ...topes.map((m) => Math.abs(v(m.d) ?? 0)));
  const maxMat = Math.max(1e-9, ...cmp.materiales.map((m) => Math.abs(v(m.d) ?? 0)));
  const nuevos = cmp.cuentas.nuevo + cmp.cuentas.salio;
  const viajesA = cmp.sitios.reduce((t, s) => t + viajesSerpro(s.a.est, centroSitio(s.clave)), 0);
  const viajesB = cmp.sitios.reduce((t, s) => t + viajesSerpro(s.b.est, centroSitio(s.clave)), 0);

  /* Lo que pinta la foto del Dashboard: la misma unidad y los mismos filtros que se ven en pantalla. */
  const datosFoto: DatosComparativo | null = cmp.filas.length === 0 ? null : {
    unidad: u, unidadTxt: ud.largo === "HL" ? "HL" : ud.largo,
    diaA: cmp.diaA, diaB: cmp.diaB,
    chips: [`Unidad: ${ud.t}`, vis.length === sitios.length ? "Todos los almacenes" : sitios.filter((x) => vis.includes(x.clave)).map((x) => x.centro ?? x.nombre).join(" · ")],
    tot: { a: tot.a ?? 0, b: tot.b ?? 0, d: tot.d ?? 0 }, pct, viajesA, viajesB,
    sitios: cmp.sitios.map((s) => ({
      clave: s.clave, centro: centroSitio(s.clave), nombre: nombreSitio(s.clave),
      a: v(s.a) ?? 0, b: v(s.b) ?? 0, d: v(s.d) ?? 0, estB: s.b.est, viajesB: viajesSerpro(s.b.est, centroSitio(s.clave)),
    })),
    topes: topes.map((m) => ({
      nombre: nom(m.sku),
      porSitioB: Object.fromEntries(m.sitios.map((f) => [f.sitio, Math.max(0, (f.b ? valorDe(f.b, u) : 0) ?? 0)])),
      a: v(m.a) ?? 0, b: v(m.b) ?? 0, d: v(m.d) ?? 0,
    })),
  };

  const controles = (
    <section className="cvt-filtros cvc-ctrl" aria-label="Fechas a comparar">
      <div className="cvt-grupo">
        <span className="cvt-lb">Día A</span>
        <input type="date" value={diaA} min={primera} max={ultima} onChange={(e) => e.target.value && setDiaA(e.target.value)} aria-label="Día A" />
        {cmp.diaA && cmp.diaA !== diaA && <small className="cvc-usa">usa el registro del {corta(cmp.diaA)}</small>}
        {!cmp.diaA && <small className="cvc-usa mal">no hay registros hasta esa fecha</small>}
      </div>
      <button type="button" className="cvc-cambiar" onClick={() => { setDiaA(diaB); setDiaB(diaA) }} aria-label="Intercambiar el día A y el día B" title="Intercambiar">⇄</button>
      <div className="cvt-grupo">
        <span className="cvt-lb">Día B</span>
        <input type="date" value={diaB} min={primera} max={ultima} onChange={(e) => e.target.value && setDiaB(e.target.value)} aria-label="Día B" />
        {cmp.diaB && cmp.diaB !== diaB && <small className="cvc-usa">usa el registro del {corta(cmp.diaB)}</small>}
      </div>
      <div className="cvt-grupo">
        <span className="cvt-lb">Atajos</span>
        <div className="cvc-chips" role="group" aria-label="Atajos de fechas">
          {atajos.map((x) => (
            <button key={x.k} type="button" className="cvc-chip" aria-pressed={atajoActivo === x.k} onClick={() => { setDiaA(x.a < primera ? primera : x.a); setDiaB(x.b) }}>{x.t}</button>
          ))}
        </div>
      </div>
      <div className="cvt-grupo">
        <span className="cvt-lb">Unidad</span>
        <div className="cvt-seg" role="radiogroup" aria-label="Unidad">
          {UNIDADES.map((x) => <button key={x.k} type="button" role="radio" aria-checked={u === x.k} className={u === x.k ? "on" : ""} onClick={() => setUnidad(x.k)}>{x.t}</button>)}
        </div>
      </div>
      <div className="cvt-grupo">
        <span className="cvt-lb">Almacén</span>
        <div className="cvt-seg" role="group" aria-label="Almacén">
          {sitios.map((s) => (
            <button key={s.clave} type="button" aria-pressed={vis.includes(s.clave)} className={vis.includes(s.clave) ? "on" : ""} onClick={() => alternar(s.clave)}>
              <i className="cvt-pt" style={{ background: colorSitio(s.clave).fondo }} aria-hidden />{s.centro ?? s.nombre}
            </button>
          ))}
        </div>
      </div>
    </section>
  );

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · CASCO DE VIDRIO · COMPARATIVO</p>
          <h1>Comparativo</h1>
          <p className="sub">
            Qué cambió en el casco entre dos días: <b>{cmp.diaA ? larga(cmp.diaA) : "—"}</b> contra <b>{cmp.diaB ? larga(cmp.diaB) : "—"}</b>.
            Rojo es que hay más casco por partir; verde, menos.
          </p>
          <p className="sub"><Link href="/inventario/casco/tablero">← Tablero de casco</Link></p>
        </div>
        <BotonesComparativo datos={datosFoto} cargarTabla={tabla.cargar} unidad={unidad} cambiarUnidad={setUnidad} />
      </section>

      {controles}

      <div className="cvc-tabs" role="tablist" aria-label="Vista del comparativo">
        <button type="button" role="tab" aria-selected={pestana === "dashboard"} className="cvc-tab" onClick={() => setPestana("dashboard")}>Dashboard</button>
        <button type="button" role="tab" aria-selected={pestana === "tabla"} className="cvc-tab" onClick={() => setPestana("tabla")}>Tabla</button>
      </div>
      {pestana === "dashboard" && sinFactor && <p className="cvc-nota">Cajas: solo suma los materiales que tienen cajas por estiba en el maestro; el resto sale con «—».</p>}

      {pestana === "tabla" ? (
        <TablaUbicacion tab={tabla} />
      ) : cmp.filas.length === 0 ? (
        <p className="cvt-vacio">No hay casco para comparar con esos filtros.</p>
      ) : (
        <>
          {/* ---------- LA GRÁFICA Y LAS CIFRAS (los tonos del dashboard del Tablero) ---------- */}
          <div className="cvc-tablero">
            <section className="cvt-caja cvc-principal" aria-label="Día A contra día B">
              <header className="cvt-cab">
                <h2><i className="cvc-marca" aria-hidden />CASCO POR PARTIR · DÍA A CONTRA DÍA B ({ud.t.toUpperCase()})</h2>
                <ul className="cvt-leyenda">
                  {cmp.sitios.map((s) => <li key={s.clave}><i className="cvt-pt" style={{ background: colorSitio(s.clave).fondo }} aria-hidden />{centroSitio(s.clave)}</li>)}
                </ul>
              </header>
              <ParejaBarras u={u} sitios={cmp.sitios} etA={cmp.diaA ? corta(cmp.diaA) : "A"} etB={cmp.diaB ? corta(cmp.diaB) : "B"} centro={centroSitio} />
            </section>
            <aside className="cvc-kpis" aria-label="Cifras del cambio">
              <div className="cvc-kpi negro">
                <span className="cvc-kpi-et">{ud.t} por partir al {cmp.diaB ? corta(cmp.diaB) : "—"}</span>
                <b>{num(tot.b, u)}</b>
                <small>{cmp.diaB ? larga(cmp.diaB) : "—"}</small>
              </div>
              <div className={"cvc-kpi " + clase(tot.d, u)}>
                <span className="cvc-kpi-et">Contra el {cmp.diaA ? corta(cmp.diaA) : "día A"}</span>
                <b>{conSigno(tot.d, u)} <small className="u">{ud.t}</small></b>
                <small>{pct == null ? "sin día A" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${nf1.format(Math.abs(pct))} % · `}ese día: {num(tot.a, u)} {ud.largo}</small>
              </div>
              <div className="cvc-kpi">
                <span className="cvc-kpi-et">Viajes SERPRO</span>
                <b>{nf1.format(viajesB)}</b>
                <small>{nf1.format(viajesA)} → {nf1.format(viajesB)} ({viajesB - viajesA > 0 ? "+" : viajesB - viajesA < 0 ? "−" : ""}{nf1.format(Math.abs(viajesB - viajesA))}) · estibas ÷ 36 o ÷ 100</small>
              </div>
              <div className="cvc-kpi">
                <span className="cvc-kpi-et">El que más cambió</span>
                <b className="cvc-kpi-mat">{topes[0] ? nom(topes[0].sku) : "—"}</b>
                <small>{topes[0] ? <><b className={clase(v(topes[0].d), u)}>{conSigno(v(topes[0].d), u)} {ud.largo}</b> · {num(v(topes[0].a), u)} → {num(v(topes[0].b), u)}</> : "ningún material cambió"}</small>
              </div>
            </aside>
          </div>

          {/* ---------- CÓMO ESTÁ CADA ALMACÉN ---------- */}
          <section className="cvt-caja" aria-label="Cómo está cada almacén">
            <header className="cvt-cab"><h2><i className="cvc-marca" aria-hidden />CÓMO ESTÁ CADA ALMACÉN</h2><span className="cvt-sub">día B contra día A</span></header>
            <div className="cvc-almacenes">
              {cmp.sitios.map((s) => {
                const a = v(s.a), b = v(s.b), d = v(s.d);
                const c = colorSitio(s.clave);
                const porc = tot.b ? ((b ?? 0) / tot.b) * 100 : 0;
                const vj = (x: number) => viajesSerpro(x, centroSitio(s.clave));
                return (
                  <article key={s.clave} className="cvc-alm" style={{ borderLeftColor: c.fondo }}>
                    <header><b>{nombreSitio(s.clave).toUpperCase()}</b><small>{cmp.diaB ? "conteo " + corta(cmp.diaB) : ""}</small></header>
                    <div className="cvc-alm-cifra">
                      <b>{num(b, u)}<small> {ud.t}</small></b>
                      <span>viajes <b>{nf1.format(vj(s.b.est))}</b></span>
                    </div>
                    <p className="cvc-alm-pie">
                      {nf0.format(porc)}% del total · {nf2.format(s.b.est)} estibas · <b className={clase(d, u)}>{conSigno(d, u)} vs {cmp.diaA ? corta(cmp.diaA) : "A"}</b>
                      <span className="cvc-alm-a">día A: {num(a, u)} {ud.largo}</span>
                    </p>
                  </article>
                );
              })}
            </div>
          </section>

          {/* ---------- LO QUE MÁS SE MOVIÓ ---------- */}
          <section className="cvt-caja" aria-label="Lo que más se movió">
            <header className="cvt-cab">
              <h2><i className="cvc-marca" aria-hidden />LO QUE MÁS SE MOVIÓ ({ud.t.toUpperCase()})</h2>
              <span className="cvt-sub">el día B por almacén · el cambio contra el día A a la derecha</span>
            </header>
            {topes.length === 0 ? <p className="cvc-nota">Ningún material cambió.</p> : (
              <ul className="cvc-movs">
                {topes.map((m) => {
                  const d = v(m.d), tb = v(m.b) ?? 0;
                  const mx = Math.max(1e-9, ...topes.map((x) => Math.max(v(x.b) ?? 0, v(x.a) ?? 0)));
                  return (
                    <li key={m.sku}>
                      <span title={`${m.sku} · ${nom(m.sku)}`}>{nom(m.sku)}</span>
                      <i className="cvc-mov-pista">
                        {m.sitios.map((f) => {
                          const x = Math.max(0, (f.b ? valorDe(f.b, u) : 0) ?? 0); if (!x) return null;
                          const c = colorSitio(f.sitio);
                          return <em key={f.sitio} style={{ width: (x / mx) * 100 + "%", background: c.fondo, color: c.tinta }} title={`${nombreSitio(f.sitio)}: ${num(x, u)}`}>{(x / mx) > 0.09 ? num(x, u) : ""}</em>;
                        })}
                      </i>
                      <b>{num(tb, u)}</b>
                      <b className={"cvc-mov-d " + clase(d, u)}>{conSigno(d, u)}</b>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ---------- CONTADORES ---------- */}
          <div className="cvt-cifras cvc-cuentas">
            <div className="cvt-cif sube"><span className="cvt-lb">Subieron</span><b>{cmp.cuentas.sube}</b><i>renglones (material por almacén)</i></div>
            <div className="cvt-cif bajo"><span className="cvt-lb">Bajaron</span><b>{cmp.cuentas.baja}</b><i>renglones</i></div>
            <div className="cvt-cif"><span className="cvt-lb">Iguales</span><b>{cmp.cuentas.igual}</b><i>renglones</i></div>
            <div className="cvt-cif"><span className="cvt-lb">Nuevos o que salieron</span><b>{nuevos}</b><i>{cmp.cuentas.nuevo} nuevos · {cmp.cuentas.salio} salieron</i></div>
          </div>

          {/* ---------- POR MATERIAL ---------- */}
          <section className="cvt-caja" aria-label="Por material">
            <header className="cvt-cab">
              <h2>POR MATERIAL · A → B ({ud.t.toUpperCase()})</h2>
              <span className="cvc-chips">
                <button type="button" className="cvc-chip" aria-pressed={filtroEstado === "todos" && !soloCambios} onClick={() => { setSoloCambios(false); setFiltroEstado("todos") }}>Todos</button>
                <button type="button" className="cvc-chip" aria-pressed={soloCambios && filtroEstado === "todos"} onClick={() => { setSoloCambios(true); setFiltroEstado("todos") }}>Solo los que cambiaron</button>
                <button type="button" className="cvc-chip" aria-pressed={filtroEstado === "sube"} onClick={() => setFiltroEstado(filtroEstado === "sube" ? "todos" : "sube")}>Solo subieron</button>
                <button type="button" className="cvc-chip" aria-pressed={filtroEstado === "baja"} onClick={() => setFiltroEstado(filtroEstado === "baja" ? "todos" : "baja")}>Solo bajaron</button>
              </span>
            </header>
            <div className="cvt-tabla-caja">
              <table className="cvt-tabla cvc-tabla">
                <thead>
                  <tr><th>MATERIAL</th><th className="n">DÍA A</th><th className="n">DÍA B</th><th className="cvc-div">◀ BAJA · SUBE ▶</th><th className="n">CAMBIO</th><th>ESTADO</th></tr>
                </thead>
                <tbody>
                  {mats.map((m) => {
                    const d = v(m.d), abierto = !!abiertos[m.sku];
                    return (
                      <Fragment key={m.sku}>
                        <tr className={abierto ? "abierto" : ""}>
                          <td>
                            <button type="button" className="cvc-abrir" aria-expanded={abierto} onClick={() => setAbiertos({ ...abiertos, [m.sku]: !abierto })}>
                              <span aria-hidden>{abierto ? "▾" : "▸"}</span> <b>{nom(m.sku)}</b> <small>{m.sku}</small>
                            </button>
                          </td>
                          <td className="n">{num(v(m.a), u)}</td>
                          <td className="n tot">{num(v(m.b), u)}</td>
                          <td className="cvc-div"><Divergente d={d ?? 0} max={maxMat} c={clase(d, u)} /></td>
                          <td className={"n tot " + clase(d, u)}>{conSigno(d, u)}</td>
                          <td><span className={"cvc-pill " + m.estado}>{nombreEstado[m.estado]}</span></td>
                        </tr>
                        {abierto && m.sitios.map((f) => <FilaSitio key={f.sitio} f={f} u={u} nombreSitio={nombreSitio} />)}
                      </Fragment>
                    );
                  })}
                  {mats.length === 0 && <tr><td colSpan={6} className="cvc-nota">No hay materiales con ese filtro.</td></tr>}
                </tbody>
                <tfoot>
                  <tr><td>TOTAL</td><td className="n">{num(tot.a, u)}</td><td className="n">{num(tot.b, u)}</td><td /><td className={"n tot " + clase(tot.d, u)}>{conSigno(tot.d, u)}</td><td /></tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

/** Una barra que sale del centro: a la derecha sube (rojo), a la izquierda baja (verde). */
function Divergente({ d, max, c }: { d: number; max: number; c: string }) {
  const w = Math.min(50, (Math.abs(d) / max) * 50);
  return (
    <span className="cvc-dv" aria-hidden>
      <i className="cvc-dv-eje" />
      {d !== 0 && <em className={c} style={d > 0 ? { left: "50%", width: w + "%" } : { right: "50%", width: w + "%" }} />}
    </span>
  );
}

function FilaSitio({ f, u, nombreSitio }: { f: FilaCmp; u: Unidad; nombreSitio: (k: string) => string }) {
  const d = valorDe(f.d, u);
  const ubic = f.a?.puesto === f.b?.puesto ? (f.b?.puesto ?? "—") : `${f.a?.puesto ?? "—"} → ${f.b?.puesto ?? "—"}`;
  return (
    <tr className="cvc-sub">
      <td><i className="cvt-pt" style={{ background: colorSitio(f.sitio).fondo }} aria-hidden /> {nombreSitio(f.sitio)}<small className="cvc-ubic"> {ubic}{f.b?.calidad ? ` · ${f.b.calidad}` : ""}</small></td>
      <td className="n">{num(f.a ? valorDe(f.a, u) : 0, u)}</td>
      <td className="n">{num(f.b ? valorDe(f.b, u) : 0, u)}</td>
      <td />
      <td className={"n " + clase(d, u)}>{conSigno(d, u)}</td>
      <td><span className={"cvc-pill " + f.estado}>{nombreEstado[f.estado]}</span></td>
    </tr>
  );
}

/** Dos barras apiladas, el día A y el día B, con los colores de cada almacén como en el dashboard del Tablero; a la derecha, lo que cambió cada uno. */
function ParejaBarras({ u, sitios, etA, etB, centro }: { u: Unidad; sitios: { clave: string; a: Medida; b: Medida; d: Medida }[]; etA: string; etB: string; centro: (k: string) => string }) {
  const W = 700, H = 330, izq = 56, base = H - 34, tope = 30, bw = 132;
  const val = (m: Medida) => Math.max(0, valorDe(m, u) ?? 0);
  const totA = sitios.reduce((t, s) => t + val(s.a), 0), totB = sitios.reduce((t, s) => t + val(s.b), 0);
  const eje = ejeNice(Math.max(totA, totB, 1), 5);
  const y = (x: number) => base - (x / eje.tope) * (base - tope);
  const xA = izq + 70, xB = xA + bw + 120;
  const pila = (x0: number, lado: "a" | "b") => {
    let acum = 0;
    return sitios.map((s) => {
      const x = val(s[lado]); const y1 = y(acum + x), y0 = y(acum); acum += x;
      const c = colorSitio(s.clave), alto = y0 - y1;
      return (
        <g key={s.clave}>
          <rect x={x0} y={y1} width={bw} height={Math.max(0, alto - 1.5)} fill={c.fondo} />
          {alto >= 16 && <text x={x0 + bw / 2} y={y1 + alto / 2 + 4} textAnchor="middle" className="cvt-seg-txt" fill={c.tinta}>{num(x, u)}</text>}
        </g>
      );
    });
  };
  /* El cambio de cada almacén, a la altura de su tramo del día B. */
  let acum = 0;
  const deltas = sitios.map((s) => {
    const x = val(s.b); const mid = y(acum + x / 2); acum += x;
    return { s, mid };
  });
  return (
    <svg className="cvc-pareja" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Barras apiladas del ${etA} y del ${etB}, por almacén`}>
      {eje.ticks.map((t) => (
        <g key={t}><line x1={izq} x2={W - 8} y1={y(t)} y2={y(t)} className="cvt-rej" /><text x={izq - 8} y={y(t) + 4} textAnchor="end" className="cvt-eje">{dec(t, u)}</text></g>
      ))}
      {pila(xA, "a")}{pila(xB, "b")}
      <line x1={xA + bw} x2={xB} y1={y(totA)} y2={y(totB)} className="cvc-enlace" />
      <text x={xA + bw / 2} y={y(totA) - 8} textAnchor="middle" className="cvt-total-txt">{dec(totA, u)}</text>
      <text x={xB + bw / 2} y={y(totB) - 8} textAnchor="middle" className="cvt-total-txt">{dec(totB, u)}</text>
      <text x={xA + bw / 2} y={H - 12} textAnchor="middle" className="cvt-eje">{etA}</text>
      <text x={xB + bw / 2} y={H - 12} textAnchor="middle" className="cvt-eje">{etB}</text>
      {deltas.map(({ s, mid }) => {
        const d = valorDe(s.d, u);
        return (
          <g key={s.clave}>
            <text x={xB + bw + 16} y={mid - 2} className="cvc-d-sitio">{centro(s.clave)}</text>
            <text x={xB + bw + 16} y={mid + 15} className={"cvc-d-val " + clase(d, u)}>{flecha(d, u)} {conSigno(d, u)}</text>
          </g>
        );
      })}
    </svg>
  );
}
