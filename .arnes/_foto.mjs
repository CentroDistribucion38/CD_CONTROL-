// src/modulos/traspasos/foto.ts
var nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
var pc = (v) => v == null ? "\u2014" : `${v}%`;
function armarFoto(d) {
  const adherencia = d.planeado > 0 ? Math.round(d.adheridos / d.planeado * 100) : null;
  const cumplimiento = d.planeado > 0 ? Math.round(d.cumplido / d.planeado * 100) : null;
  const base = Math.max(d.planeado, 1);
  const ok = Math.min(1, d.adheridos / base);
  const extra = Math.min(1 - ok, d.adicionales / base);
  const falta = Math.max(0, 1 - ok - extra);
  return {
    titulo: d.titulo,
    ojo: d.ojo,
    sub: `${d.fecha} \xB7 foto de las ${d.hora}`,
    adherencia,
    bajo: `${nf.format(d.adheridos)} de ${nf.format(d.planeado)} del plan`,
    tramos: { ok, extra, falta },
    leyenda: [
      { rot: `${nf.format(d.adheridos)} cumplidos`, tramo: "ok" },
      { rot: `${nf.format(d.adicionales)} adicionales`, tramo: "extra" },
      { rot: `${nf.format(d.faltan)} sin salir`, tramo: "falta" }
    ],
    mini: [
      { rot: "PLANEADOS", valor: nf.format(d.planeado) },
      {
        rot: "CUMPLIMIENTO",
        valor: pc(cumplimiento),
        tono: cumplimiento == null ? void 0 : cumplimiento >= 100 ? "bien" : void 0
      },
      { rot: "CARGA MOVIDA", valor: nf.format(d.carga) },
      { rot: "SIN SALIR", valor: nf.format(d.faltan), tono: d.faltan ? "mal" : "bien" }
    ],
    tipos: d.tipos.map((t) => ({
      nombre: t.nombre,
      plan: t.planeado ? nf.format(t.planeado) : "\u2014",
      cumplido: t.adheridos ? nf.format(t.adheridos) : "\u2014",
      adicional: t.adicionales ? nf.format(t.adicionales) : "\u2014",
      falta: t.faltan ? nf.format(t.faltan) : "\u2014",
      pct: t.planeado > 0 ? Math.round(t.adheridos / t.planeado * 100) : null
    })),
    /* Los vacíos y los anulados van EN EL PIE y con la palabra «aparte»:
       es la cifra que más fácil se suma por error. */
    pie: [
      d.registrados == null ? null : `${nf.format(d.registrados)} viaje${d.registrados === 1 ? "" : "s"} registrado${d.registrados === 1 ? "" : "s"}`,
      d.vacios ? `${nf.format(d.vacios)} vac\xEDo${d.vacios === 1 ? "" : "s"} aparte` : null,
      "los vac\xEDos y los anulados no entran en la adherencia"
    ].filter(Boolean).join(" \xB7 "),
    enlace: d.enlace
  };
}
var ANCHO = 1080;
var MARGEN = 44;
var hx = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
var rgba = (h, a) => `rgba(${hx(h).join(",")},${a})`;
var claro = (h, t) => "#" + hx(h).map((c) => Math.round(255 - (255 - c) * t).toString(16).padStart(2, "0")).join("");
var VERDE = "#0F7A4A";
var ROJO = "#C8102E";
var cargar = (src) => new Promise((ok) => {
  const i = new Image();
  i.onload = () => ok(i);
  i.onerror = () => ok(null);
  i.src = src;
});
function altoFoto(p) {
  return 196 + 300 + (p.tipos.length ? 58 + 40 + p.tipos.length * 56 : 0) + 106;
}
async function dibujarFoto(p, c) {
  const ALTO = altoFoto(p), E = 2;
  const cv = document.createElement("canvas");
  cv.width = ANCHO * E;
  cv.height = ALTO * E;
  const g = cv.getContext("2d");
  g.scale(E, E);
  const tinta = "#" + c.tinta, acento = "#" + c.acento, sobre = "#" + c.sobre;
  const gris = claro(c.tinta, 0.58), linea = claro(c.tinta, 0.14);
  const sans = "Archivo, 'IBM Plex Sans', system-ui, sans-serif";
  const cuerpo = "'IBM Plex Sans', system-ui, sans-serif";
  const esp = (px) => {
    g.letterSpacing = `${px}px`;
  };
  const t = (txt, x, y2, font, color, al = "left", ls = 0) => {
    g.font = font;
    g.fillStyle = color;
    g.textAlign = al;
    esp(ls);
    g.fillText(txt, x, y2);
    esp(0);
  };
  const caja = (x, y2, w, h, relleno) => {
    g.fillStyle = relleno;
    g.fillRect(x, y2, w, h);
  };
  caja(0, 0, ANCHO, ALTO, "#fff");
  caja(0, 0, ANCHO, 196, tinta);
  g.save();
  g.beginPath();
  g.rect(0, 0, ANCHO, 196);
  g.clip();
  g.strokeStyle = "rgba(255,255,255,.07)";
  g.lineWidth = 2;
  for (let x = -220; x < ANCHO + 220; x += 20) {
    g.beginPath();
    g.moveTo(x, 196);
    g.lineTo(x + 110, 0);
    g.stroke();
  }
  g.restore();
  const sello = await cargar("/marca/logo-b.png");
  if (sello) g.drawImage(sello, MARGEN, 52, 62, 62);
  const xT = MARGEN + (sello ? 82 : 0);
  t(p.ojo, xT, 66, `700 17px ${sans}`, acento, "left", 2.6);
  t(p.titulo, xT, 112, `900 44px ${sans}`, "#fff", "left", -0.8);
  t(p.sub, xT, 146, `500 20px ${cuerpo}`, "#9A9A95");
  const yH = 196, hH = 300;
  caja(0, yH, ANCHO, hH, acento);
  g.save();
  g.beginPath();
  g.rect(0, yH, ANCHO, hH);
  g.clip();
  g.beginPath();
  g.moveTo(ANCHO - 250, yH);
  g.lineTo(ANCHO, yH);
  g.lineTo(ANCHO, yH + hH);
  g.lineTo(ANCHO - 155, yH + hH);
  g.closePath();
  g.fillStyle = rgba(c.sobre, 0.08);
  g.fill();
  g.restore();
  caja(MARGEN, yH + 46, 9, 150, sobre);
  const xP = MARGEN + 32;
  t("ADHERENCIA", xP, yH + 76, `700 17px ${sans}`, sobre, "left", 2.4);
  t(pc(p.adherencia), xP, yH + 160, `900 96px ${sans}`, sobre, "left", -4);
  t(p.bajo, xP, yH + 196, `600 21px ${cuerpo}`, sobre);
  const xC = 430, wC = ANCHO - xC - MARGEN;
  caja(xC, yH + 48, wC, 34, rgba(c.sobre, 0.16));
  const wOk = Math.round(wC * p.tramos.ok), wEx = Math.round(wC * p.tramos.extra);
  caja(xC, yH + 48, wOk, 34, sobre);
  caja(xC + wOk, yH + 48, wEx, 34, rgba(c.sobre, 0.45));
  let xL = xC;
  for (const l of p.leyenda) {
    const col = l.tramo === "ok" ? sobre : l.tramo === "extra" ? rgba(c.sobre, 0.45) : rgba(c.sobre, 0.22);
    caja(xL, yH + 100, 16, 16, col);
    t(l.rot, xL + 24, yH + 114, `600 19px ${cuerpo}`, sobre);
    g.font = `600 19px ${cuerpo}`;
    xL += 24 + g.measureText(l.rot).width + 30;
  }
  const nM = p.mini.length, gap = 2;
  const wM = Math.floor((wC - gap * (nM - 1)) / nM);
  p.mini.forEach((m, i) => {
    const x = xC + i * (wM + gap), y2 = yH + 144, h = 108;
    caja(x, y2, wM, h, "#fff");
    let tam = 14;
    esp(1.2);
    g.font = `700 ${tam}px ${sans}`;
    while (g.measureText(m.rot).width > wM - 28 && tam > 10) {
      tam -= 0.5;
      g.font = `700 ${tam}px ${sans}`;
    }
    esp(0);
    t(m.rot, x + 14, y2 + 34, `700 ${tam}px ${sans}`, gris, "left", 1.2);
    const col = m.tono === "bien" ? VERDE : m.tono === "mal" ? ROJO : tinta;
    t(m.valor, x + 14, y2 + 82, `900 36px ${sans}`, col, "left", -0.5);
  });
  let y = yH + hH;
  if (p.tipos.length) {
    t("Por tipo de viaje", MARGEN, y + 42, `900 27px ${sans}`, tinta);
    t("cumplido sobre planeado", ANCHO - MARGEN, y + 42, `500 19px ${cuerpo}`, gris, "right");
    y += 58;
    const xBarra = ANCHO - MARGEN - 96;
    const xPct = xBarra - 16;
    const COL = 118;
    const cFalta = xPct - 96;
    const cAdic = cFalta - COL;
    const cCump = cAdic - COL;
    const cPlan = cCump - COL;
    t("Tipo", MARGEN, y + 26, `700 15px ${sans}`, gris, "left", 1.6);
    t("Plan", cPlan, y + 26, `700 15px ${sans}`, gris, "right", 1.6);
    t("Cumplido", cCump, y + 26, `700 15px ${sans}`, gris, "right", 1.6);
    t("Adicional", cAdic, y + 26, `700 15px ${sans}`, gris, "right", 1.6);
    t("Faltan", cFalta, y + 26, `700 15px ${sans}`, gris, "right", 1.6);
    t("Adherencia", ANCHO - MARGEN, y + 26, `700 15px ${sans}`, gris, "right", 1.6);
    caja(MARGEN, y + 38, ANCHO - MARGEN * 2, 1, linea);
    y += 40;
    p.tipos.forEach((x, i) => {
      const yy = y + i * 56;
      let tn = 22;
      g.font = `700 ${tn}px ${cuerpo}`;
      while (g.measureText(x.nombre).width > cPlan - MARGEN - 70 && tn > 14) {
        tn -= 1;
        g.font = `700 ${tn}px ${cuerpo}`;
      }
      t(x.nombre, MARGEN, yy + 36, `700 ${tn}px ${cuerpo}`, tinta);
      t(x.plan, cPlan, yy + 36, `500 22px ${cuerpo}`, tinta, "right");
      t(x.cumplido, cCump, yy + 36, `500 22px ${cuerpo}`, tinta, "right");
      t(x.adicional, cAdic, yy + 36, `500 22px ${cuerpo}`, tinta, "right");
      t(x.falta, cFalta, yy + 36, `500 22px ${cuerpo}`, x.falta === "\u2014" ? tinta : ROJO, "right");
      const col = x.pct == null ? gris : x.pct >= 100 ? VERDE : x.pct > 0 ? acento : ROJO;
      caja(xBarra, yy + 24, 96, 9, "#F0F0EC");
      if (x.pct != null) caja(xBarra, yy + 24, Math.round(96 * Math.min(x.pct, 100) / 100), 9, col);
      t(pc(x.pct), xPct, yy + 36, `800 22px ${sans}`, col, "right");
      caja(MARGEN, yy + 55, ANCHO - MARGEN * 2, 1, claro(c.tinta, 0.07));
    });
    y += p.tipos.length * 56;
  }
  caja(0, y, ANCHO, ALTO - y, claro(c.tinta, 0.04));
  caja(0, y, ANCHO, 1, linea);
  t(p.pie, MARGEN, y + 42, `500 19px ${cuerpo}`, gris);
  t(p.enlace, MARGEN, y + 76, `500 18px ${cuerpo}`, claro(c.tinta, 0.72));
  return new Promise((ok, mal) => cv.toBlob((b) => b ? ok(b) : mal(new Error("sin imagen")), "image/png"));
}
async function entregarFoto(b, nombre, titulo) {
  const f = new File([b], nombre, { type: "image/png" });
  const nav = navigator;
  if (nav.canShare?.({ files: [f] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [f], title: titulo });
      return "compartido";
    } catch {
    }
  }
  try {
    const CI = window.ClipboardItem;
    if (CI && navigator.clipboard?.write) {
      await navigator.clipboard.write([new CI({ "image/png": b })]);
      return "copiado";
    }
  } catch {
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1e4);
  return "bajado";
}
export {
  altoFoto,
  armarFoto,
  dibujarFoto,
  entregarFoto
};
