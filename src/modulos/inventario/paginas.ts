/* TODO, SIN TOPE OCULTO.
   PostgREST corta cada respuesta en su máximo de filas (1.000 por defecto) aunque se pida `limit(20000)`
   y NO AVISA: la lista llega corta y se ve perfectamente normal. La pantalla «La base» y el Excel pedían
   así y se quedaban en 1.000. Se pide por páginas (`.range`) hasta que se acaben, y por tandas de
   recorridos para que la URL del `in(...)` no se haga enorme. */
/* Si Supabase cambia su máximo de filas, solo hay que tocar este número. */
export const PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/* EN PARALELO Y NO UNA DETRÁS DE OTRA. Cada página es un viaje a Supabase; pedidas en fila, 20.000 renglones eran 20 viajes
   seguidos (y La base, con sus tandas de recorridos, decenas): la pantalla tardaba en abrir. Ahora van de a VARIAS a la vez,
   en orden. No más de VARIAS para no ahogar la base con una sola pantalla. */
const VARIAS = 4;

export async function todas<T>(pedir: (desde: number, hasta: number) => Pagina<T>): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = [];
  /* La primera sola: casi todo cabe en una página y no tiene sentido pedir otras tres vacías. */
  const p0 = await pedir(0, PAGINA - 1);
  if (p0.error) return { data: out, error: p0.error.message };
  out.push(...(p0.data ?? []));
  if (!p0.data || p0.data.length < PAGINA) return { data: out, error: null };
  for (let d = PAGINA; ; d += PAGINA * VARIAS) {
    const r = await Promise.all(Array.from({ length: VARIAS }, (_, k) => pedir(d + k * PAGINA, d + (k + 1) * PAGINA - 1)));
    for (const { data, error } of r) {
      if (error) return { data: out, error: error.message };
      out.push(...(data ?? []));
      if (!data || data.length < PAGINA) return { data: out, error: null };
    }
  }
}

/** Los renglones de unos recorridos: por tandas de ids y, dentro de cada una, por páginas ordenadas por `id`
 *  (sin un orden fijo, dos páginas podrían repetir o saltarse filas). Las tandas van de a VARIAS a la vez, en orden. */
export async function porTandas<T>(ids: string[], pedir: (tanda: string[], desde: number, hasta: number) => Pagina<T>, tanda = 25): Promise<{ data: T[]; error: string | null }> {
  const grupos: string[][] = [];
  for (let i = 0; i < ids.length; i += tanda) grupos.push(ids.slice(i, i + tanda));
  const res: { data: T[]; error: string | null }[] = new Array(grupos.length);
  let sig = 0;
  await Promise.all(Array.from({ length: Math.min(VARIAS, grupos.length) }, async () => {
    while (sig < grupos.length) { const k = sig++; res[k] = await todas<T>((d, h) => pedir(grupos[k], d, h)) }
  }));
  const out: T[] = [];
  for (const r of res) { if (r.error) return { data: out, error: r.error }; out.push(...r.data) }
  return { data: out, error: null };
}
