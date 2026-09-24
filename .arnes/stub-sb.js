export const createClient = () => ({
  auth: { updateUser: async () => ({ error: null }) },
  from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  rpc: async () => ({ data: true }),
});
