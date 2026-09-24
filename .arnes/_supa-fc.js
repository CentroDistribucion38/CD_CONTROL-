export const createClient = () => ({ rpc: async (fn, args) => {
     (window.__llamadas ??= []).push({ fn, args }); return { data: null, error: null } } });