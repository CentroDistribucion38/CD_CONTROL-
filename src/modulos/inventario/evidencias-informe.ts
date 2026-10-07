/**
 * EL CONTENIDO DEL INFORME DE EVIDENCIAS — una sola vez, para el PDF y para el Word.
 *
 * Aquí se decide QUÉ dice el informe y en qué orden (módulos claros, cada uno en hoja nueva);
 * cómo se pinta lo hace cada formato (`evidencias-pdf.ts`, `evidencias-word.ts`). Es una lista de
 * bloques sencillos: si mañana cambia una cuenta, cambia en los dos papeles a la vez.
 *
 * NO CALCULA: recibe el análisis ya hecho (`analizar`) y las gráficas ya dibujadas.
 * Es pura: se prueba sin navegador.
 */
import { TENDENCIAS, TEND, TIPOS, TIPO, diaCorto, diaTxt, lecturas, type Analisis, type Novedad, type FilaUbicacion } from "./evidencias";
import type { Imagen } from "./evidencias-graficas";

export type CeldaT = string | { x: string; fill?: string; color?: string; bold?: boolean };
export type Col = { h: string; w: number; al?: "l" | "r" | "c" };
export type Foto = { jpg: string; w: number; h: number };
export type Bloque =
  | { t: "portada"; titulo: string; sub: string; meta: string[] }
  | { t: "modulo"; n: string; titulo: string; sub?: string }
  | { t: "sub"; texto: string }
  | { t: "p"; texto: string; gris?: boolean }
  | { t: "lista"; items: string[] }
  | { t: "kpis"; items: { rotulo: string; valor: string; detalle?: string; color?: string }[] }
  | { t: "img"; img: Imagen; ancho?: number; pie?: string }
  | { t: "imgs2"; a: Imagen; b: Imagen; pieA?: string; pieB?: string }
  | { t: "tabla"; cols: Col[]; filas: CeldaT[][]; nota?: string }
  | { t: "fotos"; items: { foto: Foto; titulo: string; detalle: string }[]; nota?: string };

export type Graficas = { dias: Imagen; cobertura: Imagen; dona: Imagen; calor: Imagen; top: Imagen; tendencias: Imagen };

export type OpcionesInforme = {
  desde: string; hasta: string; tiposTxt: string; quien: string; generado: string;
  graficas: Graficas;
  /** Fotos ya bajadas y achicadas, por ruta del bucket. */
  fotos: Map<string, Foto>;
  maxFotos: number;
  maxFilasCalor: number;
  maxFilasAnexo: number;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" });
const si = (b: boolean | null) => (b == null ? "—" : b ? "Sí" : "No");
const mod = (n: Novedad) => n.ubicacion ?? "Sin ubicación";
const tiposDe = (f: FilaUbicacion) => TIPOS.filter((t) => f.tipos[t.k] > 0).map((t) => `${t.letra} ${f.tipos[t.k]}`).join(" · ");
export const periodoTxt = (desde: string, hasta: string) => (desde === hasta ? diaTxt(desde) : `${diaTxt(desde)} al ${diaTxt(hasta)}`);

export function detalleNovedad(n: Novedad): string {
  const base = [diaCorto(n.dia) + " " + hora(n.hora), n.persona ?? "—"];
  if (n.material) base.push(`${n.codigo ?? ""} ${n.material}`.trim() + (n.cajas != null ? ` · ${nf.format(n.cajas)} cj` : ""));
  if (n.tipo === "pnc") base.push(n.cumple == null ? "Política sin responder" : n.cumple ? "Cumple política" : "No cumple política");
  return base.join(" · ");
}

export function construirInforme(a: Analisis, novs: Novedad[], o: OpcionesInforme): Bloque[] {
  const B: Bloque[] = [];
  const G = o.graficas;
  const periodo = periodoTxt(o.desde, o.hasta);
  const c = a.conteoTendencia;
  const pctCumple = a.pnc.respondidos ? Math.round((a.pnc.cumplen / a.pnc.respondidos) * 100) : null;

  /* ---------- PORTADA ---------- */
  B.push({
    t: "portada", titulo: "Informe de evidencias del conteo",
    sub: `Tendencias por ubicación · ${periodo}`,
    meta: [`Periodo: ${periodo} (${a.dias.length} ${a.dias.length === 1 ? "día" : "días"})`, `Qué se cuenta como novedad: ${o.tiposTxt}`, `Generado: ${o.generado} · ${o.quien}`],
  });
  B.push({
    t: "kpis", items: [
      { rotulo: "Novedades", valor: nf.format(a.total), detalle: `${a.fotos} con foto` },
      { rotulo: "Ubicaciones afectadas", valor: nf.format(a.ubicacionesAfectadas) },
      { rotulo: "Persisten", valor: nf.format(c.persiste + c.reincide), detalle: `${c.persiste} seguidas · ${c.reincide} reinciden`, color: TEND.persiste.color },
      { rotulo: "Nuevas", valor: nf.format(c.nueva), color: TEND.nueva.color },
      { rotulo: "Ya no tienen novedad", valor: nf.format(c.ya_no), color: TEND.ya_no.color },
      { rotulo: "PNC que cumplen", valor: pctCumple == null ? "—" : `${pctCumple} %`, detalle: a.pnc.total ? `${a.pnc.cumplen} de ${a.pnc.respondidos} respondidos` : "sin PNC" },
    ],
  });
  B.push({ t: "sub", texto: "Lo que dice el periodo" });
  B.push({ t: "lista", items: lecturas(a) });
  B.push({ t: "sub", texto: "Cómo leer este informe" });
  B.push({
    t: "lista", items: [
      "Una ubicación «persiste» si tuvo novedad en el último día en que se contó y también en el día contado anterior; «reincide» si se había ido y volvió; «es nueva» si aparece por primera vez en el último día contado; «ya no» si tuvo novedad y en el último día contado salió limpia.",
      "Los días en que una ubicación NO se contó no cuentan como limpios: se muestran en gris rayado y no cambian su tendencia.",
      "Módulos del informe: 1 Tendencia por día · 2 Mapa de calor · 3 Tendencia por ubicación · 4 Dónde se concentra · 5 PNC y política de bloqueo · 6 Evidencias fotográficas · Anexo con el detalle.",
    ],
  });

  /* ---------- MÓDULO 1 · POR DÍA ---------- */
  B.push({ t: "modulo", n: "MÓDULO 1", titulo: "Tendencia por día", sub: "Cuántas novedades hubo cada día, de qué tipo, y cuántas ubicaciones se miraron." });
  B.push({ t: "img", img: G.dias, ancho: 0.8 });
  B.push({ t: "img", img: G.cobertura, ancho: 0.8 });
  B.push({
    t: "tabla", cols: [
      { h: "Día", w: 14, al: "l" }, { h: "Ubic. contadas", w: 11, al: "r" }, { h: "Ubic. con novedad", w: 12, al: "r" },
      ...TIPOS.map((t) => ({ h: t.nombre, w: 12, al: "r" as const })), { h: "Total", w: 9, al: "r" },
    ],
    filas: a.porDia.map((d) => [
      { x: diaTxt(d.dia), bold: true }, d.contadas ? nf.format(d.contadas) : { x: "no se contó", color: "#5B6B7F" }, nf.format(d.conNovedad),
      ...TIPOS.map((t) => (d.porTipo[t.k] ? nf.format(d.porTipo[t.k]) : "·")), { x: nf.format(d.total), bold: true },
    ]),
  });

  /* ---------- MÓDULO 2 · MAPA DE CALOR ---------- */
  B.push({ t: "modulo", n: "MÓDULO 2", titulo: "Mapa de calor: ubicación × día", sub: "Cada fila es una ubicación con novedad; cada columna, un día. Ayer sí, hoy no, hoy sí otra vez: se ve de un vistazo." });
  B.push({ t: "img", img: G.calor });
  if (a.filas.length > o.maxFilasCalor) B.push({ t: "p", texto: `Se muestran las ${o.maxFilasCalor} ubicaciones más críticas de ${a.filas.length}. El resto está en el anexo.`, gris: true });

  /* ---------- MÓDULO 3 · TENDENCIA POR UBICACIÓN ---------- */
  B.push({ t: "modulo", n: "MÓDULO 3", titulo: "Tendencia por ubicación", sub: "En qué va cada ubicación: si la novedad persiste, volvió, es nueva o ya se resolvió." });
  B.push({ t: "img", img: G.tendencias, ancho: 0.42 });
  B.push({ t: "lista", items: TENDENCIAS.map((t) => `${t.nombre}: ${t.frase}.`) });
  B.push({
    t: "tabla", cols: [
      { h: "Ubicación", w: 12, al: "l" }, { h: "Tendencia", w: 12, al: "l" }, { h: "Días con novedad", w: 10, al: "r" }, { h: "Seguidos hasta hoy", w: 11, al: "r" },
      { h: "Qué tipos", w: 24, al: "l" }, { h: "Último día contado", w: 13, al: "l" }, { h: "Total", w: 8, al: "r" },
    ],
    filas: a.filas.map((f) => [
      { x: f.clave, bold: true }, { x: TEND[f.tendencia].nombre, fill: suave(TEND[f.tendencia].color), color: "#12263A", bold: true },
      nf.format(f.diasConNovedad), f.tendencia === "ya_no" ? "0" : nf.format(f.racha), tiposDe(f), f.ultimoVisto ? diaTxt(f.ultimoVisto) : "—", { x: nf.format(f.total), bold: true },
    ]),
    nota: a.filas.length ? undefined : "Sin novedades en el periodo.",
  });

  /* ---------- MÓDULO 4 · DÓNDE SE CONCENTRA ---------- */
  B.push({ t: "modulo", n: "MÓDULO 4", titulo: "Dónde se concentra", sub: "Las ubicaciones y los módulos con más novedades en el periodo." });
  B.push({ t: "imgs2", a: G.dona, b: G.top, pieA: "Proporción por tipo de novedad", pieB: "Ubicaciones con más novedades" });
  B.push({
    t: "tabla", cols: [{ h: "Módulo (calle + número)", w: 30, al: "l" }, { h: "Ubicaciones afectadas", w: 20, al: "r" }, { h: "Novedades", w: 14, al: "r" }],
    filas: a.modulos.slice(0, 10).map((m) => [{ x: m.modulo, bold: true }, nf.format(m.ubicaciones), { x: nf.format(m.total), bold: true }]),
  });
  if (a.personas.length) {
    B.push({ t: "sub", texto: "Quién las anotó" });
    B.push({ t: "tabla", cols: [{ h: "Persona", w: 30, al: "l" }, { h: "Novedades anotadas", w: 20, al: "r" }], filas: a.personas.slice(0, 8).map((p) => [{ x: p.persona, bold: true }, nf.format(p.total)]) });
  }

  /* ---------- MÓDULO 5 · PNC ---------- */
  const pnc = novs.filter((n) => n.tipo === "pnc");
  B.push({ t: "modulo", n: "MÓDULO 5", titulo: "PNC y política de bloqueo", sub: "Para cada PNC: ¿tiene rótulo? ¿tiene bloqueo mecánico? Cumple la política si tiene los dos." });
  B.push({
    t: "kpis", items: [
      { rotulo: "PNC encontrados", valor: nf.format(a.pnc.total) },
      { rotulo: "Cumplen la política", valor: nf.format(a.pnc.cumplen), color: TEND.ya_no.color },
      { rotulo: "No cumplen", valor: nf.format(a.pnc.noCumplen), color: TEND.persiste.color },
      { rotulo: "Sin rótulo", valor: nf.format(a.pnc.sinRotulo) },
      { rotulo: "Sin bloqueo mecánico", valor: nf.format(a.pnc.sinBloqueo) },
      { rotulo: "Sin responder", valor: nf.format(a.pnc.sinRespuesta), detalle: "renglones anteriores a la pregunta" },
    ],
  });
  B.push({
    t: "tabla", cols: [
      { h: "Día", w: 10, al: "l" }, { h: "Ubicación", w: 10, al: "l" }, { h: "Material", w: 30, al: "l" }, { h: "Cajas", w: 7, al: "r" },
      { h: "Rótulo", w: 8, al: "c" }, { h: "Bloqueo mecánico", w: 11, al: "c" }, { h: "¿Cumple?", w: 10, al: "c" }, { h: "Persona", w: 14, al: "l" },
    ],
    filas: pnc.map((n) => [
      diaCorto(n.dia), { x: mod(n), bold: true }, `${n.codigo ?? ""} ${n.material ?? ""}`.trim() || "—", n.cajas != null ? nf.format(n.cajas) : "—",
      si(n.pnc_rotulo), si(n.pnc_bloqueo_mecanico),
      n.cumple == null ? { x: "Sin responder", color: "#5B6B7F" } : n.cumple ? { x: "Cumple", fill: "#D9EBDD", bold: true } : { x: "No cumple", fill: "#F6C65B", bold: true },
      n.persona ?? "—",
    ]),
    nota: pnc.length ? undefined : "No hubo PNC en el periodo (o no se escogió ese tipo).",
  });

  /* ---------- MÓDULO 6 · FOTOS ---------- */
  B.push({ t: "modulo", n: "MÓDULO 6", titulo: "Evidencias fotográficas", sub: "Una foto por novedad, en miniatura: ubicación, tipo, material, día, hora y quién la anotó." });
  const conFoto = novs.filter((n) => n.ruta && o.fotos.has(n.ruta)).sort((x, y) => y.dia.localeCompare(x.dia) || orden(mod(x), mod(y)));
  const unicas: Novedad[] = []; const vistas = new Set<string>();
  for (const n of conFoto) { const k = n.ruta + "|" + n.tipo; if (vistas.has(k)) continue; vistas.add(k); unicas.push(n) }
  const lasFotos = unicas.slice(0, o.maxFotos);
  const totalConRuta = new Set(novs.filter((n) => n.ruta).map((n) => n.ruta + "|" + n.tipo)).size;
  /* Dos motivos distintos para que falte una foto: no se bajó (sin señal, borrada) o se recortó por el tope. */
  const noBajaron = totalConRuta - new Set(conFoto.map((n) => n.ruta + "|" + n.tipo)).size;
  const recortadas = unicas.length - lasFotos.length;
  const notas = [
    recortadas > 0 ? `Se muestran ${lasFotos.length} fotos (las más recientes); ${recortadas} más están en la pantalla de Evidencias.` : "",
    noBajaron > 0 ? `${noBajaron} ${noBajaron === 1 ? "foto no se pudo bajar" : "fotos no se pudieron bajar"} al armar el informe (sin señal o ya no están).` : "",
  ].filter(Boolean).join(" ");
  if (lasFotos.length) {
    B.push({
      t: "fotos", items: lasFotos.map((n) => ({ foto: o.fotos.get(n.ruta!)!, titulo: `${mod(n)} · ${TIPO[n.tipo].nombre}`, detalle: detalleNovedad(n) })),
      nota: notas || undefined,
    });
  } else {
    B.push({ t: "p", texto: totalConRuta ? "Las fotos no se pudieron bajar en este momento. Vuelve a generar el informe con señal." : "En el periodo no hay novedades con foto.", gris: true });
  }

  /* ---------- ANEXO ---------- */
  B.push({ t: "modulo", n: "ANEXO", titulo: "Detalle de todas las novedades", sub: "Una fila por novedad, ordenadas por día y ubicación." });
  const lista = novs.slice(0, o.maxFilasAnexo);
  B.push({
    t: "tabla", cols: [
      { h: "Día", w: 8, al: "l" }, { h: "Hora", w: 6, al: "l" }, { h: "Ubicación", w: 9, al: "l" }, { h: "Tipo", w: 12, al: "l" }, { h: "Material", w: 30, al: "l" },
      { h: "Cajas", w: 6, al: "r" }, { h: "Persona", w: 13, al: "l" }, { h: "Conteo", w: 11, al: "l" }, { h: "Foto", w: 5, al: "c" },
    ],
    filas: lista.map((n) => [
      diaCorto(n.dia), hora(n.hora), { x: mod(n), bold: true }, { x: TIPO[n.tipo].nombre, fill: suave(TIPO[n.tipo].color) },
      `${n.codigo ?? ""} ${n.material ?? ""}`.trim() || "—", n.cajas != null ? nf.format(n.cajas) : "—", n.persona ?? "—", n.conteo, n.ruta ? "Sí" : "·",
    ]),
    nota: novs.length > lista.length ? `Se muestran las primeras ${lista.length} de ${novs.length} novedades. Acota el periodo para ver el resto.` : undefined,
  });
  return B;
}

const orden = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
/** Un color mezclado con blanco (para fondos de celda que dejen leer el texto): «#D9822B» → «#F7E6D5». */
export function suave(hex: string, k = 0.2): string {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return "#" + v.map((c) => Math.round(255 - (255 - c) * k).toString(16).padStart(2, "0")).join("").toUpperCase();
}
