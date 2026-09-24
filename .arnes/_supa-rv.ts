export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).rpcs = [...((window as any).rpcs ?? []), { f, a }];
    return { error: (window as any).falla?.(a) ?? null };
  },
});