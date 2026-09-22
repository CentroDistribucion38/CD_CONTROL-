const H = Date.now();
const tablas: Record<string, unknown[]> = {
  perfiles: [
    { id: "1", nombre: "Administrador", usuario: "admin", rol: "admin", activo: true, clave_provisional: false },
    { id: "2", nombre: "ARENOSA", usuario: "arenosa", rol: "operador", activo: true, clave_provisional: true },
    { id: "3", nombre: "EASY", usuario: "easy", rol: "generico", activo: true, clave_provisional: false },
    { id: "4", nombre: "Santiago Leal", usuario: "sleal", rol: "admin", activo: true, clave_provisional: false },
    { id: "5", nombre: "Viejo", usuario: "viejo", rol: "operador", activo: false, clave_provisional: false }],
  roles: [{ clave: "admin", nombre: "Administrador" }, { clave: "operador", nombre: "Operador" }, { clave: "generico", nombre: "Genérico" }, { clave: "facturacion", nombre: "Facturación" }],
  v_usuarios_historial: [
    { a_quien_nombre: "ARENOSA", accion: "rol", detalle: { de: "generico", a: "operador" }, hecho_nombre: "Administrador", hecho_en: new Date(H - 3600e3).toISOString() },
    { a_quien_nombre: "EASY", accion: "clave", detalle: {}, hecho_nombre: "Administrador", hecho_en: new Date(H - 86400e3 * 2).toISOString() }],
  v_roles_historial: [{ rol_nombre: "Operador", accion: "permisos", detalle: { cambios: [1, 2, 3] }, hecho_nombre: "Administrador", hecho_en: new Date(H - 7200e3).toISOString() }],
  v_admin_borrados: [{ nombre: "Traspasos · viajes", filas: 1240, borrado_nombre: "Administrador", borrado_en: new Date(H - 86400e3 * 5).toISOString() }],
};
const q = (t: string) => { const r = { data: tablas[t] ?? [], error: null }; const o: any = { select: () => o, order: () => o, limit: () => o, eq: () => o, then: (f: any) => Promise.resolve(r).then(f) }; return o };
export const createClient = async () => ({
  from: q,
  rpc: async (f: string, a: any) => f === "usuarios_ingreso"
    ? { data: [{ id: "1", ultimo_ingreso: new Date().toISOString(), creado: null }, { id: "2", ultimo_ingreso: null, creado: new Date(H - 86400e3 * 9).toISOString() },
               { id: "3", ultimo_ingreso: new Date(H - 86400e3 * 3).toISOString(), creado: null }, { id: "4", ultimo_ingreso: null, creado: null }], error: null }
    : f === "admin_existe" ? { data: a.p_objetos.map((o: string, i: number) => ({ objeto: o, existe: i !== 1 })), error: null } : { data: null, error: null },
});
