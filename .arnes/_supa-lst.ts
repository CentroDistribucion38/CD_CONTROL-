export const createClient = () => ({
  rpc: async () => ({ data: [], error: null }),
  storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  from: () => ({ insert: async () => ({ error: null }) }),
});