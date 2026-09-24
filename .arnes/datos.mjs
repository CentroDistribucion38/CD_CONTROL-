/* Viajes de mentira pero con la FORMA real de v_sider_viajes. */
const CDS = ['CD Galapa','CD Santa Marta','CD Turbaco','CD Unión Montería','CD Corozal','CD OL Curumaní'];
const MATS = [['3501226','BOTELLA MARRON 250 CC','EER'],['3500028','CANASTA PLASTICA','EER'],['3503016','BOTELLA 330 CC','RET']];
export function viajesFalsos(n, { transito = false } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const cd = CDS[i % CDS.length];
    const [sku, desc, clase] = MATS[i % MATS.length];
    const estibas = 10 + (i % 30);
    const salida = new Date(Date.now() - (i % 9) * 86400000 - (i % 30) * 3600000);
    const anulado = !transito && i % 17 === 0;
    const importado = !transito && i % 5 === 0;
    out.push({
      id: `v${i}`, placa: `ABC${String(100 + i).slice(-3)}`,
      planta: cd.replace('CD ',''), cd_origen: cd, cd_destino: 'Barranquilla',
      sku, descripcion: desc, tipo_envase: clase, estibas,
      estado: anulado ? 'anulado' : transito ? 'en_transito' : (i % 3 ? 'recibido' : 'en_transito'),
      importado, observacion: i % 7 === 0 ? 'Llegó con dos estibas menos y el sello venía roto' : null,
      motivo_anulacion: anulado ? 'Se digitó dos veces' : null,
      anulado_en: anulado ? salida.toISOString() : null, anulado_por: anulado ? 'u1' : null,
      creado_por: 'u1', creado_en: salida.toISOString(), fecha: salida.toISOString(),
      num_mes: salida.getMonth() + 1, semana: 37, anio: salida.getFullYear(),
      sider: +(estibas / 36).toFixed(4),
      cajas: i % 11 === 0 ? null : estibas * 45,
      unidades: i % 11 === 0 ? null : estibas * 45 * 38,
      hl: i % 11 === 0 ? null : +(estibas * 45 * 38 * 0.0025).toFixed(2),
      faltan_factores: i % 11 === 0,
      cert_salida_id: importado ? null : `s${i}`,
      salida_en: importado ? null : salida.toISOString(),
      salida_lat: 10.9, salida_lng: -74.8, salida_precision: 12, salida_direccion: 'Calle 30 #12-4',
      cert_llegada_id: null, llegada_en: null, llegada_lat: null, llegada_lng: null,
      llegada_precision: null, llegada_direccion: null,
      fotos_salida: importado ? 0 : (i % 8 === 0 ? 2 : 3), fotos_llegada: 0,
      en_camino: `${(i % 40)}:${String(i % 60).padStart(2,'0')}:00`,
    });
  }
  return out;
}
