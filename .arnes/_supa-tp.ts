const W = window as any;
const q = new URLSearchParams(location.hash.slice(1));
export const createClient = () => ({
  rpc: async (n: string, a: any) => {
    (W.__rpc ||= []).push({ n, a });
    if (q.get("sinsql")) return { data: null, error: { message: "Could not find the function public.conteo_tiempos in the schema cache" } };
    if (q.get("vacio")) return { data: [], error: null };
    const filas = W.__filas as any[];
    return { data: filas.filter((f) => f.dia >= a.p_desde && f.dia <= a.p_hasta), error: null };
  },
});
