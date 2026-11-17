export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    const w = window as any; w.rpcs = [...(w.rpcs ?? []), { f, a }];
    if (f === "traspaso_casco_disponible") return { error: null, data: w.disp ?? [] };
    if (f === "traspaso_registrar_varios") return { error: null, data: [{ id: "viaje-1" }] };
    if (f === "traspaso_materiales_guardar") return { error: null, data: a.p_filas.length };
    return { error: null, data: null };
  },
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
});