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

/* ===================================================================
   ESCOGER A LA PERSONA: POR ROL, Y TECLEANDO
   «El filtro es horrible»: con todos los usuarios en una sola lista hay que
   rodar entre administradores, facturación y sedes para llegar a la persona del
   OL o a la de Bavaria. Cada columna se filtra por ROL (el del operador logístico
   arranca en el rol que parezca ese, y la de Bavaria en el suyo) y la lista se
   busca tecleando.
   =================================================================== */
export type RolF = { clave: string; nombre: string };
export type PersonaF = { id: string; nombre: string; activo: boolean; rol: string };
export type OpcionPersona = { valor: string; texto: string; pista: string | null };

/** Sin tildes ni mayúsculas, para comparar nombres de rol. */
export const normalizar = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** El rol que parece ser el de cada equipo («Operador logístico», «OL» / «Bavaria», «ABI»). "" si ninguno lo parece. */
export function rolPorDefecto(roles: RolF[], equipo: Equipo): string {
  const patron = equipo === "ol" ? /(^|[^a-z])ol([^a-z]|$)|logist/ : /bavaria|inbev|(^|[^a-z])abi([^a-z]|$)/;
  const r = roles.find((x) => patron.test(normalizar(x.clave)) || patron.test(normalizar(x.nombre)));
  return r?.clave ?? "";
}

/** Los roles que de verdad tienen gente, con cuántas personas activas, por nombre. */
export function conteoPorRol(personas: PersonaF[], roles: RolF[]): (RolF & { n: number })[] {
  const n = new Map<string, number>();
  for (const p of personas) if (p.activo) n.set(p.rol, (n.get(p.rol) ?? 0) + 1);
  return roles.filter((r) => (n.get(r.clave) ?? 0) > 0)
    .map((r) => ({ ...r, n: n.get(r.clave)! }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Las opciones de UNA casilla: «sin asignar» y las personas del rol que no están ya en otra hoja
 *  (la que ya está puesta en esta casilla siempre se queda, aunque no sea del rol o esté desactivada). */
export function opcionesPersonas(o: {
  personas: PersonaF[]; roles: RolF[]; rol: string; ocupadas: Set<string>; actual: string;
}): OpcionPersona[] {
  const nombreRol = new Map(o.roles.map((r) => [r.clave, r.nombre]));
  const lista = o.personas
    .filter((p) => p.id === o.actual || (p.activo && (o.rol === "" || p.rol === o.rol) && !o.ocupadas.has(p.id)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }))
    .map((p) => ({
      valor: p.id, texto: p.nombre,
      pista: [nombreRol.get(p.rol) ?? p.rol, p.activo ? null : "desactivado"].filter(Boolean).join(" · ") || null,
    }));
  return [{ valor: "", texto: "— sin asignar —", pista: null }, ...lista];
}

/* ===================================================================
   PLANIFICAR: LA FECHA ES LA DEL INVENTARIO, no la de hoy
   «Hoy planifico todo para el viernes.» Las fechas son «AAAA-MM-DD» y se
   cuentan en días enteros (en UTC), sin horas, para que el huso no mueva el día.
   =================================================================== */
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const aUTC = (f: string): number => { const [a, m, d] = f.split("-").map(Number); return Date.UTC(a, m - 1, d) };
const deUTC = (t: number): string => new Date(t).toISOString().slice(0, 10);

export const diaSemana = (f: string): string => DIAS[new Date(aUTC(f)).getUTCDay()];
export const sumarDias = (f: string, n: number): string => deUTC(aUTC(f) + n * 86400000);
/** Cuántos días faltan desde `hoy` hasta `f` (negativo si ya pasó). */
export const diasHasta = (hoy: string, f: string): number => Math.round((aUTC(f) - aUTC(hoy)) / 86400000);
/** La próxima vez que cae `dia` (0 = domingo … 5 = viernes), contando hoy si ya es ese día. */
export function proximoDia(hoy: string, dia: number): string {
  const falta = (dia - new Date(aUTC(hoy)).getUTCDay() + 7) % 7;
  return sumarDias(hoy, falta);
}
export function textoCuando(hoy: string, f: string): string {
  const d = diasHasta(hoy, f);
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d === -1) return "ayer";
  return d > 0 ? `en ${d} días` : `hace ${-d} días`;
}
/** «viernes 03/10/2026». */
export const fechaConDia = (f: string): string => { const [a, m, d] = f.split("-"); return `${diaSemana(f)} ${d}/${m}/${a}` };

/** Los que vienen (de hoy en adelante, el más cercano primero) y los que ya pasaron (el más reciente primero). */
export function agrupar<T extends { fecha: string }>(lista: T[], hoy: string): { proximos: T[]; anteriores: T[] } {
  return {
    proximos: lista.filter((x) => x.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    anteriores: lista.filter((x) => x.fecha < hoy).sort((a, b) => b.fecha.localeCompare(a.fecha)),
  };
}

/** Si la lista de roles no llegó (o falta alguno), cada rol de una persona sale con su clave por nombre. */
export function completarRoles(personas: PersonaF[], roles: RolF[]): RolF[] {
  const vistos = new Set(roles.map((r) => r.clave));
  const extra: RolF[] = [];
  for (const p of personas) if (p.rol && !vistos.has(p.rol)) { vistos.add(p.rol); extra.push({ clave: p.rol, nombre: p.rol }) }
  return [...roles, ...extra];
}
