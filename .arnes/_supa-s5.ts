
const w = window as any;
const rec = (k: string, v: any) => { w.log = [...(w.log ?? []), { k, v }] };
const q = (tabla: string) => {
  const o: any = { _t: tabla, _f: [] as any[],
    select() { return o }, eq(c: string, v: any) { o._f.push([c, v]); return o }, order() { return o },
    insert(v: any) { rec("insert:" + tabla, v); return Promise.resolve({ error: w.falla?.[tabla] ?? null }) },
    update(v: any) { rec("update:" + tabla, v); return { eq: (c: string, id: any) => Promise.resolve({ error: null }) } },
    then(ok: any) { const d = (w.datos?.[tabla] ?? []).filter((r: any) => o._f.every(([c, v]: any) => r[c] === v)); return Promise.resolve({ data: d, error: null }).then(ok) },
  };
  return o;
};
export const createClient = () => ({
  from: q,
  rpc: async (f: string, a: any) => { rec("rpc:" + f, a); if (w.rpcFalla) return { error: { message: w.rpcFalla }, data: null }; return { error: null, data: f === "s5_borrar" ? ["x/1.jpg"] : "ok" } },
  storage: { from: () => ({
    upload: async (ruta: string, blob: Blob) => { rec("subir", { ruta, bytes: blob.size }); return { error: null } },
    remove: async (r: string[]) => { rec("quitar", r); return { error: null } },
    createSignedUrls: async (r: string[]) => ({ data: r.map((p) => ({ path: p, signedUrl: w.fotoUrl })) }),
  }) },
});