const consulta = (tabla) => { const p = new Proxy(function () {}, {
  get: (_, k) => k === "then" ? (ok) => ok({ data: (window.__DATOS ?? {})[tabla] ?? [], error: null })
    : k === "maybeSingle" ? () => Promise.resolve({ data: null, error: null }) : () => p,
  apply: () => p }); return p };
export const createClient = () => ({ from: (t) => consulta(t), rpc: async (fn) => { (window.__rpc ??= []).push(fn); return { data: "id-" + fn, error: null } } });
