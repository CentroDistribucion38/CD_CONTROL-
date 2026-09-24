const CAUSAL_NOMBRE = {
  transporte: "Aver\xEDa transporte",
  deposito: "Aver\xEDa dep\xF3sito",
  contaminado: "Producto contaminado"
};
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
const calleDe = (u) => (u.trim().match(/^[A-Za-z]+/)?.[0] ?? u).toUpperCase();
const dias = (a, b) => Math.round((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 864e5);
function porClave(av, clave) {
  const m = /* @__PURE__ */ new Map();
  for (const a of av) {
    const k = clave(a);
    const x = m.get(k) ?? { cajas: 0, unidades: 0, n: 0 };
    m.set(k, { cajas: x.cajas + a.cajas, unidades: x.unidades + a.unidades, n: x.n + 1 });
  }
  return [...m.entries()].sort((p, q) => q[1].cajas - p[1].cajas);
}
function hallazgos(av, hoy) {
  const out = [];
  const cajas = av.reduce((t, a) => t + a.cajas, 0);
  if (av.length === 0) return out;
  const calles = porClave(av, (a) => calleDe(a.ubicacion));
  if (calles.length > 1 && cajas >= 10 && av.length >= 3) {
    const [calle, d] = calles[0];
    const p = pct(d.cajas, cajas);
    if (p >= 40) {
      const enEsa = av.filter((a) => calleDe(a.ubicacion) === calle);
      const dep = enEsa.filter((a) => a.causal === "deposito").reduce((t, a) => t + a.cajas, 0);
      const pDep = pct(dep, d.cajas);
      out.push({
        peso: p >= 55 ? "alto" : "medio",
        cifra: `${p} %`,
        dice: `${p} de cada 100 cajas averiadas est\xE1n en la calle ${calle}`,
        /* LA SEGUNDA LÍNEA ES LA QUE VALE: concentrarse en un sitio no
           dice nada si la causa es el transporte —el camión no es de la
           calle—. Si la causa es depósito, el problema SÍ es del sitio. */
        porque: pDep >= 50 ? `y ${pDep} % de esas son aver\xEDa de dep\xF3sito, no de transporte: el problema es del sitio, no del viaje` : `pero solo ${pDep} % son de dep\xF3sito: llega averiado, no se aver\xEDa ah\xED`,
        cuenta: `${d.cajas} de ${cajas} cajas \xB7 ${enEsa.length} aver\xEDas \xB7 ${dep} cajas de dep\xF3sito`
      });
    }
  }
  const sinDoc = av.filter((a) => !a.documento);
  if (sinDoc.length > 0) {
    const cjs = sinDoc.reduce((t, a) => t + a.cajas, 0);
    const uds = sinDoc.reduce((t, a) => t + a.unidades, 0);
    const vieja = sinDoc.map((a) => dias(a.fecha, hoy)).sort((x, z) => z - x)[0];
    out.push({
      peso: vieja >= 7 ? "alto" : "medio",
      cifra: `${sinDoc.length}`,
      dice: `${sinDoc.length} aver${sinDoc.length === 1 ? "\xEDa" : "\xEDas"} sin documento de baja`,
      porque: `son ${cjs} cajas (${uds} unidades) que ya no existen y que el inventario sigue contando` + (vieja >= 7 ? `; la m\xE1s vieja lleva ${vieja} d\xEDas esperando` : ""),
      cuenta: `${sinDoc.map((a) => a.codigo).slice(0, 6).join(", ")}` + (sinDoc.length > 6 ? ` y ${sinDoc.length - 6} m\xE1s` : "")
    });
  }
  const conDoc = av.filter((a) => a.documento && a.documento_en);
  if (conDoc.length >= 3) {
    const ds = conDoc.map((a) => dias(a.fecha, a.documento_en)).sort((x, z) => x - z);
    const prom = ds.reduce((t, x) => t + x, 0) / ds.length;
    const peor = ds[ds.length - 1];
    out.push({
      peso: peor >= 10 ? "medio" : "dato",
      cifra: `${prom.toFixed(1).replace(".", ",")} d\xEDas`,
      dice: "es lo que tarda en promedio una aver\xEDa en darse de baja en SAP",
      porque: peor >= 10 ? `la m\xE1s lenta tard\xF3 ${peor} d\xEDas: mientras tanto el inventario contaba producto que no estaba` : `entre ${ds[0]} y ${peor} d\xEDas`,
      cuenta: `${conDoc.length} aver\xEDas con documento`
    });
  }
  const porVencer = av.filter((a) => a.vence && dias(hoy, a.vence) >= 0 && dias(hoy, a.vence) <= 30);
  if (porVencer.length > 0) {
    const cjs = porVencer.reduce((t, a) => t + a.cajas, 0);
    const pronto = porVencer.map((a) => dias(hoy, a.vence)).sort((x, z) => x - z)[0];
    out.push({
      peso: pronto <= 7 ? "alto" : "medio",
      cifra: `${cjs}`,
      dice: `${cjs} cajas averiadas vencen dentro de 30 d\xEDas`,
      porque: `la m\xE1s pr\xF3xima vence en ${pronto} d\xEDa${pronto === 1 ? "" : "s"}: despu\xE9s de esa fecha ya no se le reclama a nadie`,
      cuenta: porVencer.map((a) => `${a.codigo} vence ${a.vence}`).slice(0, 4).join(" \xB7 ")
    });
  }
  const causales = porClave(av, (a) => a.causal);
  if (cajas >= 10 && causales.length > 1) {
    const [c, d] = causales[0];
    const p = pct(d.cajas, cajas);
    if (p >= 45) {
      out.push({
        peso: "dato",
        cifra: `${p} %`,
        dice: `la causal que m\xE1s pesa es \xAB${CAUSAL_NOMBRE[c]}\xBB`,
        porque: c === "transporte" ? "se le reclama al transportador, y para eso la foto tiene que estar" : c === "deposito" ? "es de la operaci\xF3n del centro: manipulaci\xF3n, apilado o estibado" : "es de calidad, y no se arregla moviendo estibas",
        cuenta: `${d.cajas} de ${cajas} cajas \xB7 ${d.n} aver\xEDas`
      });
    }
  }
  const prods = porClave(av, (a) => a.producto);
  if (prods.length > 2 && cajas >= 10) {
    const [nombre, d] = prods[0];
    const p = pct(d.cajas, cajas);
    if (p >= 35) {
      out.push({
        peso: "dato",
        cifra: `${p} %`,
        dice: `\xAB${nombre}\xBB concentra ${p} % de las cajas averiadas`,
        porque: "si un solo producto pesa tanto, mirar su estiba y su sitio antes que el resto",
        cuenta: `${d.cajas} cajas en ${d.n} aver\xEDas`
      });
    }
  }
  const gente = porClave(av, (a) => a.reporto);
  if (av.length >= 5 && gente.length === 1) {
    out.push({
      peso: "medio",
      cifra: "1",
      dice: `todas las aver\xEDas del per\xEDodo las report\xF3 una sola persona (${gente[0][0]})`,
      porque: "en un centro de varios turnos eso casi nunca significa que los dem\xE1s no rompan: significa que no reportan",
      cuenta: `${av.length} aver\xEDas, un solo reportante`
    });
  }
  const orden = { alto: 0, medio: 1, dato: 2 };
  return out.sort((a, b) => orden[a.peso] - orden[b.peso]);
}
export {
  CAUSAL_NOMBRE,
  hallazgos
};
