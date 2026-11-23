/**
 * PLAN VS NOTIFICADO — las cuentas, sin base ni pantalla (se prueban con los archivos reales).
 *
 *  · El día se valida por FECHA DE CONTABILIZACIÓN: la noche se notifica de madrugada (01:00–05:00 del día
 *    siguiente) con la fecha del día anterior. Por eso un día está ABIERTO hasta que la MB51 traiga algo
 *    digitado después de las 06:00 del día siguiente.
 *  · Notificado = Z01 − Z02 del producto (material con «P» al final = el semielaborado de la orden).
 *  · Envase (solo retornables): la botella va 1 a 1 con lo producido y la caja es unidades ÷ unidades por caja.
 *    Consumo = −(261 + 262) de la orden; lo que llegó a AG28 = 531 + 532.
 *  · Corte de inventario: la existencia que se baja a las 06:00 solo tiene lo DIGITADO antes de las 06:00.
 *    Lo contabilizado antes del día del corte pero digitado después son las partidas.
 */

export type Plan = { id: string; anio: number; semana: number; generado: string; archivo: string | null; desde: string; hasta: string; lunes: string; total_hl: number;
  /** Escogido a mano en Cargar: «inicial» o «corte». Vacío = automático. */ papel?: string | null };
export type FilaPlanBD = { plan_id: string; fecha: string; tren: string; hora: number; sku: string | null; nombre: string | null; formato_ml: number | null; referencia: number | null; hl: number; unidades: number | null };
export type Mov = { fecha_contab: string; fecha_entrada: string; hora_entrada: string; almacen: string; clase: string; material: string; texto: string; documento: string | null; cantidad: number; um: string | null; orden: string | null };
export type Prod = { sku: string; nombre: string | null; contenido: number | null; unidades_por_caja: number | null; cajas_por_estiba: number | null };
export type Unidad = "hl" | "un" | "cajas" | "estibas";

export const masDias = (f: string, n: number) => new Date(Date.parse(f + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const entrada = (m: Pick<Mov, "fecha_entrada" | "hora_entrada">) => `${m.fecha_entrada}T${m.hora_entrada.slice(0, 8)}`;
const esCaja = (t: string) => /caja/i.test(t);
const skuDe = (material: string) => material.replace(/P$/i, "");
const ES_Z = new Set(["Z01", "Z02"]);
const CONSUMO = new Set(["261", "262"]);
const LLEGA = new Set(["531", "532"]);

/** Qué planes mandan en la semana: el INICIAL (el primero que cubre desde el lunes) y los CORTES (los demás). */
export function papeles(planes: Plan[]) {
  const orden = [...planes].sort((a, b) => a.generado.localeCompare(b.generado));
  /* Si en Cargar se escogió a mano cuál es el plan inicial, manda ese; si no, el primero generado que cubre desde el lunes
     (y que no se marcó como corte). */
  const inicial = orden.filter((p) => p.papel === "inicial").pop() ?? orden.find((p) => p.papel !== "corte" && p.desde <= p.lunes) ?? null;
  const cortes = orden.filter((p) => p !== inicial);
  /** El corte que manda para un día: el último generado que cubre ese día. */
  const corteDe = (dia: string) => [...cortes].reverse().find((p) => p.desde <= dia && dia <= p.hasta) ?? null;
  return { inicial, cortes, ultimo: cortes[cortes.length - 1] ?? null, corteDe };
}

/** Datos de cada SKU para pasar unidades a HL, cajas y estibas. */
export function maestro(filasPlan: FilaPlanBD[], prods: Prod[]) {
  const m = new Map<string, { nombre: string; ml: number; ref: number; cpe: number }>();
  for (const p of prods) {
    const ml = p.contenido ? (p.contenido < 10 ? p.contenido * 1000 : p.contenido) : 0;
    m.set(p.sku, { nombre: p.nombre ?? "", ml, ref: Number(p.unidades_por_caja) || 0, cpe: Number(p.cajas_por_estiba) || 0 });
  }
  for (const f of filasPlan) {
    if (!f.sku) continue;
    const x = m.get(f.sku) ?? { nombre: "", ml: 0, ref: 0, cpe: 0 };
    m.set(f.sku, { nombre: f.nombre || x.nombre, ml: Number(f.formato_ml) || x.ml, ref: Number(f.referencia) || x.ref, cpe: x.cpe });
  }
  return m;
}
export type Maestro = ReturnType<typeof maestro>;

export function convertir(un: number, sku: string, u: Unidad, M: Maestro): number | null {
  const x = M.get(sku);
  if (u === "un") return un;
  if (u === "hl") return x?.ml ? (un * x.ml) / 1e5 : null;
  if (u === "cajas") return x?.ref ? un / x.ref : null;
  return x?.ref && x.cpe ? un / x.ref / x.cpe : null;
}

/* ------------------------------------------------------------------ ESTADO DEL DÍA */

/** Cerrado si la MB51 ya trae algo digitado desde las 06:00 del día siguiente. */
export function estadoDia(dia: string, ultimaEntrada: string | null, hoy: string): "cerrado" | "abierto" | "sin" | "futuro" {
  if (dia > hoy) return "futuro";
  if (!ultimaEntrada || ultimaEntrada < `${dia}T00:00:00`) return "sin";
  return ultimaEntrada >= `${masDias(dia, 1)}T06:00:00` ? "cerrado" : "abierto";
}

/* ------------------------------------------------------------------ VALIDACIÓN DEL DÍA */

export type Orden = {
  orden: string; sku: string; z: number; madrugada: number;
  b261: number; b531: number; c261: number; c531: number; botella: string | null; caja: string | null;
};
export type FilaDia = {
  sku: string; nombre: string; planIni: number; planCorte: number | null; notif: number; madrugada: number;
  retornable: boolean; ref: number;
  botTeo: number; b261: number; b531: number; cajaTeo: number; c261: number; c531: number;
  ordenes: Orden[];
};
export type Alerta = { tipo: "falta261" | "caja" | "perdida" | "plan"; sku: string; orden?: string; un: number; texto: string };

/**
 * @param movs movimientos con fecha de contabilización = dia (y los de las semanas anteriores, para saber qué SKU
 *             son retornables: los que alguna vez movieron botella con 261/531).
 */
export function validarDia(dia: string, filasIni: FilaPlanBD[], filasCorte: FilaPlanBD[] | null, movs: Mov[], M: Maestro, tolCaja = 0.001) {
  const ret = new Set<string>();
  const skuOrden = new Map<string, string>();
  for (const m of movs) if (m.orden && ES_Z.has(m.clase)) skuOrden.set(m.orden, skuDe(m.material));
  for (const m of movs) if (m.orden && (CONSUMO.has(m.clase) || LLEGA.has(m.clase)) && !esCaja(m.texto) && skuOrden.has(m.orden)) ret.add(skuOrden.get(m.orden)!);

  const F = new Map<string, FilaDia>();
  const fila = (sku: string) => {
    let f = F.get(sku);
    if (!f) {
      f = { sku, nombre: M.get(sku)?.nombre ?? "", planIni: 0, planCorte: filasCorte ? 0 : null, notif: 0, madrugada: 0,
            retornable: ret.has(sku), ref: M.get(sku)?.ref ?? 0, botTeo: 0, b261: 0, b531: 0, cajaTeo: 0, c261: 0, c531: 0, ordenes: [] };
      F.set(sku, f);
    }
    return f;
  };
  const un = (r: FilaPlanBD) => Number(r.unidades) || (r.formato_ml ? (r.hl * 1e5) / Number(r.formato_ml) : 0);
  for (const r of filasIni) if (r.fecha === dia && r.sku) fila(r.sku).planIni += un(r);
  if (filasCorte) for (const r of filasCorte) if (r.fecha === dia && r.sku) { const f = fila(r.sku); f.planCorte = (f.planCorte ?? 0) + un(r) }

  const O = new Map<string, Orden>();
  const ord = (o: string, sku: string) => {
    let x = O.get(o);
    if (!x) { x = { orden: o, sku, z: 0, madrugada: 0, b261: 0, b531: 0, c261: 0, c531: 0, botella: null, caja: null }; O.set(o, x) }
    return x;
  };
  for (const m of movs) {
    if (m.fecha_contab !== dia) continue;
    if (ES_Z.has(m.clase) && /P$/i.test(m.material)) {
      const sku = skuDe(m.material), q = m.clase === "Z02" ? -Math.abs(m.cantidad) : m.cantidad;
      const f = fila(sku); f.notif += q;
      const tarde = m.fecha_entrada > dia;
      if (tarde) f.madrugada += q;
      if (m.orden) { const o = ord(m.orden, sku); o.z += q; if (tarde) o.madrugada += q }
    }
  }
  for (const m of movs) {
    if (m.fecha_contab !== dia || !m.orden || !(CONSUMO.has(m.clase) || LLEGA.has(m.clase))) continue;
    const sku = skuOrden.get(m.orden); if (!sku) continue;
    const o = ord(m.orden, sku), caja = esCaja(m.texto);
    if (CONSUMO.has(m.clase)) { if (caja) { o.c261 -= m.cantidad; o.caja = m.material } else { o.b261 -= m.cantidad; o.botella = m.material } }
    else { if (caja) { o.c531 += m.cantidad; o.caja = m.material } else { o.b531 += m.cantidad; o.botella = m.material } }
  }
  for (const o of O.values()) {
    const f = fila(o.sku);
    f.ordenes.push(o);
    if (f.retornable) {
      f.botTeo += o.z; f.b261 += o.b261; f.b531 += o.b531;
      f.cajaTeo += f.ref ? o.z / f.ref : 0; f.c261 += o.c261; f.c531 += o.c531;
    }
  }

  const alertas: Alerta[] = [];
  for (const f of F.values()) {
    f.ordenes.sort((a, b) => b.z - a.z);
    if (f.retornable) for (const o of f.ordenes) {
      const falta = o.z - o.b261;
      if (o.z > 0 && falta > 0.5) alertas.push({ tipo: "falta261", sku: f.sku, orden: o.orden, un: falta,
        texto: o.b531 > 0 ? "Tiene Z01 y 531, pero falta el 261 de la botella: entró a AG28 sin salir de AG22." : "Tiene Z01 y no tiene el 261 de la botella." });
      const teo = f.ref ? o.z / f.ref : 0, dc = o.c261 - teo;
      if (teo > 0 && dc > Math.max(1, teo * tolCaja)) alertas.push({ tipo: "caja", sku: f.sku, orden: o.orden, un: dc,
        texto: `Se consumieron ${Math.round(dc).toLocaleString("es-CO")} cajas más que Z01 ÷ ${f.ref} (${((100 * dc) / teo).toFixed(1).replace(".", ",")} %).` });
      const pb = o.b261 - o.b531, pc = o.c261 - o.c531;
      if (o.b261 > 0 && Math.abs(pb) > 0.5) alertas.push({ tipo: "perdida", sku: f.sku, orden: o.orden, un: pb, texto: `Botella: salió ${o.b261.toLocaleString("es-CO")} de AG22 y llegó ${o.b531.toLocaleString("es-CO")} a AG28.` });
      if (o.c261 > 0 && Math.abs(pc) > 0.5) alertas.push({ tipo: "perdida", sku: f.sku, orden: o.orden, un: pc, texto: `Caja: salió ${o.c261.toLocaleString("es-CO")} de AG22 y llegó ${o.c531.toLocaleString("es-CO")} a AG28.` });
    }
    if (f.planIni > 0 && f.notif < f.planIni * 0.9) alertas.push({ tipo: "plan", sku: f.sku, un: f.planIni - f.notif,
      texto: `Notificado ${Math.round((100 * f.notif) / f.planIni)} % del plan del día.` });
  }
  const orden = { falta261: 0, perdida: 1, caja: 2, plan: 3 } as const;
  alertas.sort((a, b) => orden[a.tipo] - orden[b.tipo] || b.un - a.un);
  const filas = [...F.values()].sort((a, b) => b.planIni - a.planIni || b.notif - a.notif);
  return { filas, alertas };
}

/* ------------------------------------------------------------------ CORTE DE INVENTARIO */

export type Partida = Mov & { entrada: string };
/**
 * @param corte  "aaaa-mm-ddThh:mm" (la hora del conteo)
 * @param movs   todo lo digitado desde el día del corte en adelante
 * @param ventanaMin  cuánto después del corte se considera «para decidir» si es del mismo día
 */
export function partidasCorte(corte: string, movs: Mov[], ventanaMin = 60) {
  const c = corte.length === 16 ? corte + ":00" : corte;
  const dia = c.slice(0, 10);
  const lim = new Date(Date.parse(c + "Z") + ventanaMin * 6e4).toISOString().slice(0, 19);
  const seguras: Partida[] = [], dudosas: Partida[] = [];
  let ultima = "";
  for (const m of movs) {
    const e = entrada(m);
    if (e > ultima) ultima = e;
    if (e <= c) continue;
    if (m.fecha_contab < dia) seguras.push({ ...m, entrada: e });
    else if (m.fecha_contab === dia && e <= lim) dudosas.push({ ...m, entrada: e });
  }
  seguras.sort((a, b) => a.entrada.localeCompare(b.entrada));
  dudosas.sort((a, b) => a.entrada.localeCompare(b.entrada));
  return { seguras, dudosas, ultima: ultima || null, alcanza: ultima > c };
}

/** Suma por almacén y material (el efecto en la existencia de ese almacén). */
export function porMaterial(ps: Partida[]) {
  const m = new Map<string, { almacen: string; material: string; texto: string; um: string; q: number; clases: Set<string>; docs: number }>();
  for (const p of ps) {
    const k = `${p.almacen}|${p.material}`;
    const x = m.get(k) ?? { almacen: p.almacen, material: p.material, texto: p.texto, um: p.um ?? "", q: 0, clases: new Set<string>(), docs: 0 };
    x.q += p.cantidad; x.clases.add(p.clase); x.docs++;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => a.almacen.localeCompare(b.almacen) || a.material.localeCompare(b.material));
}

/* ------------------------------------------------------------------ PARA EL ANÁLISIS DE DIFERENCIA */

export type FilaNotif = {
  tipo: "PENDIENTE POR NOTIFICAR" | "NOTIFICACION"; lado: "CONTEO" | "SAP";
  codigo: string; texto: string; unidades: number; documento: string; porque: string;
};
const dm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/**
 * LAS NOTIFICACIONES DEL ANÁLISIS DE DIFERENCIA, sacadas de la MB51, para un conteo a cierta hora (06:00).
 * El análisis compara el conteo contra la ZEXI de esa hora, que solo tiene lo DIGITADO hasta esa hora. En el almacén
 * del envase vacío (AG22) eso deja dos partidas, con los nombres de la plantilla:
 *
 *  PENDIENTE POR NOTIFICAR (suma al CONTEO): envase que físicamente ya se consumió y SAP todavía tenía a esa hora.
 *    · el 261 de una orden contabilizada antes del día del conteo pero digitado después de la hora del conteo;
 *    · el 261 que nunca apareció: orden con Z01 en los últimos días y menos botella (o caja) consumida de la que produjo.
 *  NOTIFICACION (suma a SAP): envase que SAP ya había sacado y físicamente seguía ahí: el 262 (reverso) digitado
 *    después de la hora del conteo, de algo contabilizado antes.
 *
 * Todo en unidades (botellas, cajas) y positivo, como se escribe en la plantilla. Los 311 no entran: ya van en el BALANCE.
 * @param upcDe unidades por caja de un envase (para la caja teórica de cada orden)
 */
export function notificacionesAlCorte(dia: string, hora: string, movs: Mov[], upcDe: (material: string) => number, almacen = "AG22", diasAtras = 7) {
  const corte = `${dia}T${hora.length === 5 ? hora + ":00" : hora}`;
  const desde = masDias(dia, -diasAtras);
  const filas = new Map<string, FilaNotif>();
  const poner = (f: FilaNotif) => {
    const k = `${f.tipo}|${f.codigo}|${f.documento}`;
    const x = filas.get(k);
    if (x) { x.unidades += f.unidades; if (!x.porque.includes(f.porque)) x.porque += ` · ${f.porque}` } else filas.set(k, { ...f });
  };
  let ultima = "";
  for (const m of movs) { const e = entrada(m); if (e > ultima) ultima = e }

  /* (a) 261 / 262 del almacén digitados después del corte, contabilizados antes del día. */
  for (const m of movs) {
    if (m.almacen !== almacen || !CONSUMO.has(m.clase)) continue;
    const e = entrada(m);
    if (e <= corte || m.fecha_contab >= dia || !m.cantidad) continue;
    const doc = m.orden || m.documento || "";
    const cuando = `${m.clase} digitado ${dm(e.slice(0, 10))} ${e.slice(11, 16)}, contabilizado ${dm(m.fecha_contab)}`;
    if (m.cantidad < 0) poner({ tipo: "PENDIENTE POR NOTIFICAR", lado: "CONTEO", codigo: m.material, texto: m.texto, unidades: -m.cantidad, documento: doc,
      porque: `${cuando}: a las ${hora} SAP todavía lo tenía` });
    else poner({ tipo: "NOTIFICACION", lado: "SAP", codigo: m.material, texto: m.texto, unidades: m.cantidad, documento: doc,
      porque: `${cuando}: a las ${hora} SAP ya lo había sacado` });
  }

  /* (b) Órdenes con Z01 de los últimos días a las que les falta 261 (en cualquier momento, no solo después del corte). */
  type O = { sku: string; z: number; fc: string; bot: Map<string, number>; caja: Map<string, number> };
  const O = new Map<string, O>();
  const botSku = new Map<string, string>(), cajaSku = new Map<string, string>(), textos = new Map<string, string>();
  for (const m of movs) {
    if (!m.orden) continue;
    if (ES_Z.has(m.clase) && /P$/i.test(m.material)) {
      const o = O.get(m.orden) ?? { sku: skuDe(m.material), z: 0, fc: m.fecha_contab, bot: new Map(), caja: new Map() };
      o.z += m.clase === "Z02" ? -Math.abs(m.cantidad) : m.cantidad;
      if (m.clase === "Z01" && m.fecha_contab > o.fc) o.fc = m.fecha_contab;
      O.set(m.orden, o);
    }
  }
  for (const m of movs) {
    if (!m.orden || !(CONSUMO.has(m.clase) || LLEGA.has(m.clase))) continue;
    const o = O.get(m.orden); if (!o) continue;
    const caja = esCaja(m.texto), mapa = caja ? o.caja : o.bot;
    textos.set(m.material, m.texto);
    (caja ? cajaSku : botSku).set(o.sku, m.material);
    if (!mapa.has(m.material)) mapa.set(m.material, 0);
    if (CONSUMO.has(m.clase) && m.almacen === almacen) mapa.set(m.material, mapa.get(m.material)! - m.cantidad);
  }
  for (const [orden, o] of O) {
    if (o.fc < desde || o.fc >= dia || o.z <= 0) continue;
    const bot = [...o.bot.keys()][0] ?? botSku.get(o.sku);
    if (!bot) continue;                                     // no retornable: no lleva envase
    const caja = [...o.caja.keys()][0] ?? cajaSku.get(o.sku);
    const upc = upcDe(bot) || 0;
    const pendientes: [string, number, number][] = [[bot, o.z, o.bot.get(bot) ?? 0]];
    if (caja && upc > 1) pendientes.push([caja, Math.round(o.z / upc), o.caja.get(caja) ?? 0]);
    for (const [mat, teo, usado] of pendientes) {
      const falta = teo - usado;
      if (falta > Math.max(1, teo * 0.001)) poner({ tipo: "PENDIENTE POR NOTIFICAR", lado: "CONTEO", codigo: mat, texto: textos.get(mat) ?? "", unidades: Math.round(falta), documento: orden,
        porque: usado ? `Orden ${orden} (SKU ${o.sku}, Z01 del ${dm(o.fc)}): produjo ${Math.round(teo).toLocaleString("es-CO")} y solo tiene 261 de ${Math.round(usado).toLocaleString("es-CO")}`
                      : `Orden ${orden} (SKU ${o.sku}, Z01 del ${dm(o.fc)}): no tiene el 261` });
    }
  }
  const lista = [...filas.values()].map((f) => ({ ...f, unidades: Math.round(f.unidades) })).filter((f) => f.unidades > 0)
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.codigo.localeCompare(b.codigo) || b.unidades - a.unidades);
  return { filas: lista, ultima: ultima || null, alcanza: ultima > corte };
}
