/* TODO, SIN TOPE OCULTO.
   PostgREST corta cada respuesta en su máximo de filas (1.000 por defecto) aunque se pida `limit(20000)`
   y NO AVISA: la lista llega corta y se ve perfectamente normal. La pantalla «La base» y el Excel pedían
   así y se quedaban en 1.000. Se pide por páginas (`.range`) hasta que se acaben, y por tandas de
   recorridos para que la URL del `in(...)` no se haga enorme. */
export const PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function todas<T>(pedir: (desde: number, hasta: number) => Pagina<T>): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = [];
  for (let d = 0; ; d += PAGINA) {
    const { data, error } = await pedir(d, d + PAGINA - 1);
    if (error) return { data: out, error: error.message };
    out.push(...(data ?? []));
    if (!data || data.length < PAGINA) return { data: out, error: null };
  }
}

/** Los renglones de unos recorridos: por tandas de ids y, dentro de cada una, por páginas ordenadas por `id`
 *  (sin un orden fijo, dos páginas podrían repetir o saltarse filas). */
export async function porTandas<T>(ids: string[], pedir: (tanda: string[], desde: number, hasta: number) => Pagina<T>, tanda = 25): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += tanda) {
    const r = await todas<T>((d, h) => pedir(ids.slice(i, i + tanda), d, h));
    if (r.error) return { data: out, error: r.error };
    out.push(...r.data);
  }
  return { data: out, error: null };
}
