export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).rpcs = [...((window as any).rpcs ?? []), { f, a }];
    if ((window as any).amarreFalla && f === "traspaso_amarrar_cedula")
      return { error: { message: "La cédula SR-0044 ya está cargada en otro viaje." }, data: null };
    return { error: null, data: [{ id: "viaje-nuevo-1", codigo: "TR-0171" }] };
  },
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
});