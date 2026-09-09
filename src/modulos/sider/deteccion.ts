/**
 * LEER LOS DOS ARCHIVOS QUE ENTRAN A SIDER — ZLDE y la Base de Datos.
 * ------------------------------------------------------------------
 * Vive aparte de la pantalla a propósito: es la parte que se puede
 * equivocar en silencio, y así se puede correr contra el archivo de
 * verdad en una prueba y comparar los totales con el Excel, en vez de
 * confiar en que subir un archivo a mano salió bien.
 *
 * QUÉ CAMBIÓ Y POR QUÉ
 * La primera versión buscaba una columna que se llamara "Hectolitros".
 * El ZLDE que baja de SAP NO TIENE esa columna: tiene "Cantidad", que
 * son UNIDADES. Los hectolitros del Excel salen de una fórmula al lado
 * del export. Buscando por nombre, el importador agarró "Cantidad" y
 * guardó 514.248.432 HL donde iban 248.486.
 *
 * Así que ahora no se busca por nombre: se busca por DATOS, y contra el
 * maestro que ya tenemos.
 *
 *   · el SKU        la columna cuyos valores están en sider_skus
 *   · el CD origen  la columna cuyos valores están en sider_origenes
 *   · la fecha      la columna con fechas
 *   · la cantidad   la columna numérica donde cantidad ÷ unidades_x_caja
 *                   da cajas enteras y ÷ cajas_x_estiba da estibas
 *                   enteras. En el archivo real: "Cantidad" 100% y 99%,
 *                   la siguiente candidata 54% y 4%.
 *   · la planta     la columna con pocos valores distintos donde aparece
 *                   Barranquilla, que no sea la del CD
 *
 * Hay DOS columnas llamadas "Nombre 1" en el export de SAP —el CD de
 * origen y la planta de destino—, así que por nombre no había forma.
 *
 * Y las cuatro cuentas son las mismas del Excel:
 *   Hectolitros = Cantidad × hl_x_unidad
 *   Cajas       = Cantidad ÷ unidades_x_caja
 *   Estibas     = Cajas    ÷ cajas_x_estiba
 *   Vehículos   = Estibas  ÷ 36
 */

export type Hoja = { nombre: string; filas: unknown[][] };

export type SkuMaestro = {
  sku: string;
  clase: string | null;
  cajas_x_estiba: number | null;
  unidades_x_caja: number | null;
  hl_x_unidad: number | null;
};
export type OrigenMaestro = { planta: string; cd_origen: string };

export type Maestro = {
  origenes: OrigenMaestro[];
  skus: SkuMaestro[];
  estibasPorSider: number;
};

export const limpia = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Cuántas filas se miran para juzgar un candidato. Con 400 basta y no
    se paga recorrer cuarenta y cinco mil por cada par de columnas. */
const MUESTRA = 400;
/** Hasta qué fila se busca el encabezado. */
const MAX_CAB = 12;
/** Hasta qué columna. Un export de SAP no pasa de esto. */
const MAX_COL = 60;

/* ==================== Piezas sueltas ==================== */

/** Un número, venga como número, como "1.234,5" o como "1,234.5". */
export function aNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return null;
  if (typeof v !== "string") return null;
  let t = v.trim().replace(/\s/g, "");
  if (!t || !/[0-9]/.test(t)) return null;
  const coma = t.lastIndexOf(","), punto = t.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) t = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (coma >= 0) t = /,\d{3}$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Una fecha. SheetJS con cellDates devuelve Date; un .csv trae texto.
 *
 * Con texto se asume DÍA/MES/AÑO, que es como escribe SAP en español y
 * como se escribe aquí. Un 03/04/2026 leído al revés no falla: cambia de
 * mes en silencio, y el informe es mensual.
 */
export function aFecha(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    // Serial de Excel. Fuera de 2000–2100 no es una fecha, es un número.
    if (v < 36526 || v > 73415) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v !== "string") return null;
  const t = v.trim();
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

/** El primer día del mes, en el "2026-08-01" que espera Postgres. */
export const mesDe = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const entero = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;

/** Puntaje por el nombre del encabezado. Ayuda a desempatar; no manda. */
function pista(cab: unknown, palabras: string[]): number {
  const c = limpia(cab);
  if (!c) return 0;
  for (const p of palabras) if (c === p) return 3;
  for (const p of palabras) if (c.includes(p)) return 1;
  return 0;
}

/**
 * Cuánto ayuda o estorba el NOMBRE de la hoja.
 *
 * No manda —escoger por el nombre fue lo que una vez hizo que el
 * importador se quedara con la hoja "Portada"—, pero tampoco se puede
 * ignorar: el libro de prueba trae la hoja ZLDE y la hoja "Base de
 * Datos", y las dos tienen SKU, fecha, un origen conocido y algo que
 * parece una placa. La columna ValAcoMr de ZLDE trae "LKL790", que pasa
 * por placa el 100% de las veces. Con solo los datos no hay forma de
 * saber cuál de las dos quiso subir la persona; el nombre sí lo dice, y
 * la persona ya eligió qué está importando al abrir la pestaña.
 */
function bonoNombre(nombre: string, buenas: RegExp, malas: RegExp): number {
  const n = limpia(nombre);
  if (malas.test(n)) return -400;
  if (buenas.test(n)) return 400;
  return 0;
}

type Cuerpo = { filas: unknown[][]; desde: number; hasta: number };

/** Recorre la muestra de una columna. */
function porColumna(c: Cuerpo, col: number, fn: (v: unknown, fila: unknown[]) => void) {
  for (let i = c.desde; i < c.hasta; i++) {
    const f = c.filas[i];
    if (f) fn(f[col], f);
  }
}

/** Ancho real de la hoja (la fila más larga de la muestra). */
function ancho(c: Cuerpo): number {
  let w = 0;
  for (let i = c.desde; i < c.hasta; i++) w = Math.max(w, (c.filas[i] ?? []).length);
  return Math.min(w, MAX_COL);
}

/** La columna que más valores tiene dentro de un conjunto conocido. */
function columnaDeConjunto(c: Cuerpo, conocidos: Set<string>, w: number) {
  let mejor = -1, mejorN = 0, total = 0;
  for (let col = 0; col < w; col++) {
    let n = 0, vistos = 0;
    porColumna(c, col, (v) => {
      const t = limpia(v);
      if (!t) return;
      vistos++;
      if (conocidos.has(t)) n++;
    });
    if (n > mejorN) { mejor = col; mejorN = n; total = vistos; }
  }
  return { col: mejor, aciertos: mejorN, vistos: total };
}

/** La columna con más fechas. */
function columnaDeFechas(c: Cuerpo, w: number) {
  let mejor = -1, mejorN = 0;
  for (let col = 0; col < w; col++) {
    let n = 0;
    porColumna(c, col, (v) => { if (aFecha(v)) n++; });
    if (n > mejorN) { mejor = col; mejorN = n; }
  }
  return { col: mejor, aciertos: mejorN };
}

/* ==================== ZLDE ==================== */

export type FilaZlde = {
  mes: string; cd_origen: string; planta: string; clase: string;
  hl: number; vh: number; lineas: number;
};

export type LecturaZlde = {
  iHoja: number; hoja: string; iCab: number;
  cols: { cd: number; sku: number; cantidad: number; planta: number; fecha: number };
  nombresCol: string[];
  /** Los valores distintos de la columna de planta, para poder cambiar el filtro. */
  plantas: string[];
  planta: string | null;
  filas: FilaZlde[];
  leidas: number;
  usadas: number;
  descartes: { sinSku: number; noEer: number; otraPlanta: number; sinFecha: number; sinFactores: number };
  skusDesconocidos: string[];
  cdSueltos: string[];
  puntos: number;
};

type Elegido = {
  iHoja: number; iCab: number; cd: number; sku: number;
  cantidad: number; planta: number; fecha: number; puntos: number;
};

function elegirZlde(hojas: Hoja[], m: Maestro): Elegido | null {
  const skus = new Map(m.skus.map((s) => [limpia(s.sku), s]));
  const cds = new Set(m.origenes.map((o) => limpia(o.cd_origen)));
  let mejor: Elegido | null = null;

  hojas.forEach((h, iHoja) => {
    for (let iCab = 0; iCab <= Math.min(MAX_CAB, h.filas.length - 2); iCab++) {
      const cab = (h.filas[iCab] ?? []).map((x) => String(x ?? ""));
      if (cab.filter((x) => x.trim()).length < 3) continue;
      const c: Cuerpo = { filas: h.filas, desde: iCab + 1, hasta: Math.min(h.filas.length, iCab + 1 + MUESTRA) };
      const w = ancho(c);
      if (w < 3) continue;

      // El SKU manda: sin él no hay factores y no hay hectolitros.
      const sku = columnaDeConjunto(c, new Set(skus.keys()), w);
      if (sku.col < 0 || sku.aciertos < 5) continue;

      const cd = columnaDeConjunto(c, cds, w);
      const fecha = columnaDeFechas(c, w);

      /* LA CANTIDAD. Se puntea por la cuenta que tiene que cuadrar: en
         las filas de envase retornable, cantidad ÷ unidades_x_caja da
         cajas enteras y ÷ cajas_x_estiba da estibas enteras. La columna
         de hectolitros del propio archivo saca 0% en las dos, así que
         no puede ganar por accidente. */
      let colCant = -1, mejorCant = -1;
      for (let col = 0; col < w; col++) {
        if (col === sku.col || col === fecha.col || col === cd.col) continue;
        let num = 0, cajas = 0, estibas = 0, fechas = 0;
        porColumna(c, col, (v, f) => {
          if (aFecha(v) && typeof v !== "number") fechas++;
          const s = skus.get(limpia(f[sku.col]));
          if (!s || !s.unidades_x_caja || !s.cajas_x_estiba) return;
          const n = aNumero(v);
          if (n == null || n <= 0) return;
          num++;
          if (entero(n / s.unidades_x_caja)) cajas++;
          if (entero(n / s.unidades_x_caja / s.cajas_x_estiba)) estibas++;
        });
        if (num < 5 || fechas > num / 2) continue;
        const p = (cajas / num) * 100 + (estibas / num) * 100 + pista(cab[col], ["cantidad", "ctd", "cant"]) * 5;
        if (p > mejorCant) { mejorCant = p; colCant = col; }
      }
      if (colCant < 0 || mejorCant < 60) continue;

      /* LA PLANTA DE DESTINO. Pocas distintas, texto, y no es la del CD.
         Se prefiere una donde aparezca Barranquilla porque es el filtro
         del informe, pero no se exige: el que decide es el desplegable. */
      let colPlanta = -1, mejorPl = -1;
      for (let col = 0; col < w; col++) {
        if (col === sku.col || col === cd.col || col === colCant || col === fecha.col) continue;
        const vistos = new Set<string>();
        let texto = 0;
        porColumna(c, col, (v) => {
          const t = String(v ?? "").trim();
          if (!t || aNumero(t) != null) return;
          texto++;
          if (vistos.size < 200) vistos.add(limpia(t));
        });
        if (texto < 5 || vistos.size > 60) continue;
        const p = (vistos.has("barranquilla") ? 100 : 0) + (60 - vistos.size)
                + pista(cab[col], ["planta", "centro", "destino"]) * 4;
        if (p > mejorPl) { mejorPl = p; colPlanta = col; }
      }

      const puntos = sku.aciertos * 2 + cd.aciertos * 2 + fecha.aciertos + mejorCant
                   + bonoNombre(h.nombre, /zlde|movimiento|sap/, /base de datos|seguimiento|portada|tabla umn|produccion/);
      if (!mejor || puntos > mejor.puntos) {
        mejor = { iHoja, iCab, cd: cd.col, sku: sku.col, cantidad: colCant,
                  planta: colPlanta, fecha: fecha.col, puntos };
      }
    }
  });
  return mejor;
}

/**
 * Lee el ZLDE y lo deja resumido por mes y CD, que es el grano del
 * informe: las 45.374 líneas del archivo de prueba se vuelven quince
 * filas por mes.
 */
export function leerZlde(
  hojas: Hoja[], m: Maestro,
  /* plantaFiltro y no "planta": en Elegido, planta es el ÍNDICE de la
     columna; aquí es el VALOR por el que se filtra. Dos cosas distintas
     con el mismo nombre en el mismo archivo es cómo se cuelan los
     errores que el compilador no ve. */
  forzar?: Partial<Elegido> & { plantaFiltro?: string | null }
): LecturaZlde | null {
  const base = elegirZlde(hojas, m);
  if (!base) return null;
  const e: Elegido = { ...base, ...(forzar ?? {}) } as Elegido;
  const h = hojas[e.iHoja];
  if (!h) return null;

  const skus = new Map(m.skus.map((s) => [limpia(s.sku), s]));
  const cds = new Set(m.origenes.map((o) => limpia(o.cd_origen)));
  const nombresCol = (h.filas[e.iCab] ?? []).map((x, i) =>
    String(x ?? "").trim() || `Columna ${i + 1}`);

  /* Qué plantas de destino hay, para el desplegable. Se recorre el
     archivo entero: si Barranquilla solo aparece en la fila 30.000, un
     muestreo de las primeras 400 diría que no está. */
  const plantas = new Map<string, string>();
  if (e.planta >= 0) {
    for (let i = e.iCab + 1; i < h.filas.length; i++) {
      const t = String((h.filas[i] ?? [])[e.planta] ?? "").trim();
      if (t && plantas.size < 300) plantas.set(limpia(t), t);
    }
  }
  const planta = forzar && "plantaFiltro" in forzar
    ? forzar.plantaFiltro ?? null
    : (plantas.has("barranquilla") ? plantas.get("barranquilla")! : null);

  const acum = new Map<string, { hl: number; vh: number; lineas: number }>();
  const desconocidos = new Set<string>();
  const sueltos = new Set<string>();
  const d = { sinSku: 0, noEer: 0, otraPlanta: 0, sinFecha: 0, sinFactores: 0 };
  let leidas = 0, usadas = 0;

  for (let i = e.iCab + 1; i < h.filas.length; i++) {
    const f = h.filas[i];
    if (!f) continue;
    const crudoSku = String(f[e.sku] ?? "").trim();
    if (!crudoSku) continue;
    leidas++;

    const s = skus.get(limpia(crudoSku));
    if (!s) { d.sinSku++; if (desconocidos.size < 40) desconocidos.add(crudoSku); continue; }
    const fecha = e.fecha >= 0 ? aFecha(f[e.fecha]) : null;
    if (!fecha) { d.sinFecha++; continue; }
    const cant = aNumero(f[e.cantidad]);
    if (cant == null || cant <= 0) continue;

    const cd = String(f[e.cd] ?? "").trim();
    if (!cd) continue;
    if (!cds.has(limpia(cd)) && sueltos.size < 40) sueltos.add(cd);

    const laPlanta = (e.planta >= 0 ? String(f[e.planta] ?? "").trim() : "") || "sin planta";
    const laClase = (s.clase ?? "").trim() || "sin clase";
    /* Cuántas líneas quedarían FUERA del informe, para poder decirlo. El
       informe es de EER que llegó a Barranquilla; el resto se guarda
       igual y la pantalla de ZLDE lo puede mirar, como los
       segmentadores de tu pivote. */
    if (limpia(laClase) !== "eer") d.noEer++;
    else if (planta != null && limpia(laPlanta) !== limpia(planta)) d.otraPlanta++;

    /* Sin factores no hay hectolitros que calcular: la línea se cuenta,
       el HL queda en cero y se dice cuántas fueron. Un número inventado
       sería peor que un cero. */
    const sinF = s.hl_x_unidad == null || s.unidades_x_caja == null || s.cajas_x_estiba == null;
    if (sinF) d.sinFactores++;

    const k = [mesDe(fecha), cd, laPlanta, laClase].join("\u0000");
    const a = acum.get(k) ?? { hl: 0, vh: 0, lineas: 0 };
    if (!sinF) {
      a.hl += cant * s.hl_x_unidad!;
      a.vh += cant / s.unidades_x_caja! / s.cajas_x_estiba! / m.estibasPorSider;
    }
    a.lineas++;
    acum.set(k, a);
    usadas++;
  }

  const filas = [...acum].map(([k, v]) => {
    const [mes, cd_origen, laPlanta, laClase] = k.split("\u0000");
    return { mes, cd_origen, planta: laPlanta, clase: laClase,
             hl: +v.hl.toFixed(3), vh: +v.vh.toFixed(4), lineas: v.lineas };
  }).sort((a, b) => (a.mes === b.mes ? b.hl - a.hl : a.mes.localeCompare(b.mes)));

  return {
    iHoja: e.iHoja, hoja: h.nombre, iCab: e.iCab,
    cols: { cd: e.cd, sku: e.sku, cantidad: e.cantidad, planta: e.planta, fecha: e.fecha },
    nombresCol, plantas: [...plantas.values()].sort(), planta,
    filas, leidas, usadas, descartes: d,
    skusDesconocidos: [...desconocidos], cdSueltos: [...sueltos],
    puntos: e.puntos,
  };
}

/* ==================== La hoja "Base de Datos" ==================== */

export type FilaBase = {
  fecha: string; planta: string; cd_origen: string;
  sku: string; descripcion: string; estibas: number; placa: string;
};

export type LecturaBase = {
  iHoja: number; hoja: string; iCab: number;
  cols: { origen: number; sku: number; fecha: number; estibas: number; placa: number };
  nombresCol: string[];
  filas: FilaBase[];
  leidas: number;
  descartadas: { fila: number; motivo: string }[];
};

/** Una placa colombiana: tres letras y tres números. */
const PLACA = /^[A-Za-z]{3}\s?-?\s?\d{3}$/;

export function leerBase(hojas: Hoja[], m: Maestro, forzar?: Partial<LecturaBase["cols"]> & { iHoja?: number; iCab?: number }): LecturaBase | null {
  const skus = new Map(m.skus.map((s) => [limpia(s.sku), s]));
  const descr = new Map(m.skus.map((s) => [limpia(s.sku), s]));
  /* El origen puede venir corto ("Curumani") o largo ("CD OL Curumani"):
     el maestro trae los dos y aquí se aceptan los dos. En el Excel había
     un 'Monteria ' con espacio al final que rompía el VLOOKUP; limpia()
     lo resuelve sin que nadie tenga que enterarse. */
  const porOrigen = new Map<string, OrigenMaestro>();
  for (const o of m.origenes) {
    porOrigen.set(limpia(o.planta), o);
    porOrigen.set(limpia(o.cd_origen), o);
  }

  let mejor: { iHoja: number; iCab: number; cols: LecturaBase["cols"]; puntos: number } | null = null;

  hojas.forEach((h, iHoja) => {
    for (let iCab = 0; iCab <= Math.min(MAX_CAB, h.filas.length - 2); iCab++) {
      const cab = (h.filas[iCab] ?? []).map((x) => String(x ?? ""));
      if (cab.filter((x) => x.trim()).length < 4) continue;
      const c: Cuerpo = { filas: h.filas, desde: iCab + 1, hasta: Math.min(h.filas.length, iCab + 1 + MUESTRA) };
      const w = ancho(c);
      if (w < 4) continue;

      const sku = columnaDeConjunto(c, new Set(skus.keys()), w);
      if (sku.col < 0 || sku.aciertos < 5) continue;
      const origen = columnaDeConjunto(c, new Set(porOrigen.keys()), w);
      if (origen.col < 0 || origen.aciertos < 5) continue;
      const fecha = columnaDeFechas(c, w);
      if (fecha.col < 0 || fecha.aciertos < 5) continue;

      // La placa: tres letras y tres números.
      let placa = -1, mejorPlaca = 0;
      for (let col = 0; col < w; col++) {
        if (col === sku.col || col === origen.col) continue;
        let n = 0;
        porColumna(c, col, (v) => { if (PLACA.test(String(v ?? "").trim())) n++; });
        if (n > mejorPlaca) { mejorPlaca = n; placa = col; }
      }

      /* LAS ESTIBAS. El problema no es encontrar una columna numérica:
         es que hay seis (cajas, unidades, HL, semana, año, sider). Se
         descartan las que se DERIVAN de la fecha —semana, mes, año— y
         las que no son un número de estibas plausible; entre las que
         quedan, gana la que diga "estiba" en el encabezado. */
      let estibas = -1, mejorEst = -1;
      for (let col = 0; col < w; col++) {
        if (col === sku.col || col === origen.col || col === fecha.col || col === placa) continue;
        let n = 0, plausibles = 0, derivadaDeFecha = 0;
        porColumna(c, col, (v, f) => {
          const x = aNumero(v);
          if (x == null) return;
          n++;
          if (x > 0 && x <= 200 && entero(x)) plausibles++;
          const fe = aFecha(f[fecha.col]);
          if (fe && (x === fe.getFullYear() || x === fe.getMonth() + 1 || x === semanaDe(fe))) derivadaDeFecha++;
        });
        if (n < 5) continue;
        if (derivadaDeFecha > n * 0.8) continue;
        /* Un viaje trae entre seis y cuarenta estibas: cuarenta ya es un
           sider lleno. Una columna donde la mayoría de los valores no
           caben en un camión no es la de estibas, se llame como se
           llame. Es lo que separa la hoja "Base de Datos" (100% de los
           valores por debajo de 60) de la columna "Estibas" de ZLDE
           (56%), que son cajas mal divididas. */
        if (plausibles < n * 0.85) continue;
        const p = (plausibles / n) * 100 + pista(cab[col], ["no. estibas", "estibas", "estiba"]) * 30;
        if (p > mejorEst) { mejorEst = p; estibas = col; }
      }
      if (estibas < 0) continue;

      const puntos = sku.aciertos + origen.aciertos + fecha.aciertos + mejorPlaca + mejorEst / 10
                   + bonoNombre(h.nombre, /base de datos|base|fuente principal|viajes/, /zlde|seguimiento|portada|tabla umn|produccion/);
      if (!mejor || puntos > mejor.puntos) {
        mejor = { iHoja, iCab, cols: { origen: origen.col, sku: sku.col, fecha: fecha.col, estibas, placa }, puntos };
      }
    }
  });

  if (!mejor) return null;
  const el = mejor as { iHoja: number; iCab: number; cols: LecturaBase["cols"]; puntos: number };
  const iHoja = forzar?.iHoja ?? el.iHoja;
  const iCab = forzar?.iCab ?? el.iCab;
  const cols = { ...el.cols, ...(forzar ?? {}) } as LecturaBase["cols"];
  const h = hojas[iHoja];
  if (!h) return null;

  const nombresCol = (h.filas[iCab] ?? []).map((x, i) =>
    String(x ?? "").trim() || `Columna ${i + 1}`);
  const filas: FilaBase[] = [];
  const descartadas: { fila: number; motivo: string }[] = [];
  let leidas = 0;

  for (let i = iCab + 1; i < h.filas.length; i++) {
    const f = h.filas[i];
    if (!f) continue;
    const vacia = [cols.origen, cols.sku, cols.fecha, cols.estibas, cols.placa]
      .every((c) => c < 0 || String(f[c] ?? "").trim() === "");
    if (vacia) continue;
    leidas++;

    const o = porOrigen.get(limpia(f[cols.origen]));
    const s = descr.get(limpia(f[cols.sku]));
    const fe = aFecha(f[cols.fecha]);
    const est = aNumero(f[cols.estibas]);
    const placa = String(f[cols.placa] ?? "").trim().toUpperCase().replace(/[\s-]/g, "");

    const falta =
      !o ? `origen desconocido: ${JSON.stringify(String(f[cols.origen] ?? "").trim())}`
      : !s ? `SKU desconocido: ${JSON.stringify(String(f[cols.sku] ?? "").trim())}`
      : !fe ? "sin fecha"
      : est == null || est <= 0 ? "sin estibas"
      : !placa ? "sin placa"
      : null;
    if (falta) { if (descartadas.length < 60) descartadas.push({ fila: i + 1, motivo: falta }); continue; }

    filas.push({
      fecha: iso(fe!), planta: o!.planta, cd_origen: o!.cd_origen,
      sku: s!.sku, descripcion: "", estibas: est!, placa,
    });
  }

  return { iHoja, hoja: h.nombre, iCab, cols, nombresCol, filas, leidas, descartadas };
}

/** El número de semana, como lo cuenta WEEKNUM de Excel (domingo, base 1). */
function semanaDe(d: Date): number {
  const inicio = new Date(d.getFullYear(), 0, 1);
  const dias = Math.floor((d.getTime() - inicio.getTime()) / 86400000);
  return Math.floor((dias + inicio.getDay()) / 7) + 1;
}
