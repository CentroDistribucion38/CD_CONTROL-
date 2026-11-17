export async function guardarHoja(fecha: string, j: string) { (window as any).guardado = JSON.parse(j); return { ok: true } }
export async function eliminarInventario() { return { ok: true } }