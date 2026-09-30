/* Cliente de prueba CON señal que se cae: `window.__red` = el servidor no contesta
   (el navegador dice «Failed to fetch»); `window.__dup` = la base rechaza por llave única. */
const consulta = (tabla) => { const p = new Proxy(function () {}, {
  get: (_, k) => k === "then" ? (ok) => ok({ data: (window.__DATOS ?? {})[tabla] ?? [], error: null })
    : k === "maybeSingle" ? () => Promise.resolve({ data: null, error: null }) : () => p,
  apply: () => p }); return p };
export const createClient = () => ({ from: (t) => consulta(t), rpc: async (fn, args) => {
  (window.__llamadas ??= []).push({ fn, args, red: !!window.__red });
  if (window.__lento) await new Promise((r) => setTimeout(r, window.__lento));
  if (window.__red) return { data: null, error: { message: "TypeError: Failed to fetch" } };
  if (window.__dup && fn === "conteo_fefo_agregar") return { data: null, error: { message: 'duplicate key value violates unique constraint "conteo_lineas_unico"' } };
  if (window.__rechaza && fn === "conteo_fefo_agregar") return { data: null, error: { message: "Falta decir si rota" } };
  return { data: "id-" + fn, error: null } } });
