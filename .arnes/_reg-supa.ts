const w = window as any;
w.llamadas = [];
w.hechas = w.hechas ?? [];
w.llaves = w.llaves ?? [];
const respuesta = (t: string) => {
  const data = t === "v_casco_bajas" ? w.hechas : t === "casco_bajas" ? w.llaves.map((l: string) => ({ llave: l })) : [];
  const cadena: any = new Proxy({}, {
    get: (_o, p) => p === "then" ? (r: any) => r({ data, error: null }) : () => cadena,
  });
  return cadena;
};
export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    w.llamadas.push({ f, a });
    if (f === "casco_registrar_bajas") return { data: { aplicadas: a.p_filas.length, repetidas: 0, futuras: 0, sin_factor: [], sin_sitio: [], sin_columna: [] }, error: null };
    return { data: null, error: null };
  },
  from: (t: string) => ({ select: () => respuesta(t) }),
});
