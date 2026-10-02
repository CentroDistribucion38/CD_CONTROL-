
import { createRoot } from "react-dom/client";
import { Sorting, haceCuanto, esTarde } from "../src/app/(app)/sider/sorting/Sorting";
import { FormularioAi } from "../src/modulos/sider/FormularioAi";
import { Transito } from "../src/app/(app)/sider/transito/Transito";
import { Viajes } from "../src/app/(app)/sider/Viajes";
import { Informe } from "../src/app/(app)/sider/seguimiento/ai/Informe";
import { unirMarcasSorting } from "../src/modulos/sider/comun";
(window as any).__unir = unirMarcasSorting;
(window as any).__haceCuanto = haceCuanto;
(window as any).__esTarde = esTarde;

const AHORA = "2026-09-29T15:00:00.000Z";
const hace = (h: number) => new Date(Date.parse(AHORA) - h * 3600000).toISOString();

const maestros: any = {
  falta: false,
  defectos: [
    { clave: "rota", nombre: "Rota o despicado", cobra: true, orden: 1, activo: true },
    { clave: "faltante", nombre: "Faltante", cobra: true, orden: 2, activo: true },
    { clave: "hongo", nombre: "Hongo", cobra: false, orden: 3, activo: true },
  ],
  envases: [{ clave: "G175", descripcion: "Costeñita 175", litros: 0.175, activo: true }],
  socios: [{ clave: "logi", nombre: "Logisinú", activo: true }],
  canales: [{ clave: "socios", nombre: "Socios", activo: true }, { clave: "t1", nombre: "T1", activo: true }],
};

/* n=1 certificada de 30 h · n=2 certificada de 3 h · n=3 NORMAL INTERNO de 50 h ·
   n=4 normal (marcada por el administrador) de 5 h. */
const pend = (n: number, h: number, o: any = {}) => ({
  viaje_id: "v" + n, tipo: o.tipo ?? "ai", placa: o.placa ?? "REV00" + n, planta: "BAQ", sku: "3500887",
  estibas: 20 + n, fecha: "2026-09-28", llego_en: hace(h), pedido_en: hace(h + 5),
  pedido_por: "u1", motivo: o.motivo ?? null, interno: !!o.interno,
  pedido_nombre: o.pedido ?? "Cristian Padilla",
  /* la vista de pendientes siempre trae el envase del material; el canal solo el Vh Interno */
  envase: o.envase ?? "G175",
  ...(o.canal ? { canal: o.canal, socio: o.socio ?? null } : {}),
});
const det = (n: number, o: any = {}) => ({
  id: "v" + n, placa: "REV00" + n, cd_origen: o.origen ?? "Apartadó", cd_destino: "Barranquilla",
  descripcion: o.desc ?? "Botella Costeña 175 cc", tipo_envase: "G175", sider: 12.5, cajas: 1440, hl: 25.2,
  ...(o.unidades ? { unidades: o.unidades } : {}),
});
const hecho = (n: number, o: any = {}) => ({
  id: "r" + n, viaje_id: "v" + n, fecha: "2026-09-27", planta: "BAQ", placa: o.placa ?? "HEC00" + n,
  turno: "T2", envase: "G175", envase_nombre: o.env ?? "Costeñita 175",
  recibidas: 82080, revisadas: 4104, defectos: 48, indice: 0.011696, ediciones: o.ed ?? 0,
  revisado_por: "u2", revisado_en: hace(20 + n), comentarios: null, zcl3: null,
  canal: "t1", certificado: false, socio: null, ...(o.sinTipo ? {} : { tipo: o.tipo ?? "ai" }),
});

const ORIGENES = [
  { planta: "APA", cd_origen: "Apartadó" }, { planta: "BAQ", cd_origen: "Barranquilla" },
  { planta: "MDE", cd_origen: "Medellín" }];
const SKUS_M = [
  { sku: "3500887", descripcion: "Botella Costeña 175 cc", clase: "Envase", cajas_x_estiba: 72, unidades_x_caja: 24, hl_x_unidad: 0.00175 },
  { sku: "3500901", descripcion: "Costeñita Ámbar 330 cc", clase: "Envase", cajas_x_estiba: 60, unidades_x_caja: 24, hl_x_unidad: 0.0033 },
  { sku: "3500999", descripcion: "Caja plástica azul", clase: "Envase", cajas_x_estiba: null, unidades_x_caja: null, hl_x_unidad: null }];

const cuatro = [
  pend(1, 30), pend(2, 3),
  pend(3, 50, { tipo: "sorting", interno: true, pedido: "Control Uno", placa: "INT003", canal: "socios", socio: "logi", envase: "G175" }),
  pend(4, 5, { tipo: "sorting" }),
];
const casos: Record<string, any> = {
  normal: { puedeEditar: true, puedeCrear: true, maestros, pendientes: cuatro,
    detalle: [det(1, { unidades: 34560 }), det(2), det(4)],   /* el 3 SIN detalle: no puede esconderse */
    hechos: [hecho(1), hecho(2, { tipo: "sorting", ed: 2 }), hecho(3), hecho(5, { sinTipo: true })] },
  /* EL QUE ADMINISTRA LA PLATAFORMA: escoge y anula, como en Tránsito. */
  manda: { puedeEditar: true, puedeCrear: true, manda: true, maestros, pendientes: cuatro,
    detalle: [det(1, { unidades: 34560 }), det(2), det(4)], hechos: [hecho(1), hecho(2, { tipo: "sorting" })] },
  soloNormal: { puedeEditar: true, maestros, pendientes: [pend(4, 5, { tipo: "sorting" })],
    detalle: [det(4)], hechos: [hecho(2, { tipo: "sorting" })] },
  largos: { puedeEditar: true, maestros,
    pendientes: [pend(1, 30, { pedido: "Nombre Muy Largo De Una Persona Con Apellidos Compuestos" }),
                 pend(3, 50, { tipo: "sorting", interno: true, placa: "ABC-1234-LARGA", pedido: "Otro Nombre Muy Largo De Persona De Control" })],
    detalle: [det(1, { origen: "Centro de distribución de Apartadó zona franca", desc: "Botella retornable Costeña 175 cc caja por veinticuatro unidades reforzada" })],
    hechos: [hecho(1, { placa: "XYZ-9999-LARGA", env: "Envase retornable de vidrio color ámbar de 175 centímetros cúbicos" }),
             hecho(2, { tipo: "sorting", placa: "XYZ-8888-LARGA" })] },
  /* EDITA REVISIONES PERO NO TIENE EL PERMISO «Vh Interno (+)»: sin «+». */
  sincrear: { puedeEditar: true, puedeCrear: false, maestros, pendientes: [pend(1, 30)], detalle: [det(1)], hechos: [hecho(1)] },
  /* CREA PERO NO CIERRA REVISIONES: el «+» es de su propio permiso. */
  soloCrea: { puedeEditar: false, puedeCrear: true, maestros: null, pendientes: [pend(1, 30)], detalle: [det(1)], hechos: [hecho(1)] },
  lectura: { puedeEditar: false, maestros: null, pendientes: [pend(1, 30)], detalle: [det(1)], hechos: [hecho(1)] },
  vacio: { puedeEditar: true, maestros, pendientes: [], detalle: [], hechos: [] },
  /* SIN PERMISO PERO CON LOS MAESTROS: el componente tiene que negarse
     POR SU CUENTA, no confiar en que la página nunca se los pase. */
  lecturaConMaestros: { puedeEditar: false, maestros, pendientes: [pend(1, 30)], detalle: [det(1)], hechos: [hecho(1)] },
};

const q = new URL(location.href).searchParams;
const m = q.get("m") ?? "sorting";
const c = q.get("c") ?? "normal";
const root = createRoot(document.getElementById("r")!);

if (m === "sorting") {
  const k = casos[c];
  root.render(<Sorting ahora={AHORA} pendientes={k.pendientes} detalle={k.detalle}
    hechos={k.hechos} nombres={{ u1: "Cristian Padilla", u2: "Muchacho Uno" }}
    maestros={k.maestros} puedeEditar={k.puedeEditar}
    puedeCrear={!!k.puedeCrear} manda={!!k.manda} origenes={k.puedeCrear ? ORIGENES : []} skus={k.puedeCrear ? SKUS_M : []}
    socios={k.puedeCrear ? [{ clave: "logi", nombre: "Logisinú" }, { clave: "sur", nombre: "Distribuciones del Sur" }] : []}
    estibasPorSider={36} />);
} else if (m === "form") {
  const viaje = { viaje_id: "vf", placa: "FRM001", planta: "BAQ", fecha: "2026-09-28", sku: "3500887",
                  llego_en: hace(2),
                  ...(q.get("u") ? { unidades: Number(q.get("u")) } : {}),
                  ...(q.get("canal") ? { canal: q.get("canal") } : {}),
                  ...(q.get("socio") ? { socio: q.get("socio") } : {}),
                  ...(q.get("envase") ? { envase: q.get("envase") } : {}),
                  ...(q.get("interno") ? { interno: true } : {}) };
  /* «corregir»: una revisión ya guardada, de T3, de T1 (canal), con envase G175. */
  const previa: any = q.get("previa") ? {
    id: "r9", viaje_id: "vf", fecha: "2026-09-27", planta: "BAQ", placa: "FRM001", turno: "T3",
    canal: "t1", canal_nombre: "T1", socio: null, socio_nombre: null, envase: "G175", envase_nombre: "Costeñita 175",
    litros: 0.175, certificado: false, recibidas: 1000, revisadas: 100, zcl3: null, comentarios: null,
    revisado_por: "u2", revisado_en: hace(20), editado_por: null, editado_en: null, ediciones: 0,
    defectos: 0, otros: 0, marcadas: 0, indice: 0, no_abono: 0, abono_sap: 1000, hl_defectos: 0 } : null;
  root.render(<FormularioAi viaje={viaje} revision={previa} detalle={[]} defectos={maestros.defectos}
    envases={maestros.envases} socios={maestros.socios} canales={maestros.canales}
    alGuardar={() => { (window as any).__guardado = true }} alCancelar={() => {}}
    {...(c === "sorting" ? { tipo: "sorting" as const } : {})} />);
} else if (m === "viajes") {
  /* FUENTE PRINCIPAL: la marca de la revisión normal junto al estado, y el interno. */
  const f = (n: number, o: any) => ({
    id: "f" + n, placa: "FUE00" + n, planta: "APA", cd_origen: "Apartadó", cd_destino: "Barranquilla",
    sku: "3500887", descripcion: "Botella Costeña 175 cc", tipo_envase: "G175", estibas: 20, sider: 12.5,
    cajas: 1440, unidades: 34560, hl: 25.2, estado: "recibido", en_camino: null, fotos_salida: 3,
    fotos_llegada: 3, salida_en: hace(30), llegada_en: hace(24), creado_por: "u1", creado_en: hace(30),
    fecha: "2026-09-28", num_mes: 9, semana: 39, anio: 2026, importado: false, faltan_factores: false,
    observacion: null, motivo_anulacion: null, ...o });
  const viajes = [f(1, {}), f(2, {}), f(3, {}), f(4, { estado: "en_transito" }),
                  f(5, { fotos_salida: 0, salida_en: null, en_camino: null }),
                  ...(c === "eliminar" || c === "sinmanda" ? [f(6, { estado: "anulado", motivo_anulacion: "Se digitó dos veces" }),
                                          f(7, { estado: "anulado", motivo_anulacion: "No salió" })] : [])];
  root.render(<Viajes viajes={viajes as any} nombres={{ u1: "Cristian Padilla" }} origenes={[]} skus={[]}
    manda={c === "eliminar"} esEditor={false}
    sorting={c === "sinmarcas" ? {} : { f1: "pendiente", f2: "hecho", f4: "pendiente", f5: "pendiente" }}
    internos={c === "sinmarcas" ? [] : ["f5"]} />);
} else if (m === "informe") {
  const rv = (n: number, o: any) => ({
    id: "i" + n, viaje_id: "v" + n, fecha: "2026-09-2" + n, planta: "BAQ", placa: "INF00" + n, turno: "T1",
    envase: "G175", envase_nombre: "Costeñita 175", recibidas: 1000, revisadas: 100, defectos: 3, otros: 0,
    no_abono: 30, hl_defectos: 0.1, indice: 0.03, socio: "logi", socio_nombre: "Logisinú",
    canal: "t1", canal_nombre: "T1", origen: "propio", ediciones: 0, comentarios: null, zcl3: null,
    defectos_hoja: 3, hl_hoja: 0.1, pct_hoja: 0.03, ...o });
  const revs = c === "sintipo"
    ? [rv(1, {}), rv(2, {})]
    : [rv(1, { tipo: "ai" }), rv(2, { tipo: "sorting" }), rv(3, { tipo: "sorting" })];
  const datos: any = { revisiones: revs,
    defectos: [{ clave: "rota", nombre: "Rota o despicado", cobra: true, orden: 1, unidades: 9, hl: 0.3, pct: 0.03 }],
    socios: [{ clave: "logi", nombre: "Logisinú", revisiones: revs.length, recibidas: 3000, revisadas: 300, defectos: 9, no_abono: 90, hl: 0.3, indice: 0.03 }],
    semanas: [{ semana: "2026-09-21", revisiones: revs.length, revisadas: 300, defectos: 9, indice: 0.03 }],
    total: { revisiones: revs.length, recibidas: 3000, revisadas: 300, defectos: 9, otros: 0, no_abono: 90, hl: 0.3,
             socios: 1, importadas: 0, indice: 0.03, defectos_hoja: 9, hl_hoja: 0.3, pct_hoja: 0.03 },
    porRevision: new Map() };
  root.render(<Informe datos={datos}
    opciones={{ socios: [["logi", "Logisinú"]], envases: [["G175", "Costeñita 175"]], canales: [["t1", "T1"]],
                primera: "2026-09-21", ultima: "2026-09-29" }}
    filtro={{ desde: "2026-09-21", hasta: "2026-09-29", ...(c === "filtrado" ? { tipo: "sorting" } : {}) }}
    esEditor={false} />);
} else {
  /* TRÁNSITO: la tarjeta, con los casos que importan. */
  const v = (n: number, o: any) => ({
    id: "t" + n, placa: o.placa ?? "TRN00" + n, planta: "APA", cd_origen: "Apartadó", cd_destino: "Barranquilla",
    sku: "3500887", descripcion: "Botella Costeña 175 cc", tipo_envase: "G175", estibas: 20, sider: 12.5,
    cajas: 1440, hl: 25.2, estado: "en_transito", en_camino: "05:30:00", fotos_salida: 3,
    salida_en: hace(6), salida_direccion: o.dir ?? "Calle 30 # 12-45, zona industrial", creado_por: "u1",
    creado_en: hace(6), fecha: "2026-09-29", importado: false, requiere_ai: false, ...o });
  const interno = (n: number, o: any = {}) => v(n, { placa: "INT00" + n, interno: true, requiere_sorting: true,
    fotos_salida: 0, salida_en: null, en_camino: null, salida_direccion: null, creado_en: hace(2), ...o });
  const viajes = c === "largos"
    ? [v(1, { requiere_ai: true, dir: "Kilómetro 14 vía Barranquilla – Ciénaga, sector zona franca industrial, bodega 12 y 13" }),
       interno(2, { descripcion: "Botella retornable Costeña 175 cc caja por veinticuatro unidades reforzada" })]
    : c === "sinfotos"
    ? [v(1, { fotos_salida: 1 }), interno(2)]
    : [v(1, {}), v(2, { requiere_sorting: true }), v(3, { requiere_ai: true }),
       interno(4), v(5, { requiere_ai: true, requiere_sorting: true })];
  const origenes = [
    { planta: "APA", cd_origen: "Apartadó" }, { planta: "BAQ", cd_origen: "Barranquilla" },
    { planta: "MDE", cd_origen: "Medellín" }];
  const skus = [
    { sku: "3500887", descripcion: "Botella Costeña 175 cc", clase: "Envase", cajas_x_estiba: 72, unidades_x_caja: 24, hl_x_unidad: 0.00175 },
    { sku: "3500901", descripcion: "Costeñita Ámbar 330 cc", clase: "Envase", cajas_x_estiba: 60, unidades_x_caja: 24, hl_x_unidad: 0.0033 },
    { sku: "3500999", descripcion: "Caja plástica azul", clase: "Envase", cajas_x_estiba: null, unidades_x_caja: null, hl_x_unidad: null }];
  root.render(<Transito viajes={viajes as any} nombres={{ u1: "Cristian Padilla" }}
    esEditor={c !== "lectura"} puedePedirAi={c !== "noadmin"} manda={c !== "noadmin"}
    origenes={origenes} skus={skus} estibasPorSider={36}
    trabados={0} sinEvidencia={0} cabeza={<h1>En tránsito</h1>} />);
}
