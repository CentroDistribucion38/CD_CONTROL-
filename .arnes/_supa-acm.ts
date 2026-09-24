
const apuntar = (f: string, a: any) => {
  (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
};
export const createClient = () => ({
  rpc: async (f: string, a: any) => { apuntar(f, a); return { data: null, error: null } },
  from: (t: string) => ({
    delete: () => ({
      eq: async (col: string, v: any) => { apuntar("delete1:" + t, { col, v }); return { error: null } },
      in: async (col: string, v: any[]) => { apuntar("delete:" + t, { col, v }); return { error: null } },
    }),
    update: () => ({ eq: async () => ({ error: null }) }),
    insert: async () => ({ error: null }),
  }),
});