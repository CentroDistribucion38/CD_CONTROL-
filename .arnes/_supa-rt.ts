export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    /* EL MAESTRO DE OPERARIOS DE MENTIRA: un solo PIN bueno. Un PIN
       apagado y uno inventado contestan IGUAL —lista vacía—, que es lo
       que hace la función de verdad: si el apagado contestara distinto,
       el maestro se podría ir adivinando de a cuatro dígitos desde la
       pantalla de registrar. */
    if (f === "operario_por_pin") {
      return a.p_pin === "4021"
        ? { data: [{ id: "o-1", nombre: "Genesis Visbal", empresa: "Easy", turno: "B" }], error: null }
        : { data: [], error: null };
    }
    return { data: [{ id: "id-1", codigo: "RB-0099", exige_foto: false }], error: null };
  },
  storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  from: () => ({ insert: async () => ({ error: null }) }),
});