/**
 * LA BARRA DE COMANDOS (como la de SAP)
 * ------------------------------------------------------------------
 * Se escribe un CÓDIGO corto en la cabecera y se abre esa pantalla. Con
 * «/o» se abre en OTRA VENTANA —con la misma sesión, o sea el mismo
 * usuario— para trabajar en varios módulos a la vez.
 *
 *   INV-CORTE        abre «Corte de líneas» en esta ventana
 *   /o INV-CORTE     lo abre en otra ventana
 *   /n INV-CORTE     lo abre en ESTA ventana (igual que sin prefijo)
 *   /o               otra ventana en la portada
 *   corte            sin código también sirve: se busca por nombre
 *
 * LOS CÓDIGOS SALEN DEL REGISTRO, no se escriben a mano: la lista de
 * pantallas es la de registro.ts y aquí solo se les pone un nombre corto
 * (módulo + ruta). Quien agrega una sección ya tiene su comando.
 *
 * SOLO SALE LO QUE LA PERSONA PUEDE ABRIR: se arma con las rutas
 * permitidas que resuelve el layout, así que escribir el código de una
 * pantalla cerrada no la abre ni la sugiere. (Quien protege los datos
 * sigue siendo la base; esto solo evita ofrecer lo que no toca.)
 */
import type { Modulo } from "./registro";

export type Comando = {
  /** Lo que se teclea: «INV-CORTE». */
  codigo: string;
  nombre: string;
  modulo: string;
  ruta: string;
};

export type Accion =
  | { tipo: "ir"; ruta: string; nueva: boolean; comando: Comando | null }
  | { tipo: "error"; mensaje: string };

/** La primera parte de la dirección → el prefijo corto del código. */
const PREFIJOS: Record<string, string> = {
  quiebra: "QUI", roturas: "ROT", sider: "SID", traspasos: "TRA",
  acciones: "ACC", admin: "ADM", inventario: "INV", facturacion: "FAC",
};

/** Sin tildes, en mayúsculas, con los espacios recortados. */
export const normalizar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

export function codigoDeRuta(ruta: string): string {
  const [base, ...resto] = ruta.split("/").filter(Boolean);
  const pre = PREFIJOS[base] ?? normalizar(base ?? "").replace(/[^A-Z0-9]/g, "").slice(0, 3);
  return [pre, ...resto.map((s) => normalizar(s).replace(/[^A-Z0-9]+/g, "-"))].join("-");
}

/**
 * Todos los comandos de esta persona: uno por pantalla que aparece en el
 * menú y que puede ver, más la portada.
 */
export function armarComandos(modulos: Modulo[], permitidas: string[]): Comando[] {
  const ok = new Set(permitidas);
  const out: Comando[] = [{ codigo: "INICIO", nombre: "Portada", modulo: "CONTROL", ruta: "/inicio" }];
  const vistos = new Set<string>(["INICIO"]);
  for (const m of modulos) {
    if (!m.activo || m.oculto) continue;
    for (const s of m.secciones) {
      if (s.oculto || !ok.has(s.ruta)) continue;
      let codigo = codigoDeRuta(s.ruta);
      /* Dos pantallas con el mismo código nunca deben pisarse: la segunda lleva el número. */
      for (let n = 2; vistos.has(codigo); n++) codigo = `${codigoDeRuta(s.ruta)}-${n}`;
      vistos.add(codigo);
      out.push({ codigo, nombre: s.nombre, modulo: m.nombre, ruta: s.ruta });
    }
  }
  return out;
}

/** «/o INV-CORTE» → { nueva: true, consulta: "INV-CORTE" }. */
export function parsear(texto: string): { nueva: boolean; consulta: string; prefijo: boolean } {
  const m = /^\s*\/([on])(?:\s+|$)(.*)$/i.exec(texto);
  if (!m) return { nueva: false, consulta: texto.trim(), prefijo: false };
  return { nueva: m[1].toLowerCase() === "o", consulta: m[2].trim(), prefijo: true };
}

/**
 * Las pantallas que encajan con lo escrito, la mejor primero:
 * 0 código exacto · 1 el código empieza así · 2 una parte del código empieza así ·
 * 3 el nombre empieza así · 4 todas las palabras están en código, nombre o módulo.
 */
export function buscar(comandos: Comando[], consulta: string, limite = 8): Comando[] {
  const q = normalizar(consulta);
  if (!q) return [];
  const palabras = q.split(" ");
  const puntaje = (c: Comando): number => {
    const cod = c.codigo, nom = normalizar(c.nombre), todo = `${cod} ${nom} ${normalizar(c.modulo)}`;
    if (cod === q) return 0;
    if (cod.startsWith(q)) return 1;
    if (cod.split("-").some((p) => p.startsWith(q))) return 2;
    if (nom.startsWith(q)) return 3;
    if (palabras.every((p) => todo.includes(p))) return 4;
    return 99;
  };
  return comandos
    .map((c, i) => ({ c, p: puntaje(c), i }))
    .filter((x) => x.p < 99)
    .sort((a, b) => a.p - b.p || a.c.codigo.length - b.c.codigo.length || a.i - b.i)
    .slice(0, limite)
    .map((x) => x.c);
}

/**
 * Qué hacer con lo que se escribió. `escogido` es la sugerencia resaltada
 * de la lista (si la persona bajó con las flechas); sin ella, gana la mejor.
 * `nuevaVentana` viene de Shift+Enter y equivale a escribir «/o».
 */
export function interpretar(texto: string, comandos: Comando[], escogido?: Comando | null, nuevaVentana = false): Accion {
  const { nueva, consulta, prefijo } = parsear(texto);
  const otra = nueva || nuevaVentana;
  if (!consulta) {
    return prefijo ? { tipo: "ir", ruta: "/inicio", nueva: otra, comando: null } : { tipo: "error", mensaje: "Escribe un código (ej. INV-CORTE) o parte del nombre." };
  }
  const q = normalizar(consulta);
  const exacto = comandos.find((c) => c.codigo === q);
  const c = exacto ?? escogido ?? buscar(comandos, consulta, 1)[0];
  if (!c) return { tipo: "error", mensaje: `No hay una pantalla «${consulta}» que puedas abrir.` };
  return { tipo: "ir", ruta: c.ruta, nueva: otra, comando: c };
}
