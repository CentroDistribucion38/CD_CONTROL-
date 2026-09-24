export const createClient = () => ({ rpc: async (f: string, a: any) => {
  (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
  return { data: f === "rol_borrar" ? (a.p_mover_a ? 2 : 0) : f === "rol_crear" ? a.p_clave : 3, error: null };
} });