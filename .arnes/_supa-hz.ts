
const apuntar = (f: string, a: any) => {
  (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
};
export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    apuntar(f, a);
    return { data: f === "hallazgo_borrar" ? (a?.p_ids ?? []).length : { accion_codigo: "AC-0099" },
             error: null };
  },
  from: (t: string) => ({
    select: (c?: string) => ({
      eq: () => ({ order: () => Promise.resolve({ data: [], error: null }),
                   then: (r: any) => r({ data: [], error: null }) }),
      in: () => ({ order: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
    }),
    insert: async (fila: any) => { apuntar("insert:" + t, fila); return { error: null } },
  }),
  storage: { from: () => ({
    upload: async (ruta: string) => { apuntar("upload", { ruta }); return { error: null } },
    createSignedUrl: async () => ({ data: { signedUrl: "" } }),
  }) },
});