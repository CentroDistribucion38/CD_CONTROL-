/**
 * 5S · EL INFORME EN HOJAS CARTA — cómo se reparte en páginas.
 *
 * El formato es el de calidad (opción C) con el bloque de resultado de la opción A. Cada hoja lleva el mismo
 * encabezado (logo, título, código, versión, fecha y «página X de N»), así que el informe NO puede dejarse correr
 * solo como una página web: aquí se arma de antemano qué va en cada hoja. Cada bloque trae su alto estimado en
 * puntos de pantalla (1 in = 96) y se llenan las hojas en orden, con margen de sobra para que nada se corte.
 * Las tablas que se parten (la matriz, los hallazgos) repiten su cabecera en la hoja siguiente.
 */
import { NOMBRE_S, LAS_S, type ClaveS, type Inspeccion5S, type ItemInspeccion } from "./cinco-s";

export type FotoInf = { item_id: string; url: string };
export type DatosInforme = {
  insp: Inspeccion5S; items: ItemInspeccion[]; fotos: FotoInf[];
  cargo: string | null; anterior: number | null; numero: string;
};

export type Bloque =
  | { k: "datos" } | { k: "resultado" } | { k: "porS" }
  | { k: "titulo"; n: number; t: string }
  | { k: "matriz"; filas: ({ grupo: ClaveS } | { item: ItemInspeccion; n: number })[] }
  | { k: "hallazgos"; filas: { item: ItemInspeccion; n: number }[] }
  | { k: "fotos"; fotos: { url: string; item: ItemInspeccion; n: number; i: number }[] }
  | { k: "obs" } | { k: "firmas" };

/** Lo que cabe en una hoja: 11 in menos márgenes, encabezado y pie, con aire. */
const CABE = 1056 - 80 - 74 - 40; // hoja − márgenes − encabezado − aire para el pie

const largo = (t: string | null | undefined, porLinea: number) => Math.max(1, Math.ceil((t ?? "").length / porLinea));

export function armarHojas(d: DatosInforme): Bloque[][] {
  const iS = (s: string) => LAS_S.findIndex((x) => x.clave === s);
  const items = [...d.items].sort((a, b) => iS(a.s) - iS(b.s) || a.orden - b.orden);
  const num = new Map(items.map((x, i) => [x.id, i + 1]));
  const malos = items.filter((i) => i.resultado === "no_cumple")
    .sort((a, b) => ({ alta: 0, media: 1, baja: 2 }[a.severidad ?? "media"] - ({ alta: 0, media: 1, baja: 2 }[b.severidad ?? "media"])));
  /* Las fotos: primero las de los hallazgos, en el orden de los hallazgos. */
  const orden = [...malos, ...items.filter((i) => i.resultado !== "no_cumple")];
  const fotos = orden.flatMap((it) => d.fotos.filter((f) => f.item_id === it.id).map((f) => ({ url: f.url, item: it, n: num.get(it.id)! })))
    .map((f, i) => ({ ...f, i: i + 1 }));

  /* LOS PEDAZOS, con su alto. */
  type Pieza = { alto: number; b: Bloque; junta?: "matriz" | "hallazgos" | "fotos"; cab?: number };
  const piezas: Pieza[] = [
    { alto: 34, b: { k: "titulo", n: 1, t: "Datos generales" } },
    { alto: 82, b: { k: "datos" } },
    { alto: 34, b: { k: "titulo", n: 2, t: "Resultado" } },
    { alto: 150, b: { k: "resultado" } },
    { alto: 26 + 5 * 25, b: { k: "porS" } },
    { alto: 34, b: { k: "titulo", n: 3, t: "Matriz de verificación" } },
  ];
  let grupo = "";
  for (const it of items) {
    if (it.s !== grupo) { grupo = it.s; piezas.push({ alto: 21, b: { k: "matriz", filas: [{ grupo: it.s }] }, junta: "matriz", cab: 24 }) }
    const lineas = Math.max(largo(it.pregunta, 84), largo([it.zona, it.observacion].filter(Boolean).join(" · "), 34));
    piezas.push({ alto: 9 + lineas * 14, b: { k: "matriz", filas: [{ item: it, n: num.get(it.id)! }] }, junta: "matriz", cab: 24 });
  }
  piezas.push({ alto: 34, b: { k: "titulo", n: 4, t: "Hallazgos y plan de acción" } });
  if (malos.length === 0) piezas.push({ alto: 40, b: { k: "hallazgos", filas: [] } });
  for (const it of malos) {
    const lineas = largo(`${it.zona ?? ""} ${it.observacion ?? ""}`, 52);
    piezas.push({ alto: Math.max(52, 14 + lineas * 14), b: { k: "hallazgos", filas: [{ item: it, n: num.get(it.id)! }] }, junta: "hallazgos", cab: 26 });
  }
  piezas.push({ alto: 34, b: { k: "titulo", n: 5, t: "Registro fotográfico" } });
  if (fotos.length === 0) piezas.push({ alto: 40, b: { k: "fotos", fotos: [] } });
  for (let i = 0; i < fotos.length; i += 2) piezas.push({ alto: 238, b: { k: "fotos", fotos: fotos.slice(i, i + 2) }, junta: "fotos" });
  piezas.push({ alto: 34, b: { k: "titulo", n: 6, t: "Observaciones del auditor" } });
  piezas.push({ alto: 24 + largo(d.insp.nota, 110) * 16, b: { k: "obs" } });
  piezas.push({ alto: 34, b: { k: "titulo", n: 7, t: "Firmas" } });
  piezas.push({ alto: 104, b: { k: "firmas" } });

  /* A LAS HOJAS. Un título nunca queda solo al final de una hoja: se va con lo que titula. */
  const hojas: Bloque[][] = [[]];
  let usado = 0;
  for (let i = 0; i < piezas.length; i++) {
    const p = piezas[i];
    const hoja = hojas[hojas.length - 1];
    const ultimo = hoja[hoja.length - 1];
    const sigueTabla = p.junta && ultimo && ultimo.k === p.b.k;
    let alto = p.alto + (p.junta && !sigueTabla ? p.cab ?? 0 : 0);
    if (p.b.k === "titulo" && piezas[i + 1]) alto += piezas[i + 1].alto + (piezas[i + 1].cab ?? 0);
    /* Ni el título de una S queda solo al pie de la hoja: se va con su primer punto. */
    const esGrupo = p.b.k === "matriz" && "grupo" in p.b.filas[0];
    if (esGrupo && piezas[i + 1]) alto += piezas[i + 1].alto;
    if (usado + alto > CABE && hoja.length) {
      hojas.push([]); usado = 0;
      alto = p.alto + (p.cab ?? 0);
    }
    const actual = hojas[hojas.length - 1];
    const prev = actual[actual.length - 1];
    if (p.junta && prev && prev.k === p.b.k) {
      if (prev.k === "matriz" && p.b.k === "matriz") prev.filas.push(...p.b.filas);
      else if (prev.k === "hallazgos" && p.b.k === "hallazgos") prev.filas.push(...p.b.filas);
      else if (prev.k === "fotos" && p.b.k === "fotos") prev.fotos.push(...p.b.fotos);
    } else {
      actual.push(structuredClone(p.b));
    }
    usado += p.b.k === "titulo" ? p.alto : alto;
  }
  return hojas.filter((h) => h.length);
}

export const nombreS = (s: string) => NOMBRE_S[s as ClaveS];
