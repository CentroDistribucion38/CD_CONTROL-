/* EL INVENTARIO FISCAL: PAREJAS Y HOJAS NUMERADAS.
 *
 * Un inventario fiscal se cuenta por parejas: una persona del operador
 * logístico (OL) y una de Bavaria cuentan LA MISMA hoja, cada una por su lado,
 * y después se comparan. Cuántas hojas hay no está fijo: son las que hagan
 * falta, y una hoja puede quedar con una sola persona (o con ninguna todavía)
 * mientras se arman las parejas.
 *
 * Aquí vive lo que no es pantalla: agregar y quitar hojas, revisar que nadie
 * esté en dos sitios, resumir cómo va el armado y armar lo que se manda a la
 * base (que vuelve a revisar lo mismo: esto es para avisar antes de enviar).
 */
export type HojaForm = { numero: number; ol: string; bavaria: string };   // "" = sin persona
export type Equipo = "ol" | "bavaria";

export const hojasVacias = (n: number): HojaForm[] =>
  Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => ({ numero: i + 1, ol: "", bavaria: "" }));

/** Agrega `n` hojas en blanco. Cada una toma el MENOR número libre: quitada la 3 de cinco, la próxima es la 3. */
export function agregarHojas(hojas: HojaForm[], n: number): HojaForm[] {
  const usados = new Set(hojas.map((h) => h.numero));
  const nuevas: HojaForm[] = [];
  let k = 1;
  for (let i = 0; i < Math.max(0, Math.floor(n)); i++) {
    while (usados.has(k)) k++;
    usados.add(k);
    nuevas.push({ numero: k, ol: "", bavaria: "" });
  }
  return [...hojas, ...nuevas].sort((a, b) => a.numero - b.numero);
}

/** Quita una hoja. Las demás conservan su número: la hoja 4 ya pudo repartirse impresa. */
export const quitarHoja = (hojas: HojaForm[], numero: number): HojaForm[] =>
  hojas.filter((h) => h.numero !== numero);

export const ponerPersona = (hojas: HojaForm[], numero: number, equipo: Equipo, id: string): HojaForm[] =>
  hojas.map((h) => (h.numero === numero ? { ...h, [equipo]: id } : h));

export type Revision = {
  /** Persona → números de las hojas donde aparece, solo las que aparecen en más de un sitio. */
  repetidas: Map<string, number[]>;
  /** Lo que impide guardar, en palabras. */
  errores: string[];
  total: number; completas: number; aMedias: number; vacias: number;
};

export function revisar(hojas: HojaForm[]): Revision {
  const donde = new Map<string, number[]>();
  for (const h of hojas) for (const id of [h.ol, h.bavaria]) {
    if (!id) continue;
    donde.set(id, [...(donde.get(id) ?? []), h.numero]);
  }
  const repetidas = new Map([...donde].filter(([, v]) => v.length > 1));
  const errores: string[] = [];
  if (hojas.length === 0) errores.push("Falta al menos una hoja.");
  for (const [, hs] of repetidas) {
    errores.push(hs[0] === hs[1] && hs.length === 2
      ? `La hoja ${hs[0]} tiene a la misma persona en el OL y en Bavaria.`
      : `Una persona está en las hojas ${[...new Set(hs)].join(", ")}: solo puede estar en una.`);
  }
  let completas = 0, aMedias = 0, vacias = 0;
  for (const h of hojas) {
    const n = (h.ol ? 1 : 0) + (h.bavaria ? 1 : 0);
    if (n === 2) completas++; else if (n === 1) aMedias++; else vacias++;
  }
  return { repetidas, errores, total: hojas.length, completas, aMedias, vacias };
}

/** Lo que va a la base: «» pasa a null y las hojas van en orden de número. */
export const aPayload = (hojas: HojaForm[]) =>
  [...hojas].sort((a, b) => a.numero - b.numero)
    .map((h) => ({ numero: h.numero, ol: h.ol || null, bavaria: h.bavaria || null }));

/** «5 hojas · 4 parejas completas · 1 a medias»: lo que se dice de un inventario en la lista. */
export function textoResumen(r: Pick<Revision, "total" | "completas" | "aMedias" | "vacias">): string {
  const partes = [`${r.total} ${r.total === 1 ? "hoja" : "hojas"}`];
  partes.push(`${r.completas} ${r.completas === 1 ? "pareja completa" : "parejas completas"}`);
  if (r.aMedias > 0) partes.push(`${r.aMedias} a medias`);
  if (r.vacias > 0) partes.push(`${r.vacias} sin nadie`);
  return partes.join(" · ");
}
