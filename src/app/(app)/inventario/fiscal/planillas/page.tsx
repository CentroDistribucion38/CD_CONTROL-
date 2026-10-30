import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MODULOS_DE_LA_HOJA } from "@/modulos/inventario/modulos-hoja";
import { fechaConDia } from "@/modulos/inventario/fiscal";
import { compensarCruce, moduloDeUbicacion, type FilaCruce } from "@/modulos/inventario/fiscal-cruce";
import { cargarFiscales } from "../datos";
import { BarraPlanillas } from "./BarraPlanillas";
import "./planillas.css";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · PLAN FISCAL · PLANILLAS DE CONTEO.
 * Una planilla por pareja (por hoja), en carta horizontal, lista para imprimir y firmar. Trae lo que contó CADA UNO de la pareja
 * (el operador logístico y Bavaria), renglón por renglón, y la diferencia entre los dos. Si la hoja todavía no tiene conteo, sale con los
 * módulos de su calle en blanco para contar a mano. Abajo, dos cuadros LIBRES para la firma de los responsables, y GRUPO y ÁREA ASIGN.
 * también libres: si la hoja es de PT o de EER sale del conteo, no se escribe de antemano.
 */
const FILAS = 18; /* renglones por página */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

type Linea = {
  equipo: string; ubicacion: string; sku: string; material: string;
  cajas_por_estiba: number | null; estibas: number | null; saldo: number | null; cajas: number | null; total_cajas: number | string | null;
  venc_dia: number | null; venc_mes: number | null; venc_anio: number | null; estado_envase?: string | null; averia?: boolean | null; pnc?: boolean | null;
};
type Lado = { estibas: number; saldo: number; cajas: number; total: number };
type Fila = { modulo: string; sku: string; material: string; udsCaja: number | null; detalle: string; ol: Lado | null; bav: Lado | null; compensada?: boolean };

const vacio = (): Lado => ({ estibas: 0, saldo: 0, cajas: 0, total: 0 });

/** Junta lo que contó cada equipo igual que el cruce del Control fiscal: por MÓDULO (sin lado), material y estado; el vencimiento NO cuenta
 *  (importan el SKU y la cantidad). Después marca lo que se compensa (mismas cajas de más y de menos) para que se lea igual que allá. */
function armarFilas(lineas: Linea[]): Fila[] {
  const m = new Map<string, Fila>();
  for (const l of lineas) {
    const mod = moduloDeUbicacion(l.ubicacion);
    const k = [mod, l.sku, l.estado_envase ?? "", l.averia ? 1 : 0, l.pnc ? 1 : 0].join("|");
    let f = m.get(k);
    if (!f) {
      const partes: string[] = [];
      if (l.estado_envase) partes.push(l.estado_envase);
      if (l.averia) partes.push("AVERÍA");
      if (l.pnc) partes.push("PNC");
      f = { modulo: mod.replace(/_/g, " "), sku: l.sku, material: l.material, udsCaja: l.cajas_por_estiba || null, detalle: partes.join(" · "), ol: null, bav: null };
      m.set(k, f);
    }
    const lado = l.equipo === "BAVARIA" ? (f.bav ??= vacio()) : (f.ol ??= vacio());
    lado.estibas += Number(l.estibas ?? 0); lado.saldo += Number(l.saldo ?? 0); lado.cajas += Number(l.cajas ?? 0); lado.total += Number(l.total_cajas ?? 0);
  }
  const filas = [...m.values()].sort((a, b) => a.modulo.localeCompare(b.modulo, "es", { numeric: true }) || a.sku.localeCompare(b.sku));
  const cruce: FilaCruce[] = filas.map((f) => {
    const ol = f.ol ? f.ol.total : null, bv = f.bav ? f.bav.total : null;
    return { ubicacion: f.modulo, sku: f.sku, material: f.material, vencDia: null, vencMes: null, vencAnio: null, cajasOl: ol, cajasBavaria: bv,
      diferencia: (ol ?? 0) - (bv ?? 0), estado: ol == null ? "SOLO_BAVARIA" : bv == null ? "SOLO_OL" : ol === bv ? "COINCIDE" : "DIFIERE" };
  });
  const r = compensarCruce(cruce);
  /* Lo que se compensaba NO se muestra como compensado: el mismo material contado en varios sitios de la hoja se junta en UN renglón,
     en el primer sitio donde aparece, con el conteo de los dos: ahí la diferencia sale en cero. */
  const sale = new Set<number>();
  const primero = new Map<string, number>();
  const unidas = filas.map((f) => ({ ...f, ol: f.ol ? { ...f.ol } : null, bav: f.bav ? { ...f.bav } : null }));
  filas.forEach((f, i) => {
    if (!r.filas[i]?.compensada) return;
    const j = primero.get(f.sku);
    if (j === undefined) { primero.set(f.sku, i); return }
    const base = unidas[j];
    for (const eq of ["ol", "bav"] as const) {
      const o = f[eq];
      if (!o) continue;
      const b = (base[eq] ??= vacio());
      b.estibas += o.estibas; b.saldo += o.saldo; b.cajas += o.cajas; b.total += o.total;
    }
    sale.add(i);
  });
  return unidas.filter((_, i) => !sale.has(i)).map((f) => ({ ...f, compensada: false }));
}

/** Los renglones de módulo de una calle, en el orden en que se recorre, para la planilla en blanco de una hoja sin conteo. */
function modulosDe(calle: string): string[] {
  const out: string[] = [];
  for (const m of MODULOS_DE_LA_HOJA[calle] ?? []) {
    if (/^\d/.test(m)) out.push(`${calle}${m} IZQ`, `${calle}${m} DER`); else out.push(`${calle} ${m}`);
  }
  return out;
}

const n = (v: number | undefined | null) => (v ? nf.format(v) : "");
const dif = (f: Fila) => (f.ol?.total ?? 0) - (f.bav?.total ?? 0);
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));

export default async function PlanillasPage({ searchParams }: { searchParams: Promise<{ fiscal?: string; hoja?: string }> }) {
  const q = await searchParams;
  const r = await cargarFiscales();
  if ("fallo" in r) return r.fallo;
  const { fiscales, personas } = r.datos;
  const f = fiscales.find((x) => x.id === q.fiscal);
  if (!f) {
    return (
      <div className="pl">
        <p className="pl-vacio">Escoge un inventario fiscal en el <Link href="/inventario/fiscal">Plan fiscal</Link> y toca «Planillas».</p>
      </div>
    );
  }
  const nombre = new Map(personas.map((p) => [p.id, p.nombre]));
  const soloHoja = Number(q.hoja);
  const hojas = f.hojas.filter((h) => !soloHoja || h.numero === soloHoja);
  const supabase = await createClient();
  let sinConteo = false;
  const paginasDe = await Promise.all(hojas.map(async (h) => {
    const id = f.hojaIds?.[h.numero];
    let filas: Fila[] = [];
    if (id) {
      const bd = await supabase.rpc("inv_fiscal_bd_hoja", { p_hoja: id });
      if (bd.error) sinConteo = true; else filas = armarFilas((bd.data ?? []) as Linea[]);
    } else sinConteo = true;
    const conConteo = filas.length > 0;
    const blancos = conConteo || !h.calle ? [] : modulosDe(h.calle);
    const total = conConteo ? filas.length : blancos.length;
    const n = Math.max(1, Math.ceil(total / FILAS));
    return { h, filas, blancos, conConteo, n };
  }));
  const total = paginasDe.reduce((t, p) => t + p.n, 0);
  const hoy = new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="pl">
      <BarraPlanillas>
        <b>{f.nombre}</b>
        <span>{fechaConDia(f.fecha)} · {hojas.length} {hojas.length === 1 ? "planilla" : "planillas"} · {total} {total === 1 ? "página" : "páginas"} carta horizontal</span>
        <span className="pl-filtro">
          <Link href={`/inventario/fiscal/planillas?fiscal=${f.id}`} className={!soloHoja ? "on" : ""}>Todas</Link>
          {f.hojas.map((h) => <Link key={h.numero} href={`/inventario/fiscal/planillas?fiscal=${f.id}&hoja=${h.numero}`} className={soloHoja === h.numero ? "on" : ""}>Hoja {h.numero}</Link>)}
        </span>
      </BarraPlanillas>
      {sinConteo && <p className="pl-vacio">No pude traer el conteo de alguna hoja (falta correr <code>2026-10-fiscal-cruce.sql</code> / <code>2026-10-fiscal-TODO.sql</code> en Supabase, o no hay permiso de «Inventario fiscal»). Esas hojas salen en blanco.</p>}
      {hojas.length === 0 && <p className="pl-vacio">Este inventario todavía no tiene hojas. Arma las parejas en el Plan fiscal.</p>}
      {paginasDe.flatMap(({ h, filas, blancos, conConteo, n: np }) => Array.from({ length: np }, (_, i) => {
        const ultima = i === np - 1;
        const trozo = conConteo ? filas.slice(i * FILAS, (i + 1) * FILAS) : [];
        const mods = !conConteo ? blancos.slice(i * FILAS, (i + 1) * FILAS) : [];
        const relleno = Math.max(0, FILAS - (conConteo ? trozo.length : mods.length));
        const numerados = h.calle ? (MODULOS_DE_LA_HOJA[h.calle] ?? []).filter((m) => /^\d/.test(m)) : [];
        const ol = h.ol ? (nombre.get(h.ol) ?? "—") : "";
        const bav = h.bavaria ? (nombre.get(h.bavaria) ?? "—") : "";
        const tOl = filas.reduce((t, x) => t + (x.ol?.total ?? 0), 0);
        const tBav = filas.reduce((t, x) => t + (x.bav?.total ?? 0), 0);
        return (
          <section key={`${h.numero}-${i}`} className="pl-pg" aria-label={`Planilla hoja ${h.numero}, página ${i + 1} de ${np}`}>
            <div className="pl-hd">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca/logo-bavaria.png" alt="Bavaria" />
              <div className="pl-tit"><b>PLANILLA DE CONTEO</b><span>Inventario fiscal</span></div>
              <div className="pl-hoja"><small>HOJA</small><b>{h.numero}</b></div>
            </div>
            <div className="pl-regla" />
            <div className="pl-meta">
              <div><small>Inventario</small><b>{f.nombre}</b></div>
              <div><small>Fecha</small><b>{fechaConDia(f.fecha)}</b></div>
              <div><small>Inicio</small><b className="blanco" /></div>
              <div><small>Final</small><b className="blanco" /></div>
              <div><small>Calle</small><b>{h.calle ? `Calle ${h.calle}` : ""}</b></div>
              <div><small>Página</small><b>{i + 1} de {np}</b></div>
            </div>
            <div className="pl-par">
              <div><span><small>Contador · Operador logístico{numerados.length > 1 ? ` · ${numerados[0]} → ${numerados[numerados.length - 1]}` : ""}</small><b>{ol}</b></span><i /></div>
              <div><span><small>Contador · Bavaria{numerados.length > 1 ? ` · ${numerados[numerados.length - 1]} → ${numerados[0]}` : ""}</small><b>{bav}</b></span><i /></div>
            </div>
            <div className="pl-tw">
              <table className="pl-t">
                <colgroup>
                  <col style={{ width: 72 }} /><col style={{ width: 84 }} /><col />
                  <col style={{ width: 46 }} />
                  <col style={{ width: 46 }} /><col style={{ width: 46 }} /><col style={{ width: 46 }} /><col style={{ width: 54 }} />
                  <col style={{ width: 46 }} /><col style={{ width: 46 }} /><col style={{ width: 46 }} /><col style={{ width: 54 }} />
                  <col style={{ width: 56 }} />
                </colgroup>
                <thead>
                  <tr><th rowSpan={2}>Módulo</th><th rowSpan={2}>Código</th><th rowSpan={2}>Descripción</th><th rowSpan={2}>Uds caja</th>
                    <th colSpan={4} className="ol">Operador logístico</th><th colSpan={4} className="bv">Bavaria</th><th rowSpan={2}>Dif.</th></tr>
                  <tr><th className="ol">Est.</th><th className="ol">Saldo</th><th className="ol">Cajas</th><th className="ol">Total</th>
                    <th className="bv">Est.</th><th className="bv">Saldo</th><th className="bv">Cajas</th><th className="bv">Total</th></tr>
                </thead>
                <tbody>
                  {trozo.map((x, k) => {
                    const d = dif(x);
                    return (
                      <tr key={k}>
                        <td className="m">{x.modulo}</td><td className="c">{x.sku}</td>
                        <td className="d">{x.material}{x.detalle && <em>{x.detalle}</em>}</td>
                        <td className="r">{n(x.udsCaja)}</td>
                        <td className="r">{n(x.ol?.estibas)}</td><td className="r">{n(x.ol?.saldo)}</td><td className="r">{n(x.ol?.cajas)}</td><td className="r t">{x.ol ? nf.format(x.ol.total) : ""}</td>
                        <td className="r">{n(x.bav?.estibas)}</td><td className="r">{n(x.bav?.saldo)}</td><td className="r">{n(x.bav?.cajas)}</td><td className="r t">{x.bav ? nf.format(x.bav.total) : ""}</td>
                        <td className={"r t" + (d !== 0 ? (x.compensada ? " comp" : " mal") : "")}>{d === 0 ? (x.ol && x.bav ? "0" : "") : <>{signo(d)}{x.compensada && <em>compensa</em>}</>}</td>
                      </tr>
                    );
                  })}
                  {mods.map((m, k) => <tr key={`b${k}`}><td className="m">{m}</td>{Array.from({ length: 12 }, (_, c) => <td key={c} />)}</tr>)}
                  {Array.from({ length: relleno }, (_, k) => <tr key={`r${k}`}><td className="m" />{Array.from({ length: 12 }, (_, c) => <td key={c} />)}</tr>)}
                </tbody>
              </table>
            </div>
            {conConteo && ultima && (
              <div className="pl-tot">
                <span>Total de la hoja · cajas</span>
                <b>Operador logístico {nf.format(tOl)}</b><b>Bavaria {nf.format(tBav)}</b>
                <b className={tOl - tBav !== 0 ? "mal" : ""}>Diferencia {tOl - tBav === 0 ? "0" : signo(tOl - tBav)}</b>
              </div>
            )}
            <div className="pl-pie">
              <div className="pl-lado">
                <div className="pl-firma"><b>Responsable OL</b><small>nombre completo y firma</small></div>
                <div className="pl-campo"><b>Grupo</b></div>
              </div>
              <div className="pl-lado">
                <div className="pl-campo"><b>Área asign.</b></div>
                <div className="pl-firma"><b>Responsable Bavaria</b><small>nombre completo y firma</small></div>
              </div>
            </div>
            <div className="pl-mini">{f.nombre} · Hoja {h.numero} · generada por CONTROL CD38 · {hoy}</div>
          </section>
        );
      }))}
    </div>
  );
}
