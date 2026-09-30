const w = window as any;
w.__rpc = [];
const tabla = (vista: string) => { const b: any = { select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b, is: () => b, neq: () => b, maybeSingle: () => b, single: () => b,
  insert: () => b, update: () => b, delete: () => b, upsert: () => b, then: (res: any) => res({ data: [], error: null }) }; return b };
export function createClient() {
  return {
    rpc: async (n: string, a: any) => { w.__rpc.push({ n, a }); return { data: n === "sider_ficha_guardar" ? "fNEW" : n === "sider_ficha_dar_salida" ? ["vA", "vB"] : [{ viaje_id: "vNEW", certificacion_id: "cNEW" }], error: null } },
    from: (v: string) => tabla(v),
    storage: { from: () => ({ upload: async () => ({ data: {}, error: null }), createSignedUrl: async () => ({ data: { signedUrl: "" }, error: null }) }) },
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  };
}
