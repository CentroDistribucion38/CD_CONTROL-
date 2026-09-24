export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    return { data: (a?.p_ids ?? []).length, error: null };
  },
});