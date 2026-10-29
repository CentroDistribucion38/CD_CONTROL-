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
  /** Columnas «INGRESO» y «Entrada de Mercancía» del archivo. Sin definir = el archivo no las trae; null = vacías (todavía no está en SAP). */
  ingreso?: string | null;
  em?: string | null;
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
  /** filas del archivo que ya existían pero estaban ANULADAS: se reactivan (no se crean de nuevo: la llave es única) */
  reactivar: { id: string; clave: string; fila: FilaConClave }[];
  cambiadas: Cambio[];
  iguales: number;
  /** filas con fecha de recibo hasta el corte: ya están dentro del saldo inicial */
  anteriores: number;
  /** códigos que no están en el maestro de productos */
  sinProducto: { codigo: string; n: number }[];
  /** cargadas antes (después del corte) que el archivo de hoy ya no trae */
  ausentes: Existente[];
  /** filas del archivo que traen la entrada de mercancía (se actualiza sola, no es un cambio de cantidades) y cuántas no la tienen todavía */
  conEM: number; sinEM: number;
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

/** Si una fila del archivo no tiene la misma llave que una ya cargada pero coincide en remisión + código (por ejemplo la placa se escribió distinto), es la MISMA:
 *  se le pone la llave de la cargada, para no duplicar el ingreso. Solo cuando hay una sola candidata libre. */
export function emparejarClaves(filas: FilaConClave[], existentes: Existente[]): FilaConClave[] {
  const exactas = new Set(existentes.map((e) => e.clave));
  const porRC = new Map<string, Existente[]>();
  for (const e of existentes) { const p = e.clave.split("|"); const k = `${p[0]}|${p[2]}`; porRC.set(k, [...(porRC.get(k) ?? []), e]) }
  const usadas = new Set(filas.filter((f) => exactas.has(f.clave)).map((f) => f.clave));
  return filas.map((f) => {
    if (exactas.has(f.clave)) return f;
    const c = (porRC.get(`${f.remision}|${f.codigo}`) ?? []).filter((e) => !usadas.has(e.clave));
    if (c.length === 1) { usadas.add(c[0].clave); return { ...f, clave: c[0].clave } }
    return f;
  });
}

export function compararPeldar(filas: FilaPeldar[], existentes: Existente[], productos: Set<string>, corte: string, anulados: Existente[] = []): Comparacion {
  const porClave = new Map(existentes.map((e) => [e.clave, e]));
  const out: Comparacion = { nuevas: [], reactivar: [], cambiadas: [], iguales: 0, anteriores: 0, sinProducto: [], ausentes: [], conEM: 0, sinEM: 0 };
  const faltan = new Map<string, number>();
  const enArchivo = new Set<string>();
  const anPorClave = new Map(anulados.map((a) => [a.clave, a]));
  const anUsadas = new Set<string>();
  const anPorRC = new Map<string, Existente[]>();
  for (const a of anulados) { const p = a.clave.split("|"); const k = `${p[0]}|${p[2]}`; anPorRC.set(k, [...(anPorRC.get(k) ?? []), a]) }
  for (const f of emparejarClaves(conClaves(filas), existentes)) {
    if (f.fecha <= corte) { out.anteriores++; continue }
    if (!productos.has(f.codigo)) { faltan.set(f.codigo, (faltan.get(f.codigo) ?? 0) + 1); continue }
    enArchivo.add(f.clave);
    if (f.em !== undefined) { out.conEM++; if (!f.em || !f.ingreso) out.sinEM++ }
    const e = porClave.get(f.clave);
    if (!e) {
      /* ¿estaba cargada y anulada? entonces se reactiva en vez de crearla (la llave no se puede repetir) */
      let a = anPorClave.get(f.clave);
      if (!a || anUsadas.has(a.clave)) { const c = (anPorRC.get(`${f.remision}|${f.codigo}`) ?? []).filter((x) => !anUsadas.has(x.clave)); a = c.length === 1 ? c[0] : undefined }
      if (a && !anUsadas.has(a.clave)) { anUsadas.add(a.clave); out.reactivar.push({ id: a.id, clave: a.clave, fila: { ...f, clave: a.clave } }); continue }
      out.nuevas.push(f); continue;
    }
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

/* =====================================================================
   CUADRE SAP DE AG07 · PASO 1: LOS PALLETS CONTRA LA ZEXI
   El conteo es el inventario de pallets de CONTROL, SIN los pallets que todavía no tienen entrada de mercancía (no están en SAP y no se
   pueden meter a control de calidad). En SAP, el envase de AG07 vive en CONTROL DE CALIDAD — con una excepción: el 3500005 (Costeñita 175R)
   no se toca en control-cal (lo que haya ahí no se mueve y no cuenta: se muestra en rojo) y se cuadra solo contra el AG71 en libre utilización.
   ===================================================================== */
export type ZexiAlm = { almacen: string; codigo: string; descripcion: string; libre: number; calidad: number; bloqueado: number; total: number };
export const SKU_A_AG71 = new Set(["3500005"]);
export type Mov07 = { titulo: string; cantidad: number };
export type FilaCuadre07 = {
  codigo: string; descripcion: string; undPorPallet: number;
  pallets: number; pendientes: number; palletsSap: number; conteo: number;
  libre: number; calidad: number; bloqueado: number; libre71: number | null; enZexi: boolean;
  /** SAP − conteo en el lugar donde debe quedar el envase (control-cal de AG07; para el 3500005, libre de AG71 DESPUÉS del traslado) */
  dif: number; destino: "AG07 control-cal" | "AG71 libre";
  movs: Mov07[]; sinAlcanzar: number;
};
export function cuadrePallets07(productos: { codigo: string; descripcion: string; und_por_pallet: number }[], saldos: Map<string, number>, pend: Map<string, number>, zexi: ZexiAlm[]): FilaCuadre07[] {
  const z = (alm: string, c: string) => zexi.find((x) => x.almacen === alm && x.codigo === c);
  const out: FilaCuadre07[] = [];
  for (const p of productos) {
    const pallets = redondear(saldos.get(p.codigo) ?? 0), pendientes = redondear(pend.get(p.codigo) ?? 0);
    const a7 = z("AG07", p.codigo), a71 = z("AG71", p.codigo);
    if (!pallets && !pendientes && !(a7?.calidad) && !(a71?.libre && SKU_A_AG71.has(p.codigo))) continue;
    const palletsSap = redondear(pallets - pendientes), conteo = palletsSap * p.und_por_pallet;
    const libre = a7?.libre ?? 0, calidad = a7?.calidad ?? 0, bloqueado = a7?.bloqueado ?? 0;
    const movs: Mov07[] = []; let sinAlcanzar = 0, dif: number, destino: FilaCuadre07["destino"], libre71: number | null = null;
    if (SKU_A_AG71.has(p.codigo)) {
      destino = "AG71 libre"; libre71 = a71?.libre ?? 0;
      /* Lo que haya en control-cal de AG07 NO se mira ni se mueve (no se puede): no cuenta y permanece. Solo se compara AG71 libre contra el conteo. */
      dif = redondear(libre71 - conteo);
      if (dif < -0.5) {
        /* AG71 tiene menos que el conteo: se trae de AG07 con 311 (de libre; lo bloqueado primero pasa a libre con 343) */
        let falta = -dif, a311 = 0;
        const dl = Math.min(falta, Math.max(0, libre)); if (dl > 0.5) { a311 += dl; falta -= dl }
        const db = Math.min(falta, Math.max(0, bloqueado)); if (db > 0.5) { movs.push({ titulo: "Mov 343 en AG07 (Bloqueado → Libre)", cantidad: Math.round(db) }); a311 += db; falta -= db }
        if (a311 > 0.5) movs.push({ titulo: "Mov 311 (AG07 Libre → AG71 Libre)", cantidad: Math.round(a311) });
        sinAlcanzar = falta > 0.5 ? Math.round(falta) : 0;
      } else if (dif > 0.5) movs.push({ titulo: "Mov 311 (AG71 Libre → AG07 Libre)", cantidad: Math.round(dif) });
    } else {
      destino = "AG07 control-cal"; dif = redondear(calidad - conteo);
      if (dif < -0.5) {
        let falta = -dif;
        const dl = Math.min(falta, Math.max(0, libre)); if (dl > 0.5) { movs.push({ titulo: "Mov 322 en AG07 (Libre → Control de calidad)", cantidad: Math.round(dl) }); falta -= dl }
        const db = Math.min(falta, Math.max(0, bloqueado)); if (db > 0.5) { movs.push({ titulo: "Mov 349 en AG07 (Bloqueado → Control de calidad)", cantidad: Math.round(db) }); falta -= db }
        sinAlcanzar = falta > 0.5 ? Math.round(falta) : 0;
      } else if (dif > 0.5) movs.push({ titulo: "Mov 321 en AG07 (Control de calidad → Libre)", cantidad: Math.round(dif) });
    }
    out.push({ codigo: p.codigo, descripcion: p.descripcion, undPorPallet: p.und_por_pallet, pallets, pendientes, palletsSap, conteo, libre, calidad, bloqueado, libre71, enZexi: !!a7 || !!a71, dif, destino, movs, sinAlcanzar });
  }
  return out;
}

/* =====================================================================
   CUADRE SAP DE AG07 · PASO 2: LA HOJA DE INVENTARIO CONTRA LA ZEXI DE AG07
   Cada renglón de la hoja trae ESTIBAS y CAJAS. Se pasan a unidades con los factores del maestro (unidades por caja y cajas por estiba):
     · ENVASE:        unidades = estibas × cajas por estiba × unidades por caja + cajas × unidades por caja
     · CAJA PLÁSTICA: unidades = estibas × cajas por estiba + cajas
     Se toma TODA la hoja (menos PALLET y casco) y se compara contra la LIBRE UTILIZACIÓN de AG07 (el control de calidad ya quedó en el paso 1).
   La diferencia (SAP − hoja) es de inventario: no se arregla moviendo entre estados.
   ===================================================================== */
export type FactorSku = { upc: number; cpe: number };
export type FilaInv07 = {
  codigo: string; descripcion: string; tipo: "ENVASE" | "CAJA";
  estibas: number; cajas: number; unidades: number; sinFactor: boolean;
  libre: number; calidad: number; bloqueado: number; sap: number; dif: number;
  /** Para la estiba de madera: cuántas van debajo de producto (se suman a las que se cuentan solas). */
  nota?: string;
};
/** Estiba de madera: la cantidad de la hoja ya son unidades. */
const SKU_UNIDADES_DIRECTAS = new Set(["3500163"]);
export function cuadreInventario07(secciones: SeccionHoja[], zexi: ZexiAlm[], factores: Map<string, FactorSku>, nombres: Map<string, string>): FilaInv07[] {
  /* TODA la hoja menos lo que ya se cuadró aparte: la sección PALLET (paso 1) y los casco de vidrio (salen del módulo de Casco). */
  const acc = new Map<string, { tipo: "ENVASE" | "CAJA"; estibas: number; cajas: number; unidades: number; concepto: string }>();
  for (const s of secciones) {
    const t = limpio(s.titulo);
    if (t === "pallet" || t in CENTRO_DE_CASCO || t.startsWith("casco")) continue;
    const tipo: "ENVASE" | "CAJA" = t.includes("caja") ? "CAJA" : "ENVASE";
    for (const f of s.filas) {
      const c = f.codigo && f.codigo !== SIN_SKU ? f.codigo : null; if (!c) continue;
      const fa = factores.get(c) ?? { upc: 1, cpe: 0 };
      const est = f.a ?? 0, caj = f.b ?? 0;
      const u = SKU_UNIDADES_DIRECTAS.has(c) ? est + caj : tipo === "ENVASE" ? est * fa.cpe * fa.upc + caj * fa.upc : est * fa.cpe + caj;
      const x = acc.get(c) ?? { tipo, estibas: 0, cajas: 0, unidades: 0, concepto: f.concepto };
      x.estibas += est; x.cajas += caj; x.unidades += u; acc.set(c, x);
    }
  }
  /* LA ESTIBA DE MADERA (3500163): además de las que se cuentan solas, cada ESTIBA de producto (envase, cajas…) va montada sobre una estiba de madera, y también cuenta. */
  let sobre = 0;
  for (const [c, x] of acc) if (!SKU_UNIDADES_DIRECTAS.has(c)) sobre += x.estibas;
  for (const c of SKU_UNIDADES_DIRECTAS) {
    const x = acc.get(c);
    if (x) { x.unidades += sobre }
    else if (sobre > 0) acc.set(c, { tipo: "ENVASE", estibas: 0, cajas: 0, unidades: sobre, concepto: "Estiba de madera" });
  }
  const z = (c: string) => zexi.find((x) => x.almacen === "AG07" && x.codigo === c);
  /* Materiales de AG07 con libre utilización que la hoja no trae: también se muestran, contra una hoja en cero. */
  for (const x of zexi) if (x.almacen === "AG07" && !acc.has(x.codigo) && x.libre) acc.set(x.codigo, { tipo: /caja/i.test(x.descripcion) ? "CAJA" : "ENVASE", estibas: 0, cajas: 0, unidades: 0, concepto: x.descripcion });
  const out: FilaInv07[] = [];
  for (const [codigo, x] of acc) {
    const fa = factores.get(codigo) ?? { upc: 1, cpe: 0 };
    const a = z(codigo), libre = a?.libre ?? 0, calidad = a?.calidad ?? 0, bloqueado = a?.bloqueado ?? 0;
    /* Contra libre utilización: el control de calidad ya quedó cuadrado en el paso 1. */
    const sap = libre;
    out.push({ codigo, descripcion: nombres.get(codigo) ?? a?.descripcion ?? x.concepto, tipo: x.tipo, estibas: x.estibas, cajas: x.cajas, unidades: Math.round(x.unidades), sinFactor: x.estibas > 0 && !fa.cpe && !SKU_UNIDADES_DIRECTAS.has(codigo),
      nota: SKU_UNIDADES_DIRECTAS.has(codigo) ? `${Math.round(x.unidades - sobre)} contadas solas + ${Math.round(sobre)} estibas que van debajo del producto` : undefined,
      libre, calidad, bloqueado, sap, dif: Math.round(sap - x.unidades) });
  }
  return out.sort((a, b) => (a.tipo === b.tipo ? a.codigo.localeCompare(b.codigo) : a.tipo === "ENVASE" ? -1 : 1));
}
