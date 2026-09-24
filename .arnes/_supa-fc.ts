export const createClient = () => ({
  rpc: async () => ({ error: null }),
  from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
});