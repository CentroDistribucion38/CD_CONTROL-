export const createClient = () => ({
     rpc: async () => ({ data: null, error: null }),
     from: () => ({ select: () => ({ data: [], error: null }) }),
   });