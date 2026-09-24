export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { que: "rpc", f, a }];
    return { data: null, error: null };
  },
  storage: { from: () => ({ upload: async (ruta: string) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { que: "subir", ruta }];
    return { error: null };
  } }) },
  from: (t: string) => ({ insert: async (fila: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { que: "insert", t, fila }];
    return { error: null };
  } }),
});