export const createClient = () => ({ rpc: async (fn, args) => { (window.__rpc ??= []).push({ fn, args }); return { data: args?.p_ids?.length ?? true, error: null } } });
