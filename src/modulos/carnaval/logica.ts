/**
 * AG07 CARNAVAL · LA CUENTA (sin base de datos, para poder probarla sola).
 *
 * El inventario de envase vacío de Peldar se lleva por PALLETS:
 *   saldo del código    = suma de los pallets de sus movimientos (+ entra, − sale)
 *   unidades            = pallets × unidades por pallet
 *   HL                  = pallets × unidades por pallet × cc / 100.000
 *
 * Cada fila del archivo diario de Peldar se identifica por REMISIÓN + PLACA + CÓDIGO (una remisión puede
 * traer varias placas). Si el mismo archivo trae esa llave dos veces, la segunda lleva «|2», y así.
 */

export type FilaPeldar = {
  fecha: string;        // fecha de recibo, AAAA-MM-DD
  codigo: string;
  descripcion: string;
  remision: string;
  placa: string;
  pallets: number;
  und: number;
};
export type FilaConClave = FilaPeldar & { clave: string };

export type Existente = { id: string; clave: string; fecha: string; pallets: number; und: number | null };

export type Cambio = {
  clave: string;
  id: string;
  fila: FilaConClave;
  antes: { fecha: string; pallets: number; und: number | null };
};

export type Comparacion = {
  nuevas: FilaConClave[];
  cambiadas: Cambio[];
  iguales: number;
  /** filas con fecha de recibo hasta el corte: ya están dentro del saldo inicial */
  anteriores: number;
  /** códigos que no están en el maestro de productos */
  sinProducto: { codigo: string; n: number }[];
  /** cargadas antes (después del corte) que el archivo de hoy ya no trae */
  ausentes: Existente[];
};

export const redondear = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export const hl = (pallets: number, undPorPallet: number, cc: number) => (pallets * undPorPallet * cc) / 100000;
export const unidades = (pallets: number, undPorPallet: number) => pallets * undPorPallet;

export function claveBase(f: Pick<FilaPeldar, "remision" | "placa" | "codigo">) {
  return `${f.remision.trim()}|${f.placa.trim().toUpperCase()}|${f.codigo.trim()}`;
}

/** Les pone la llave a las filas del archivo, en el orden en que vienen. */
export function conClaves(filas: FilaPeldar[]): FilaConClave[] {
  const vistas = new Map<string, number>();
  return filas.map((f) => {
    const b = claveBase(f);
    const n = (vistas.get(b) ?? 0) + 1;
    vistas.set(b, n);
    return { ...f, clave: n === 1 ? b : `${b}|${n}` };
  });
}

export function compararPeldar(filas: FilaPeldar[], existentes: Existente[], productos: Set<string>, corte: string): Comparacion {
  const porClave = new Map(existentes.map((e) => [e.clave, e]));
  const out: Comparacion = { nuevas: [], cambiadas: [], iguales: 0, anteriores: 0, sinProducto: [], ausentes: [] };
  const faltan = new Map<string, number>();
  const enArchivo = new Set<string>();
  for (const f of conClaves(filas)) {
    if (f.fecha <= corte) { out.anteriores++; continue }
    if (!productos.has(f.codigo)) { faltan.set(f.codigo, (faltan.get(f.codigo) ?? 0) + 1); continue }
    enArchivo.add(f.clave);
    const e = porClave.get(f.clave);
    if (!e) { out.nuevas.push(f); continue }
    const igual = e.fecha === f.fecha && redondear(e.pallets) === redondear(f.pallets) && (e.und == null || Number(e.und) === f.und);
    if (igual) out.iguales++;
    else out.cambiadas.push({ clave: f.clave, id: e.id, fila: f, antes: { fecha: e.fecha, pallets: e.pallets, und: e.und } });
  }
  out.sinProducto = [...faltan].map(([codigo, n]) => ({ codigo, n }));
  out.ausentes = existentes.filter((e) => e.fecha > corte && !enArchivo.has(e.clave));
  return out;
}

/** El día de hoy en Colombia (AAAA-MM-DD). */
export const hoyCO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

/* =====================================================================
   INVENTARIO DIARIO (la hoja «EXISTENCIAS DIARIAS» de Carnaval)
   Se lee de la foto, se revisa en pantalla y se guarda un renglón por día. La sección PALLET se compara
   con el saldo de pallets que lleva la app: si no coincide, una persona decide (dejar o ajustar la app).
   ===================================================================== */
/** `dudosa`: el lector de la foto no estuvo seguro de los números de este renglón; una persona debe revisarlo. */
export type FilaHoja = { concepto: string; a: number | null; b: number | null; dudosa?: boolean; codigo?: string | null };
export type SeccionHoja = { titulo: string; colA: string; colB: string; filas: FilaHoja[] };
export type Hoja = { fecha: string; secciones: SeccionHoja[] };

export const limpio = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Cómo se llama cada línea de PALLET en la hoja → el código de Carnaval. */
export const MAPA_PALLET: Record<string, string> = {
  "costenita 175r": "3500005",
  "palleth clover cc320": "3501430", "pallet clover cc320": "3501430", "palleth clover cc 320": "3501430", "clover cc320": "3501430",
  "flint 330r": "412707",
  "marron 330r": "412644",
  "marron 1000cc": "3500888",
  "flint 1000r": "3500887",
  "marron 250 cc": "3501226", "marron 250cc": "3501226",
  "flint 250": "3501225",
  "trophy": "3500446",
};
export const codigoDePallet = (concepto: string) => MAPA_PALLET[limpio(concepto)] ?? null;

/* =====================================================================
   AMARRE A LOS SKU: cada renglón de la hoja lleva el CÓDIGO del maestro, y la descripción sale del maestro (no de lo que diga
   la hoja o la foto). La equivalencia «sección + nombre en la hoja → código» se guarda y se aprende: lo que se asigna una vez
   queda para todos los días. El código «-» quiere decir «este renglón no es un SKU» (estibas de madera, por ejemplo).
   ===================================================================== */
export const SIN_SKU = "-";
export const claveEq = (seccion: string, concepto: string) => `${limpio(seccion)}|${limpio(concepto)}`;
/** Código de un renglón: lo que ya traiga → la equivalencia guardada → (en PALLET) el mapa de pallets → nada. */
export function codigoDeFila(seccion: string, f: FilaHoja, eq: Record<string, string>): string | null {
  return eq[claveEq(seccion, f.concepto)] ?? f.codigo ?? (esSeccionPallet(seccion) ? codigoDePallet(f.concepto) : null) ?? null;
}
/** Pone el código a cada renglón de la hoja (sin tocar los números). */
export function aplicarCodigos(secciones: SeccionHoja[], eq: Record<string, string>): SeccionHoja[] {
  return secciones.map((s) => ({ ...s, filas: s.filas.map((f) => ({ ...f, codigo: codigoDeFila(s.titulo, f, eq) })) }));
}
/** Renglones que todavía no tienen código (ni «no es un SKU»). */
export const sinCodigo = (secciones: SeccionHoja[]) => secciones.reduce((t, s) => t + s.filas.filter((f) => !f.codigo).length, 0);
export const esSeccionPallet = (titulo: string) => limpio(titulo) === "pallet";

export type FilaValidacion = { codigo: string; nombreHoja: string; hoja: number; app: number; dif: number; faltaEnHoja?: boolean };
export type Validacion = { filas: FilaValidacion[]; sinEmparejar: string[]; sinSeccion: boolean };

/** Compara la sección PALLET de la hoja contra el saldo de la app (solo las líneas con diferencia, o con saldo que la hoja no trae). */
export function validarPallet(hoja: Hoja, saldos: Record<string, number>, nombres: Record<string, string>): Validacion {
  const sec = hoja.secciones.find((s) => esSeccionPallet(s.titulo));
  if (!sec) return { filas: [], sinEmparejar: [], sinSeccion: true };
  const filas: FilaValidacion[] = [];
  const sinEmparejar: string[] = [];
  const vistos = new Set<string>();
  for (const f of sec.filas) {
    const cod = f.codigo && f.codigo !== SIN_SKU ? f.codigo : codigoDePallet(f.concepto);
    if (!cod) { if ((f.a ?? 0) !== 0) sinEmparejar.push(f.concepto); continue }
    vistos.add(cod);
    const hojaQ = f.a ?? 0, app = redondear(saldos[cod] ?? 0);
    if (redondear(hojaQ) !== app) filas.push({ codigo: cod, nombreHoja: f.concepto, hoja: hojaQ, app, dif: redondear(hojaQ - app) });
  }
  for (const [cod, q] of Object.entries(saldos)) {
    if (!vistos.has(cod) && redondear(q) !== 0 && nombres[cod]) filas.push({ codigo: cod, nombreHoja: nombres[cod], hoja: 0, app: redondear(q), dif: redondear(-q), faltaEnHoja: true });
  }
  return { filas, sinEmparejar, sinSeccion: false };
}


/* =====================================================================
   LA HOJA VIVA: lo que se trae solo y lo que se escribe a mano.
     · PALLET → los pallets que lleva la app (Control) al cierre del día.
     · CASCO DE VIDRIO B38 → el saldo de AG07 Alm. Bodega Carnaval en Casco de vidrio.
     · CASCO VIDRIO CERVECERIA ATLANTICO (la primera) → el saldo de CA22 ERR Atlántico en Casco de vidrio.
     · Todo lo demás lo actualiza una persona a mano.
   Lo que viene de otro módulo no se teclea aquí: se muestra y se guarda tal como estaba ese día.
   ===================================================================== */
export type FilaVista = FilaHoja & { auto?: boolean; ref: number };
export type SeccionVista = { titulo: string; colA: string; colB: string; filas: FilaVista[]; fuente: "pallet" | "casco" | null; nota?: string };
export type CascoSitio = { fecha: string; nombre: string; filas: { sku: string; descripcion: string; estibas: number }[] };
export type ContextoAuto = {
  fecha: string;
  /** pallets por código al cierre del día (los de la app) */
  pallets: Record<string, number>;
  /** códigos que Carnaval lleva por pallets (carnaval_productos) */
  carnaval: string[];
  /** por centro SAP (AG07, CA22): el último saldo de Casco de vidrio. `undefined` = no se pudo leer; `null` = sin registros. */
  casco: Record<string, CascoSitio | null | undefined>;
};
export const CENTRO_DE_CASCO: Record<string, string> = { "casco de vidrio b38": "AG07", "casco vidrio cerveceria atlantico": "CA22" };

export function conAuto(secs: SeccionHoja[], ctx: ContextoAuto): SeccionVista[] {
  const vistas: Record<string, number> = {};
  const car = new Set(ctx.carnaval);
  return secs.map((s) => {
    const k = limpio(s.titulo);
    const ord = vistas[k] ?? 0; vistas[k] = ord + 1;
    const propias: FilaVista[] = s.filas.map((f, i) => ({ ...f, ref: i }));
    if (esSeccionPallet(s.titulo)) {
      const usados = new Set<string>();
      const filas = propias.map((f) => {
        const cod = f.codigo && f.codigo !== SIN_SKU ? f.codigo : codigoDePallet(f.concepto);
        if (!cod || !car.has(cod) || usados.has(cod)) return f;
        usados.add(cod);
        return { ...f, codigo: cod, a: redondear(ctx.pallets[cod] ?? 0), b: null, auto: true };
      });
      for (const [cod, q] of Object.entries(ctx.pallets)) if (car.has(cod) && !usados.has(cod) && redondear(q) !== 0) filas.push({ concepto: cod, codigo: cod, a: redondear(q), b: null, auto: true, ref: -1 });
      return { titulo: s.titulo, colA: s.colA || "CANTIDAD", colB: "", filas, fuente: "pallet" as const, nota: `Pallets que lleva la app (Control) al cierre del ${ctx.fecha}` };
    }
    const centro = ord === 0 ? CENTRO_DE_CASCO[k] : undefined;
    if (centro && ctx.casco[centro] !== undefined) {
      const c = ctx.casco[centro];
      const filas: FilaVista[] = (c?.filas ?? []).map((r) => ({ concepto: r.descripcion, codigo: r.sku, a: r.estibas, b: null, auto: true, ref: -1 }));
      return { titulo: s.titulo, colA: "ESTIBA", colB: "", filas, fuente: "casco" as const, nota: c ? `Casco de vidrio · ${c.nombre} · saldo del ${c.fecha}` : `Casco de vidrio no tiene saldo de ${centro} hasta el ${ctx.fecha}` };
    }
    return { titulo: s.titulo, colA: s.colA, colB: s.colB && !/^columna\d*$/i.test(s.colB) ? s.colB : "", filas: propias, fuente: null };
  });
}

/** La hoja que se guarda: lo traído solo + lo escrito a mano, con los números ya puestos. */
export function aHojaGuardada(v: SeccionVista[]): SeccionHoja[] {
  return v.map((s) => ({ titulo: s.titulo, colA: s.colA, colB: s.colB, filas: s.filas.map((f) => ({ concepto: f.concepto, a: f.a, b: f.b, codigo: f.codigo ?? null })) }));
}
