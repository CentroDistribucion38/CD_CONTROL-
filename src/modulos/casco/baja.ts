/**
 * LA HOJA «BAJA» DE SAP: LEERLA Y DECIR A DÓNDE VA CADA FILA.
 *
 * El archivo (RELACION_TRASPASO_DE_CASCO_DE_VIDRIO_DIARIA.xlsx) trae una hoja «Baja» con una fila
 * por material y documento: Fe.contabilización, Almacén (AG18, AG22…), Documento material, Material,
 * Cantidad (en UNIDADES y NEGATIVA: es una salida de SAP), Texto cab.documento (el motivo) y la
 * Clase de movimiento.
 *
 * AQUÍ SOLO SE LEE. Convertir unidades a estibas y sumar en Control lo hace la base
 * (`casco_registrar_bajas`), con el factor del maestro: si el factor se calculara en la pantalla,
 * cada navegador podría guardar una cifra distinta. La pantalla calcula las estibas SOLO para
 * mostrarlas antes de aplicar.
 *
 * EL TEXTO MANDA A DÓNDE VA (y tiene que decir lo mismo que `casco_registrar_bajas`):
 *   «BAJA LAVADO»      → columna «Lavado con baja» del almacén de la fila (Fábrica).
 *   «BAJA EXTRASUCIO»  → columna «Extrasucio con baja» del almacén de la fila (Bodega 38).
 *   cualquier otro (SORTING, PRESORTING, ROTURA DE MAQUINA…) → se SUMA al inventario del almacén.
 */

export type FilaBaja = {
  /** Fila del Excel (1 = la primera), para decir cuál falló. */
  fila: number;
  fecha: string;        // YYYY-MM-DD
  centro: string;       // AG18, AG22…
  sku: string;
  descripcion: string;
  unidades: number;     // sin signo
  texto: string;
  documento: string;
  clase: string;
  destino: "inventario" | "baja";
  /** Identifica la fila para no sumarla dos veces si se importa el mismo archivo otra vez. */
  llave: string;
};

export type LecturaBaja = {
  hoja: string | null;
  filas: FilaBaja[];
  descartadas: { fila: number; motivo: string }[];
  error: string | null;
};

const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** ¿Este texto va a la columna «… con baja»? Igual que la regla de la base. */
export function destinoDeTexto(texto: string): "inventario" | "baja" {
  return /(LAVADO|EXTRASUCIO)/.test(texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase())
    ? "baja" : "inventario";
}

/** Fecha de una celda de Excel: número de serie, Date o texto (2026-09-24 · 24/09/2026). */
export function fechaDeCelda(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // xlsx con cellDates entrega la medianoche LOCAL: se lee en local para no correr un día.
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const t = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

const numero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "").trim().replace(/\s/g, "");
  if (!t) return null;
  // «-116.280» o «-116,280» (miles) frente a «-1,5» (decimal): SAP no trae decimales en UN.
  const limpio = /^-?\d{1,3}([.,]\d{3})+$/.test(t) ? t.replace(/[.,]/g, "") : t.replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
};

/**
 * `filas` = la hoja como matriz (xlsx `sheet_to_json(ws, { header: 1, raw: true })`).
 * Busca la fila de encabezados (la que tiene «Material» y «Cantidad») y lee desde ahí.
 */
export function leerBaja(filas: unknown[][], hoja: string | null = null): LecturaBaja {
  const vacio = (error: string): LecturaBaja => ({ hoja, filas: [], descartadas: [], error });
  let h = -1;
  for (let i = 0; i < Math.min(filas.length, 20); i++) {
    const c = (filas[i] ?? []).map(norm);
    if (c.includes("material") && c.includes("cantidad")) { h = i; break }
  }
  if (h < 0) return vacio("No encontré los encabezados «Material» y «Cantidad». ¿Es la hoja Baja de SAP?");

  const enc = (filas[h] ?? []).map(norm);
  const col = (...opc: ((t: string) => boolean)[]) => {
    for (const o of opc) { const i = enc.findIndex(o); if (i >= 0) return i }
    return -1;
  };
  const cFecha = col((t) => t.startsWith("fe.contab") || t === "fecha de contabilizacion", (t) => t === "fecha de entrada");
  const cAlm = col((t) => t === "almacen");
  const cDoc = col((t) => t === "documento material");
  const cSku = col((t) => t === "material");
  const cDesc = col((t) => t === "texto breve de material");
  const cCant = col((t) => t === "cantidad");
  const cUni = col((t) => t.startsWith("unidad medida"));
  const cTexto = col((t) => t.startsWith("texto cab"));
  const cClase = col((t) => t.startsWith("clase de mov"));

  const faltan = [
    cFecha < 0 && "Fe.contabilización", cAlm < 0 && "Almacén", cSku < 0 && "Material",
    cCant < 0 && "Cantidad", cTexto < 0 && "Texto cab.documento",
  ].filter(Boolean);
  if (faltan.length) return vacio(`Faltan columnas en la hoja: ${faltan.join(", ")}.`);

  const out: FilaBaja[] = [];
  const descartadas: { fila: number; motivo: string }[] = [];
  const vistas = new Map<string, number>();

  for (let i = h + 1; i < filas.length; i++) {
    const r = filas[i] ?? [];
    const sku = String(r[cSku] ?? "").trim();
    if (!sku && r.every((x) => x == null || x === "")) continue;
    const n = i + 1;
    if (!sku) { descartadas.push({ fila: n, motivo: "No trae material" }); continue }
    const cant = numero(r[cCant]);
    if (cant == null || cant === 0) { descartadas.push({ fila: n, motivo: `${sku}: la cantidad está vacía o es cero` }); continue }
    if (cant > 0) {
      descartadas.push({ fila: n, motivo: `${sku}: la cantidad es positiva (${cant}); una baja de SAP viene negativa. Revisa si es una reversa` });
      continue;
    }
    const uni = cUni >= 0 ? String(r[cUni] ?? "").trim().toUpperCase() : "UN";
    if (uni && uni !== "UN") { descartadas.push({ fila: n, motivo: `${sku}: la unidad es ${uni}, no UN` }); continue }
    const fecha = fechaDeCelda(r[cFecha]);
    if (!fecha) { descartadas.push({ fila: n, motivo: `${sku}: la fecha no se entiende` }); continue }
    const centro = String(r[cAlm] ?? "").trim().toUpperCase();
    if (!centro) { descartadas.push({ fila: n, motivo: `${sku}: no trae almacén` }); continue }

    const texto = String(r[cTexto] ?? "").trim();
    const documento = cDoc >= 0 ? String(r[cDoc] ?? "").trim() : "";
    const unidades = Math.abs(cant);
    /* LA LLAVE: documento + almacén + material + texto + cantidad + cuál de las IDÉNTICAS es. SAP deja
       «Posición» en 0 en todo el archivo y un mismo documento repite material (y hasta aparece en dos
       almacenes con textos distintos), así que sin el contador dos líneas legítimas iguales se
       tomarían por una repetida. Importar el mismo archivo otra vez da las mismas llaves. */
    const base = [documento, centro, sku, texto, unidades].join("|");
    const k = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, k);

    out.push({
      fila: n, fecha, centro, sku, descripcion: cDesc >= 0 ? String(r[cDesc] ?? "").trim() : "",
      unidades, texto, documento, clase: cClase >= 0 ? String(r[cClase] ?? "").trim() : "",
      destino: destinoDeTexto(texto), llave: `${base}|${k}`,
    });
  }
  if (!out.length && !descartadas.length) return vacio("La hoja no trae filas debajo de los encabezados.");
  return { hoja, filas: out, descartadas, error: null };
}

/** Escoge la hoja «Baja» del libro (o la primera que se lea como baja). */
export function hojaBaja(nombres: string[]): string | null {
  return nombres.find((n) => norm(n) === "baja") ?? nombres.find((n) => norm(n).startsWith("baja")) ?? null;
}
