import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * CASCO DE VIDRIO · REGISTRAR · EXPORTAR — la validación «lo de ayer + las bajas = lo de hoy».
 *
 * «Quiero que el sistema me haga esa tabla para yo validar, y poder exportarla.»
 *
 * Para un día de Control, por cada tabla (AG22, AG18, AG07, CA22) y cada material:
 *
 *   ESPERADO = lo que había el último día anterior con registros
 *            + las bajas vigentes de ese día (inventario: +estibas · columna «con baja»: signo × estibas)
 *            + los movimientos y ajustes de ese día que afectan Control (llegan +, salen −)
 *   HOY      = lo que tiene Control ese día
 *
 * Si coinciden, la celda CUADRA. Si no, hay que REVISAR: algo se sumó de más (un resto de una baja deshecha,
 * algo tecleado a mano) o no llegó (Control guardado con datos viejos). «Solo registro» no mueve nada y se cuenta aparte.
 *
 * Es una función pura (`calcularCuadre`) y un lector (`cargarCuadre`) que sirve igual desde el navegador y desde
 * el servidor: la pantalla muestra el resultado y la ruta de exportar lo escribe en Excel.
 */

export type SitioCuadre = { clave: string; nombre: string; centro?: string | null; baja_rotulo: string | null };
export type MaterialCuadre = { sku: string; nombre: string; hl_estiba: number | null };

export type RegistroDia = { ubicacion: string; sku: string; inventario: number | null; baja: number | null; hl: number | null };
export type BajaDia = {
  id: string; ubicacion: string; sku: string; destino: string; signo: number; estibas: number; unidades: number;
  texto: string | null; nota?: string | null; documento: string | null; fecha_sap: string | null; archivo_id?: string | null;
  centro?: string; descripcion?: string;
};
export type MovimientoDia = {
  sku: string; estibas: number; afecta: boolean; ubic_origen: string | null; ubic_destino: string | null;
  columna?: string | null; ajuste?: boolean | null;
};

export type EntradaCuadre = {
  fecha: string;
  sitios: SitioCuadre[];
  materiales: MaterialCuadre[];
  hoy: RegistroDia[];
  /** El último día anterior con registros de cada sitio: la fecha y sus filas. */
  ayer: Record<string, { fecha: string | null; filas: RegistroDia[] }>;
  bajas: BajaDia[];
  movimientos: MovimientoDia[];
};

export type FilaCuadre = {
  sku: string; descripcion: string;
  ayerInv: number; ayerBaja: number;
  bajasInv: number; bajasBaja: number;
  movInv: number; movBaja: number;
  esperadoInv: number; esperadoBaja: number;
  hoyInv: number; hoyBaja: number;
  difInv: number; difBaja: number;
  hlAyer: number; hlHoy: number; hlEsperado: number | null; difHl: number | null;
  hlEstiba: number | null;        // HL de una estiba según el maestro (null si el maestro no lo trae)
  soloRegistro: number;           // filas «solo registro» de ese material (no mueven nada)
  estado: "cuadra" | "revisar";
  motivo: string;
};
export type TotalCuadre = {
  ayerInv: number; ayerBaja: number; bajasInv: number; bajasBaja: number; movInv: number; movBaja: number;
  esperadoInv: number; esperadoBaja: number; hoyInv: number; hoyBaja: number; difInv: number; difBaja: number;
  hlAyer: number; hlHoy: number; hlEsperado: number;
};
export type SitioResultado = {
  sitio: SitioCuadre; diaAyer: string | null; hayRegistroHoy: boolean;
  filas: FilaCuadre[]; totales: TotalCuadre; cuadran: number; revisar: number;
  nBajas: number; nSoloRegistro: number;
};
export type Cuadre = {
  fecha: string; sitios: SitioResultado[];
  cuadran: number; revisar: number; bajas: BajaDia[];
  /** Bajas del día que caen en un almacén que no está en la lista de tablas. */
  sinTabla: BajaDia[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (x: unknown) => { const n = Number(x ?? 0); return Number.isFinite(n) ? n : 0 };
export const TOL_EST = 0.011;   // estibas: un centésimo (las bajas se redondean a 2 decimales)
export const TOL_HL = 0.15;     // HL: el tablero redondea a 0,1 y el maestro puede traer más decimales

function vacio(): TotalCuadre {
  return { ayerInv: 0, ayerBaja: 0, bajasInv: 0, bajasBaja: 0, movInv: 0, movBaja: 0, esperadoInv: 0, esperadoBaja: 0,
    hoyInv: 0, hoyBaja: 0, difInv: 0, difBaja: 0, hlAyer: 0, hlHoy: 0, hlEsperado: 0 };
}

export function calcularCuadre(e: EntradaCuadre): Cuadre {
  const mat = new Map(e.materiales.map((m) => [m.sku, m]));
  const claves = new Set(e.sitios.map((s) => s.clave));
  const sinTabla = e.bajas.filter((b) => !claves.has(b.ubicacion));
  const sitios: SitioResultado[] = [];

  for (const s of e.sitios) {
    const ayer = e.ayer[s.clave] ?? { fecha: null, filas: [] };
    const hoyF = e.hoy.filter((r) => r.ubicacion === s.clave);
    const bajasS = e.bajas.filter((b) => b.ubicacion === s.clave);
    const movS = e.movimientos.filter((m) => m.afecta && (m.ubic_origen === s.clave || m.ubic_destino === s.clave));

    const porSku = new Map<string, {
      ayer?: RegistroDia; hoy?: RegistroDia; bI: number; bB: number; mI: number; mB: number; solo: number;
    }>();
    const f = (sku: string) => {
      let x = porSku.get(sku);
      if (!x) { x = { bI: 0, bB: 0, mI: 0, mB: 0, solo: 0 }; porSku.set(sku, x) }
      return x;
    };
    for (const r of ayer.filas) f(r.sku).ayer = r;
    for (const r of hoyF) f(r.sku).hoy = r;
    for (const b of bajasS) {
      const x = f(b.sku);
      if (b.destino === "inventario") x.bI += num(b.estibas);
      else if (b.destino === "baja") x.bB += num(b.signo || 1) * num(b.estibas);
      else x.solo += 1;
    }
    for (const m of movS) {
      const x = f(m.sku), col = m.columna === "baja" ? "mB" : "mI";
      if (m.ubic_destino === s.clave) x[col] += num(m.estibas);
      if (m.ubic_origen === s.clave) x[col] -= num(m.estibas);
    }

    const hayRegistroHoy = hoyF.length > 0;
    const filas: FilaCuadre[] = [];
    /* Un sitio sin registro ese día no tiene nada que comparar: Control mostraría el saldo de ayer. Solo se
       compara si ese día tiene filas, o si hay bajas o movimientos que debieron dejarlas. */
    const hayMovimiento = bajasS.length > 0 || movS.length > 0;
    if (hayRegistroHoy || hayMovimiento) {
      for (const [sku, x] of porSku) {
        const m = mat.get(sku);
        const ayerInv = num(x.ayer?.inventario), ayerBaja = num(x.ayer?.baja);
        const esperadoInv = r2(ayerInv + x.bI + x.mI), esperadoBaja = r2(ayerBaja + x.bB + x.mB);
        const hoyInv = num(x.hoy?.inventario), hoyBaja = num(x.hoy?.baja);
        const difInv = r2(hoyInv - esperadoInv), difBaja = r2(hoyBaja - esperadoBaja);
        const hlHoy = num(x.hoy?.hl), hlAyer = num(x.ayer?.hl);
        const fac = m?.hl_estiba ?? null;
        const hlEsperado = fac != null ? r2((esperadoInv + esperadoBaja) * fac) : null;
        const difHl = hlEsperado != null ? r2(hlHoy - hlEsperado) : null;
        const malEst = Math.abs(difInv) > TOL_EST || Math.abs(difBaja) > TOL_EST;
        const malHl = difHl != null && Math.abs(difHl) > TOL_HL;
        let motivo = "";
        if (Math.abs(difInv) > TOL_EST) {
          motivo = difInv > 0
            ? `Hoy tiene ${r2(difInv)} est. de más en el inventario: puede ser el resto de una baja deshecha o algo tecleado a mano en Control.`
            : `Faltan ${r2(-difInv)} est. en el inventario: una baja o un movimiento no llegó a la celda, o Control se guardó con datos viejos.`;
        } else if (Math.abs(difBaja) > TOL_EST) {
          motivo = difBaja > 0
            ? `La columna «con baja» tiene ${r2(difBaja)} est. de más.`
            : `A la columna «con baja» le faltan ${r2(-difBaja)} est.`;
        } else if (malHl) {
          motivo = "Las estibas cuadran pero el HL no: revisa los factores del maestro para este material.";
        }
        filas.push({
          sku, descripcion: m?.nombre ?? sku, ayerInv, ayerBaja, bajasInv: r2(x.bI), bajasBaja: r2(x.bB),
          movInv: r2(x.mI), movBaja: r2(x.mB), esperadoInv, esperadoBaja, hoyInv, hoyBaja, difInv, difBaja,
          hlAyer, hlHoy, hlEsperado, difHl, hlEstiba: fac, soloRegistro: x.solo,
          estado: malEst || malHl ? "revisar" : "cuadra", motivo,
        });
      }
      /* Primero lo que hay que revisar, después lo que más se movió, después por código. */
      filas.sort((a, b) =>
        (a.estado === "revisar" ? 0 : 1) - (b.estado === "revisar" ? 0 : 1)
        || (b.hoyInv + b.hoyBaja) - (a.hoyInv + a.hoyBaja) || a.sku.localeCompare(b.sku));
    }

    const t = vacio();
    for (const r of filas) {
      t.ayerInv += r.ayerInv; t.ayerBaja += r.ayerBaja; t.bajasInv += r.bajasInv; t.bajasBaja += r.bajasBaja;
      t.movInv += r.movInv; t.movBaja += r.movBaja; t.esperadoInv += r.esperadoInv; t.esperadoBaja += r.esperadoBaja;
      t.hoyInv += r.hoyInv; t.hoyBaja += r.hoyBaja; t.hlAyer += r.hlAyer; t.hlHoy += r.hlHoy;
      t.hlEsperado += r.hlEsperado ?? r.hlHoy;
    }
    for (const k of Object.keys(t) as (keyof TotalCuadre)[]) t[k] = r2(t[k]);
    t.difInv = r2(t.hoyInv - t.esperadoInv); t.difBaja = r2(t.hoyBaja - t.esperadoBaja);

    sitios.push({
      sitio: s, diaAyer: ayer.fecha, hayRegistroHoy, filas, totales: t,
      cuadran: filas.filter((x) => x.estado === "cuadra").length, revisar: filas.filter((x) => x.estado === "revisar").length,
      nBajas: bajasS.filter((b) => b.destino !== "registro").length, nSoloRegistro: bajasS.filter((b) => b.destino === "registro").length,
    });
  }
  return {
    fecha: e.fecha, sitios,
    cuadran: sitios.reduce((n, s) => n + s.cuadran, 0), revisar: sitios.reduce((n, s) => n + s.revisar, 0),
    bajas: e.bajas, sinTabla,
  };
}

/** Lee de la base lo que hace falta y arma el cuadre. Sirve con el cliente del navegador y con el del servidor. */
export async function cargarCuadre(
  supabase: SupabaseClient, fecha: string, sitios: SitioCuadre[], materiales: MaterialCuadre[],
): Promise<{ cuadre: Cuadre } | { error: string }> {
  const leer = async <T,>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> => {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as T[];
  };
  try {
    const COLS = "ubicacion, sku, inventario, baja, hl";
    const hoy = await leer<RegistroDia>(supabase.from("casco_registros").select(COLS).eq("fecha", fecha).limit(5000));

    const ayer: EntradaCuadre["ayer"] = {};
    await Promise.all(sitios.map(async (s) => {
      const u = await leer<{ fecha: string }>(supabase.from("casco_registros").select("fecha")
        .eq("ubicacion", s.clave).lt("fecha", fecha).order("fecha", { ascending: false }).limit(1));
      const dia = u[0]?.fecha ?? null;
      ayer[s.clave] = {
        fecha: dia,
        filas: dia ? await leer<RegistroDia>(supabase.from("casco_registros").select(COLS)
          .eq("ubicacion", s.clave).eq("fecha", dia).limit(5000)) : [],
      };
    }));

    const bajas = await leer<BajaDia>(supabase.from("v_casco_bajas").select("*").eq("fecha", fecha).order("creado_en").limit(5000));
    const movimientos = await leer<MovimientoDia>(supabase.from("v_casco_movimientos").select("*").eq("fecha", fecha).limit(5000));

    return { cuadre: calcularCuadre({ fecha, sitios, materiales, hoy, ayer, bajas, movimientos }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
