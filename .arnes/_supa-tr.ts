export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    if ((window as any).FALLA) return { data: null, error: { message: (window as any).FALLA } };
    return { data: null, error: null };
  },
  storage: { from: () => ({ upload: async () => ({ error: null }),
                            createSignedUrl: async () => ({ data: null, error: null }) }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
                 insert: async () => ({ error: null }) }),
});