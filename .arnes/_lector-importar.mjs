const pelar = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").replace(/[.:]+$/, "").trim();
const COLUMNAS = [
  {
    clave: "referencia",
    rotulo: "Referencia",
    obliga: true,
    nombres: [
      "referencia",
      "referencia documento",
      "no referencia",
      "nro referencia",
      "numero de referencia",
      "documento"
    ]
  },
  {
    clave: "fecha",
    rotulo: "Fecha",
    obliga: true,
    nombres: [
      "fecha de entrada",
      "fecha entrada",
      "fecha contabilizacion",
      "fecha de contabilizacion",
      "fecha contab",
      "fecha de documento",
      "fecha documento",
      "fecha doc",
      "fecha"
    ]
  },
  {
    clave: "cantidad",
    rotulo: "Cantidad",
    obliga: true,
    nombres: ["cantidad", "cantidad en um", "cantidad en um entrada", "ctd", "ctd en um"]
  },
  {
    clave: "hora",
    rotulo: "Hora",
    obliga: false,
    nombres: ["hora de entrada", "hora entrada", "hora contabilizacion", "hora"]
  },
  {
    clave: "material",
    rotulo: "Material",
    obliga: false,
    nombres: ["material", "codigo material", "codigo de material"]
  },
  {
    clave: "descripcion",
    rotulo: "Descripci\xF3n",
    obliga: false,
    nombres: [
      "texto breve de material",
      "texto breve",
      "descripcion",
      "descripcion material",
      "descripcion del material"
    ]
  },
  { clave: "centro", rotulo: "Centro", obliga: false, nombres: ["centro"] },
  { clave: "almacen", rotulo: "Almac\xE9n", obliga: false, nombres: ["almacen", "alm"] }
];
const MIRAR = 15;
function cabeceraDe(crudo) {
  let mejor = {
    fila: 0,
    donde: {},
    aciertos: -1,
    titulos: []
  };
  for (let i = 0; i < Math.min(MIRAR, crudo.length); i++) {
    const cab = crudo[i].map(pelar);
    const donde = {};
    const tomados = /* @__PURE__ */ new Set();
    for (const c of COLUMNAS) {
      const j = cab.findIndex((h, k) => h !== "" && !tomados.has(k) && c.nombres.includes(h));
      if (j >= 0) {
        donde[c.clave] = j;
        tomados.add(j);
      }
    }
    for (const c of COLUMNAS) {
      if (donde[c.clave] !== void 0) continue;
      const j = cab.findIndex((h, k) => h !== "" && !tomados.has(k) && c.nombres.some((n) => h.startsWith(n)));
      if (j >= 0) {
        donde[c.clave] = j;
        tomados.add(j);
      }
    }
    const aciertos = Object.keys(donde).length;
    if (aciertos > mejor.aciertos) {
      mejor = { fila: i, donde, aciertos, titulos: crudo[i].map((x) => String(x ?? "").trim()) };
    }
  }
  return mejor;
}
function aFecha(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = (n) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const t = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const m2 = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/);
  if (m2) return `20${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  return null;
}
function aHora(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = (n) => String(n).padStart(2, "0");
    return `${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
  }
  const t = String(v ?? "").trim();
  const m = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  let h = Number(m[1]);
  if (/p\.?\s*m\.?/i.test(t) && h < 12) h += 12;
  if (/a\.?\s*m\.?/i.test(t) && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
}
function aNumero(v) {
  if (typeof v === "number" && isFinite(v)) return String(v);
  const bruto = String(v ?? "").trim();
  if (!bruto) return "0";
  const negativo = /^-/.test(bruto) || /-\s*$/.test(bruto) || /^\(.*\)$/.test(bruto);
  const t = bruto.replace(/[^\d.,]/g, "");
  if (!t) return "0";
  const coma = t.lastIndexOf(","), punto = t.lastIndexOf(".");
  let dec;
  if (coma >= 0 && punto >= 0) dec = Math.max(coma, punto);
  else if (coma >= 0) dec = coma;
  else if (punto >= 0) dec = t.indexOf(".") === punto && /\.\d{3}$/.test(t) ? -1 : punto;
  else dec = -1;
  const ent = (dec >= 0 ? t.slice(0, dec) : t).replace(/[.,]/g, "");
  const frac = dec >= 0 ? t.slice(dec + 1).replace(/[.,]/g, "") : "";
  const n = (ent || "0") + (frac ? "." + frac : "");
  return (negativo ? "-" : "") + n;
}
const TOPE_EJEMPLOS = 40;
function leerHoja(crudo, hoja) {
  const cab = cabeceraDe(crudo);
  const faltan = COLUMNAS.filter((c) => c.obliga && cab.donde[c.clave] === void 0);
  const filas = [];
  const descartes = [];
  let descartadas = 0;
  if (!faltan.length) {
    for (let i = cab.fila + 1; i < crudo.length; i++) {
      const r = crudo[i] ?? [];
      if (r.every((c) => c == null || String(c).trim() === "")) continue;
      const ref = String(r[cab.donde.referencia] ?? "").trim();
      const fec = aFecha(r[cab.donde.fecha]);
      if (!ref || !fec) {
        descartadas++;
        if (descartes.length < TOPE_EJEMPLOS) {
          descartes.push({
            fila: i + 1,
            por: !ref && !fec ? "sin referencia y sin fecha" : !ref ? "sin referencia" : `la fecha no se entiende: \xAB${String(r[cab.donde.fecha] ?? "").trim() || "vac\xEDa"}\xBB`
          });
        }
        continue;
      }
      filas.push({
        referencia: ref,
        fecha: fec,
        cantidad: aNumero(r[cab.donde.cantidad]),
        hora: aHora(r[cab.donde.hora]) ?? "",
        material: String(r[cab.donde.material] ?? "").trim(),
        descripcion: String(r[cab.donde.descripcion] ?? "").trim(),
        centro: String(r[cab.donde.centro] ?? "").trim(),
        almacen: String(r[cab.donde.almacen] ?? "").trim()
      });
    }
  }
  return {
    filas,
    hoja,
    filaCab: cab.fila,
    titulos: cab.titulos,
    donde: cab.donde,
    descartes,
    descartadas,
    faltan
  };
}
function puntaje(l) {
  return (l.faltan.length ? 0 : 1e6) + l.filas.length + Object.keys(l.donde).length;
}
function escogerHoja(hojas) {
  let mejor = null;
  let puntos = -1;
  for (const h of hojas) {
    if (h.crudo.length < 2) continue;
    const l = leerHoja(h.crudo, h.nombre);
    const p = puntaje(l);
    if (p > puntos) {
      puntos = p;
      mejor = l;
    }
  }
  return mejor;
}
export {
  COLUMNAS,
  aFecha,
  aHora,
  aNumero,
  cabeceraDe,
  escogerHoja,
  leerHoja,
  pelar,
  puntaje
};
