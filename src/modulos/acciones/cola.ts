"use client";

/**
 * LA COLA DE LO QUE NO PUDO SALIR.
 *
 * En los pasillos de la bodega no hay señal. Sin esto, tocar "Reportar"
 * ahí adentro devuelve un error, y lo que pasa después no es que la
 * persona camine hasta la puerta y vuelva: es que no lo reporta. El
 * hallazgo se pierde, y un módulo de acciones correctivas que pierde
 * hallazgos no sirve para nada.
 *
 * POR QUÉ INDEXEDDB Y NO localStorage.
 * localStorage solo guarda texto, y aquí hay una FOTO. Meterla como
 * base64 la infla un 33% y el cupo de localStorage son 5 MB: dos fotos y
 * se llena, fallando en silencio y borrando lo que ya había. IndexedDB
 * guarda el Blob tal cual y tiene cupo de verdad.
 *
 * QUÉ SE GUARDA Y QUÉ NO.
 * Se guarda el reporte completo, con su foto YA SELLADA. El sello se
 * puso en el teléfono al tomarla, así que cuando esto salga —media hora
 * después, o mañana— la foto va a seguir diciendo la hora y el sitio de
 * cuando se tomó, no los de cuando subió. Esa es toda la razón por la
 * que el sello se pone al tomar y no al subir.
 *
 * LO QUE NO SE PUEDE PROMETER: el plazo. El vencimiento lo calcula la
 * base al recibir el reporte, así que una acción que sale de la cola al
 * día siguiente vence 48 horas después de ESE momento, no del hallazgo.
 * Se avisa con esas palabras al encolar, en vez de dejar creer que el
 * reloj arrancó cuando se tomó la foto.
 */

const BASE = "acciones-cola";
const ALMACEN = "pendientes";

export type Pendiente = {
  id?: number;
  /* Lo mismo que recibe accion_reportar, tal cual. Se guarda el payload
     y no los campos sueltos: el día que la función reciba un argumento
     más, lo encolado viejo sigue saliendo con lo que tenía. */
  rpc: Record<string, unknown>;
  foto?: Blob;
  ancho?: number;
  alto?: number;
  /* Cuándo se intentó de verdad. Es lo que se le muestra a la persona:
     "lo de las 9:14 del pasillo 3". */
  intentado_en: string;
  titulo: string;
};

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const p = indexedDB.open(BASE, 1);
    p.onupgradeneeded = () => {
      const db = p.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: "id", autoIncrement: true });
      }
    };
    p.onsuccess = () => ok(p.result);
    p.onerror = () => mal(p.error);
  });
}

/** Guardar un reporte que no pudo salir. */
export async function encolar(x: Omit<Pendiente, "id">) {
  const db = await abrir();
  return new Promise<void>((ok, mal) => {
    const t = db.transaction(ALMACEN, "readwrite");
    t.objectStore(ALMACEN).add(x);
    t.oncomplete = () => { db.close(); ok() };
    t.onerror = () => { db.close(); mal(t.error) };
  });
}

export async function pendientes(): Promise<Pendiente[]> {
  /* En un navegador sin IndexedDB —o en modo privado de algunos— esto no
     existe. Se contesta "no hay nada pendiente" en vez de reventar: la
     app tiene que seguir funcionando, solo que sin cola. */
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await abrir();
    return await new Promise<Pendiente[]>((ok, mal) => {
      const t = db.transaction(ALMACEN, "readonly");
      const p = t.objectStore(ALMACEN).getAll();
      p.onsuccess = () => { db.close(); ok(p.result as Pendiente[]) };
      p.onerror = () => { db.close(); mal(p.error) };
    });
  } catch {
    return [];
  }
}

async function quitar(id: number) {
  const db = await abrir();
  return new Promise<void>((ok) => {
    const t = db.transaction(ALMACEN, "readwrite");
    t.objectStore(ALMACEN).delete(id);
    t.oncomplete = () => { db.close(); ok() };
    t.onerror = () => { db.close(); ok() };
  });
}

/** ¿Este error es "no hay red" o es "la base dijo que no"? */
export function esDeRed(e: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const m = (e as { message?: string })?.message?.toLowerCase() ?? "";
  /* "Failed to fetch" y "NetworkError" son lo que devuelve el navegador
     cuando la petición no llegó a ningún lado. Un rechazo de la base
     —permiso, reincidencia, fecha futura— llega con su propio texto y NO
     se debe encolar: reintentarlo mañana lo va a rechazar igual, y
     mientras tanto la persona cree que quedó reportado. */
  return m.includes("failed to fetch") || m.includes("networkerror") ||
         m.includes("load failed") || m.includes("network request failed");
}

/**
 * Intentar sacar todo lo que hay en la cola. Devuelve cuántos salieron y
 * cuántos quedaron.
 *
 * Lo que la base RECHAZA con un motivo —"ya va 3 veces en esta zona"— se
 * saca de la cola y se devuelve en `rechazados`: dejarlo ahí lo haría
 * reintentar para siempre, y cada reintento fallaría igual. Se le dice a
 * la persona qué pasó con ese, que es lo único honesto.
 */
export async function vaciar(
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  cli: any
): Promise<{ salieron: number; quedan: number; rechazados: string[] }> {
  const lista = await pendientes();
  let salieron = 0;
  const rechazados: string[] = [];

  for (const p of lista) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) break;

    const { data, error } = await cli.rpc("accion_reportar", p.rpc);

    if (error) {
      if (esDeRed(error)) break;             // sigue sin red: se deja para después
      rechazados.push(`${p.titulo}: ${error.message}`);
      if (p.id != null) await quitar(p.id);  // rechazo con motivo: no se reintenta
      continue;
    }

    const fila = Array.isArray(data) ? data[0] : data;
    const id = fila?.id as string | undefined;

    /* La foto va después, con el id que acaba de dar la base. Si no
       sube, la acción YA existe: se pierde la imagen, no el hallazgo. */
    if (p.foto && id) {
      const ruta = `${id}/hallazgo.jpg`;
      const { error: eSubir } = await cli.storage
        .from("acciones").upload(ruta, p.foto, { contentType: "image/jpeg", upsert: true });
      if (!eSubir) {
        await cli.from("acciones_fotos").insert({
          accion_id: id, ranura: "hallazgo", ruta,
          ancho: p.ancho ?? null, alto: p.alto ?? null, bytes: p.foto.size,
          tomada_en: p.intentado_en,
          lat: p.rpc.p_lat ?? null, lng: p.rpc.p_lng ?? null,
          precision_m: p.rpc.p_precision ?? null,
        });
      }
    }

    salieron += 1;
    if (p.id != null) await quitar(p.id);
  }

  const quedan = (await pendientes()).length;
  return { salieron, quedan, rechazados };
}
