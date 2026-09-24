export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    return { data: [{ id: "nueva", codigo: "AV-0099" }], error: null };
  },
});