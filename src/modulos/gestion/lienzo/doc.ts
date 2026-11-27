/**
 * EL LIENZO DEL MAPA DE PROCESOS — el modelo (sin pantalla ni base).
 *
 * «Que eso dentro sea literal un canvas: que estén las figuras del flujograma, que pueda editar, mover, agregar;
 *  que se vea mucho mejor y que todos los que tenemos queden con esos tonos, uniformes.»
 *
 * · DocLienzo: lo que se guarda en la base (gestion_mapas.doc): figuras, zonas (los carriles N1/N2/N3 o las columnas
 *   de los flujos) y uniones (flechas pegadas a las figuras: si una figura se mueve, la flecha la sigue).
 * · TIPOS: el mismo tono para el mismo tipo de figura en TODOS los diagramas (actividad crema/ámbar, entrada-salida
 *   blanca, decisión roja, inicio/fin azul de la marca, PI amarillo…).
 * · convertir(): pasa un diagrama del Excel (diagramas-datos.ts) a un DocLienzo.
 * · ordenar(): acomoda solo: mismo tamaño por tipo, filas y columnas alineadas a la cuadrícula, sin figuras encimadas,
 *   y cada zona ajustada a lo que tiene. Se puede deshacer.
 */
import type { Diagrama } from "@/modulos/gestion/referencia/diagramas-datos";

export type TipoFig = "actividad" | "es" | "tarea" | "decision" | "inicio" | "proceso" | "pi" | "doc" | "novedad" | "etiqueta";
export type Lado = "t" | "r" | "b" | "l";
export type Fig = { id: string; tipo: TipoFig; x: number; y: number; w: number; h: number; t: string; color?: string | null; pi?: string | null };
export type Zona = { id: string; t: string; x: number; y: number; w: number; h: number };
export type Union = { id: string; de: string; a: string; deLado: Lado; aLado: Lado; t?: string; flecha: "fin" | "ambas" | "ninguna" };
export type DocLienzo = { v: 1; figuras: Fig[]; zonas: Zona[]; uniones: Union[] };

export type Forma = "chevron" | "paralelo" | "rect" | "rombo" | "doc" | "texto";
export const TIPOS: Record<TipoFig, { nombre: string; forma: Forma; fondo: string; borde: string; texto: string; w: number; h: number; franja?: string }> = {
  actividad: { nombre: "Actividad", forma: "chevron", fondo: "#FFF6D9", borde: "#E0A92E", texto: "#14171C", w: 200, h: 64 },
  es: { nombre: "Entrada / salida", forma: "paralelo", fondo: "#FFFFFF", borde: "#8C97A6", texto: "#14171C", w: 200, h: 64 },
  tarea: { nombre: "Tarea", forma: "rect", fondo: "#FFFFFF", borde: "#3B4250", texto: "#14171C", w: 200, h: 64, franja: "#3B4250" },
  decision: { nombre: "Decisión", forma: "rombo", fondo: "#FFFFFF", borde: "#C8102E", texto: "#14171C", w: 170, h: 104 },
  inicio: { nombre: "Inicio / fin", forma: "rect", fondo: "#04203F", borde: "#04203F", texto: "#FFFFFF", w: 200, h: 64 },
  proceso: { nombre: "Proceso", forma: "rect", fondo: "#04203F", borde: "#04203F", texto: "#FFFFFF", w: 200, h: 64, franja: "#F5B800" },
  pi: { nombre: "PI", forma: "rect", fondo: "#FFC300", borde: "#C99A00", texto: "#14171C", w: 200, h: 58 },
  doc: { nombre: "Documento", forma: "doc", fondo: "#F3F6FA", borde: "#7A8899", texto: "#14171C", w: 190, h: 72 },
  novedad: { nombre: "Novedad", forma: "rect", fondo: "#FDECEE", borde: "#C8102E", texto: "#9B0D22", w: 200, h: 58, franja: "#C8102E" },
  etiqueta: { nombre: "Texto", forma: "texto", fondo: "transparent", borde: "transparent", texto: "#4B5563", w: 240, h: 36 },
};
/** El orden en que salen en la barra de figuras (el del proceso: empieza, actividad, tarea, decisión…). */
export const ORDEN_TIPOS: TipoFig[] = ["inicio", "actividad", "tarea", "decision", "es", "pi", "doc", "novedad", "proceso", "etiqueta"];
/** Colores que se pueden poner a mano (el fondo); «null» = el del tipo. */
export const COLORES = ["#FFF6D9", "#FFFFFF", "#F3F6FA", "#E8F5E9", "#FDECEE", "#FFC300", "#04203F"];

export const GRID = 20;
const snap = (v: number) => Math.round(v / GRID) * GRID;
let serie = 0;
export const nuevoId = (p: string) => `${p}${Date.now().toString(36)}${(serie++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ------------------------------------------------------------------------------------------------
 * DEL EXCEL AL LIENZO
 * ---------------------------------------------------------------------------------------------- */
const DE_K: Record<string, TipoFig | null> = {
  actividad: "actividad", es: "es", tarea: "tarea", pi: "pi", decision: "decision", terminal: "inicio",
  doc: "doc", etiqueta: "etiqueta", proceso: "proceso", tiempo: "etiqueta", llave: null,
};
/** Los rótulos del Excel vienen en mayúsculas y sin tildes. */
function rotulo(t: string): string {
  const s = t.trim().replace(/^N(\d):\s*/i, "N$1 · ").replace(/^Process$/i, "Proceso");
  return s.replace(/CRITICAS/g, "CRÍTICAS").replace(/CRITICOS/g, "CRÍTICOS").replace(/DOCUMENTACION/g, "DOCUMENTACIÓN")
    .replace(/NO CRITICA/g, "NO CRÍTICA");
}
function ladoMasCerca(f: { x: number; y: number; w: number; h: number }, p: number[]): Lado {
  const d: [Lado, number][] = [["t", Math.abs(p[1] - f.y)], ["b", Math.abs(p[1] - (f.y + f.h))], ["l", Math.abs(p[0] - f.x)], ["r", Math.abs(p[0] - (f.x + f.w))]];
  return d.sort((a, b) => a[1] - b[1])[0][0];
}

export function convertir(d: Diagrama): DocLienzo {
  const figuras: Fig[] = [];
  for (const f of d.formas) {
    const tipo = DE_K[f.k] ?? (f.g === "rombo" ? "decision" : f.g === "doc" ? "doc" : null);
    if (!tipo) continue;
    figuras.push({ id: `f${f.i}`, tipo, x: f.x, y: f.y, w: Math.max(40, f.w), h: Math.max(24, f.h), t: f.t.trim() });
  }
  /* ZONAS: las guías del Excel parten el diagrama en celdas (columnas × filas); cada celda lleva el rótulo que cae en
     ella. Una celda sin rótulo se une a la de arriba (en los flujos, «Proceso» ocupa toda su columna). */
  const vx = d.guias.filter((g) => Math.abs(g[0] - g[2]) < Math.abs(g[1] - g[3])).map((g) => g[0]).sort((a, b) => a - b);
  const hy = d.guias.filter((g) => Math.abs(g[0] - g[2]) >= Math.abs(g[1] - g[3])).map((g) => g[1]).sort((a, b) => a - b);
  const xs = [0, ...vx, d.w], ys = [0, ...hy, d.h];
  const usados = new Set<number>();
  const zonas: Zona[] = [];
  for (let c = 0; c < xs.length - 1; c++) {
    let actual: Zona | null = null;
    for (let r = 0; r < ys.length - 1; r++) {
      const x0 = xs[c], x1 = xs[c + 1], y0 = ys[r], y1 = ys[r + 1];
      const k = d.rotulos.findIndex((ro, i) => !usados.has(i) && ro.x >= x0 - 2 && ro.x < x1 && ro.y >= y0 - 2 && ro.y < y1);
      if (k >= 0) {
        usados.add(k);
        actual = { id: `z${c}-${r}`, t: rotulo(d.rotulos[k].t), x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        zonas.push(actual);
      } else if (actual) actual.h = y1 - actual.y;
    }
  }
  d.rotulos.forEach((ro, i) => {
    if (!usados.has(i)) figuras.push({ id: `r${i}`, tipo: "etiqueta", x: ro.x, y: ro.y, w: Math.max(160, ro.t.length * 9), h: 32, t: rotulo(ro.t) });
  });
  /* UNIONES: cada línea del Excel se pega a la figura más cercana de cada punta (si hay una a menos de 60 px). */
  const cerca = (p: number[]) => {
    let mejor: Fig | null = null, md = 60;
    for (const f of figuras) {
      if (f.tipo === "etiqueta") continue;
      const dx = Math.max(f.x - p[0], 0, p[0] - (f.x + f.w)), dy = Math.max(f.y - p[1], 0, p[1] - (f.y + f.h));
      const dd = Math.hypot(dx, dy);
      if (dd < md) { md = dd; mejor = f }
    }
    return mejor;
  };
  const uniones: Union[] = [];
  d.lineas.forEach((l, i) => {
    const p0 = l.p[0], p1 = l.p[l.p.length - 1];
    let A = cerca(p0), B = cerca(p1), pa = p0, pb = p1;
    if (!A || !B || A === B) return;
    let flecha: Union["flecha"] = (l.a & 1) && (l.a & 2) ? "ambas" : l.a ? "fin" : "ninguna";
    if (l.a === 2) { [A, B] = [B, A]; [pa, pb] = [pb, pa]; flecha = "fin" }
    if (uniones.some((u) => u.de === A!.id && u.a === B!.id)) return;
    uniones.push({ id: `u${i}`, de: A.id, a: B.id, deLado: ladoMasCerca(A, pa), aLado: ladoMasCerca(B, pb), flecha });
  });
  return { v: 1, figuras, zonas, uniones };
}

/* ------------------------------------------------------------------------------------------------
 * ORDENAR
 * ---------------------------------------------------------------------------------------------- */
const centro = (f: { x: number; y: number; w: number; h: number }) => ({ cx: f.x + f.w / 2, cy: f.y + f.h / 2 });
export const zonaDe = (zonas: Zona[], f: Fig): Zona | null => {
  const { cx, cy } = centro(f);
  return zonas.find((z) => cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h) ?? null;
};

const PAD_X = 40, PAD_TOP = 64, PAD_BOT = 40, GAP_X = 48, GAP_Y = 44;

export function ordenar(doc: DocLienzo): DocLienzo {
  const figuras = doc.figuras.map((f) => {
    const t = TIPOS[f.tipo];
    return f.tipo === "etiqueta" ? { ...f } : { ...f, x: f.x + (f.w - t.w) / 2, y: f.y + (f.h - t.h) / 2, w: t.w, h: t.h };
  });
  const zonas = doc.zonas.map((z) => ({ ...z }));
  const grupos = new Map<string, Fig[]>();
  for (const f of figuras) {
    const z = zonaDe(doc.zonas, doc.figuras.find((o) => o.id === f.id) ?? f);
    const k = z?.id ?? "";
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  for (const [k, fs] of grupos) {
    const z = zonas.find((x) => x.id === k);
    const x0 = z ? z.x + PAD_X : -Infinity;
    /* Filas: figuras cuyo centro cae a menos de 40 px en vertical. */
    const ord = [...fs].sort((a, b) => centro(a).cy - centro(b).cy);
    const filas: Fig[][] = [];
    for (const f of ord) {
      const ult = filas.at(-1);
      const media = ult ? ult.reduce((s, g) => s + centro(g).cy, 0) / ult.length : 0;
      if (ult && centro(f).cy - media <= 40) ult.push(f); else filas.push([f]);
    }
    let fondoAnt = z ? z.y + PAD_TOP - GAP_Y : -Infinity;
    for (const fila of filas) {
      const alto = Math.max(...fila.map((f) => f.h));
      let cy = snap(fila.reduce((s, g) => s + centro(g).cy, 0) / fila.length);
      if (cy - alto / 2 < fondoAnt + GAP_Y) cy = snap(fondoAnt + GAP_Y + alto / 2 + GRID / 2);
      fila.sort((a, b) => a.x - b.x);
      let der = x0 - GAP_X;
      for (const f of fila) {
        f.x = Math.max(snap(f.x), snap(der + GAP_X));
        f.y = cy - f.h / 2;
        der = f.x + f.w;
      }
      fondoAnt = cy + alto / 2;
    }
  }
  /* Cada zona se ajusta a lo que tiene; las de la misma columna quedan del mismo ancho y apiladas sin encimarse. */
  for (const z of zonas) {
    const fs = grupos.get(z.id) ?? [];
    if (!fs.length) continue;
    const der = Math.max(...fs.map((f) => f.x + f.w)) + PAD_X, abajo = Math.max(...fs.map((f) => f.y + f.h)) + PAD_BOT;
    z.w = Math.max(z.w, der - z.x);
    z.h = Math.max(abajo - z.y, PAD_TOP + 40);
  }
  const porCol = new Map<number, Zona[]>();
  for (const z of zonas) { const k = Math.round(z.x); porCol.set(k, [...(porCol.get(k) ?? []), z]) }
  for (const col of porCol.values()) {
    const ancho = Math.max(...col.map((z) => z.w));
    col.sort((a, b) => a.y - b.y);
    let fondo = -Infinity;
    for (const z of col) {
      z.w = ancho;
      if (z.y < fondo) {
        const dy = fondo - z.y;
        z.y += dy;
        for (const f of grupos.get(z.id) ?? []) f.y += dy;
      }
      fondo = z.y + z.h;
    }
  }
  /* Columnas lado a lado: si una creció, las de su derecha se corren. */
  const cols = [...porCol.entries()].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < cols.length; i++) {
    const prev = cols[i - 1][1], cur = cols[i][1];
    const finPrev = Math.max(...prev.map((z) => z.x + z.w));
    const ini = Math.min(...cur.map((z) => z.x));
    if (ini < finPrev) {
      const dx = finPrev - ini;
      for (const z of cur) { z.x += dx; for (const f of grupos.get(z.id) ?? []) f.x += dx }
    }
  }
  return { ...doc, figuras, zonas };
}

/** Un diagrama del Excel ya ordenado: lo que sale la primera vez, antes de que alguien lo edite. */
export const semilla = (d: Diagrama): DocLienzo => ordenar(convertir(d));

/** Que lo guardado tenga forma de DocLienzo (lo que viene de la base se revisa antes de usarlo). */
export function esDoc(x: unknown): x is DocLienzo {
  const d = x as DocLienzo;
  return !!d && d.v === 1 && Array.isArray(d.figuras) && Array.isArray(d.zonas) && Array.isArray(d.uniones);
}
