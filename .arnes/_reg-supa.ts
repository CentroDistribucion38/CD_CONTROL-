/* Base de mentira, con memoria: lo que se registra aparece en los historiales, lo que se deshace desaparece. */
const w = window as any;
w.llamadas = [];
w.hechas = w.hechas ?? [];       // v_casco_bajas
w.archivos = w.archivos ?? [];   // v_casco_archivos
w.llaves = w.llaves ?? [];
w.maestro = w.maestro ?? [];     // casco_mov_maestro
w.movs = w.movs ?? [];           // v_casco_movimientos
w.ubic = w.ubic ?? [];           // casco_ubicaciones
let n = 1;
const tablas: Record<string, () => any[]> = {
  v_casco_bajas: () => w.hechas, v_casco_archivos: () => w.archivos, casco_mov_maestro: () => w.maestro, casco_ubicaciones: () => w.ubic,
  v_casco_movimientos: () => w.movs, casco_bajas: () => w.llaves.map((l: string) => ({ llave: l })),
};
const respuesta = (t: string) => {
  const cadena: any = new Proxy({}, {
    get: (_o, p) => p === "then" ? (r: any) => r({ data: (tablas[t]?.() ?? []).slice(), error: null }) : () => cadena,
  });
  return cadena;
};
export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    w.llamadas.push({ f, a });
    if (f === "casco_registrar_bajas") {
      const id = "arch-" + n++;
      w.archivos.unshift({ id, nombre: a.p_archivo, hoja: a.p_hoja, dia_control: a.p_fecha, filas_leidas: a.p_leidas, aplicadas: a.p_filas.length, repetidas: 0, vigentes: a.p_filas.length, estibas: 1, usuario: "ana@x.co", creado_en: "2026-10-08T15:00:00Z" });
      a.p_filas.forEach((x: any, i: number) => w.hechas.push({
        id: `b${n++}`, fecha: a.p_fecha, fecha_sap: x.fecha, signo: /LAVADO|EXTRASUCIO/.test(x.texto ?? "") ? -1 : 1, centro: x.centro, ubicacion: "x",
        ubicacion_nombre: x.centro, sku: x.sku, descripcion: x.sku, unidades: x.unidades, estibas: 1,
        destino: /LAVADO|EXTRASUCIO/.test(x.texto ?? "") ? "baja" : "inventario", texto: x.texto, documento: x.documento, clase: x.clase, archivo_id: id,
      }));
      return { data: { aplicadas: a.p_filas.length, repetidas: 0, futuras: 0, sin_factor: [], sin_sitio: [], sin_columna: [], archivo: id }, error: null };
    }
    if (f === "casco_quitar_archivo") {
      w.hechas = w.hechas.filter((h: any) => h.archivo_id !== a.p_id); w.archivos = w.archivos.filter((x: any) => x.id !== a.p_id);
      return { data: 0, error: null };
    }
    if (f === "casco_movimiento_registrar") {
      for (const x of a.p_filas) {
        const o = w.maestro.find((m: any) => m.id === x.origen_id), d = w.maestro.find((m: any) => m.id === x.destino_id);
        w.movs.unshift({ id: "m" + n++, fecha: a.p_fecha, origen: o.nombre, destino: d.nombre, sku: x.sku, descripcion: "desc " + x.sku, estibas: x.estibas, entrega: x.entrega, placa: x.placa, afecta: x.afecta, ubic_origen: o.ubicacion, ubic_destino: d.ubicacion, creado_en: "2026-10-08T15:00:0" + (n % 10) + "Z" });
      }
      return { data: null, error: null };
    }
    if (f === "casco_movimiento_quitar") { w.movs = w.movs.filter((m: any) => m.id !== a.p_id); return { data: null, error: null } }
    if (f === "casco_mov_maestro_guardar") {
      const i = a.p_id ? w.maestro.find((m: any) => m.id === a.p_id) : null;
      if (i) Object.assign(i, { codigo: a.p_codigo, nombre: a.p_nombre, ubicacion: a.p_ubicacion || null, descuenta: a.p_descuenta });
      else w.maestro.push({ id: "i" + n++, tipo: a.p_tipo, codigo: a.p_codigo, nombre: a.p_nombre, ubicacion: a.p_ubicacion || null, orden: 99, descuenta: a.p_descuenta });
      return { data: null, error: null };
    }
    if (f === "casco_mov_maestro_borrar") { w.maestro = w.maestro.filter((m: any) => m.id !== a.p_id); return { data: null, error: null } }
    return { data: null, error: null };
  },
  from: (t: string) => ({ select: () => respuesta(t) }),
});
