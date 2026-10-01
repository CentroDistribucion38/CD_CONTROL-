/**
 * INVENTARIO · LA COLA SIN SEÑAL.
 *
 * Contar se hace de pie, en los pasillos, y la señal se cae. Cada renglón
 * nuevo que no se pudo mandar se guarda en el TELÉFONO como «pendiente» y
 * se sube solo cuando la señal vuelve (o con un botón), en el mismo orden
 * en que se anotó.
 *
 * Esto es SOLO la lógica, sin pantalla ni red, para poder probarla sola:
 * `vaciarCola` recibe la función que manda UN renglón y decide qué hacer
 * con lo que conteste.
 *
 * LO QUE NUNCA HACE
 *   · Descartar un renglón en silencio. Si la base lo rechaza por otra
 *     razón que la señal, queda en la cola con su error escrito, y quien
 *     cuenta decide si lo quita.
 *   · Saltarse el orden: si la señal se cae a la mitad, lo que falta sigue
 *     en la cola, en su sitio.
 *   · Duplicar un renglón que sí había llegado: la base tiene una llave
 *     única por material + módulo + vencimiento; un segundo envío del
 *     mismo renglón lo rechaza, y `vaciarCola` lo deja marcado como
 *     «duplicado» para que la pantalla lo compare con lo que ya hay.
 */

export type ItemCola<B> = {
  id: string;
  t: number;
  /** Lo que se tecleó, tal cual (el borrador de la pantalla). */
  bb: B;
  sku: string;
  /** Cómo se llama el módulo: «A01_DER». Solo para mostrarlo. */
  lugar: string;
  /** La ubicación, si ya existía en el maestro al anotar. */
  ubicacionId: string | null;
  /** Por qué la base no lo aceptó, si ya se intentó. */
  error?: string;
  /** La base dijo «ya existe uno igual». */
  duplicado?: boolean;
};

/** ¿El error es de la RED y no de la base? */
export const esFalloDeRed = (msg: string): boolean =>
  /failed to fetch|fetch failed|networkerror|network request failed|load failed|err_internet|err_network|sin señal|timed? ?out|tiempo de espera/i.test(msg);

/** ¿La base dijo que ya hay uno igual (llave única; o, en el Corte, que el inicial ya tiene su final)? */
export const esDuplicado = (msg: string): boolean =>
  /duplicate key|conteo_lineas_unico|violates unique|ya tiene su corte final/i.test(msg);

type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function leerCola<B>(llave: string | null, almacen?: Almacen): ItemCola<B>[] {
  if (!llave) return [];
  try {
    const a = almacen ?? localStorage;
    const crudo = a.getItem(llave);
    if (!crudo) return [];
    const v = JSON.parse(crudo) as unknown;
    return Array.isArray(v)
      ? (v as ItemCola<B>[]).filter((x) => x && typeof x.id === "string" && x.bb && typeof x.sku === "string")
      : [];
  } catch { return [] }
}

/** Sin nada pendiente se BORRA la llave: no deja basura por cada conteo. */
export function guardarCola<B>(llave: string | null, items: ItemCola<B>[], almacen?: Almacen): void {
  if (!llave) return;
  try {
    const a = almacen ?? localStorage;
    if (items.length) a.setItem(llave, JSON.stringify(items));
    else a.removeItem(llave);
  } catch { /* sin almacenamiento la pantalla funciona igual: se pierde lo pendiente */ }
}

export type Resultado = { ok: true } | { red: true } | { error: string };

export type Vaciado<B> = {
  enviados: ItemCola<B>[];
  /** Lo que sigue pendiente, en el mismo orden. */
  quedan: ItemCola<B>[];
};

/**
 * Manda la cola de a UNO, en orden.
 *   ok     → sale de la cola.
 *   red    → se corta aquí: este y todos los que siguen quedan intactos.
 *   error  → este queda con su error (y `duplicado` si fue la llave única)
 *            y se sigue con el siguiente: un renglón malo no puede
 *            encerrar a los buenos.
 */
export async function vaciarCola<B>(
  items: ItemCola<B>[], enviar: (it: ItemCola<B>) => Promise<Resultado>,
): Promise<Vaciado<B>> {
  const enviados: ItemCola<B>[] = [];
  const quedan: ItemCola<B>[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let r: Resultado;
    try { r = await enviar(it) } catch (e) { r = { red: true }; void e }
    if ("ok" in r) { enviados.push(it); continue }
    if ("red" in r) { quedan.push(...items.slice(i)); break }
    quedan.push({ ...it, error: r.error, duplicado: esDuplicado(r.error) });
  }
  return { enviados, quedan };
}

/* ---------------------------------------------------------------------
   ¿LO QUE LA BASE YA TIENE ES ESTE MISMO RENGLÓN?
   Un «ya existe uno igual» puede ser el mismo renglón que llegó y cuya
   respuesta se perdió con la señal. Es el mismo si coinciden material,
   módulo, ESTADO DEL ENVASE y cantidades. El estado cuenta porque el mismo
   material en el mismo módulo puede estar NUEVO, LAVADO y EXTRASUCIO a la
   vez: son renglones distintos, y uno de ellos no puede darse por enviado
   porque otro, con la misma cantidad, ya esté.
   --------------------------------------------------------------------- */
export const entero = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export type RenglonEnBase = {
  codigo: string; ubicacion: string | null; estado_envase: string | null;
  estibas: number | null; saldo: number | null; cajas: number | null;
};
export type BorradorCola = {
  modo: "estibas" | "cajas"; estibas: string; saldo: string; cajas: string; estado: string;
};

export function yaEstaEnLaBase(x: RenglonEnBase, it: ItemCola<BorradorCola>): boolean {
  const bb = it.bb;
  return x.codigo === it.sku && x.ubicacion === it.lugar &&
    (x.estado_envase ?? "") === (bb.estado || "") &&
    (bb.modo === "estibas"
      ? (x.estibas ?? null) === entero(bb.estibas) && (x.saldo ?? null) === entero(bb.saldo)
      : (x.cajas ?? null) === entero(bb.cajas));
}

/** Lo que se le dice a quien cuenta cuando la base rechaza el renglón por repetido (con señal, en el momento). */
export const AVISO_REPETIDO =
  "Ya anotaste este material en ese módulo con esa fecha y ese MISMO estado del envase. " +
  "Si es de otro estado (NUEVO, LAVADO, EXTRASUCIO…), escógelo en «Datos adicionales»; " +
  "si es el mismo, corrige el renglón que ya está en «El borrador».";
