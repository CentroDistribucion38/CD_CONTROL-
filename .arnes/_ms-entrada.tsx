import { createRoot } from "react-dom/client";
import { Certificar } from "../src/app/(app)/sider/certificar/Certificar";
import { DarSalida } from "../src/app/(app)/sider/salida/DarSalida";
import { Transito } from "../src/app/(app)/sider/transito/Transito";
import { Sorting } from "../src/app/(app)/sider/sorting/Sorting";
import { Viajes } from "../src/app/(app)/sider/Viajes";
import { Informe } from "../src/app/(app)/sider/seguimiento/ai/Informe";
import { Seguimiento } from "../src/app/(app)/sider/seguimiento/Seguimiento";
import { Novedades } from "../src/app/(app)/sider/novedades/Novedades";
import { Maestro } from "../src/app/(app)/sider/maestro/Maestro";
import { Importar } from "../src/app/(app)/sider/importar/Importar";

const AHORA = "2026-09-29T15:00:00.000Z";
const hace = (h: number) => new Date(Date.parse(AHORA) - h * 3600000).toISOString();
const q = new URL(location.href).searchParams;
const m = q.get("m") ?? "certificar";
const c = q.get("c") ?? "";
const root = createRoot(document.getElementById("r")!);

const ORIGENES = [
  { planta: "APA", cd_origen: "Apartadó", activo: true }, { planta: "CUR", cd_origen: "Curumaní", activo: true },
  { planta: "MDE", cd_origen: "Medellín", activo: true }, { planta: "TUR", cd_origen: "Turbaco", activo: true },
  { planta: "BAQ", cd_origen: "Barranquilla", activo: true }] as any[];
const SKUS = [
  { sku: "3500887", descripcion: "Botella Costeña 175 cc", clase: "Envase", cajas_x_estiba: 72, unidades_x_caja: 24, hl_x_unidad: 0.00175, activo: true },
  { sku: "3501226", descripcion: "Botella marrón 250 cc", clase: "Envase", cajas_x_estiba: 45, unidades_x_caja: 38, hl_x_unidad: 0.0025, activo: true },
  { sku: "3500901", descripcion: "Costeñita Ámbar 330 cc", clase: "Envase", cajas_x_estiba: 60, unidades_x_caja: 24, hl_x_unidad: 0.0033, activo: true },
  { sku: "3500999", descripcion: "Caja plástica azul", clase: "Envase", cajas_x_estiba: null, unidades_x_caja: null, hl_x_unidad: null, activo: true }] as any[];

const maestros: any = {
  falta: false,
  defectos: [
    { clave: "rota", nombre: "Rota o despicado", cobra: true, orden: 1, activo: true },
    { clave: "faltante", nombre: "Faltante", cobra: true, orden: 2, activo: true },
    { clave: "cemento", nombre: "Cemento o pintura", cobra: true, orden: 3, activo: true },
    { clave: "noret", nombre: "No retornable", cobra: true, orden: 4, activo: true },
    { clave: "hongo", nombre: "Hongo", cobra: false, orden: 5, activo: true },
    { clave: "etiq", nombre: "Etiqueta asoleada", cobra: false, orden: 6, activo: true },
  ],
  envases: [{ clave: "G175", descripcion: "Costeñita 175", litros: 0.175, activo: true },
            { clave: "G250", descripcion: "Marrón 250", litros: 0.25, activo: true }],
  socios: [{ clave: "logi", nombre: "Logisinú", activo: true }, { clave: "trans", nombre: "Transportes del Caribe", activo: true }],
  canales: [{ clave: "socios", nombre: "Socios", activo: true }, { clave: "t1", nombre: "T1", activo: true }, { clave: "t2", nombre: "T2", activo: true }],
};

const pend = (n: number, h: number, o: any = {}) => ({
  viaje_id: "v" + n, tipo: o.tipo ?? "ai", placa: o.placa ?? "REV00" + n, planta: "APA", sku: "3500887",
  estibas: 20 + n, fecha: "2026-09-28", llego_en: hace(h), pedido_en: hace(h + 5),
  pedido_por: "u1", motivo: null, interno: !!o.interno, pedido_nombre: o.pedido ?? "Cristian Padilla",
  envase: o.envase ?? "G175",
  ...(o.canal ? { canal: o.canal, socio: o.socio ?? null } : {}) });
const det = (n: number, o: any = {}) => ({
  id: "v" + n, placa: o.placa ?? "REV00" + n, cd_origen: o.origen ?? "Apartadó",
  descripcion: "Botella Costeña 175 cc", tipo_envase: "G175", sider: 12.5, cajas: 3420, unidades: 82080, hl: 143.64 });
const hecho = (n: number, o: any = {}) => ({
  id: "r" + n, viaje_id: "v" + n, fecha: "2026-09-27", planta: "APA", placa: o.placa ?? "HEC00" + n,
  turno: "T2", envase: "G175", envase_nombre: "Costeñita 175", recibidas: 82080, revisadas: 4104, defectos: 48,
  indice: 0.011696, ediciones: 0, revisado_por: "u2", revisado_en: hace(20 + n), comentarios: null, zcl3: null,
  canal: "t1", certificado: false, socio: null, tipo: o.tipo ?? "ai" });

const nombres = { u1: "Cristian Padilla", u2: "Muchacho Uno" };

const v = (n: number, o: any) => ({
  id: "t" + n, placa: o.placa ?? "TRN00" + n, planta: "APA", cd_origen: o.origen ?? "Apartadó", cd_destino: "Barranquilla",
  sku: "3500887", descripcion: "Botella Costeña 175 cc", tipo_envase: "G175", estibas: 20, sider: 12.5,
  cajas: 1440, hl: 25.2, estado: "en_transito", en_camino: "05:30:00", fotos_salida: 3,
  salida_en: hace(6), salida_direccion: "Calle 30 # 12-45, zona industrial", creado_por: "u1",
  creado_en: hace(6), fecha: "2026-09-29", importado: false, requiere_ai: false, ...o });

const FICHAS = [
  { id: "f1", placa: "JYN141", planta: "APA", lote: null, nota: null, direccion: "Calle 30 # 12-45, Zona Industrial, Barranquilla",
    creado_por: "u1", creado_en: hace(1.5), fotos: 3,
    lineas: [{ sku: "3500887", estibas: 20 }, { sku: "3501226", estibas: 10 }] },
  { id: "f2", placa: "KLM872", planta: "CUR", lote: null, nota: "Precinto roto en la puerta izquierda", direccion: null,
    creado_por: "u2", creado_en: hace(0.4), fotos: 3, lineas: [{ sku: "3500901", estibas: 18 }] },
  { id: "f3", placa: "PQR305", planta: "TUR", lote: null, nota: null, direccion: null,
    creado_por: "u1", creado_en: hace(14), fotos: 2, lineas: [{ sku: "3500887", estibas: 12 }, { sku: "3500999", estibas: 4 }] },
] as any[];

if (m === "certificar") {
  root.render(<Certificar origenes={ORIGENES.filter((o) => o.planta !== "BAQ")} skus={SKUS} estibasPorSider={36} esEditor={c !== "lectura"}
    fichas={q.get("f") ? FICHAS.filter((f) => f.creado_por === "u1") : []} />);
} else if (m === "salida") {
  root.render(<DarSalida fichas={c === "vacio" ? [] : c === "creador" ? FICHAS.filter((f) => f.creado_por === "u1") : FICHAS} origenes={ORIGENES as any} skus={SKUS} estibasPorSider={36}
    nombres={nombres} yo={c === "creador" ? "u1" : "u3"} ahora={AHORA} puedeDarSalida={c !== "creador" && c !== "sinpermiso"} />);
} else if (m === "transito" && c.startsWith("multi")) {
  /* UN CAMIÓN, DOS MATERIALES, UNA FACTURA (nacen juntos al dar salida): misma
     placa, misma factura, misma hora de salida. Y otro camión suelto. */
  const salida = hace(2);
  const viajes = [
    v(1, { placa: "ABC569", sku: "3501225", descripcion: "BOTELLA FLINT 250 CC", tipo_envase: "EER", estibas: 20, sider: 0.56, cajas: 900, hl: 85.5, factura: "7687019429", salida_en: salida, en_camino: "02:00:00", requiere_ai: c === "multi-ai" }),
    v(2, { placa: "ABC569", sku: "3500005", descripcion: "Envase Costeñita 175R", tipo_envase: "EER", estibas: 25, sider: 0.69, cajas: 1350, hl: 89.78, factura: "7687019429", salida_en: salida, en_camino: "02:00:00" }),
    v(3, { placa: "JYN141", factura: "7687019430", salida_en: hace(5), en_camino: "05:00:00" }),
  ];
  const adm = c !== "multi-lectura";
  root.render(<Transito viajes={viajes as any} nombres={nombres} esEditor esAdmin={adm} manda={adm} origenes={ORIGENES as any}
    skus={SKUS} estibasPorSider={36} trabados={0} sinEvidencia={0} cabeza={<h1>En tránsito</h1>} />);
} else if (m === "transito") {
  const viajes = [
    v(1, { placa: "JYN141", en_camino: "05:30:00" }),
    v(2, { placa: "KLM872", salida_en: hace(31), en_camino: "31:10:00", origen: "Curumaní", fotos_salida: 3 }),
    v(3, { placa: "PQR305", fotos_salida: 1, origen: "Turbaco" }),
    v(4, { placa: "TVX219", requiere_ai: true, origen: "Medellín" }),
  ];
  root.render(<Transito viajes={viajes as any} nombres={nombres} esEditor esAdmin manda origenes={ORIGENES as any}
    skus={SKUS} estibasPorSider={36} trabados={0} sinEvidencia={0} cabeza={<h1>En tránsito</h1>} />);
} else if (m === "sorting") {
  const cuatro = [pend(1, 30, { placa: "JYN141" }), pend(2, 3, { placa: "KLM872" }),
    pend(3, 26, { tipo: "sorting", interno: true, pedido: "Control Uno", placa: "ABC123", canal: "socios", socio: "logi", envase: "G175" }),
    pend(4, 5, { tipo: "sorting", placa: "PQR305" })];
  root.render(<Sorting ahora={AHORA} pendientes={cuatro as any} detalle={[det(1, { placa: "JYN141" }), det(2, { placa: "KLM872" }), det(3, { placa: "ABC123" }), det(4, { placa: "PQR305" })] as any}
    hechos={[hecho(1, { placa: "TVX219" }), hecho(2, { placa: "GHJ450", tipo: "sorting" })] as any}
    nombres={nombres} maestros={maestros} puedeEditar puedeCrear={c !== "sincrear"}
    origenes={ORIGENES.map((o) => ({ planta: o.planta, cd_origen: o.cd_origen })) as any} skus={SKUS} estibasPorSider={36}
    socios={maestros.socios.map((x: any) => ({ clave: x.clave, nombre: x.nombre }))} />);
} else if (m === "viajes") {
  const f = (n: number, o: any) => ({
    id: "f" + n, placa: "FUE00" + n, planta: "APA", cd_origen: "Apartadó", cd_destino: "Barranquilla",
    sku: "3500887", descripcion: "Botella Costeña 175 cc", tipo_envase: "G175", estibas: 20, sider: 12.5,
    cajas: 1440, unidades: 34560, hl: 25.2, estado: "recibido", en_camino: null, fotos_salida: 3,
    fotos_llegada: 3, salida_en: hace(30), llegada_en: hace(24), creado_por: "u1", creado_en: hace(30),
    fecha: "2026-09-28", num_mes: 9, semana: 39, anio: 2026, importado: false, faltan_factores: false,
    observacion: null, motivo_anulacion: null, ...o });
  const viajes = [f(1, { placa: "JYN141" }), f(2, { placa: "KLM872", cd_origen: "Curumaní" }),
    f(3, { placa: "PQR305", estado: "en_transito", fotos_llegada: 0, llegada_en: null }),
    f(4, { placa: "ABC123", fotos_salida: 0, salida_en: null, fotos_llegada: 0, llegada_en: null }),
    f(5, { placa: "TVX219", estado: "anulado", motivo_anulacion: "Se digitó dos veces" })];
  root.render(<Viajes viajes={viajes as any} nombres={nombres} origenes={ORIGENES as any} skus={SKUS}
    manda={c !== "lectura"} esEditor={c !== "lectura"} sorting={{ f1: "pendiente", f2: "hecho", f3: "pendiente" }} internos={["f4"]} />);
} else if (m === "informe") {
  const rv = (n: number, o: any) => ({
    id: "i" + n, viaje_id: "v" + n, fecha: "2026-09-2" + n, planta: "APA", placa: "INF00" + n, turno: "T1",
    envase: "G175", envase_nombre: "Costeñita 175", recibidas: 82080, revisadas: 4104, defectos: 48, otros: 12,
    no_abono: 960, hl_defectos: 1.6, indice: 0.0117, socio: "logi", socio_nombre: "Logisinú",
    canal: "t1", canal_nombre: "T1", origen: "propio", ediciones: 0, comentarios: null, zcl3: null,
    defectos_hoja: 48, hl_hoja: 1.6, pct_hoja: 0.0117, tipo: "ai", ...o });
  const revs = [rv(1, { placa: "JYN141" }), rv(2, { placa: "KLM872", tipo: "sorting", defectos: 30, indice: 0.0073 }),
    rv(3, { placa: "GHJ450", socio: "trans", socio_nombre: "Transportes del Caribe", defectos: 90, indice: 0.0219 })];
  const datos: any = { revisiones: revs,
    defectos: [{ clave: "rota", nombre: "Rota o despicado", cobra: true, orden: 1, unidades: 90, hl: 1.9, pct: 0.0219 },
               { clave: "faltante", nombre: "Faltante", cobra: true, orden: 2, unidades: 40, hl: 0.9, pct: 0.0097 }],
    socios: [{ clave: "logi", nombre: "Logisinú", revisiones: 2, recibidas: 164160, revisadas: 8208, defectos: 78, no_abono: 1560, hl: 2.6, indice: 0.0095 },
             { clave: "trans", nombre: "Transportes del Caribe", revisiones: 1, recibidas: 82080, revisadas: 4104, defectos: 90, no_abono: 1800, hl: 1.9, indice: 0.0219 }],
    semanas: [{ semana: "2026-09-21", revisiones: 3, revisadas: 12312, defectos: 168, indice: 0.0136 }],
    total: { revisiones: 3, recibidas: 246240, revisadas: 12312, defectos: 168, otros: 36, no_abono: 3360, hl: 4.4, socios: 2, importadas: 0, indice: 0.0136, defectos_hoja: 168, hl_hoja: 4.4, pct_hoja: 0.0136 },
    porRevision: new Map() };
  root.render(<Informe datos={datos}
    opciones={{ socios: [["logi", "Logisinú"], ["trans", "Transportes del Caribe"]], envases: [["G175", "Costeñita 175"]], canales: [["t1", "T1"]], primera: "2026-09-01", ultima: "2026-09-29" }}
    filtro={{ desde: "2026-09-01", hasta: "2026-09-29" }} esEditor={false} />);
} else if (m === "seguimiento") {
  const fila = (cd: string, pl: string, hl: number, real: number) => ({
    mes: "2026-09-01", cd_origen: cd, planta: pl, aplica_sider: true, fuera_del_maestro: false,
    vh_recibidos: hl / 25, vh_bu_mtd: hl / 250, vh_real_mtd: real / 25,
    pct_cumplimiento_vh: real / (hl * 0.1), hl_recibido: hl, bu_mtd: hl * 0.1, real_mtd: real,
    pct_cumplimiento: real / (hl * 0.1), pct_certificacion: real / hl, viajes: 12, estibas: 240, lineas_zlde: 30, meta: 0.1 });
  const filas = [fila("Curumaní", "CUR", 3937, 697), fila("Turbaco", "TUR", 31042, 2462), fila("Apartadó", "APA", 21500, 2320),
    fila("Medellín", "MDE", 48200, 1900), fila("Yumbo", "YUM", 15900, 0)];
  root.render(<Seguimiento filas={filas as any} zlde={[{ cd_origen: "Curumaní", planta: "Barranquilla", clase: "EER", hl: 3937, vh_recibidos: 8, lineas: 20 },
    { cd_origen: "Turbaco", planta: "Barranquilla", clase: "EER", hl: 31042, vh_recibidos: 60, lineas: 80 }] as any}
    desde="2026-09-01" hasta="2026-09-29" dias={[]} nombreMes="septiembre 2026" esEditor />);
} else if (m === "novedades") {
  const nov = (n: number, o: any) => ({
    id: "n" + n, tramo: "t1", tipo: "viaje", motivo: "sello", motivo_nombre: "Sello roto", viaje_id: "v" + n,
    placa: "JYN141", fecha: "2026-09-27", hora: "14:30:00", factura: "7687019429", lote: "L2609A", sku: "3500887",
    cantidad: 4, unidad: "estibas", descripcion: "Llegó con el sello roto y 4 estibas golpeadas.", foto_ruta: null,
    cd_responsable: "Apartadó", compromiso: null, fecha_compromiso: null, estado: "abierta", que_se_hizo: null,
    creada_por: "u1", creada_en: hace(30), cerrada_por: null, cerrada_en: null, cd_origen: "Apartadó", material: "Botella Costeña 175 cc", estado_viaje: "recibido", pegada_a_viaje: true, dias: 2, vencida: false, respuestas: 0, ...o });
  const novedades = [nov(1, {}), nov(2, { placa: "KLM872", motivo_nombre: "Estibas golpeadas", cantidad: 2 }),
    nov(3, { placa: "PQR305", estado: "cerrada", que_se_hizo: "Se repuso la carga.", cerrada_en: hace(4) })];
  root.render(<Novedades novedades={novedades as any}
    motivos={[{ clave: "sello", nombre: "Sello roto", tramo: null, tipo: "viaje", orden: 1 },
              { clave: "falt", nombre: "Faltante", tramo: null, tipo: "viaje", orden: 2 },
              { clave: "golpe", nombre: "Estibas golpeadas", tramo: "t1", tipo: "viaje", orden: 3 },
              { clave: "cerr", nombre: "Cliente cerrado", tramo: "t2", tipo: "entrega", orden: 4 }] as any}
    viajes={[{ id: "v1", placa: "JYN141", cd_origen: "Apartadó", descripcion: "Botella Costeña 175 cc", sku: "3500887", factura: "7687019429", lote: "L2609A" }] as any}
    hilo={[]} nombres={nombres} puedeEditar miBodega="Barranquilla" />);
} else if (m === "maestro") {
  root.render(<Maestro origenes={ORIGENES as any} skus={SKUS} estibasPorSider={36} esEditor />);
} else if (m === "importar") {
  root.render(<Importar maestro={{ origenes: ORIGENES, skus: SKUS } as any} zldeCargado={[{ mes: "2026-08-01", cd: 11, hl: 246268 }]} importados={[{ mes: "2026-07-01", viajes: 320 }]} />);
}
