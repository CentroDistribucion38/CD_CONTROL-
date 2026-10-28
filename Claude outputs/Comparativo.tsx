"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import type { SitioCasco } from "@/modulos/casco/datos";
import { ejeNice, type Punto } from "@/modulos/casco/serie";
import { colorSitio, corta, enOrdenInforme, larga } from "@/modulos/casco/informe";
import { comparar, nombreEstado, valorDe, type Estado, type FilaCmp, type Medida, type Unidad } from "@/modulos/casco/comparar";

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

export function Comparativo({ puntos, sitios, nombres, cajasPorEstiba, errorLectura }: {
  puntos: Punto[]; sitios: SitioCasco[]; nombres: Record<string, string>;
  cajasPorEstiba: Record<string, number | null>; errorLectura: string | null;
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
      </section>

      {controles}

      <div className="cvc-tabs" role="tablist" aria-label="Vista del comparativo">
        <button type="button" role="tab" aria-selected={pestana === "dashboard"} className="cvc-tab" onClick={() => setPestana("dashboard")}>Dashboard</button>
        <button type="button" role="tab" aria-selected={pestana === "tabla"} className="cvc-tab" onClick={() => setPestana("tabla")}>Tabla</button>
      </div>
      {sinFactor && <p className="cvc-nota">Cajas: solo suma los materiales que tienen cajas por estiba en el maestro; el resto sale con «—».</p>}

      {cmp.filas.length === 0 ? (
        <p className="cvt-vacio">No hay casco para comparar con esos filtros.</p>
      ) : pestana === "dashboard" ? (
        <>
          {/* ---------- EL CAMBIO, EN GRANDE ---------- */}
          <div className="cvc-hero">
            <div className="cvc-lado a">
              <span className="cvt-lb">Día A · {cmp.diaA ? larga(cmp.diaA) : "—"}</span>
              <b>{num(tot.a, u)}<small> {ud.largo}</small></b>
            </div>
            <div className={"cvc-centro " + clase(tot.d, u)}>
              <span className="cvc-centro-et">Cambio entre los dos días</span>
              <b>{flecha(tot.d, u)} {conSigno(tot.d, u)}<small> {ud.largo}</small></b>
              <span className="cvc-pct">
                {pct == null ? "sin día A para comparar" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${nf1.format(Math.abs(pct))} % · ${clase(tot.d, u) === "up" ? "más casco por partir" : clase(tot.d, u) === "dn" ? "menos casco por partir" : "sin cambio"}`}
              </span>
            </div>
            <div className="cvc-lado b">
              <span className="cvt-lb">Día B · {cmp.diaB ? larga(cmp.diaB) : "—"}</span>
              <b>{num(tot.b, u)}<small> {ud.largo}</small></b>
            </div>
          </div>

          {/* ---------- UNA TARJETA POR ALMACÉN ---------- */}
          <div className="cvc-almacenes">
            {cmp.sitios.map((s) => {
              const a = v(s.a), b = v(s.b), d = v(s.d);
              const mx = Math.max(1e-9, ...cmp.sitios.map((x) => Math.max(Math.abs(v(x.a) ?? 0), Math.abs(v(x.b) ?? 0))));
              const c = colorSitio(s.clave);
              return (
                <article key={s.clave} className="cvc-alm" style={{ borderLeftColor: c.fondo }}>
                  <header>
                    <b>{nombreSitio(s.clave)}</b>
                    <span className={"cvc-pill " + clase(d, u)}>{flecha(d, u)} {conSigno(d, u)}</span>
                  </header>
                  <div className="cvc-par">
                    <span>Día A</span><i><em className="ant" style={{ width: Math.max(0, ((a ?? 0) / mx) * 100) + "%", background: c.fondo }} /></i><b>{num(a, u)}</b>
                    <span>Día B</span><i><em style={{ width: Math.max(0, ((b ?? 0) / mx) * 100) + "%", background: c.fondo }} /></i><b>{num(b, u)}</b>
                  </div>
                  <small>{a ? `${(d ?? 0) > 0 ? "+" : (d ?? 0) < 0 ? "−" : ""}${nf1.format(Math.abs(((d ?? 0) / Math.abs(a)) * 100))} %` : "sin día A"} · {centroSitio(s.clave)}</small>
                </article>
              );
            })}
          </div>

          {/* ---------- CASCADA Y MOVIMIENTOS ---------- */}
          <div className="cvc-dos">
            <section className="cvt-caja" aria-label="De dónde viene el cambio">
              <header className="cvt-cab"><h2>DE DÓNDE VIENE EL CAMBIO ({ud.t.toUpperCase()})</h2></header>
              <Cascada
                u={u}
                inicio={{ et: cmp.diaA ? corta(cmp.diaA) : "A", v: tot.a ?? 0 }}
                pasos={cmp.sitios.map((s) => ({ et: centroSitio(s.clave), v: v(s.d) ?? 0 }))}
                fin={{ et: cmp.diaB ? corta(cmp.diaB) : "B", v: tot.b ?? 0 }} />
            </section>
            <section className="cvt-caja" aria-label="Lo que más se movió">
              <header className="cvt-cab"><h2>LO QUE MÁS SE MOVIÓ</h2><span className="cvt-sub">por material · {ud.largo}</span></header>
              {topes.length === 0 ? <p className="cvc-nota">Ningún material cambió.</p> : (
                <ul className="cvc-movs">
                  {topes.map((m) => {
                    const d = v(m.d);
                    return (
                      <li key={m.sku}>
                        <span title={`${m.sku} · ${nom(m.sku)}`}>{nom(m.sku)}</span>
                        <i><em className={clase(d, u)} style={{ width: (Math.abs(d ?? 0) / maxMov) * 100 + "%" }} /></i>
                        <b className={clase(d, u)}>{conSigno(d, u)}</b>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

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
      ) : (
        <TablaDetalle cmp={cmp} u={u} nom={nom} nombreSitio={nombreSitio} soloCambios={soloCambios} setSoloCambios={setSoloCambios} />
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

/** La cascada: del total del día A al del día B, con lo que sumó o restó cada almacén. */
function Cascada({ u, inicio, pasos, fin }: { u: Unidad; inicio: { et: string; v: number }; pasos: { et: string; v: number }[]; fin: { et: string; v: number } }) {
  const W = 640, H = 270, base = H - 34, tope = 26;
  let corre = inicio.v;
  const barras: { et: string; de: number; a: number; tipo: "ini" | "fin" | "up" | "dn" | "eq"; rot: string }[] = [
    { et: inicio.et, de: 0, a: inicio.v, tipo: "ini", rot: num(inicio.v, u) },
  ];
  for (const p of pasos) {
    const de = corre; corre += p.v;
    barras.push({ et: p.et, de, a: corre, tipo: p.v > 0 ? "up" : p.v < 0 ? "dn" : "eq", rot: conSigno(p.v, u) });
  }
  barras.push({ et: fin.et, de: 0, a: fin.v, tipo: "fin", rot: num(fin.v, u) });
  const max = Math.max(1e-9, ...barras.map((b) => Math.max(b.de, b.a)));
  const eje = ejeNice(max, 5);
  const y = (val: number) => base - (val / eje.tope) * (base - tope);
  const n = barras.length, izq = 52, bw = Math.min(78, (W - izq - 10) / n * 0.62), paso = (W - izq - 10) / n;
  return (
    <svg className="cvc-casc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cascada del total del día A al día B, almacén por almacén">
      {eje.ticks.map((t) => (
        <g key={t}><line x1={izq} x2={W - 6} y1={y(t)} y2={y(t)} className="cvt-rej" /><text x={izq - 8} y={y(t) + 4} textAnchor="end" className="cvt-eje">{dec(t, u)}</text></g>
      ))}
      {barras.map((b, i) => {
        const x = izq + i * paso + (paso - bw) / 2;
        const top = y(Math.max(b.de, b.a)), alto = Math.max(2, Math.abs(y(b.de) - y(b.a)));
        const sig = barras[i + 1];
        return (
          <g key={i}>
            <rect x={x} y={top} width={bw} height={alto} className={"cvc-bar " + b.tipo} rx="2" />
            <text x={x + bw / 2} y={top - 7} textAnchor="middle" className="cvc-bar-txt">{b.rot}</text>
            <text x={x + bw / 2} y={H - 12} textAnchor="middle" className="cvt-eje">{b.et}</text>
            {sig && <line x1={x + bw} x2={x + paso} y1={y(b.a)} y2={y(b.a)} className="cvc-enlace" />}
          </g>
        );
      })}
    </svg>
  );
}

/** LA TABLA, COMO EL EXCEL: un renglón por material y almacén, con las ubicaciones de antes y de ahora y la diferencia coloreada. */
function TablaDetalle({ cmp, u, nom, nombreSitio, soloCambios, setSoloCambios }: {
  cmp: ReturnType<typeof comparar>; u: Unidad; nom: (s: string) => string; nombreSitio: (k: string) => string;
  soloCambios: boolean; setSoloCambios: (b: boolean) => void;
}) {
  const grupos = cmp.materiales
    .map((m) => ({ m, filas: m.sitios.filter((f) => !soloCambios || f.estado !== "igual") }))
    .filter((g) => g.filas.length > 0)
    .sort((x, y) => x.m.sku.localeCompare(y.m.sku));
  const medida = (f: FilaCmp, lado: "a" | "b"): number | null => { const c = f[lado]; return c ? valorDe(c, u) : 0 };
  return (
    <section className="cvt-caja" aria-label="Tabla del comparativo">
      <header className="cvt-cab">
        <h2>TABLA · {cmp.diaA ? corta(cmp.diaA) : "A"} → {cmp.diaB ? corta(cmp.diaB) : "B"} ({UNIDADES.find((x) => x.k === u)!.t.toUpperCase()})</h2>
        <span className="cvc-chips">
          <button type="button" className="cvc-chip" aria-pressed={!soloCambios} onClick={() => setSoloCambios(false)}>Todo</button>
          <button type="button" className="cvc-chip" aria-pressed={soloCambios} onClick={() => setSoloCambios(true)}>Solo cambios</button>
        </span>
      </header>
      <div className="cvt-tabla-caja cvc-alta">
        <table className="cvt-tabla cvc-excel">
          <thead>
            <tr><th>ESTADO</th><th>CÓDIGO</th><th>ALMACÉN</th><th>DESCRIPCIÓN</th><th>UBICACIONES (A → B)</th><th className="n">DÍA A</th><th className="n">DÍA B</th><th className="n">DIF.</th></tr>
          </thead>
          <tbody>
            {grupos.map(({ m, filas }) => (
              <Fragment key={m.sku}>
                {filas.map((f) => {
                  const a = medida(f, "a"), b = medida(f, "b"), d = a == null || b == null ? null : b - a;
                  const ubic = f.a?.puesto === f.b?.puesto ? (f.b?.puesto ?? "—") : `${f.a?.puesto ?? "—"} → ${f.b?.puesto ?? "—"}`;
                  return (
                    <tr key={f.sitio} className={"cvc-f " + f.estado}>
                      <td><span className={"cvc-pill " + f.estado}>{nombreEstado[f.estado]}</span></td>
                      <td className="cod">{m.sku}</td>
                      <td><i className="cvt-pt" style={{ background: colorSitio(f.sitio).fondo }} aria-hidden /> {nombreSitio(f.sitio)}</td>
                      <td>{nom(m.sku)}</td>
                      <td className="cvc-ubic">{ubic}{f.b?.calidad ? ` · ${f.b.calidad}` : ""}</td>
                      <td className="n">{num(a, u)}</td>
                      <td className="n">{num(b, u)}</td>
                      <td className={"n tot cvc-dif " + clase(d, u)}>{conSigno(d, u)}</td>
                    </tr>
                  );
                })}
                <tr className="cvc-total-mat">
                  <td colSpan={5}>Total {m.sku}</td>
                  <td className="n">{num(valorDe(m.a, u), u)}</td><td className="n">{num(valorDe(m.b, u), u)}</td>
                  <td className={"n tot cvc-dif " + clase(valorDe(m.d, u), u)}>{conSigno(valorDe(m.d, u), u)}</td>
                </tr>
              </Fragment>
            ))}
            {grupos.length === 0 && <tr><td colSpan={8} className="cvc-nota">No hay renglones con ese filtro.</td></tr>}
          </tbody>
          <tfoot>
            <tr><td colSpan={5}>TOTAL GENERAL</td><td className="n">{num(valorDe(cmp.a, u), u)}</td><td className="n">{num(valorDe(cmp.b, u), u)}</td><td className={"n tot cvc-dif " + clase(valorDe(cmp.d, u), u)}>{conSigno(valorDe(cmp.d, u), u)}</td></tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
