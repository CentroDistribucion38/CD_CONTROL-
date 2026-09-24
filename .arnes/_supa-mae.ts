export const createClient = () => ({
  from: () => ({
    update: () => ({ eq: async () => ({ error: null }) }),
    delete: () => ({ eq: async () => ({ error: null }) }),
    insert: async () => ({ error: null }),
  }),
});