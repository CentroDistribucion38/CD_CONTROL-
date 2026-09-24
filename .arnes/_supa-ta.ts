export const createClient = () => ({
  rpc: async (f: string, a: any) => { (window as any).rpcs = [...((window as any).rpcs ?? []), { f, a }]; return { error: null, data: null } },
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
});