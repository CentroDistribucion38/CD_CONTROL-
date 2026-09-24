// src/modulos/acciones/medir.ts
var HORA = 36e5;
var DIA = 864e5;
var MIN_MEDIR = 5;
var t = (s) => s ? Date.parse(s) : NaN;
var anulada = (a) => a.estado === "anulada";
function mediana(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function percentil(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)];
}
var pct = (a, b) => b ? Math.round(a / b * 100) : null;
var plazoH = (a) => (t(a.vence_en) - t(a.reportada_en)) / HORA;
var aTiempo = (a) => !!a.cerrada_en && t(a.cerrada_en) <= t(a.vence_en);
function lunes(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - (x.getDay() + 6) % 7);
  return x;
}
function medir(todas, hoyD, dias, metas, nombres = {}) {
  const hoy = hoyD.getTime();
  const desde = hoy - dias * DIA;
  const acc = todas.filter((a) => !anulada(a));
  const enPeriodo = (s) => {
    const x = t(s);
    return x >= desde && x <= hoy;
  };
  const vivas = acc.filter((a) => a.viva);
  const reportadas = acc.filter((a) => enPeriodo(a.reportada_en));
  const cerradas = acc.filter((a) => enPeriodo(a.cerrada_en));
  const verificadas = acc.filter((a) => enPeriodo(a.verificada_en) && a.efectiva !== null);
  const abiertasAntes = acc.filter((a) => t(a.reportada_en) <= desde && (!a.cerrada_en || t(a.cerrada_en) > desde)).length;
  const kpis = {
    abiertas: vivas.length,
    abiertasAntes,
    vencidas: vivas.filter((a) => a.vencida).length,
    reportadas: reportadas.length,
    cerradas: cerradas.length,
    aTiempo: pct(cerradas.filter(aTiempo).length, cerradas.length),
    efectividad: verificadas.length >= MIN_MEDIR ? pct(verificadas.filter((a) => a.efectiva).length, verificadas.length) : null,
    verificadas: verificadas.length,
    cierreMedianaH: mediana(cerradas.map((a) => (t(a.cerrada_en) - t(a.reportada_en)) / HORA)),
    metas
  };
  const tiempos = ["alta", "media", "baja"].map((p) => {
    const c = cerradas.filter((a) => a.prioridad === p);
    const asignar = acc.filter((a) => a.prioridad === p && enPeriodo(a.reportada_en) && a.asignada_en).map((a) => (t(a.asignada_en) - t(a.reportada_en)) / HORA);
    const cerrar = c.map((a) => (t(a.cerrada_en) - t(a.reportada_en)) / HORA);
    const verificar = acc.filter((a) => a.prioridad === p && enPeriodo(a.verificada_en) && a.cerrada_en).map((a) => (t(a.verificada_en) - t(a.cerrada_en)) / HORA);
    const plazos = acc.filter((a) => a.prioridad === p).map(plazoH).filter((x) => x > 0);
    return {
      prioridad: p,
      n: c.length,
      plazoH: mediana(plazos),
      asignarH: mediana(asignar),
      cerrarH: mediana(cerrar),
      cerrarP90H: percentil(cerrar, 90),
      verificarH: mediana(verificar),
      aTiempo: pct(c.filter(aTiempo).length, c.length)
    };
  });
  const semanas = [];
  const nSem = Math.min(26, Math.max(4, Math.ceil(dias / 7)));
  let ini = lunes(hoyD).getTime() - (nSem - 1) * 7 * DIA;
  for (let i = 0; i < nSem; i++, ini += 7 * DIA) {
    const fin = ini + 7 * DIA;
    const hasta = Math.min(fin, hoy);
    semanas.push({
      desde: ini,
      hasta: fin,
      entran: acc.filter((a) => {
        const x = t(a.reportada_en);
        return x >= ini && x < fin;
      }).length,
      cierran: acc.filter((a) => {
        const x = t(a.cerrada_en);
        return x >= ini && x < fin;
      }).length,
      quedan: acc.filter((a) => t(a.reportada_en) < hasta && (!a.cerrada_en || t(a.cerrada_en) >= hasta)).length,
      /* «29 jun», no «29 de jun»: en el celular caben seis y no tres. */
      etiqueta: `${new Date(ini).getDate()} ${new Date(ini).toLocaleDateString("es-CO", { month: "short" }).replace(".", "")}`
    });
  }
  const franjas = [
    { rot: "0\u20133 d\xEDas", de: 0, a: 3 },
    { rot: "4\u20137", de: 4, a: 7 },
    { rot: "8\u201315", de: 8, a: 15 },
    { rot: "16\u201330", de: 16, a: 30 },
    { rot: "M\xE1s de 30", de: 31, a: Infinity }
  ].map((f) => {
    const en = vivas.filter((a) => {
      const d = Math.floor((hoy - t(a.reportada_en)) / DIA);
      return d >= f.de && d <= f.a;
    });
    return { ...f, n: en.length, vencidas: en.filter((a) => a.vencida).length };
  });
  const grupos = /* @__PURE__ */ new Map();
  for (const a of acc) if (a.zona) {
    const k = a.motivo + "|" + a.zona;
    grupos.set(k, [...grupos.get(k) ?? [], a]);
  }
  let repeticiones = 0;
  const repiten = [...grupos.values()].map((g) => {
    const s = [...g].sort((a, b) => t(a.reportada_en) - t(b.reportada_en));
    let rep = 0;
    for (let i = 1; i < s.length; i++)
      if (t(s[i].reportada_en) - t(s[i - 1].reportada_en) <= 30 * DIA && enPeriodo(s[i].reportada_en)) rep++;
    repeticiones += rep;
    const u = s[s.length - 1];
    return {
      motivo: u.motivo_nombre,
      zona: u.zona_nombre ?? u.zona ?? "",
      codigoZona: u.zona ?? "",
      n: s.length,
      repeticiones: rep,
      abiertas: s.filter((a) => a.viva).length,
      ultima: u.reportada_en
    };
  }).filter((x) => x.n > 1).sort((a, b) => b.repeticiones - a.repeticiones || b.n - a.n);
  const reincidencia = {
    reabiertas: acc.filter((a) => a.estado === "reabierta").length,
    noEfectivas: verificadas.filter((a) => a.efectiva === false).length,
    repeticiones,
    /* Efectividad REAL: de lo verificado en el periodo, lo que además no
       se repitió en su zona en los 30 días siguientes. */
    real: (() => {
      const ok = verificadas.filter((a) => a.efectiva && !(a.zona && acc.some((b) => b.id !== a.id && b.motivo === a.motivo && b.zona === a.zona && t(b.reportada_en) > t(a.cerrada_en ?? a.reportada_en) && t(b.reportada_en) - t(a.cerrada_en ?? a.reportada_en) <= 30 * DIA)));
      return pct(ok.length, verificadas.length);
    })(),
    repiten: repiten.slice(0, 12)
  };
  const cuenta = /* @__PURE__ */ new Map();
  for (const a of reportadas) cuenta.set(a.motivo_nombre, (cuenta.get(a.motivo_nombre) ?? 0) + 1);
  const ord = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  let acum = 0;
  const pareto = ord.map(([motivo, n]) => {
    acum += n;
    return { motivo, n, acumulado: reportadas.length ? Math.round(acum / reportadas.length * 100) : 0 };
  });
  const corte80 = pareto.findIndex((x) => x.acumulado >= 80);
  const dueno = (a) => a.responsable ? { k: "p:" + a.responsable, nombre: nombres[a.responsable] ?? "Sin nombre", equipo: a.equipo_nombre } : a.equipo ? { k: "e:" + a.equipo, nombre: a.equipo_nombre ?? a.equipo, equipo: "Equipo" } : { k: "-", nombre: "Sin due\xF1o", equipo: null };
  const porDueno = /* @__PURE__ */ new Map();
  for (const a of acc) {
    if (!a.viva && !enPeriodo(a.cerrada_en) && !enPeriodo(a.verificada_en)) continue;
    const d = dueno(a);
    const x = porDueno.get(d.k) ?? { nombre: d.nombre, equipo: d.equipo, lista: [] };
    x.lista.push(a);
    porDueno.set(d.k, x);
  }
  const responsables = [...porDueno.entries()].map(([k, x]) => {
    const c = x.lista.filter((a) => enPeriodo(a.cerrada_en));
    const v = x.lista.filter((a) => enPeriodo(a.verificada_en) && a.efectiva !== null);
    const carga = x.lista.filter((a) => a.viva).length;
    const vencidas = x.lista.filter((a) => a.vencida).length;
    const at = pct(c.filter(aTiempo).length, c.length);
    const ef = v.length >= MIN_MEDIR ? pct(v.filter((a) => a.efectiva).length, v.length) : null;
    const semaforo = k === "-" || vencidas >= 3 || at !== null && at < metas.aTiempo - 15 ? "mal" : vencidas > 0 || at !== null && at < metas.aTiempo || ef !== null && ef < metas.efectividad ? "ojo" : "bien";
    return {
      clave: k,
      nombre: x.nombre,
      equipo: x.equipo,
      carga,
      vencidas,
      cerradas: c.length,
      aTiempo: at,
      efectividad: ef,
      cierreH: mediana(c.map((a) => (t(a.cerrada_en) - t(a.reportada_en)) / HORA)),
      semaforo
    };
  }).sort((a, b) => b.vencidas - a.vencidas || b.carga - a.carga);
  const zonas = /* @__PURE__ */ new Map();
  for (const a of acc) {
    if (!a.zona || !(a.viva || enPeriodo(a.reportada_en))) continue;
    const z = zonas.get(a.zona) ?? { codigo: a.zona, nombre: a.zona_nombre ?? a.zona, proceso: a.zona_proceso, total: 0, vivas: 0, vencidas: 0, repeticiones: 0 };
    if (enPeriodo(a.reportada_en)) z.total++;
    if (a.viva) z.vivas++;
    if (a.vencida) z.vencidas++;
    zonas.set(a.zona, z);
  }
  for (const r of repiten) {
    const z = zonas.get(r.codigoZona);
    if (z) z.repeticiones += r.repeticiones;
  }
  return {
    dias,
    kpis,
    tiempos,
    semanas,
    franjas,
    reincidencia,
    pareto,
    corte80,
    responsables,
    zonas: [...zonas.values()].sort((a, b) => b.total - a.total)
  };
}
function horas(h) {
  if (h === null || !isFinite(h)) return "\u2014";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 36) return `${h.toFixed(h < 10 ? 1 : 0).replace(".", ",")} h`;
  return `${(h / 24).toFixed(1).replace(".", ",")} d\xEDas`;
}
export {
  MIN_MEDIR,
  aTiempo,
  horas,
  lunes,
  mediana,
  medir,
  percentil
};
