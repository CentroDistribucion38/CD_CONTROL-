export const createClient = () => ({
  rpc: async () => ({ data: null, error: null }),
  from: () => ({ insert: async () => ({ error: null }) }),
});