/**
 * EVIDENCIAS DEL CONTEO — las cuentas de la hoja «Evidencias» y de sus informes (PDF y Word).
 *
 * La base entrega dos listas (`conteo_evidencias` y `conteo_cobertura`); aquí se arma todo lo
 * demás, UNA SOLA VEZ, para que la pantalla, el PDF y el Word digan lo mismo:
 *
 *   · cada ubicación × cada día tiene un estado:
 *       «novedad»   se encontró algo (avería, PNC, módulo mezclado o sin acceso)
 *       «limpia»    se contó ese día y no había nada
 *       «sin»       ese día NO se contó (no se sabe: no es lo mismo que «limpia»)
 *   · la TENDENCIA de cada ubicación con novedad se lee sobre los días en que sí se miró:
 *       Nueva       la novedad aparece en el último día visto y antes no había
 *       Persiste    estaba en el día visto anterior y sigue en el último
 *       Reincide    se había ido (día limpio) y volvió
 *       Ya no       tuvo novedad y en el último día visto salió limpia
 *
 * No toca la base ni la pantalla: son funciones puras.
 */
export type TipoNovedad = "averia" | "pnc" | "mezclado" | "sin_acceso";

export const TIPOS: { k: TipoNovedad; nombre: string; letra: string; color: string }[] = [
  { k: "averia", nombre: "Avería", letra: "A", color: "#E4002B" },
  { k: "pnc", nombre: "PNC", letra: "P", color: "#0B4EA2" },
  { k: "mezclado", nombre: "Módulo mezclado", letra: "M", color: "#E9A81F" },
  { k: "sin_acceso", nombre: "Módulo sin acceso", letra: "S", color: "#5B6B7F" },
];
export const TIPO = Object.fromEntries(TIPOS.map((t) => [t.k, t])) as Record<TipoNovedad, (typeof TIPOS)[number]>;

export type Novedad = {
  dia: string; conteo_id: string; conteo: string; ubicacion_id: string | null; ubicacion: string | null;
  calle: string | null; modulo: string | null; lado: string | null;
  tipo: TipoNovedad; linea_id: string | null; codigo: string | null; material: string | null; cajas: number | null;
  persona: string | null; hora: string; ruta: string | null;
  pnc_rotulo: boolean | null; pnc_bloqueo_mecanico: boolean | null; cumple: boolean | null;
};

export type Cobertura = {
  dia: string; ubicacion_id: string | null; ubicacion: string | null; calle: string | null; modulo: string | null; lado: string | null;
  renglones: number; conteos: number;
};

export type EstadoCelda = "novedad" | "limpia" | "sin";
export type Tendencia = "nueva" | "persiste" | "reincide" | "ya_no";
export const TENDENCIAS: { k: Tendencia; nombre: string; frase: string; color: string }[] = [
  { k: "persiste", nombre: "Persiste", frase: "sigue con novedad en el último día contado", color: "#E4002B" },
  { k: "reincide", nombre: "Reincide", frase: "se había ido y volvió", color: "#8E0018" },
  { k: "nueva", nombre: "Nueva", frase: "apareció en el último día contado", color: "#E9A81F" },
  { k: "ya_no", nombre: "Ya no", frase: "tuvo novedad y en el último día contado salió limpia", color: "#0B4EA2" },
];
export const TEND = Object.fromEntries(TENDENCIAS.map((t) => [t.k, t])) as Record<Tendencia, (typeof TENDENCIAS)[number]>;

export type Celda = { estado: EstadoCelda; n: number; tipos: TipoNovedad[] };

export type FilaUbicacion = {
  id: string; clave: string; calle: string; modulo: string; lado: string;
  celdas: Celda[];                 // una por día del periodo, en orden
  total: number;                   // novedades en todo el periodo
  diasConNovedad: number;
  tipos: Record<TipoNovedad, number>;
  tendencia: Tendencia;
  racha: number;                   // días contados seguidos con novedad, hasta el último día visto
  ultimoVisto: string | null;      // último día en que se contó (o se halló algo)
};

export type DiaResumen = {
  dia: string; total: number; porTipo: Record<TipoNovedad, number>;
  contadas: number;                // ubicaciones contadas ese día
  conNovedad: number;              // ubicaciones con novedad ese día
};

export type Analisis = {
  dias: string[];
  filas: FilaUbicacion[];          // solo ubicaciones con alguna novedad, las más graves primero
  porDia: DiaResumen[];
  porTipo: Record<TipoNovedad, number>;
  total: number;
  ubicacionesAfectadas: number;
  conteoTendencia: Record<Tendencia, number>;
  pnc: { total: number; respondidos: number; cumplen: number; noCumplen: number; sinRespuesta: number; sinRotulo: number; sinBloqueo: number };
  modulos: { modulo: string; total: number; ubicaciones: number }[];   // calle+módulo, p. ej. «A01»
  fotos: number;                   // novedades que traen foto
  personas: { persona: string; total: number }[];
};

const ceros = (): Record<TipoNovedad, number> => ({ averia: 0, pnc: 0, mezclado: 0, sin_acceso: 0 });

/** Los días «aaaa-mm-dd» de desde a hasta, ambos incluidos (tope de 400). */
export function rangoDias(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const d = new Date(desde + "T12:00:00Z"), h = new Date(hasta + "T12:00:00Z");
  while (d <= h && out.length < 400) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
  return out;
}

const orden = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

/** Las novedades del periodo que son de los tipos escogidos (sin tipos = todos), en orden de día, ubicación y hora. */
export function filtrarNovedades(novs: Novedad[], desde: string, hasta: string, tipos?: TipoNovedad[]): Novedad[] {
  const activos = new Set<TipoNovedad>(tipos && tipos.length ? tipos : TIPOS.map((t) => t.k));
  return novs.filter((n) => activos.has(n.tipo) && n.dia >= desde && n.dia <= hasta)
    .sort((x, y) => x.dia.localeCompare(y.dia) || orden(x.ubicacion ?? "", y.ubicacion ?? "") || x.hora.localeCompare(y.hora));
}

export function analizar(novs: Novedad[], cob: Cobertura[], desde: string, hasta: string, tipos?: TipoNovedad[]): Analisis {
  const dias = rangoDias(desde, hasta);
  const idx = new Map(dias.map((d, i) => [d, i]));
  const vistas = filtrarNovedades(novs, desde, hasta, tipos);

  /* Lo que se contó, por ubicación y día. */
  const contada = new Map<string, Set<number>>();
  const marcaContada = (id: string, d: string) => {
    const i = idx.get(d); if (i == null) return;
    const s = contada.get(id) ?? new Set<number>(); s.add(i); contada.set(id, s);
  };
  const info = new Map<string, { clave: string; calle: string; modulo: string; lado: string }>();
  for (const c of cob) {
    if (!c.ubicacion_id) continue;
    marcaContada(c.ubicacion_id, c.dia);
    if (!info.has(c.ubicacion_id)) info.set(c.ubicacion_id, { clave: c.ubicacion ?? "—", calle: c.calle ?? "", modulo: c.modulo ?? "", lado: c.lado ?? "" });
  }

  const porUbi = new Map<string, Novedad[]>();
  for (const n of vistas) {
    const id = n.ubicacion_id ?? "sin-ubicacion";
    if (!info.has(id)) info.set(id, { clave: n.ubicacion ?? "Sin ubicación", calle: n.calle ?? "", modulo: n.modulo ?? "", lado: n.lado ?? "" });
    /* Una novedad también prueba que ese día se miró la ubicación. */
    marcaContada(id, n.dia);
    (porUbi.get(id) ?? porUbi.set(id, []).get(id)!).push(n);
  }

  const filas: FilaUbicacion[] = [];
  const conteoTendencia: Record<Tendencia, number> = { nueva: 0, persiste: 0, reincide: 0, ya_no: 0 };
  for (const [id, lista] of porUbi) {
    const meta = info.get(id)!;
    const celdas: Celda[] = dias.map((_, i) => {
      const ese = lista.filter((n) => idx.get(n.dia) === i);
      if (ese.length) return { estado: "novedad", n: ese.length, tipos: [...new Set(ese.map((n) => n.tipo))] };
      return { estado: contada.get(id)?.has(i) ? "limpia" : "sin", n: 0, tipos: [] };
    });
    const tiposN = ceros(); for (const n of lista) tiposN[n.tipo]++;
    /* La secuencia de los días VISTOS (con novedad o limpios), sin los días «sin conteo». */
    const visto = celdas.map((c, i) => ({ c, i })).filter((x) => x.c.estado !== "sin");
    const ult = visto[visto.length - 1];
    const ant = visto[visto.length - 2];
    const huboAntes = visto.slice(0, -1).some((x) => x.c.estado === "novedad");
    let t: Tendencia;
    if (ult.c.estado === "limpia") t = "ya_no";
    else if (ant && ant.c.estado === "novedad") t = "persiste";
    else if (huboAntes) t = "reincide";
    else t = "nueva";
    let racha = 0;
    for (let k = visto.length - 1; k >= 0 && visto[k].c.estado === "novedad"; k--) racha++;
    conteoTendencia[t]++;
    filas.push({
      id, clave: meta.clave, calle: meta.calle, modulo: meta.modulo, lado: meta.lado, celdas,
      total: lista.length, diasConNovedad: celdas.filter((c) => c.estado === "novedad").length,
      tipos: tiposN, tendencia: t, racha, ultimoVisto: ult ? dias[ult.i] : null,
    });
  }
  const peso: Record<Tendencia, number> = { persiste: 0, reincide: 1, nueva: 2, ya_no: 3 };
  filas.sort((a, b) => peso[a.tendencia] - peso[b.tendencia] || b.diasConNovedad - a.diasConNovedad || b.total - a.total || orden(a.clave, b.clave));

  const porDia: DiaResumen[] = dias.map((dia, i) => {
    const de = vistas.filter((n) => n.dia === dia);
    const pt = ceros(); for (const n of de) pt[n.tipo]++;
    const ubisCont = new Set<string>();
    for (const [id, s] of contada) if (s.has(i)) ubisCont.add(id);
    return { dia, total: de.length, porTipo: pt, contadas: ubisCont.size, conNovedad: new Set(de.map((n) => n.ubicacion_id ?? "sin-ubicacion")).size };
  });

  const porTipo = ceros(); for (const n of vistas) porTipo[n.tipo]++;
  const pn = vistas.filter((n) => n.tipo === "pnc");
  const resp = pn.filter((n) => n.pnc_rotulo != null && n.pnc_bloqueo_mecanico != null);
  const pnc = {
    total: pn.length, respondidos: resp.length,
    cumplen: resp.filter((n) => n.cumple === true).length,
    noCumplen: resp.filter((n) => n.cumple === false).length,
    sinRespuesta: pn.length - resp.length,
    sinRotulo: resp.filter((n) => n.pnc_rotulo === false).length,
    sinBloqueo: resp.filter((n) => n.pnc_bloqueo_mecanico === false).length,
  };

  const mod = new Map<string, { total: number; ubis: Set<string> }>();
  for (const n of vistas) {
    const k = `${n.calle ?? ""}${n.modulo ?? ""}` || (n.ubicacion ?? "—");
    const m = mod.get(k) ?? { total: 0, ubis: new Set<string>() };
    m.total++; m.ubis.add(n.ubicacion_id ?? "x"); mod.set(k, m);
  }
  const modulos = [...mod.entries()].map(([modulo, m]) => ({ modulo, total: m.total, ubicaciones: m.ubis.size }))
    .sort((a, b) => b.total - a.total || orden(a.modulo, b.modulo));

  const per = new Map<string, number>();
  for (const n of vistas) per.set(n.persona ?? "Sin nombre", (per.get(n.persona ?? "Sin nombre") ?? 0) + 1);
  const personas = [...per.entries()].map(([persona, total]) => ({ persona, total })).sort((a, b) => b.total - a.total);

  return {
    dias, filas, porDia, porTipo, total: vistas.length, ubicacionesAfectadas: filas.length, conteoTendencia,
    pnc, modulos, fotos: vistas.filter((n) => n.ruta).length, personas,
  };
}

/* ---------------- Texto ---------------- */
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
/** «mié 30 sep». */
export const diaTxt = (iso: string) => { const f = new Date(iso + "T12:00:00Z"); return `${DIAS[f.getUTCDay()]} ${f.getUTCDate()} ${MES[f.getUTCMonth()]}` };
/** «30 sep». */
export const diaCorto = (iso: string) => { const f = new Date(iso + "T12:00:00Z"); return `${f.getUTCDate()} ${MES[f.getUTCMonth()]}` };
/** Letras de los tipos de una celda: «A·P». */
export const letrasTipos = (t: TipoNovedad[]) => TIPOS.filter((x) => t.includes(x.k)).map((x) => x.letra).join("·");

/** La lectura del periodo en frases, para el resumen del informe y de la pantalla. */
export function lecturas(a: Analisis): string[] {
  const out: string[] = [];
  if (a.total === 0) return ["En el periodo no se encontró ninguna novedad con los filtros escogidos."];
  const t = TIPOS.filter((x) => a.porTipo[x.k] > 0).map((x) => `${a.porTipo[x.k]} de ${x.nombre.toLowerCase()}`);
  out.push(`Se encontraron ${a.total} novedades en ${a.ubicacionesAfectadas} ubicaciones (${t.join(", ")}).`);
  const c = a.conteoTendencia;
  const partes: string[] = [];
  if (c.persiste) partes.push(`${c.persiste} persisten`);
  if (c.reincide) partes.push(`${c.reincide} reinciden`);
  if (c.nueva) partes.push(`${c.nueva} son nuevas`);
  if (c.ya_no) partes.push(`${c.ya_no} ya no tienen novedad`);
  if (partes.length) out.push(`Por tendencia, de las ${a.ubicacionesAfectadas} ubicaciones: ${partes.join(", ")}.`);
  const pico = [...a.porDia].sort((x, y) => y.total - x.total)[0];
  if (pico && pico.total > 0) out.push(`El día con más novedades fue ${diaTxt(pico.dia)} (${pico.total}).`);
  const peor = a.filas.find((f) => f.tendencia === "persiste") ?? a.filas[0];
  if (peor) out.push(`${peor.clave} ${peor.tendencia === "persiste" ? `lleva ${peor.racha} ${peor.racha === 1 ? "día contado" : "días contados seguidos"} con novedad` : `tuvo novedad ${peor.diasConNovedad} ${peor.diasConNovedad === 1 ? "día" : "días"}`}.`);
  if (a.pnc.total) {
    out.push(a.pnc.respondidos
      ? `PNC: ${a.pnc.cumplen} de ${a.pnc.respondidos} con la política de bloqueo cumplida (rótulo y bloqueo mecánico).${a.pnc.sinRespuesta ? ` ${a.pnc.sinRespuesta} sin responder.` : ""}`
      : `PNC: ${a.pnc.total} sin respuesta sobre la política de bloqueo.`);
  }
  const sinCont = a.porDia.filter((d) => d.contadas === 0).length;
  if (sinCont) out.push(`Hubo ${sinCont} ${sinCont === 1 ? "día" : "días"} del periodo sin ningún conteo: ahí «sin novedad» no significa «limpio», significa «no se contó».`);
  return out;
}
