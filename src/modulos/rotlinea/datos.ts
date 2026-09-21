import { createClient } from "@/lib/supabase/server";

/**
 * ROTURA DE LÍNEA — lo que la pantalla necesita saber.
 *
 * Todo lo que se lee aquí sale de las vistas del módulo, nunca de las
 * tablas en crudo: las vistas ya traen los nombres puestos y ya
 * resolvieron el cruce con la producción. Si cada pantalla hiciera su
 * propio join, bastaría que una se olvidara del filtro de la baja para
 * que dos informes del mismo día dieran cifras distintas.
 */

export type Linea   = {
  linea: number; tren: string; centro_coste: string;
  activo: boolean; orden: number | null;
};
export type Maquina = {
  item: number; nombre: string; activo: boolean; orden: number | null;
  /** Al sumar, esta se cuenta dentro de otra (PALE-DEPA en PASTEURIZADORA,
   *  CARGADOR en SALIDA DE LAVADORA). No viene hasta correr
   *  `2026-09-rotura-linea-sumar-maquinas.sql`. */
  suma_en?: number | null;
};
export type Envase  = {
  material: string; descripcion: string; peso_kg: number;
  activo: boolean; orden: number | null;
};

export type Sku = {
  sku: string; descripcion: string; corto: string | null; envase: string;
  activo: boolean; orden: number | null;
};

/** Cuánto se usa cada cosa del maestro. Sale de v_rotlinea_uso. */
export type Uso = {
  clase: "envase" | "maquina" | "linea" | "sku";
  clave: string; registros: number; unidades: number; ultima: string;
};

/** Una firma de turno, con lo que dice la tabla hoy al lado. */
export type Firma = {
  fecha: string; linea: number; turno: number;
  firmado_por: string | null; firmado_nombre: string | null; firmado_usuario: string | null;
  firmado_en: string; nota: string | null;
  firmadas: number; kg_firmados: number; pesadas: number;
  unidades_hoy: number; kg_hoy: number; cambio_despues: boolean;
};

/** Una pesada ya guardada, resumida. */
export type Pesada = {
  linea: number; turno: number; envase: string; envase_nombre: string;
  toma: number; maquinas: number; kg: number; und: number;
  baja: boolean;
};

/** Cuántos kilos lleva cada máquina en ese turno, para pintar la rejilla. */
export type PorMaquina = { maquina: number; kg: number; und: number };

const sinTablas = (m: string) =>
  m.includes("does not exist") || m.includes("schema cache") || m.includes("rotlinea_");

/**
 * LAS CUATRO LISTAS del maestro, y opcionalmente cuánto se usa cada una.
 *
 * El uso NO se pide siempre: la pantalla de registrar no lo necesita y
 * es un recorrido sobre los 24.000 registros. Solo la del maestro lo
 * pide, que es donde hace falta para poder decir «esto no se puede
 * borrar porque lo nombran 1.865 registros».
 */
export async function maestros({ conUso = false } = {}) {
  const supabase = await createClient();
  const [l, m, e, s, u] = await Promise.all([
    supabase.from("rotlinea_lineas").select("*").order("orden", { nullsFirst: false }),
    supabase.from("rotlinea_maquinas").select("*").order("orden", { nullsFirst: false }),
    supabase.from("rotlinea_envases").select("*").order("orden", { nullsFirst: false }),
    supabase.from("rotlinea_skus").select("*").order("orden", { nullsFirst: false }),
    conUso ? supabase.from("v_rotlinea_uso").select("*")
           : Promise.resolve({ data: [], error: null }),
  ]);
  const vacio = {
    lineas: [] as Linea[], maquinas: [] as Maquina[],
    envases: [] as Envase[], skus: [] as Sku[], uso: [] as Uso[],
  };
  if (l.error) return { falta: sinTablas(l.error.message), ...vacio };
  return {
    falta: false,
    lineas: (l.data ?? []) as Linea[],
    maquinas: (m.data ?? []) as Maquina[],
    envases: (e.data ?? []) as Envase[],
    skus: (s.data ?? []) as Sku[],
    /* Si la vista del uso todavía no existe —falta correr su migración—
       la pantalla sale igual, solo que sin los conteos: media pantalla
       es mejor que una pantalla en blanco. */
    uso: (u.error ? [] : (u.data ?? [])) as Uso[],
  };
}

/**
 * LO QUE YA LLEVA EL DÍA, agrupado por (línea, turno, envase, pesada).
 *
 * SE AGRUPA AQUÍ Y NO EN LA BASE porque son las filas de un día —unas
 * cuantas docenas— y agruparlas en el servidor obligaría a una vista
 * más, o a una consulta por cada combinación. Con un mes sería otra
 * historia; con un día, traer el detalle y sumarlo aquí es una sola ida.
 */
export async function delDia(fecha: string) {
  const supabase = await createClient();
  const [{ data, error }, fir] = await Promise.all([
    supabase.from("v_rotlinea")
      .select("linea, turno, envase, envase_nombre, toma, maquina, kg, und, baja")
      .eq("fecha", fecha),
    supabase.from("v_rotlinea_firmas").select("*").eq("fecha", fecha),
  ]);
  if (error) return { falta: sinTablas(error.message), pesadas: [] as Pesada[],
                      firmas: [] as Firma[], filas: [] };

  type F = {
    linea: number; turno: number; envase: string; envase_nombre: string;
    toma: number; maquina: number; kg: number; und: number; baja: boolean;
  };
  const filas = (data ?? []) as F[];

  const mapa = new Map<string, Pesada>();
  for (const f of filas) {
    const k = `${f.linea}|${f.turno}|${f.envase}|${f.toma}`;
    const p = mapa.get(k) ?? {
      linea: f.linea, turno: f.turno, envase: f.envase, envase_nombre: f.envase_nombre,
      toma: f.toma, maquinas: 0, kg: 0, und: 0, baja: true,
    };
    p.maquinas += 1;
    p.kg += Number(f.kg);
    p.und += Number(f.und);
    /* La pesada está dada de baja solo si TODAS sus filas lo están. A
       medias no es "dada de baja": es un pendiente que se ve entero. */
    p.baja = p.baja && f.baja;
    mapa.set(k, p);
  }
  const pesadas = [...mapa.values()].sort(
    (a, b) => a.linea - b.linea || a.turno - b.turno ||
              a.envase.localeCompare(b.envase) || a.toma - b.toma);

  /* Si la tabla de firmas todavía no existe —falta correr su
     migración— la pantalla sale igual, solo que sin firmas. Media
     pantalla es mejor que una pantalla en blanco. */
  return { falta: false, pesadas, filas, firmas: (fir.error ? [] : (fir.data ?? [])) as Firma[] };
}

/* =====================================================================
   EL TABLERO
   ---------------------------------------------------------------------
   Todo sale de las vistas al GRANO DIARIO y se suma aquí. Un rango de
   un año son 365 × 4 filas por corte —unas pocas miles—, no los 24.243
   registros: agrupar en la base es lo que permite que el tablero abra
   en un segundo con el año entero puesto.
   ===================================================================== */
/** El mismo largo de período, pegado atrás. Null cuando no hay registro
 *  antes: un aumento contra cero es infinito, no un porcentaje. */
export type Anterior   = { und: number; kg: number; producidas: number };

export type FilaDia    = { fecha: string; linea: number; und: number; kg: number;
                           pesadas: number; turnos: number; sin_baja: number };
/* SIN fecha NI linea: llegan ya sumados por el rango que se pidió.
   Dejarlos en el tipo sería prometer un dato que la función no manda. */
export type FilaMaq    = { maquina: number; maquina_nombre: string;
                           orden: number; rotas: number; kg: number };
export type FilaEnvase = { envase: string; envase_nombre: string;
                           und: number; kg: number };
export type FilaProd   = { fecha: string; linea: number; producidas: number; hl: number | null };
export type SinFirma   = { fecha: string; linea: number; turno: number; und: number; kg: number };
/** El resumen de lo que espera firma. Separa lo que se registró EN LA
 *  APP —que sí se puede cerrar hoy— del histórico que entró por SQL y
 *  que nadie va a firmar nunca. */
export type ResumenFirma = { turnos: number; unidades: number; kg: number;
                             turnos_app: number; unidades_app: number };

export async function tablero(desde: string, hasta: string, linea?: number) {
  const supabase = await createClient();
  const rango = <T>(q: T) => {
    let c = (q as ReturnType<typeof supabase.from>["select"] extends never ? never : any)
      .gte("fecha", desde).lte("fecha", hasta);
    if (linea) c = c.eq("linea", linea);
    return c;
  };

  /* MÁQUINAS Y ENVASES SE PIDEN YA SUMADOS, por función y no por
     vista. Al grano diario, un año de máquinas son 10.477 filas que
     viajaban enteras hasta aquí para convertirse en quince barras: la
     base agrupaba, mandaba, y este archivo volvía a agrupar. Con el
     rango dentro de la consulta son quince filas y veintiuna. El resto
     —la serie del día, la producción, lo sin firmar— sí necesita el
     grano diario, porque se dibuja día por día. */
  /* EL PERÍODO ANTERIOR, DEL MISMO LARGO Y PEGADO ATRÁS. Es contra lo
     que compara la tarjeta de arriba: «▲ 12,4 % vs período anterior».
     Sin esto la cifra es un número suelto — 1,9 millones de botellas no
     dice nada hasta que se sabe si el mes pasado fueron dos o uno.

     Se pide con `select("und,kg")` y no con `*`: son las mismas ~800
     filas del año pero con dos columnas en vez de siete, y de ellas
     aquí solo sale una suma. Todo el módulo se peleó para bajar de
     12.171 filas por clic; esto no puede deshacerlo. */
  const largo = Math.max(1,
    Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1);
  const dia = (t: number) => new Date(t).toISOString().slice(0, 10);
  const antHasta = dia(Date.parse(desde) - 86_400_000);
  const antDesde = dia(Date.parse(desde) - largo * 86_400_000);

  const args = { p_desde: desde, p_hasta: hasta, p_linea: linea ?? null };
  const [d, m, e, p, sf, su, ad, ap] = await Promise.all([
    rango(supabase.from("v_rotlinea_dia").select("*")),
    supabase.rpc("rotlinea_tablero_maquina", args),
    supabase.rpc("rotlinea_tablero_envase", args),
    rango(supabase.from("v_rotlinea_prod_dia").select("*")),
    /* SIN FIRMA, TAMBIÉN POR FUNCIÓN. Al grano de turno son 1.790 filas
       en 2026 y PostgREST corta en 1.000 sin avisar: la tarjeta decía
       exactamente «1000», que es el número más sospechoso que puede dar
       un conteo. Ahora vienen el resumen (una fila) y los seis últimos. */
    supabase.rpc("rotlinea_sin_firma_resumen", args),
    supabase.rpc("rotlinea_sin_firma_ultimos", { ...args, p_cuantos: 6 }),
    (() => {
      let c = supabase.from("v_rotlinea_dia").select("und,kg")
        .gte("fecha", antDesde).lte("fecha", antHasta);
      if (linea) c = c.eq("linea", linea);
      return c;
    })(),
    (() => {
      let c = supabase.from("v_rotlinea_prod_dia").select("producidas")
        .gte("fecha", antDesde).lte("fecha", antHasta);
      if (linea) c = c.eq("linea", linea);
      return c;
    })(),
  ]);

  if (d.error) {
    return { falta: sinTablas(d.error.message), dias: [] as FilaDia[], maquinas: [] as FilaMaq[],
             envases: [] as FilaEnvase[], produccion: [] as FilaProd[],
             sinFirma: [] as SinFirma[], resumenFirma: null as ResumenFirma | null,
             anterior: null as Anterior | null, antDesde, antHasta };
  }

  /* Si el período anterior no tiene registro —el primer mes cargado, o
     un rango que arranca antes de la historia— la tarjeta NO inventa un
     «▲ 100 %»: dice que no hay con qué comparar. Un aumento contra cero
     es infinito, no un porcentaje. */
  const antUnd = ad.error ? 0 : (ad.data ?? []).reduce((a, r) => a + Number(r.und), 0);
  const antKg  = ad.error ? 0 : (ad.data ?? []).reduce((a, r) => a + Number(r.kg), 0);
  const antProd = ap.error ? 0 : (ap.data ?? []).reduce((a, r) => a + Number(r.producidas), 0);
  return {
    falta: false,
    dias: (d.data ?? []) as FilaDia[],
    maquinas: (m.error ? [] : (m.data ?? [])) as FilaMaq[],
    envases: (e.error ? [] : (e.data ?? [])) as FilaEnvase[],
    produccion: (p.error ? [] : (p.data ?? [])) as FilaProd[],
    /* Si las funciones de firmas todavía no existen —falta correr su
       migración— el tablero sale igual y la tarjeta dice cero: media
       pantalla es mejor que una pantalla en blanco. */
    sinFirma: (su.error ? [] : (su.data ?? [])) as SinFirma[],
    anterior: (antUnd > 0 ? { und: antUnd, kg: antKg, producidas: antProd } : null) as Anterior | null,
    antDesde, antHasta,
    resumenFirma: (sf.error ? null
                   : ((Array.isArray(sf.data) ? sf.data[0] : sf.data) ?? null)) as ResumenFirma | null,
  };
}
