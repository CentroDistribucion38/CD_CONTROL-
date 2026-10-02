/* Cliente de prueba para la foto del renglón: anota cada subida al bucket y
   cada upsert de `conteo_fotos`, y contesta «el último renglón» con un id. */
const reg = (x) => (window.__foto ??= []).push(x);
const consulta = (tabla) => { const p = new Proxy(function () {}, {
  get: (_, k) => k === "then" ? (ok) => ok({ data: (window.__DATOS ?? {})[tabla] ?? [], error: null })
    : k === "maybeSingle" ? () => Promise.resolve({ data: tabla === "v_conteo_fefo" ? { id: window.__ultimo ?? "NUEVO", dias_para_salir: null, codigo: "900" } : null, error: null })
    : k === "upsert" ? (fila) => { reg({ t: "fila", tabla, fila }); return Promise.resolve({ error: window.__malFila ? { message: "no existe la tabla" } : null }) }
    : () => p,
  apply: () => p }); return p };
export const createClient = () => ({
  from: (t) => consulta(t),
  storage: { from: (b) => ({
    upload: async (ruta, blob, o) => { reg({ t: "sube", b, ruta, tipo: o?.contentType, bytes: blob.size }); return { error: window.__malSube ? { message: "bucket no existe" } : null } },
    remove: async (r) => { reg({ t: "quita", b, r }); return { error: null } },
    createSignedUrl: async (ruta) => { reg({ t: "firma", b, ruta }); return { data: { signedUrl: "http://t.local/foto.jpg" }, error: null } },
  }) },
  rpc: async (fn, args) => {
    (window.__llamadas ??= []).push({ fn, args, red: !!window.__red });
    if (window.__red) return { data: null, error: { message: "TypeError: Failed to fetch" } };
    return { data: "id-" + fn, error: null } } });
