/**
 * LAS CAUSAS DE CADA DIFERENCIA DEL CRUCE FISCAL, EN LENGUAJE TÉCNICO.
 *
 * «Mira que Génesis contó y la pareja no: que las causales sean claras,
 * específicas, descritas de manera técnica de qué fue lo que pasó.»
 *
 * El cruce dice QUÉ no coincide (solo uno lo anotó, o las cajas difieren).
 * Esto dice POR QUÉ, con los nombres de las dos personas y con las cifras de
 * cada una, mirando lo que cada quien anotó renglón por renglón:
 *
 *   NO LO ANOTÓ EL OPERADOR / BAVARIA   uno anotó el renglón y el otro no anotó
 *                                       ese material en ese sitio (omisión).
 *   VENCIMIENTO DISTINTO                en el mismo sitio y material, uno anotó
 *                                       una fecha y el otro otra: no se cruzan.
 *   SITIO DISTINTO                      el mismo material, vencimiento y cantidad
 *                                       aparecen en dos sitios distintos.
 *   UNO ANOTÓ CERO                      uno dijo «vacío» y el otro anotó cajas.
 *   SIN CAJAS POR ESTIBA                el maestro no tiene el factor: las estibas
 *                                       no se convierten a cajas.
 *   FORMA DE REGISTRO DISTINTA          uno anotó cajas totales y el otro estibas + saldo.
 *   ESTIBAS DISTINTAS / SALDO DISTINTO / ESTIBAS Y SALDO
 *                                       las dos formas de contar son iguales y se
 *                                       alejan en las estibas, en el saldo o en ambos.
 *   CAJAS DISTINTAS                     los dos anotaron cajas totales y no son iguales.
 *   SIN DETALLE POR PERSONA             hay diferencia pero falta lo que anotó cada quien.
 *
 * Puro: recibe lo ya cruzado y lo que anotó cada persona; no lee la base.
 */
import { textoVenc, type ConteoPersona, type FilaCruce } from "./fiscal-cruce";

export type CausaCodigo =
  | "OMISION_OL" | "OMISION_BAVARIA" | "VENC_DISTINTO" | "SITIO_DISTINTO" | "CERO" | "SIN_FACTOR"
  | "FORMA_REGISTRO" | "ESTIBAS" | "SALDO" | "ESTIBAS_Y_SALDO" | "CAJAS" | "SIN_DETALLE";

export const ETIQUETA_CAUSA: Record<CausaCodigo, string> = {
  OMISION_OL: "No lo anotó el operador",
  OMISION_BAVARIA: "No lo anotó Bavaria",
  VENC_DISTINTO: "Vencimiento distinto",
  SITIO_DISTINTO: "Sitio distinto",
  CERO: "Uno anotó cero",
  SIN_FACTOR: "Sin cajas por estiba en el maestro",
  FORMA_REGISTRO: "Forma de registro distinta",
  ESTIBAS: "Estibas distintas",
  SALDO: "Saldo distinto",
  ESTIBAS_Y_SALDO: "Estibas y saldo distintos",
  CAJAS: "Cajas totales distintas",
  SIN_DETALLE: "Sin detalle por persona",
};

/** Qué significa cada causa, en una frase: va al resumen del Excel. */
export const SIGNIFICA_CAUSA: Record<CausaCodigo, string> = {
  OMISION_OL: "Bavaria anotó el renglón y el operador no anotó ese material en ese sitio: omisión o no se contó.",
  OMISION_BAVARIA: "El operador anotó el renglón y Bavaria no anotó ese material en ese sitio: omisión o no se contó.",
  VENC_DISTINTO: "Mismo sitio y material, pero cada uno anotó una fecha de vencimiento diferente: por eso no se cruzan.",
  SITIO_DISTINTO: "El mismo material, vencimiento y cantidad aparecen anotados en dos sitios distintos.",
  CERO: "Uno anotó el sitio vacío (0 cajas) y el otro anotó producto.",
  SIN_FACTOR: "El material no tiene «cajas por estiba» en el maestro: las estibas anotadas no se convierten a cajas.",
  FORMA_REGISTRO: "Uno anotó cajas totales y el otro estibas + saldo: puede ser un error de conversión.",
  ESTIBAS: "Mismo saldo, pero distinto número de estibas completas: una estiba de más o de menos.",
  SALDO: "Mismas estibas, pero distinto saldo de cajas sueltas.",
  ESTIBAS_Y_SALDO: "Difieren a la vez las estibas y el saldo: revisar la estiba incompleta.",
  CAJAS: "Los dos anotaron cajas totales y no son iguales.",
  SIN_DETALLE: "Hay diferencia, pero no se pudo leer lo que anotó cada persona.",
};

export type Causa = { codigo: CausaCodigo; etiqueta: string; detalle: string; revisar: string };

export type HojaParaCausas = {
  ol: string | null; bavaria: string | null;
  filas: FilaCruce[];
  /** Lo que anotó cada persona; null = no se pudo leer. */
  conteos: ConteoPersona[] | null;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number | null | undefined) => nf.format(v ?? 0);
const mismoVenc = (a: FilaCruce | ConteoPersona, b: FilaCruce | ConteoPersona) =>
  (a.vencDia ?? null) === (b.vencDia ?? null) && (a.vencMes ?? null) === (b.vencMes ?? null) && (a.vencAnio ?? null) === (b.vencAnio ?? null);
const venc = (f: FilaCruce | ConteoPersona) => textoVenc(f.vencDia, f.vencMes, f.vencAnio);

/** Lo que anotó una persona, tal cual: «72 est × 54 + 0 saldo = 3.888 cj» o «3.780 cj (cajas totales)». */
export function textoConteo(c: ConteoPersona): string {
  if (c.cajas != null) return `${n(c.cajas)} cj (anotó cajas totales)`;
  const est = c.estibas ?? 0, sal = c.saldo ?? 0;
  if (!c.cajasPorEstiba) return `${n(est)} est + ${n(sal)} saldo (sin cajas por estiba en el maestro: suma ${n(c.totalCajas)} cj)`;
  return `${n(est)} est × ${n(c.cajasPorEstiba)} + ${n(sal)} saldo = ${n(c.totalCajas)} cj`;
}

/** La causa de cada fila de una hoja (null en las que coinciden), en el mismo orden de `filas`. */
export function causasDeHoja(h: HojaParaCausas): (Causa | null)[] {
  const nOl = h.ol ? `${h.ol} (operador)` : "el operador";
  const nBa = h.bavaria ? `${h.bavaria} (Bavaria)` : "Bavaria";
  const soloOl = h.filas.filter((f) => f.estado === "SOLO_OL");
  const soloBa = h.filas.filter((f) => f.estado === "SOLO_BAVARIA");
  const hecha = (codigo: CausaCodigo, detalle: string, revisar: string): Causa => ({ codigo, etiqueta: ETIQUETA_CAUSA[codigo], detalle, revisar });

  /* Una fila que solo anotó uno: ¿el otro la anotó con otra fecha, en otro sitio, o no la anotó? */
  const soloUno = (f: FilaCruce, delOl: boolean): Causa => {
    const quien = delOl ? nOl : nBa, otro = delOl ? nBa : nOl;
    const cajas = (delOl ? f.cajasOl : f.cajasBavaria) ?? 0;
    const sus = delOl ? soloBa : soloOl;                                   // lo que solo anotó el OTRO
    const mat = `${f.sku} ${f.material}`;
    const cercano = (l: FilaCruce[]) => [...l].sort((a, b) =>
      Math.abs(((delOl ? a.cajasBavaria : a.cajasOl) ?? 0) - cajas) - Math.abs(((delOl ? b.cajasBavaria : b.cajasOl) ?? 0) - cajas))[0];
    const cant = (x: FilaCruce) => (delOl ? x.cajasBavaria : x.cajasOl) ?? 0;

    const otraFecha = cercano(sus.filter((x) => x.sku === f.sku && x.ubicacion === f.ubicacion && !mismoVenc(x, f)));
    if (otraFecha) {
      const igual = cant(otraFecha) === cajas;
      return hecha("VENC_DISTINTO",
        `En ${f.ubicacion}, ${quien} anotó ${mat} con vencimiento ${venc(f)} (${n(cajas)} cj) y ${otro} anotó el mismo material con vencimiento ${venc(otraFecha)} (${n(cant(otraFecha))} cj). ` +
        (igual ? "Las cajas son iguales: la diferencia está solo en la fecha de vencimiento." : `Además las cajas difieren en ${n(Math.abs(cajas - cant(otraFecha)))}.`),
        `Leer la fecha de vencimiento impresa en el pallet de ${f.ubicacion} y corregir la de quien se equivocó (${venc(f)} o ${venc(otraFecha)}).`);
    }
    const otroSitio = sus.find((x) => x.sku === f.sku && x.ubicacion !== f.ubicacion && mismoVenc(x, f) && cant(x) === cajas);
    if (otroSitio) {
      return hecha("SITIO_DISTINTO",
        `${quien} anotó ${n(cajas)} cj de ${mat} (vence ${venc(f)}) en ${f.ubicacion}; ${otro} anotó el mismo material, con el mismo vencimiento y la misma cantidad, en ${otroSitio.ubicacion}. Probablemente es el mismo pallet registrado en dos sitios.`,
        `Confirmar en cuál de los dos sitios (${f.ubicacion} o ${otroSitio.ubicacion}) está físicamente el pallet y corregir el otro.`);
    }
    /* Omisión: y, si el otro sí anotó ese material en otros sitios, se dice dónde. */
    const enOtros = [...new Set(h.filas.filter((x) => x !== f && x.sku === f.sku && ((delOl ? x.cajasBavaria : x.cajasOl) ?? null) !== null).map((x) => x.ubicacion))];
    return hecha(delOl ? "OMISION_BAVARIA" : "OMISION_OL",
      `${quien} anotó ${n(cajas)} cj de ${mat} en ${f.ubicacion} (vence ${venc(f)}); ${otro} no anotó ese material en ese sitio con ese vencimiento.` +
      (enOtros.length ? ` ${otro} sí anotó ${f.sku} en: ${enOtros.join(", ")}.` : ""),
      `Ir a ${f.ubicacion} y recontar ${f.sku}: si el pallet existe, lo omitió ${otro}; si no existe, ${quien} lo anotó por error.`);
  };

  /* Una fila que anotaron los dos pero con cajas distintas: se mira CÓMO anotó cada uno. */
  const difiere = (f: FilaCruce): Causa => {
    const mismo = (c: ConteoPersona) => c.ubicacion === f.ubicacion && c.sku === f.sku && mismoVenc(c, f);
    const a = h.conteos?.find((c) => c.equipo === "OL" && mismo(c));
    const b = h.conteos?.find((c) => c.equipo === "BAVARIA" && mismo(c));
    const dif = f.diferencia, ab = Math.abs(dif);
    if (!a || !b) {
      return hecha("SIN_DETALLE",
        `Los dos anotaron este renglón en ${f.ubicacion}: ${nOl} ${n(f.cajasOl)} cj y ${nBa} ${n(f.cajasBavaria)} cj (diferencia ${dif > 0 ? "+" : "−"}${n(ab)}). No se pudo leer cómo contó cada uno (estibas, saldo, cajas).`,
        `Recontar ${f.sku} en ${f.ubicacion}.`);
    }
    const factor = a.cajasPorEstiba ?? b.cajasPorEstiba ?? null;
    const dos = `${nOl}: ${textoConteo(a)}. ${nBa}: ${textoConteo(b)}.`;
    if (((a.estibas ?? 0) > 0 || (b.estibas ?? 0) > 0) && !factor) {
      return hecha("SIN_FACTOR",
        `${f.sku} no tiene «cajas por estiba» en el maestro: las estibas anotadas no se convierten a cajas y el cruce solo suma el saldo y las cajas sueltas. ${dos}`,
        `Cargar las cajas por estiba de ${f.sku} en el maestro de materiales y volver a exportar el cruce.`);
    }
    if (a.totalCajas === 0 || b.totalCajas === 0) {
      const ceroOl = a.totalCajas === 0, cero = ceroOl ? nOl : nBa, otro = ceroOl ? nBa : nOl, cant = ceroOl ? b.totalCajas : a.totalCajas;
      return hecha("CERO", `${cero} anotó el sitio ${f.ubicacion} vacío (0 cj) y ${otro} anotó ${n(cant)} cj de ${f.sku}.`,
        `Ir a ${f.ubicacion}: ¿hay producto o está vacío? Corregir a quien se equivocó.`);
    }
    const porCajasA = a.cajas != null, porCajasB = b.cajas != null;
    if (porCajasA !== porCajasB) {
      return hecha("FORMA_REGISTRO",
        `Cada uno anotó de forma distinta: ${porCajasA ? nOl : nBa} anotó cajas totales y ${porCajasA ? nBa : nOl} estibas + saldo. ${dos} Diferencia ${dif > 0 ? "+" : "−"}${n(ab)} cj.`,
        `Convertir las estibas con el factor ${n(factor)} y confirmar con un reconteo cuál cifra es la real.`);
    }
    if (porCajasA && porCajasB) {
      return hecha("CAJAS", `Los dos anotaron cajas totales: ${nOl} ${n(a.cajas)} cj y ${nBa} ${n(b.cajas)} cj en ${f.ubicacion} (diferencia ${dif > 0 ? "+" : "−"}${n(ab)}).`,
        `Recontar las cajas del pallet de ${f.ubicacion}; ${dif > 0 ? nBa : nOl} anotó menos.`);
    }
    const dE = (a.estibas ?? 0) - (b.estibas ?? 0), dS = (a.saldo ?? 0) - (b.saldo ?? 0);
    if (dE !== 0 && dS === 0) {
      return hecha("ESTIBAS",
        `Mismo saldo (${n(a.saldo)} cj), pero ${nOl} contó ${n(a.estibas)} estibas y ${nBa} ${n(b.estibas)}: ${n(Math.abs(dE))} ${Math.abs(dE) === 1 ? "estiba" : "estibas"} de diferencia = ${n(ab)} cj (a ${n(factor)} cj por estiba).`,
        `Recontar las estibas completas en ${f.ubicacion}: una de las dos personas contó ${n(Math.abs(dE))} de más.`);
    }
    if (dE === 0 && dS !== 0) {
      return hecha("SALDO",
        `Mismas estibas (${n(a.estibas)}), pero el saldo de cajas sueltas difiere: ${nOl} ${n(a.saldo)} cj y ${nBa} ${n(b.saldo)} cj (diferencia ${n(Math.abs(dS))} cj).`,
        `Recontar la estiba incompleta de ${f.ubicacion} (las cajas sueltas).`);
    }
    const compensan = (dE > 0) !== (dS > 0);
    return hecha("ESTIBAS_Y_SALDO",
      `Difieren las estibas (${n(a.estibas)} vs ${n(b.estibas)}) y el saldo (${n(a.saldo)} vs ${n(b.saldo)}); neto ${dif > 0 ? "+" : "−"}${n(ab)} cj. ${dos}` +
      (compensan ? " Las dos diferencias se compensan en parte: probablemente una estiba incompleta anotada como completa por uno de los dos." : ""),
      `Recontar ${f.sku} en ${f.ubicacion}, empezando por la estiba incompleta.`);
  };

  return h.filas.map((f) =>
    f.estado === "COINCIDE" ? null
    : f.estado === "SOLO_OL" ? soloUno(f, true)
    : f.estado === "SOLO_BAVARIA" ? soloUno(f, false)
    : difiere(f));
}
