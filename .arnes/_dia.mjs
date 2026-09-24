// src/modulos/traspasos/datos.ts
const createClient = null;
function sinTablas(msg) {
  const t = (msg ?? "").toLowerCase();
  return t.includes("does not exist") || t.includes("schema cache");
}
function hoyLocal() {
  const bogota = new Date(Date.now() - 5 * 36e5);
  if (bogota.getUTCHours() >= 22) bogota.setUTCDate(bogota.getUTCDate() + 1);
  return bogota.toISOString().slice(0, 10);
}
async function tipos(soloActivos = true) {
  const supabase = await createClient();
  let q = supabase.from("traspasos_tipos").select("*");
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q.order("orden", { ascending: true, nullsFirst: false });
  if (error) return { tipos: [], falta: sinTablas(error.message) };
  return { tipos: data ?? [], falta: false };
}
async function puntos(soloActivos = true) {
  const supabase = await createClient();
  let q = supabase.from("traspasos_puntos").select("*");
  if (soloActivos) q = q.eq("activo", true);
  const { data } = await q.order("orden", { ascending: true, nullsFirst: false });
  return data ?? [];
}
async function viajesDelDia(fecha) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_traspasos_viajes").select("*").eq("fecha", fecha).order("hora", { ascending: false });
  if (error) return { viajes: [], falta: sinTablas(error.message) };
  return { viajes: data ?? [], falta: false };
}
async function viajesRango(desde, hasta) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_traspasos_viajes").select("*").gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }).order("hora", { ascending: false }).limit(2e4);
  if (error) return { viajes: [], falta: sinTablas(error.message) };
  return { viajes: data ?? [], falta: false };
}
async function control(fecha) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_traspasos_control").select("*").eq("fecha", fecha).order("turno_orden", { ascending: true }).order("tipo_orden", { ascending: true, nullsFirst: false });
  if (error) return { filas: [], falta: sinTablas(error.message) };
  return { filas: data ?? [], falta: false };
}
async function controlRango(desde, hasta) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_traspasos_control").select("*").gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }).order("turno_orden", { ascending: true }).order("tipo_orden", { ascending: true, nullsFirst: false });
  if (error) return { filas: [], falta: sinTablas(error.message) };
  return { filas: data ?? [], falta: false };
}
async function vaciosRango(desde, hasta) {
  const supabase = await createClient();
  const { data } = await supabase.from("v_traspasos_viajes").select("fecha, turno, viajes").eq("vacio", true).eq("estado", "registrado").gte("fecha", desde).lte("fecha", hasta);
  return (data ?? []).reduce((a, v) => a + v.viajes, 0);
}
async function puntosFaltantes() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_traspasos_puntos_faltantes").select("*").order("veces", { ascending: false });
  if (error) return [];
  return (data ?? []).map((f) => ({
    texto: f.texto,
    veces: f.veces ?? 0,
    /* La vista vieja no traía estas tres. Si todavía es la que está
       corriendo, la pantalla se ve completa igual: sin semana y sin
       pareja, que es exactamente lo que había antes. */
    veces_semana: f.veces_semana ?? 0,
    ultima: f.ultima,
    parecido: f.parecido ?? null,
    parecido_nombre: f.parecido_nombre ?? null,
    parecido_viajes: f.parecido_viajes ?? null
  }));
}
async function usoDelMaestro() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_traspasos_uso").select("clase, clave, viajes, ultima");
  const tipos2 = {};
  const pts = {};
  const placas = {};
  const rutas = {};
  const ultima = {};
  if (error) return { tipos: tipos2, puntos: pts, placas, rutas, ultima, falta: true };
  for (const f of data ?? []) {
    if (f.clase === "tipo") tipos2[f.clave] = f.viajes;
    else if (f.clase === "punto") pts[f.clave] = f.viajes;
    else if (f.clase === "placa") placas[f.clave] = f.viajes;
    else if (f.clase === "ruta") rutas[f.clave] = f.viajes;
    ultima[f.clase + ":" + f.clave] = f.ultima;
  }
  return { tipos: tipos2, puntos: pts, placas, rutas, ultima, falta: false };
}
async function placasMaestro(soloActivas = true) {
  const supabase = await createClient();
  let q = supabase.from("traspasos_placas").select("placa, nota, activo, orden");
  if (soloActivas) q = q.eq("activo", true);
  const { data, error } = await q.order("orden", { ascending: true, nullsFirst: false });
  if (error) return { placas: [], falta: sinTablas(error.message) };
  return { placas: data ?? [], falta: false };
}
async function planDelDia(fecha) {
  const supabase = await createClient();
  const [pl, vac] = await Promise.all([
    supabase.from("traspasos_plan").select("id, fecha, turno, tipo, planeado, publicado").eq("fecha", fecha).eq("estado", "registrado"),
    supabase.from("traspasos_plan_vacios").select("turno, vacios").eq("fecha", fecha)
  ]);
  const lineas = pl.data ?? [];
  return {
    falta: !!pl.error && sinTablas(pl.error.message),
    publicadas: lineas.filter((l) => l.publicado),
    borrador: lineas.filter((l) => !l.publicado),
    vacios: vac.data ?? []
  };
}
async function placasRecientes(limite = 8) {
  const supabase = await createClient();
  const { data } = await supabase.from("v_traspasos_placas").select("placa, veces, ultima").order("ultima", { ascending: false }).limit(limite);
  return data ?? [];
}
async function rutasFrecuentes(limite = 6) {
  const supabase = await createClient();
  const { data } = await supabase.from("v_traspasos_rutas").select("origen, destino, veces").order("veces", { ascending: false }).limit(limite);
  return data ?? [];
}
async function promedioDelDia(fecha) {
  const supabase = await createClient();
  const d = (/* @__PURE__ */ new Date(fecha + "T12:00:00")).getUTCDay();
  const iso = d === 0 ? 7 : d;
  const { data } = await supabase.from("v_traspasos_promedio").select("turno, tipo, promedio, dias").eq("dia_semana", iso);
  return data ?? [];
}
async function diaAbierto(fecha) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("traspaso_dia_abierto", { p_fecha: fecha });
  if (error) return true;
  return data !== false;
}
var TOPE_DIA = 5e3;
async function cruceDelDia(fecha) {
  const supabase = await createClient();
  const [c, pri, ult, sd, cd] = await Promise.all([
    supabase.from("v_traspasos_cruce").select("*").or(`sap_fecha.eq.${fecha},sis_fecha.eq.${fecha}`).order("sap_hora").limit(TOPE_DIA),
    /* DE LOS MOVIMIENTOS, que es donde vive el corte desde que se guarda
       fila por fila. La tabla agrupada de antes quedó jubilada como
       `traspasos_sap_viejo` y ya no se actualiza: leerla daría un rango
       congelado en el día de la migración, sin dar error. */
    supabase.from("traspasos_sap_mov").select("fecha").order("fecha", { ascending: true }).limit(1),
    supabase.from("traspasos_sap_mov").select("fecha").order("fecha", { ascending: false }).limit(1),
    /* ===============================================================
           EL SEGUNDO CONTROL: LOS QUE SE REGISTRARON SIN DOCUMENTO.
    
           NO SALE EN NINGUNO DE LOS TRES MONTONES, y ese es el punto. El
           cruce empareja por número de documento; un viaje al que nadie le
           apuntó el número no tiene con qué emparejarse, así que no está en
           «faltan», no está en «sobran» y no está en «cuadran». Desaparece.
    
           Y es el agujero más grande de los dos: al documento de SAP que
           nadie registró se llega por el corte; al viaje sin documento no
           se llega por ningún lado — ni SAP sabe que existe, porque nadie
           escribió el papel que los une.
    
           LOS VACÍOS NO CUENTAN. Un viaje sin carga no lleva documento
           porque no hay papel que llevar; pedírselo obligaría a
           inventarlo. La vista ya lo resuelve: `sin_documento` es «con
           carga, registrado y sin documento».
           =============================================================== */
    /* DESDE FACTURACIÓN, «SIN DOCUMENTO» ES «POR FACTURAR»: el número
       que se cruza con SAP lo pone facturación al confirmar la salida.
       Un viaje que facturación no ha confirmado no tiene con qué
       emparejarse, igual que antes uno sin documento. */
    supabase.from("v_traspasos_viajes").select("*").eq("fecha", fecha).eq("por_facturar", true).order("turno_orden").order("hora").limit(500),
    /* ===============================================================
           Y LOS QUE SÍ LO LLEVAN. No es adorno: el resumen del día no
           puede decir «9 sin documento» sin decir sobre cuántos. «Nueve»
           de doce es un día malo; «nueve» de ciento cuarenta es otra cosa,
           y sin el denominador las dos se leen igual.
    
           SON LOS VIAJES, NO LOS DOCUMENTOS DEL CORTE: aquí se cuenta lo
           que la gente registró, que es lo que esta pantalla vigila. Lo
           que SAP tiene y nadie registró va en su propio montón, abajo.
           =============================================================== */
    supabase.from("v_traspasos_viajes").select("*").eq("fecha", fecha).eq("vale", true).not("factura_documento", "is", null).order("turno_orden").order("hora").limit(TOPE_DIA)
  ]);
  if (c.error) {
    return {
      falta: /does not exist|schema cache/i.test(c.error.message),
      lineas: [],
      tope: false,
      hayCorte: false,
      desde: null,
      hasta: null,
      sinDocumento: sd.data ?? [],
      conDocumento: cd.data ?? []
    };
  }
  const desde = pri.data?.[0]?.fecha ?? null;
  const hasta = ult.data?.[0]?.fecha ?? null;
  return {
    falta: false,
    lineas: c.data ?? [],
    tope: (c.data ?? []).length === TOPE_DIA,
    hayCorte: desde != null && hasta != null && desde <= fecha && fecha <= hasta,
    desde,
    hasta,
    /* VA APARTE DEL CRUCE Y NO DEPENDE DE ÉL: un viaje sin documento es
       un problema haya corte importado o no. Atarlo al corte lo
       escondería justo los días en que nadie importó nada. */
    sinDocumento: sd.data ?? [],
    conDocumento: cd.data ?? []
  };
}
async function importacionesSap(cuantas = 8) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_traspasos_sap_importaciones").select("*").order("cuando", { ascending: false }).limit(cuantas);
  if (error) {
    return {
      falta: /does not exist|schema cache/i.test(error.message),
      lista: []
    };
  }
  return { falta: false, lista: data ?? [] };
}
var FACTURACION_DESDE = "2026-09-21";
async function bandejaFacturacion(diasSalieron = 3) {
  const supabase = await createClient();
  const desde = new Date(Date.now() - diasSalieron * 864e5).toISOString();
  const [pend, sal] = await Promise.all([
    supabase.from("v_traspasos_viajes").select("*").eq("por_facturar", true).gte("fecha", FACTURACION_DESDE).order("fecha").order("turno_orden").order("hora").limit(500),
    supabase.from("v_traspasos_viajes").select("*").eq("salida_historica", false).not("salida_en", "is", null).gte("salida_en", desde).order("salida_en", { ascending: false }).limit(200)
  ]);
  if (pend.error) {
    return {
      falta: /column|does not exist|schema cache/i.test(pend.error.message),
      pendientes: [],
      salieron: []
    };
  }
  return {
    falta: false,
    pendientes: pend.data ?? [],
    salieron: sal.data ?? []
  };
}
export {
  FACTURACION_DESDE,
  bandejaFacturacion,
  control,
  controlRango,
  cruceDelDia,
  diaAbierto,
  hoyLocal,
  importacionesSap,
  placasMaestro,
  placasRecientes,
  planDelDia,
  promedioDelDia,
  puntos,
  puntosFaltantes,
  rutasFrecuentes,
  tipos,
  usoDelMaestro,
  vaciosRango,
  viajesDelDia,
  viajesRango
};
