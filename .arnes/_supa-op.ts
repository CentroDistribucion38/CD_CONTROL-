export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    /* La carga por lista contesta lo que contesta la funcion de verdad:
       una fila por nombre, con su PIN y su estado. */
    if (f === "operarios_cargar") {
      return { data: (a.p_lista ?? []).map((x: any, i: number) => ({
        nombre: x.nombre, pin: x.pin ?? String(3300 + i),
        empresa: x.empresa ?? "Easy", turno: x.turno ?? null,
        estado: i === 0 ? "nuevo" : "nuevo",
      })), error: null };
    }
    return { data: "id-nuevo", error: null };
  },
});