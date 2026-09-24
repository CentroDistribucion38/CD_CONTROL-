export const createClient = () => ({ from: (t: string) => ({
  upsert: async (filas: any) => { (window as any).escritos = [...((window as any).escritos ?? []), { t, filas }]; return { error: null } },
  update: () => ({ eq: async () => ({ error: null }) }), delete: () => ({ eq: async () => ({ error: null }) }),
}) });