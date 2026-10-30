import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MODULOS_DE_LA_HOJA } from "@/modulos/inventario/modulos-hoja";
import { fechaConDia } from "@/modulos/inventario/fiscal";
import { compensarCruce, moduloDeUbicacion, type FilaCruce } from "@/modulos/inventario/fiscal-cruce";
import { cargarFiscales } from "../datos";
import { Planillas, type HojaP } from "./Planillas";
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
  const datos: HojaP[] = await Promise.all(hojas.map(async (h) => {
    const id = f.hojaIds?.[h.numero];
    let filas: Fila[] = [];
    if (id) {
      const bd = await supabase.rpc("inv_fiscal_bd_hoja", { p_hoja: id });
      if (bd.error) sinConteo = true; else filas = armarFilas((bd.data ?? []) as Linea[]);
    } else sinConteo = true;
    const conConteo = filas.length > 0;
    /* PT o EER sale de lo contado: si todo es producto es PT, si todo es envase es EER, si hay de los dos, los dos. Sin conteo, queda libre. */
    let grupo = "";
    if (conConteo) {
      const tp = await supabase.from("productos").select("sku,tipo_material").in("sku", [...new Set(filas.map((x) => x.sku))]);
      const tipos = new Set((tp.data ?? []).map((x) => (x.tipo_material === "ENVASE" ? "EER" : "PT")));
      grupo = tp.error || tipos.size === 0 ? "" : [...tipos].sort().reverse().join(" + ");
    }
    const blancos = conConteo || !h.calle ? [] : modulosDe(h.calle);
    const total = conConteo ? filas.length : blancos.length;
    const numerados = h.calle ? (MODULOS_DE_LA_HOJA[h.calle] ?? []).filter((m) => /^\d/.test(m)) : [];
    const lim = numerados.length > 1 ? [numerados[0], numerados[numerados.length - 1]] : null;
    return {
      numero: h.numero, calle: h.calle ?? "", grupo,
      olNombre: h.ol ? (nombre.get(h.ol) ?? "—") : "", bavNombre: h.bavaria ? (nombre.get(h.bavaria) ?? "—") : "",
      sentidoOl: lim ? `${lim[0]} → ${lim[1]}` : "", sentidoBav: lim ? `${lim[1]} → ${lim[0]}` : "",
      filas: filas.map((x) => ({ modulo: x.modulo, sku: x.sku, material: x.material, udsCaja: x.udsCaja, detalle: x.detalle,
        ol: x.ol ? { estibas: x.ol.estibas, saldo: x.ol.saldo, cajas: x.ol.cajas } : null, bav: x.bav ? { estibas: x.bav.estibas, saldo: x.bav.saldo, cajas: x.bav.cajas } : null })),
      blancos, conConteo, np: Math.max(1, Math.ceil(total / FILAS)),
    };
  }));
  const hoy = new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" });
  const aviso = sinConteo ? "No pude traer el conteo de alguna hoja (falta correr 2026-10-fiscal-cruce.sql / 2026-10-fiscal-TODO.sql en Supabase, o no hay permiso de «Inventario fiscal»). Esas hojas salen en blanco." : null;
  return <Planillas fiscalId={f.id} nombre={f.nombre} fechaTexto={fechaConDia(f.fecha)} hoy={hoy} hojas={datos} todas={f.hojas.map((h) => h.numero)} soloHoja={soloHoja} aviso={aviso} />;
}
