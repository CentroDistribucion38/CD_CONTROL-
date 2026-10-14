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
import { TENDENCIAS, TEND, TIPOS, TIPO, diaCorto, diaTxt, hlTxt, lecturas, unTxt, type Analisis, type Novedad, type FilaUbicacion } from "./evidencias";
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
  | { t: "tabla"; cols: Col[]; filas: CeldaT[][]; nota?: string; compacta?: boolean }
  | { t: "fotos"; items: { foto: Foto; titulo: string; detalle: string }[]; nota?: string };

export type Graficas = { dias: Imagen; cobertura: Imagen; dona: Imagen; top: Imagen; tendencias: Imagen };

export type OpcionesInforme = {
  desde: string; hasta: string; tiposTxt: string; quien: string; generado: string;
  /** Los tipos escogidos (sin PNC escogido, el informe no habla de PNC). Vacío = todos. */
  tipos?: string[];
  graficas: Graficas;
  /** Fotos ya bajadas y achicadas, por ruta del bucket. */
  fotos: Map<string, Foto>;
  maxFotos: number;
  maxFilasAnexo: number;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" });
const si = (b: boolean | null) => (b == null ? "—" : b ? "Sí" : "No");
const mod = (n: Novedad) => n.ubicacion ?? "Sin ubicación";
const tiposDe = (f: FilaUbicacion) => TIPOS.filter((t) => f.tipos[t.k] > 0).map((t) => `${t.letra} ${f.tipos[t.k]}`).join(" · ");
export const periodoTxt = (desde: string, hasta: string) => (desde === hasta ? diaTxt(desde) : `${diaTxt(desde)} al ${diaTxt(hasta)}`);

/** El detalle de una novedad. En la pantalla dice quién la anotó; en el PDF y el Word NO (`conPersona` = false):
 *  «no voy a perjudicar a las personas». */
export function detalleNovedad(n: Novedad, conPersona = true): string {
  const base = [diaCorto(n.dia) + " " + hora(n.hora)];
  if (conPersona) base.push(n.persona ?? "—");
  if (n.material) base.push(`${n.codigo ?? ""} ${n.material}`.trim() + (n.cajas != null ? ` · ${nf.format(n.cajas)} cj · ${unTxt(n.unidades)} un · ${hlTxt(n.hl)} hl` : ""));
  if (n.tipo === "pnc") base.push(n.cumple == null ? "Política sin responder" : n.cumple ? "Cumple política" : "No cumple política");
  return base.join(" · ");
}

/** «30 de septiembre de 2026, martes»: la fecha larga para el relato. */
const fechaLarga = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const NOMBRES: Record<string, [string, string]> = {
  averia: ["avería", "averías"], pnc: ["PNC", "PNC"], mezclado: ["módulo mezclado", "módulos mezclados"], sin_acceso: ["módulo sin acceso", "módulos sin acceso"],
};
const plural = (n: number, uno: string, varios: string) => `${nf.format(n)} ${n === 1 ? uno : varios}`;

/**
 * LA REDACCIÓN DEL DÍA: «que sea una redacción como si yo lo estuviese escribiendo, con todas las novedades
 * reportadas». Por cada día (el más reciente primero): un párrafo de entrada y uno por tipo de novedad con TODAS
 * las ubicaciones —y en avería y PNC, el material y las cajas—. En primera persona del plural, sin nombres.
 */
function redaccion(a: Analisis, novs: Novedad[]): Bloque[] {
  const out: Bloque[] = [];
  const y = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
  const porUbic = (xs: Novedad[]) => {
    const m = new Map<string, Novedad[]>();
    for (const n of xs) (m.get(mod(n)) ?? m.set(mod(n), []).get(mod(n))!).push(n);
    return [...m].sort(([p], [q]) => orden(p, q));
  };
  const ultimo = a.porDia.length ? a.porDia[a.porDia.length - 1].dia : null;
  for (const d of [...a.porDia].reverse()) {
    if (!d.contadas && !d.total) continue;
    const fecha = fechaLarga(d.dia);
    out.push({ t: "sub", texto: fecha.replace(/^./, (c) => c.toUpperCase()) });
    if (!d.total) {
      out.push({ t: "p", texto: `El ${fecha} realizamos el conteo de ${plural(d.contadas, "ubicación", "ubicaciones")} y no evidenciamos ninguna novedad.` });
      continue;
    }
    const delDia = novs.filter((n) => n.dia === d.dia);
    const resumen = TIPOS.filter((t) => d.porTipo[t.k] > 0).map((t) => plural(d.porTipo[t.k], ...(NOMBRES[t.k] ?? [t.nombre, t.nombre])));
    out.push({ t: "p", texto: `El ${fecha} realizamos el conteo de ${plural(d.contadas, "ubicación", "ubicaciones")}. Durante el recorrido evidenciamos ${plural(d.total, "novedad", "novedades")} en ${plural(d.conNovedad, "ubicación", "ubicaciones")}: ${y(resumen)}. Las relaciono a continuación.` });
    /* «Organiza esto, que es un desastre»: por tipo, UNA frase y, en avería y PNC, una TABLA con el detalle
       (ubicación · código · material · cajas · hl), no un párrafo corrido. */
    for (const t of TIPOS) {
      const xs = delDia.filter((n) => n.tipo === t.k).sort((p, q) => orden(mod(p), mod(q)) || (p.codigo ?? "").localeCompare(q.codigo ?? ""));
      if (!xs.length) continue;
      const grupos = porUbic(xs);
      const cajas = xs.reduce((s, n) => s + (n.cajas ?? 0), 0), hl = xs.reduce((s, n) => s + (n.hl ?? 0), 0);
      const cj = (n: Novedad) => (n.cajas ? nf.format(n.cajas) : "—");
      if (t.k === "averia" || t.k === "pnc") {
        const esPnc = t.k === "pnc";
        out.push({ t: "p", texto: esPnc
          ? `PNC: reportamos ${plural(xs.length, "producto no conforme", "productos no conformes")} en ${plural(grupos.length, "ubicación", "ubicaciones")}${cajas ? `, ${plural(cajas, "caja", "cajas")} (${hlTxt(hl)} hl)` : ""}. ${xs.filter((n) => n.cumple === false).length ? `${plural(xs.filter((n) => n.cumple === false).length, "no cumple", "no cumplen")} la política de bloqueo.` : ""}`.trim()
          : `Averías: encontramos ${plural(xs.length, "avería", "averías")} en ${plural(grupos.length, "ubicación", "ubicaciones")}${cajas ? `, que suman ${plural(cajas, "caja", "cajas")} (${hlTxt(hl)} hl)` : ""}. Este es el detalle:` });
        out.push({
          t: "tabla", compacta: true,
          cols: esPnc
            ? [{ h: "Ubicación", w: 12, al: "l" }, { h: "Código", w: 9, al: "l" }, { h: "Material", w: 34, al: "l" }, { h: "Cajas", w: 8, al: "r" }, { h: "Rótulo", w: 8, al: "c" }, { h: "Bloqueo", w: 8, al: "c" }, { h: "¿Cumple?", w: 10, al: "c" }]
            : [{ h: "Ubicación", w: 13, al: "l" }, { h: "Código", w: 10, al: "l" }, { h: "Material", w: 45, al: "l" }, { h: "Cajas", w: 9, al: "r" }, { h: "Hl", w: 8, al: "r" }],
          filas: xs.map((n) => esPnc
            ? [{ x: mod(n), bold: true }, n.codigo ?? "—", n.material ?? "—", cj(n), si(n.pnc_rotulo), si(n.pnc_bloqueo_mecanico),
               n.cumple == null ? { x: "Sin responder", color: "#5B6B7F" } : n.cumple ? { x: "Cumple", fill: "#CFE0F5", bold: true } : { x: "No cumple", fill: "#F9C6CF", bold: true }]
            : [{ x: mod(n), bold: true }, n.codigo ?? "—", n.material ?? "—", cj(n), n.hl ? hlTxt(n.hl) : "—"])
            .concat(xs.length > 1 && cajas ? [esPnc
              ? [{ x: "Total", bold: true }, "", "", { x: nf.format(cajas), bold: true }, "", "", ""]
              : [{ x: "Total", bold: true }, "", "", { x: nf.format(cajas), bold: true }, { x: hlTxt(hl), bold: true }]] : []),
        });
      } else if (t.k === "mezclado") {
        out.push({ t: "p", texto: `Módulos mezclados: encontramos producto mezclado en ${plural(grupos.length, "ubicación", "ubicaciones")}: ${y(grupos.map(([u]) => u))}.` });
      } else if (t.k === "sin_acceso") {
        out.push({ t: "p", texto: `Módulos sin acceso: no tuvimos acceso a ${plural(grupos.length, "ubicación", "ubicaciones")}: ${y(grupos.map(([u]) => u))}. Quedan con su foto de evidencia.` });
      } else {
        out.push({ t: "p", texto: `${t.nombre}: ${y(grupos.map(([u]) => u))}.` });
      }
    }
    /* Lo que viene de antes (solo en el último día): las ubicaciones que siguen con novedad. */
    if (d.dia === ultimo) {
      const siguen = a.filas.filter((f) => f.tendencia === "persiste" || f.tendencia === "reincide").map((f) => f.clave).sort(orden);
      const nuevas = a.filas.filter((f) => f.tendencia === "nueva").map((f) => f.clave).sort(orden);
      const ya = a.filas.filter((f) => f.tendencia === "ya_no").map((f) => f.clave).sort(orden);
      const partes = [
        siguen.length ? `siguen con novedad desde conteos anteriores ${y(siguen)}` : "",
        nuevas.length ? `aparecen por primera vez ${y(nuevas)}` : "",
        ya.length ? `ya no presentan novedad ${y(ya)}` : "",
      ].filter(Boolean);
      if (partes.length && a.porDia.length > 1) out.push({ t: "p", texto: `Frente a los días anteriores del periodo: ${partes.join("; ")}.` });
    }
  }
  return out.length ? out : [{ t: "p", texto: "En el periodo no se contó ninguna ubicación con los filtros escogidos." }];
}

export function construirInforme(a: Analisis, novs: Novedad[], o: OpcionesInforme): Bloque[] {
  const B: Bloque[] = [];
  /* «Si algo está en cero, no muestres esas tarjetas.» */
  const tarjetas = (items: Extract<Bloque, { t: "kpis" }>["items"]) => {
    const xs = items.filter((k) => !/^(0|0 %|—)$/.test(k.valor.trim()));
    if (xs.length) B.push({ t: "kpis", items: xs });
  };
  const G = o.graficas;
  const periodo = periodoTxt(o.desde, o.hasta);
  const c = a.conteoTendencia;
  const pctCumple = a.pnc.respondidos ? Math.round((a.pnc.cumplen / a.pnc.respondidos) * 100) : null;
  /* «Si quito PNC no debería salir nada de PNC.» */
  const conPnc = !o.tipos?.length || o.tipos.includes("pnc");
  /* Solo los tipos que tienen algo (los que no se escogieron o están en cero no salen). */
  const tiposVivos = TIPOS.filter((t) => a.porTipo[t.k] > 0);
  /* Los módulos se numeran según los que salen. */
  let nMod = 0;
  const numero = () => `MÓDULO ${++nMod}`;

  /* ---------- PORTADA ---------- */
  B.push({
    t: "portada", titulo: "Informe de evidencias del conteo",
    sub: `Tendencias por ubicación · ${periodo}`,
    meta: [`Periodo: ${periodo} (${a.dias.length} ${a.dias.length === 1 ? "día" : "días"})`, `Qué se cuenta como novedad: ${o.tiposTxt}`, `Generado: ${o.generado}`],
  });
  tarjetas([
      { rotulo: "Novedades", valor: nf.format(a.total), detalle: `${a.fotos} con foto` },
      { rotulo: "Ubicaciones afectadas", valor: nf.format(a.ubicacionesAfectadas) },
      { rotulo: "Persisten", valor: nf.format(c.persiste + c.reincide), detalle: `${c.persiste} seguidas · ${c.reincide} reinciden`, color: TEND.persiste.color },
      { rotulo: "Nuevas", valor: nf.format(c.nueva), color: TEND.nueva.color },
      { rotulo: "Ya no tienen novedad", valor: nf.format(c.ya_no), color: TEND.ya_no.color },
      ...(conPnc ? [{ rotulo: "PNC que cumplen", valor: pctCumple == null ? "—" : `${pctCumple} %`, detalle: a.pnc.total ? `${a.pnc.cumplen} de ${a.pnc.respondidos} respondidos` : "sin PNC" }] : []),
  ]);
  B.push({ t: "sub", texto: "Lo que dice el periodo" });
  B.push({ t: "lista", items: lecturas(a) });
  /* LA REDACCIÓN, EN SU PROPIO MÓDULO: todas las novedades reportadas, contadas como las escribiría yo. */
  B.push({ t: "modulo", n: "INFORME", titulo: "Lo que evidenciamos en el conteo", sub: `Periodo: ${periodo}. Todas las novedades reportadas, día por día.` });
  B.push(...redaccion(a, novs));

  /* ---------- MÓDULO 1 · POR DÍA ---------- */
  B.push({ t: "modulo", n: numero(), titulo: "Tendencia por día", sub: "Cuántas novedades hubo cada día, de qué tipo, y cuántas ubicaciones se miraron." });
  B.push({ t: "imgs2", a: G.dias, b: G.cobertura });
  B.push({
    t: "tabla", cols: [
      { h: "Día", w: 14, al: "l" }, { h: "Ubic. contadas", w: 11, al: "r" }, { h: "Ubic. con novedad", w: 12, al: "r" },
      ...tiposVivos.map((t) => ({ h: t.nombre, w: 12, al: "r" as const })), { h: "Total", w: 9, al: "r" },
    ],
    filas: a.porDia.map((d) => [
      { x: diaTxt(d.dia), bold: true }, d.contadas ? nf.format(d.contadas) : { x: "no se contó", color: "#5B6B7F" }, nf.format(d.conNovedad),
      ...tiposVivos.map((t) => (d.porTipo[t.k] ? nf.format(d.porTipo[t.k]) : "·")), { x: nf.format(d.total), bold: true },
    ]),
    compacta: true,
  });

  /* ---------- MÓDULO 2 · TENDENCIA POR UBICACIÓN ---------- */
  B.push({ t: "modulo", n: numero(), titulo: "Tendencia por ubicación", sub: "En qué va cada ubicación: si la novedad persiste, volvió, es nueva o ya se resolvió." });
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
    compacta: true,
  });

  /* ---------- MÓDULO 3 · DÓNDE SE CONCENTRA ---------- */
  B.push({ t: "modulo", n: numero(), titulo: "Dónde se concentra", sub: "Las ubicaciones y los módulos con más novedades en el periodo." });
  B.push({ t: "imgs2", a: G.dona, b: G.top, pieA: "Proporción por tipo de novedad", pieB: "Ubicaciones con más novedades" });
  B.push({
    t: "tabla", cols: [{ h: "Módulo (calle + número)", w: 30, al: "l" }, { h: "Ubicaciones afectadas", w: 20, al: "r" }, { h: "Novedades", w: 14, al: "r" }],
    filas: a.modulos.slice(0, 6).map((m) => [{ x: m.modulo, bold: true }, nf.format(m.ubicaciones), { x: nf.format(m.total), bold: true }]),
    compacta: true,
  });
  /* Sin «Quién las anotó»: el informe no nombra a nadie. */

  /* ---------- MÓDULO 4 · PNC (solo si PNC está escogido) ---------- */
  const pnc = novs.filter((n) => n.tipo === "pnc");
  if (conPnc && a.pnc.total > 0) {
  B.push({ t: "modulo", n: numero(), titulo: "PNC y política de bloqueo", sub: "Para cada PNC: ¿tiene rótulo? ¿tiene bloqueo mecánico? Cumple la política si tiene los dos." });
  /* LO PRIMERO: cuánto PNC hay en total, en cajas, unidades y hectolitros. */
  const Mm = a.pnc.medidas;
  tarjetas([
      { rotulo: "PNC encontrados", valor: nf.format(a.pnc.total), detalle: "renglones" },
      { rotulo: "Total en cajas", valor: nf.format(Mm.cajas), color: TIPO.pnc.color },
      { rotulo: "Total en unidades", valor: nf.format(Mm.unidades), color: TIPO.pnc.color },
      { rotulo: "Total en hectolitros", valor: hlTxt(Mm.hl), color: TIPO.pnc.color },
  ]);
  tarjetas([
      { rotulo: "Cumplen la política", valor: nf.format(a.pnc.cumplen), color: TEND.ya_no.color },
      { rotulo: "No cumplen", valor: nf.format(a.pnc.noCumplen), color: TEND.persiste.color },
      { rotulo: "Sin rótulo", valor: nf.format(a.pnc.sinRotulo) },
      { rotulo: "Sin bloqueo mecánico", valor: nf.format(a.pnc.sinBloqueo) },
  ]);
  /* LO QUE ES ESE PNC, UNA SOLA TABLA QUE SUMA: cuántos son y cuántas cajas, unidades y hectolitros, por situación. */
  const filaS = (txt: string, n: number, m: typeof Mm, fill?: string, bold?: boolean): CeldaT[] => [
    { x: txt, fill, bold: true }, { x: nf.format(n), bold }, { x: nf.format(m.cajas), bold }, { x: nf.format(m.unidades), bold }, { x: hlTxt(m.hl), bold },
  ];
  B.push({
    t: "tabla", compacta: true,
    cols: [{ h: "PNC por situación", w: 26, al: "l" }, { h: "PNC", w: 12, al: "r" }, { h: "Cajas", w: 16, al: "r" }, { h: "Unidades", w: 18, al: "r" }, { h: "Hectolitros", w: 16, al: "r" }],
    filas: [
      filaS("Cumplen la política", a.pnc.cumplen, a.pnc.medidasCumplen, "#CFE0F5"),
      filaS("No cumplen", a.pnc.noCumplen, a.pnc.medidasNoCumplen, "#F9C6CF"),
      filaS("Sin responder", a.pnc.sinRespuesta, a.pnc.medidasSinRespuesta),
      filaS("Total PNC", a.pnc.total, Mm, undefined, true),
    ],
  });
  if (Mm.sinDato) B.push({ t: "p", gris: true, texto: `${Mm.sinDato} renglón(es) de PNC no traen unidades por caja o hectolitros en el maestro de materiales: no suman en esas dos medidas.` });
  B.push({
    t: "tabla", cols: [
      { h: "Día", w: 10, al: "l" }, { h: "Ubicación", w: 10, al: "l" }, { h: "Material", w: 26, al: "l" }, { h: "Cajas", w: 7, al: "r" }, { h: "Unidades", w: 9, al: "r" }, { h: "Hl", w: 6, al: "r" },
      { h: "Rótulo", w: 8, al: "c" }, { h: "Bloqueo mecánico", w: 11, al: "c" }, { h: "¿Cumple?", w: 10, al: "c" },
    ],
    filas: pnc.map((n) => [
      diaCorto(n.dia), { x: mod(n), bold: true }, `${n.codigo ?? ""} ${n.material ?? ""}`.trim() || "—", n.cajas != null ? nf.format(n.cajas) : "—", unTxt(n.unidades), hlTxt(n.hl),
      si(n.pnc_rotulo), si(n.pnc_bloqueo_mecanico),
      n.cumple == null ? { x: "Sin responder", color: "#5B6B7F" } : n.cumple ? { x: "Cumple", fill: "#CFE0F5", bold: true } : { x: "No cumple", fill: "#F9C6CF", bold: true },
    ]).concat(pnc.length ? [[{ x: "Total PNC", bold: true }, "", "", { x: nf.format(Mm.cajas), bold: true }, { x: nf.format(Mm.unidades), bold: true }, { x: hlTxt(Mm.hl), bold: true }, "", "", ""]] : []),
    nota: pnc.length ? undefined : "No hubo PNC en el periodo.",
  });
  }

  /* ---------- MÓDULO 5 · FOTOS ---------- */
  B.push({ t: "modulo", n: numero(), titulo: "Evidencias fotográficas", sub: "Una foto por novedad, en miniatura: ubicación, tipo, material, día y hora." });
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
      t: "fotos", items: lasFotos.map((n) => ({ foto: o.fotos.get(n.ruta!)!, titulo: `${mod(n)} · ${TIPO[n.tipo].nombre}`, detalle: detalleNovedad(n, false) })),
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
      { h: "Cajas", w: 6, al: "r" }, { h: "Unid.", w: 7, al: "r" }, { h: "Hl", w: 5, al: "r" }, { h: "Conteo", w: 12, al: "l" }, { h: "Foto", w: 5, al: "c" },
    ],
    filas: lista.map((n) => [
      diaCorto(n.dia), hora(n.hora), { x: mod(n), bold: true }, { x: TIPO[n.tipo].nombre, fill: suave(TIPO[n.tipo].color) },
      `${n.codigo ?? ""} ${n.material ?? ""}`.trim() || "—", n.cajas != null ? nf.format(n.cajas) : "—", unTxt(n.unidades), hlTxt(n.hl), n.conteo, n.ruta ? "Sí" : "·",
    ]),
    nota: novs.length > lista.length ? `Se muestran las primeras ${lista.length} de ${novs.length} novedades. Acota el periodo para ver el resto.` : undefined,
  });
  return B;
}

const orden = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
/** Un color mezclado con blanco (para fondos de celda que dejen leer el texto): «#FF7A1A» → «#FFE4D1». */
export function suave(hex: string, k = 0.2): string {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return "#" + v.map((c) => Math.round(255 - (255 - c) * k).toString(16).padStart(2, "0")).join("").toUpperCase();
}
