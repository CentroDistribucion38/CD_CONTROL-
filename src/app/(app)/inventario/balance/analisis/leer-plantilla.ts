/**
 * LEER LA PLANTILLA DE NOVEDADES en el navegador y VALIDARLA antes de subir («valida primero»).
 * No se confía en las fórmulas guardadas: con sus hojas TIPOS y MAESTRO se vuelve a hacer la cuenta
 * (estibas × cajas por estiba + cajas) × unidades por caja + sueltas, y las cajas plásticas que la guardan.
 */
import { CAJA_EN_DEPA, lineaDeDepa } from "@/modulos/inventario/depa";

type Celda = string | number | null | undefined;
const txt = (v: Celda) => String(v ?? "").trim();
const num = (v: Celda) => { const n = typeof v === "number" ? v : Number(txt(v).replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0 };
const codigo = (v: Celda) => txt(v).replace(/\.0+$/, "");

const ZEXI_PRODUCTO = "ZEXI PRODUCTO";
export type FilaPlantilla = { tipo: string; lado: "CONTEO" | "SAP" | "NO SUMA"; documento: string | null; codigo: string; unidades: number; caja_codigo: string | null; cajas: number | null };
/** Una línea de la MB51 (movimiento 311): cantidad con signo, + entra al almacén, − sale de él. */
export type FilaMb51 = { almacen: string; codigo: string; cantidad: number; documento: string | null; hora: string | null };
export type Lectura = { fecha: string | null; filas: FilaPlantilla[]; errores: string[]; mb51: FilaMb51[] };

/** El maestro del sistema: lo que se usa cuando la hoja MAESTRO de la plantilla no trae el código o no trae su caja. */
export type MaestroSistema = Record<string, { upc: number; cpe: number; caja: string | null }>;

export async function leerPlantilla(archivo: File, sistema: MaestroSistema = {}): Promise<Lectura> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  const hoja = (n: string) => libro.Sheets[n];
  if (!hoja("NOVEDADES") || !hoja("TIPOS") || !hoja("MAESTRO")) return { fecha: null, filas: [], errores: ["Ese archivo no es la plantilla de novedades (le faltan las hojas NOVEDADES, TIPOS o MAESTRO)."], mb51: [] };
  const filas = (n: string) => XLSX.utils.sheet_to_json<Celda[]>(hoja(n), { header: 1, raw: true, defval: null });

  const tipos = new Map<string, { lado: string; pide: boolean; caja: boolean }>();
  for (const f of filas("TIPOS").slice(1)) {
    const n = txt(f[0]).toUpperCase(); if (!n) continue;
    tipos.set(n, { lado: txt(f[1]).toUpperCase(), pide: /^s/i.test(txt(f[2])), caja: /^s/i.test(txt(f[4])) });
  }
  /* ZEXI PRODUCTO: la ZEXI de los productos (unidades). No suma el producto: solo su caja plástica, a SAP. Ya viene de fábrica aunque la hoja TIPOS no la traiga. */
  if (!tipos.has(ZEXI_PRODUCTO)) tipos.set(ZEXI_PRODUCTO, { lado: "SAP", pide: false, caja: true });
  /* AJUSTE CAJAS: cajas plásticas que existen y no estaban contadas (código de la CAJA y cuántas). Suma al conteo. */
  if (!tipos.has("AJUSTE CAJAS")) tipos.set("AJUSTE CAJAS", { lado: "CONTEO", pide: false, caja: false });
  const maestro = new Map<string, { upc: number; cpe: number; caja: string | null }>();
  for (const f of filas("MAESTRO").slice(1)) {
    const c = codigo(f[0]); if (!/^\d+$/.test(c)) continue;
    maestro.set(c, { upc: num(f[2]) || 1, cpe: num(f[3]), caja: codigo(f[4]) || null });
  }

  const nov = filas("NOVEDADES");
  /* La fecha (B2): un número de Excel o un texto dd/mm/aaaa. */
  let fecha: string | null = null;
  const b2 = nov[1]?.[1];
  /* Número de Excel: días desde el 30/12/1899. */
  if (typeof b2 === "number" && b2 > 30000 && b2 < 80000) fecha = new Date(Date.UTC(1899, 11, 30) + Math.floor(b2) * 86400000).toISOString().slice(0, 10);
  else { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(txt(b2)); if (m) fecha = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` }

  const out: FilaPlantilla[] = [], errores: string[] = [];
  nov.slice(5).forEach((f, i) => {
    const fila = i + 6;
    const tipo = txt(f[0]).toUpperCase(), cod = codigo(f[2]);
    if (!tipo && !cod) return;
    const t = tipos.get(tipo), sis = sistema[cod];
    /* La hoja MAESTRO de la plantilla manda; si no trae el código, o lo trae sin caja, se completa con el maestro del sistema. */
    const propio = maestro.get(cod);
    const m0 = propio
      ? (!propio.caja && sis?.caja ? { upc: propio.upc > 1 ? propio.upc : sis.upc, cpe: propio.cpe || sis.cpe, caja: sis.caja } : propio)
      : sis ? { upc: sis.upc || 1, cpe: sis.cpe, caja: sis.caja } : undefined;
    /* Un producto de la ZEXI que el sistema no conoce no frena la plantilla: simplemente no trae caja y no suma. */
    const m = m0 ?? (tipo === ZEXI_PRODUCTO ? { upc: 1, cpe: 0, caja: null } : undefined);
    if (!tipo) { errores.push(`Fila ${fila}: falta el tipo.`); return }
    if (!t || !["CONTEO", "SAP", "NO SUMA"].includes(t.lado)) { errores.push(`Fila ${fila}: el tipo «${tipo}» no tiene «SUMA EN» en la hoja TIPOS.`); return }
    if (!cod) { errores.push(`Fila ${fila}: falta el código.`); return }
    if (!m) { errores.push(`Fila ${fila}: el código ${cod} no está en el maestro de la plantilla ni en el del sistema.`); return }
    const est = num(f[3]), cajas = num(f[4]), sueltas = num(f[5]);
    if (est > 0 && !m.cpe) { errores.push(`Fila ${fila}: ${cod} no tiene cajas por estiba: escribe cajas.`); return }
    const doc = txt(f[1]) || null;
    if (t.pide && !doc) { errores.push(`Fila ${fila}: falta el N° de entrega.`); return }
    const unidades = (est * m.cpe + cajas) * m.upc + sueltas;
    if (!(unidades > 0)) { errores.push(`Fila ${fila}: falta la cantidad.`); return }
    /* DEPA: algunos envases salen en otra caja que la del maestro (la Flint 250 sale en café 225). */
    const cajaDe = lineaDeDepa(tipo) ? (CAJA_EN_DEPA[cod] ?? m.caja) : m.caja;
    const conCaja = t.caja && cajaDe && m.upc > 1;
    out.push({ tipo, lado: t.lado as FilaPlantilla["lado"], documento: doc, codigo: cod, unidades,
      caja_codigo: conCaja ? cajaDe : null, cajas: conCaja ? Math.floor(unidades / m.upc) : null });
  });

  /* LA HOJA «311 MB51» (opcional): lo que salió de la MB51. Material, almacén, cantidad con signo, documento y hora. */
  const mb51: FilaMb51[] = [];
  if (hoja("311 MB51")) {
    filas("311 MB51").slice(5).forEach((f, i) => {
      const fila = i + 6;
      const cod = codigo(f[0]), alm = txt(f[1]).toUpperCase().replace(/\s+/g, "");
      if (!cod && !alm && !txt(f[2])) return;
      if (!/^\d+$/.test(cod)) { errores.push(`311 MB51, fila ${fila}: falta el material (o no es un número).`); return }
      if (!/^AG\d{2}$/.test(alm)) { errores.push(`311 MB51, fila ${fila}: el almacén debe ser como AG18 (dice «${alm || "vacío"}»).`); return }
      const cant = num(f[2]);
      if (!cant) { errores.push(`311 MB51, fila ${fila}: falta la cantidad.`); return }
      const h = f[4];
      const hora = typeof h === "number" && h >= 0 && h < 1 ? new Date(Math.round(h * 86400) * 1000).toISOString().slice(11, 19) : txt(h) || null;
      mb51.push({ almacen: alm, codigo: cod, cantidad: cant, documento: txt(f[3]) || null, hora });
    });
  }
  if (!out.length && !mb51.length && !errores.length) errores.push("La plantilla está vacía: llena al menos una fila en NOVEDADES o en 311 MB51.");
  return { fecha, filas: out, errores, mb51 };
}
