// src/modulos/inventario/riesgo.ts
var FRANJAS = [
  { clave: "vencido", rot: "Ya vencido", corto: "Vencido", que: "pas\xF3 su fecha de vencimiento: no se puede despachar" },
  { clave: "pasado", rot: "Ya no alcanza a salir", corto: "Pas\xF3 de salida", que: "no llega al cliente con la vida \xFAtil m\xEDnima" },
  { clave: "semana", rot: "Sale esta semana", corto: "0\u20137 d\xEDas", que: "tiene que salir en los pr\xF3ximos 7 d\xEDas" },
  { clave: "quince", rot: "Sale en 8 a 15 d\xEDas", corto: "8\u201315 d\xEDas", que: "hay que programarlo" },
  { clave: "mes", rot: "Sale en 16 a 30 d\xEDas", corto: "16\u201330 d\xEDas", que: "vigilar" },
  { clave: "ok", rot: "Con margen", corto: "+30 d\xEDas", que: "m\xE1s de un mes para salir" },
  { clave: "sinfecha", rot: "Sin fecha", corto: "Sin fecha", que: "no se le puede calcular cu\xE1ndo sale" }
];
function franja(r) {
  if (r.dias_para_vencer != null && r.dias_para_vencer < 0) return "vencido";
  const d = r.dias_para_salir;
  if (d == null) return "sinfecha";
  if (d < 0) return "pasado";
  if (d <= 7) return "semana";
  if (d <= 15) return "quince";
  if (d <= 30) return "mes";
  return "ok";
}
var ORDEN = { vencido: 0, pasado: 1, semana: 2, quince: 3, mes: 4, ok: 5, sinfecha: 6 };
var peor = (a, b) => ORDEN[a] <= ORDEN[b] ? a : b;
var enRiesgo = (f) => ORDEN[f] <= ORDEN.mes;
var num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};
function medirRiesgo(lineas, conteos, uxcPorSku) {
  const cuando = new Map(conteos.map((c) => [c.id, c.enviado_en ?? c.fecha_analisis ?? ""]));
  const ultimoPorSitio = /* @__PURE__ */ new Map();
  for (const l of lineas) {
    const k = l.ubicacion_id ?? l.ubicacion ?? "\u2014";
    const actual = ultimoPorSitio.get(k);
    if (!actual || (cuando.get(l.conteo_id) ?? "") > (cuando.get(actual) ?? "")) ultimoPorSitio.set(k, l.conteo_id);
  }
  const foto = lineas.filter((l) => ultimoPorSitio.get(l.ubicacion_id ?? l.ubicacion ?? "\u2014") === l.conteo_id);
  const usados = new Set(foto.map((l) => l.conteo_id));
  const fechas = conteos.filter((c) => usados.has(c.id)).map((c) => c.fecha_analisis).filter(Boolean).sort();
  const vacia = () => ({ cajas: 0, unidades: 0, renglones: 0, materiales: 0, sinUxc: 0 });
  const franjas = Object.fromEntries(FRANJAS.map((f) => [f.clave, vacia()]));
  const porMat = /* @__PURE__ */ new Map();
  const matsPorFranja = /* @__PURE__ */ new Map();
  let totalCajas = 0, totalUnidades = 0;
  for (const l of foto) {
    if (l.tipo_material === "ENVASE") continue;
    const uxc = uxcPorSku[l.codigo] ?? null;
    const tc = num(l.total_cajas);
    const un = uxc ? tc * uxc : null;
    const f = franja(l);
    const fr = franjas[f];
    fr.cajas += tc;
    fr.renglones += 1;
    if (un != null) fr.unidades += un;
    else fr.sinUxc += 1;
    (matsPorFranja.get(f) ?? matsPorFranja.set(f, /* @__PURE__ */ new Set()).get(f)).add(l.codigo);
    totalCajas += tc;
    if (un != null) totalUnidades += un;
    const m = porMat.get(l.codigo) ?? {
      codigo: l.codigo,
      nombre: l.material,
      familia: l.familia,
      uxc,
      cajas: 0,
      unidades: uxc ? 0 : null,
      enRiesgoCajas: 0,
      enRiesgoUnidades: uxc ? 0 : null,
      franja: "ok",
      diasSalir: null,
      vence: null,
      sitios: []
    };
    m.cajas += tc;
    if (m.unidades != null && un != null) m.unidades += un;
    if (enRiesgo(f)) {
      m.enRiesgoCajas += tc;
      if (m.enRiesgoUnidades != null && un != null) m.enRiesgoUnidades += un;
    }
    m.franja = m.sitios.length ? peor(m.franja, f) : f;
    if (l.dias_para_salir != null && (m.diasSalir == null || l.dias_para_salir < m.diasSalir)) {
      m.diasSalir = l.dias_para_salir;
      m.vence = l.vencimiento;
    }
    m.sitios.push({
      id: l.id,
      ubicacion: l.ubicacion_combinada ?? l.ubicacion ?? "Sin ubicaci\xF3n",
      calle: l.calle,
      modulo: l.modulo,
      lado: l.lado,
      vencimiento: l.vencimiento,
      fabricacion: l.fabricacion,
      dias_para_vencer: l.dias_para_vencer,
      dias_para_salir: l.dias_para_salir,
      estibas: num(l.estibas),
      cajas: num(l.cajas),
      saldo: num(l.saldo),
      total_cajas: tc,
      unidades: un,
      franja: f,
      averia: !!l.averia,
      pnc: !!l.pnc,
      nota: l.nota,
      conto: l.conto,
      contado_en: l.contado_en,
      conteo: l.conteo
    });
    porMat.set(l.codigo, m);
  }
  for (const [f, s] of matsPorFranja) franjas[f].materiales = s.size;
  const materiales = [...porMat.values()].map((m) => ({
    ...m,
    sitios: m.sitios.sort((a, b) => ORDEN[a.franja] - ORDEN[b.franja] || (a.dias_para_salir ?? 1e9) - (b.dias_para_salir ?? 1e9) || a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }))
  })).sort((a, b) => ORDEN[a.franja] - ORDEN[b.franja] || b.enRiesgoCajas - a.enRiesgoCajas || b.cajas - a.cajas);
  const semanas = Array.from({ length: 9 }, (_, i) => ({ rot: i === 0 ? "Pas\xF3" : i === 1 ? "Esta" : `S+${i - 1}`, cajas: 0, unidades: 0 }));
  for (const l of foto) {
    if (l.tipo_material === "ENVASE" || l.dias_para_salir == null) continue;
    const i = l.dias_para_salir < 0 || franja(l) === "vencido" ? 0 : Math.floor(l.dias_para_salir / 7) + 1;
    if (i > 8) continue;
    const uxc = uxcPorSku[l.codigo] ?? null;
    semanas[i].cajas += num(l.total_cajas);
    if (uxc) semanas[i].unidades += num(l.total_cajas) * uxc;
  }
  return {
    foto,
    franjas,
    materiales,
    semanas,
    totalCajas,
    totalUnidades,
    ubicaciones: new Set(foto.map((l) => l.ubicacion_id ?? l.ubicacion)).size,
    desde: fechas[0] ?? null,
    hasta: fechas.at(-1) ?? null,
    recorridos: usados.size
  };
}
export {
  FRANJAS,
  enRiesgo,
  franja,
  medirRiesgo,
  peor
};
