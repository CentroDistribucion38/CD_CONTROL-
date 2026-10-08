/* Base de mentira para Control: v_casco con eq/order, casco_registros para los totales. */
const w = window as any;
const FILAS = () => w.registros as any[];
const consulta = (t: string) => {
  const eqs: [string, any][] = []; let limite = false;
  const cadena: any = new Proxy({}, {
    get: (_o, p: string) => {
      if (p === "then") return (r: any) => {
        let d = FILAS().filter((x) => eqs.every(([k, v]) => x[k] === v));
        if (limite) d = d.slice(0, 1);
        r({ data: d, error: null });
      };
      if (p === "eq") return (k: string, v: any) => { eqs.push([k, v]); return cadena };
      if (p === "limit") return () => { limite = true; return cadena };
      return () => cadena;
    },
  });
  return cadena;
};
export const createClient = () => ({ from: (t: string) => ({ select: () => consulta(t) }), rpc: async () => ({ data: null, error: null }) });
