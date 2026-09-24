export const createClient = () => ({ rpc: async (f: string, a: any) => {
  (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
  const n = a.p_desde ? 40 : 125;
  return { data: [{ filas: n, archivos: a.p_clave === "rotlinea.hojas" ? 3 : 0, primera: a.p_desde ?? "2026-01-02", ultima: a.p_hasta ?? "2026-09-21" }], error: null };
} });