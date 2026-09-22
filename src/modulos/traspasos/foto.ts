/**
 * EL CIERRE, EN IMAGEN — para mandarlo por WhatsApp.
 *
 * «Mira cómo se copia… y debería copiarse como foto, algo
 * espectacular.»  El texto pelado se lee, pero llega como un mensaje
 * más entre cincuenta; la foto se abre, se ve el porcentaje de lejos y
 * se reenvía. Así que lo que se copia es la imagen.
 *
 * DOS PIEZAS, Y POR ESO ESTÁN SEPARADAS:
 *
 *   armarFoto()    junta las cifras en lo que la imagen enseña. Es una
 *                  función pura —entra el cierre, sale una lista de
 *                  renglones— y se puede medir sin navegador.
 *   dibujarFoto()  la pinta en un canvas al doble de resolución.
 *
 * Es el mismo reparto que la hoja de rotura (armarHoja/dibujarHoja) y
 * por el mismo motivo: un total mal sumado se ve perfectamente normal
 * dentro de una imagen, y la única forma de cazarlo es comprobar los
 * números ANTES de que se vuelvan píxeles.
 *
 * 1080 DE ANCHO porque es lo que WhatsApp respeta sin recomprimir a
 * mitad de tamaño; el alto sale del contenido.
 */

export type ColoresFoto = {
  /** RRGGBB, sin almohadilla. */
  tinta: string;
  /** El acento del tema. */
  acento: string;
  /** La tinta que la app empareja con ese acento: lo que va ENCIMA. */
  sobre: string;
};

export type DatosFoto = {
  titulo: string;            // «Cierre del turno A»
  ojo: string;               // «TURNO A · 06:00 · 14:00»
  fecha: string;             // «Martes, 22 de septiembre de 2026»
  hora: string;              // «04:21 p. m.»
  planeado: number; adheridos: number; adicionales: number; faltan: number;
  cumplido: number; carga: number; vacios: number | null; registrados: number | null;
  tipos: { nombre: string; planeado: number; adheridos: number; adicionales: number; faltan: number }[];
  enlace: string;
};

/* ---------- LO QUE LA IMAGEN ENSEÑA ---------- */
export type Plan = {
  titulo: string; ojo: string; sub: string;
  adherencia: number | null; bajo: string;
  /* Los tres tramos de la cinta, en tanto por uno y sumando 1. */
  tramos: { ok: number; extra: number; falta: number };
  leyenda: { rot: string; tramo: "ok" | "extra" | "falta" }[];
  mini: { rot: string; valor: string; tono?: "bien" | "mal" }[];
  tipos: { nombre: string; plan: string; cumplido: string; adicional: string; falta: string; pct: number | null }[];
  pie: string;
  enlace: string;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const pc = (v: number | null) => (v == null ? "—" : `${v}%`);

export function armarFoto(d: DatosFoto): Plan {
  const adherencia = d.planeado > 0 ? Math.round((d.adheridos / d.planeado) * 100) : null;
  const cumplimiento = d.planeado > 0 ? Math.round((d.cumplido / d.planeado) * 100) : null;

  /* LA CINTA REPARTE SOBRE EL PLAN, no sobre lo movido: si se hicieron
     más de los planeados, el tramo de adicionales se recorta. Es la
     misma regla de la pantalla, y tiene que serlo: si la foto repartiera
     distinto, la barra de la imagen y la del tablero no coincidirían. */
  const base = Math.max(d.planeado, 1);
  const ok = Math.min(1, d.adheridos / base);
  const extra = Math.min(1 - ok, d.adicionales / base);
  const falta = Math.max(0, 1 - ok - extra);

  return {
    titulo: d.titulo,
    ojo: d.ojo,
    sub: `${d.fecha} · foto de las ${d.hora}`,
    adherencia,
    bajo: `${nf.format(d.adheridos)} de ${nf.format(d.planeado)} del plan`,
    tramos: { ok, extra, falta },
    leyenda: [
      { rot: `${nf.format(d.adheridos)} cumplidos`, tramo: "ok" },
      { rot: `${nf.format(d.adicionales)} adicionales`, tramo: "extra" },
      { rot: `${nf.format(d.faltan)} sin salir`, tramo: "falta" },
    ],
    mini: [
      { rot: "PLANEADOS", valor: nf.format(d.planeado) },
      { rot: "CUMPLIMIENTO", valor: pc(cumplimiento),
        tono: cumplimiento == null ? undefined : cumplimiento >= 100 ? "bien" : undefined },
      { rot: "CARGA MOVIDA", valor: nf.format(d.carga) },
      { rot: "SIN SALIR", valor: nf.format(d.faltan), tono: d.faltan ? "mal" : "bien" },
    ],
    tipos: d.tipos.map((t) => ({
      nombre: t.nombre,
      plan: t.planeado ? nf.format(t.planeado) : "—",
      cumplido: t.adheridos ? nf.format(t.adheridos) : "—",
      adicional: t.adicionales ? nf.format(t.adicionales) : "—",
      falta: t.faltan ? nf.format(t.faltan) : "—",
      pct: t.planeado > 0 ? Math.round((t.adheridos / t.planeado) * 100) : null,
    })),
    /* Los vacíos y los anulados van EN EL PIE y con la palabra «aparte»:
       es la cifra que más fácil se suma por error. */
    pie: [
      d.registrados == null ? null : `${nf.format(d.registrados)} viaje${d.registrados === 1 ? "" : "s"} registrado${d.registrados === 1 ? "" : "s"}`,
      d.vacios ? `${nf.format(d.vacios)} vacío${d.vacios === 1 ? "" : "s"} aparte` : null,
      "los vacíos y los anulados no entran en la adherencia",
    ].filter(Boolean).join(" · "),
    enlace: d.enlace,
  };
}

/* ---------- LA PINTURA ---------- */
const ANCHO = 1080, MARGEN = 44;
const hx = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgba = (h: string, a: number) => `rgba(${hx(h).join(",")},${a})`;
const claro = (h: string, t: number) => "#" + hx(h).map((c) => Math.round(255 - (255 - c) * t).toString(16).padStart(2, "0")).join("");
const VERDE = "#0F7A4A", ROJO = "#C8102E";

const cargar = (src: string) => new Promise<HTMLImageElement | null>((ok) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src;
});

/** Cuánto mide de alto la imagen con este contenido. Se calcula antes de
 *  pintar porque el canvas necesita su tamaño de entrada. */
export function altoFoto(p: Plan) {
  return 196                                  // la banda de arriba
    + 300                                     // la franja del acento
    + (p.tipos.length ? 58 + 40 + p.tipos.length * 56 : 0)
    + 106;                                    // el pie
}

export async function dibujarFoto(p: Plan, c: ColoresFoto): Promise<Blob> {
  const ALTO = altoFoto(p), E = 2;
  const cv = document.createElement("canvas");
  cv.width = ANCHO * E; cv.height = ALTO * E;
  const g = cv.getContext("2d")!; g.scale(E, E);

  const tinta = "#" + c.tinta, acento = "#" + c.acento, sobre = "#" + c.sobre;
  const gris = claro(c.tinta, 0.58), linea = claro(c.tinta, 0.14);
  const sans = "Archivo, 'IBM Plex Sans', system-ui, sans-serif";
  const cuerpo = "'IBM Plex Sans', system-ui, sans-serif";
  const esp = (px: number) => { (g as unknown as { letterSpacing: string }).letterSpacing = `${px}px` };
  const t = (txt: string, x: number, y: number, font: string, color: string,
             al: CanvasTextAlign = "left", ls = 0) => {
    g.font = font; g.fillStyle = color; g.textAlign = al; esp(ls); g.fillText(txt, x, y); esp(0);
  };
  const caja = (x: number, y: number, w: number, h: number, relleno: string) => {
    g.fillStyle = relleno; g.fillRect(x, y, w, h);
  };

  caja(0, 0, ANCHO, ALTO, "#fff");

  /* ---------- 1 · LA BANDA NEGRA ---------- */
  caja(0, 0, ANCHO, 196, tinta);
  /* Las rayas de la marca, al 7%: se notan y no compiten con el título. */
  g.save(); g.beginPath(); g.rect(0, 0, ANCHO, 196); g.clip();
  g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 2;
  for (let x = -220; x < ANCHO + 220; x += 20) {
    g.beginPath(); g.moveTo(x, 196); g.lineTo(x + 110, 0); g.stroke();
  }
  g.restore();

  const sello = await cargar("/marca/logo-b.png");
  if (sello) g.drawImage(sello, MARGEN, 52, 62, 62);
  const xT = MARGEN + (sello ? 82 : 0);
  t(p.ojo, xT, 66, `700 17px ${sans}`, acento, "left", 2.6);
  t(p.titulo, xT, 112, `900 44px ${sans}`, "#fff", "left", -0.8);
  t(p.sub, xT, 146, `500 20px ${cuerpo}`, "#9A9A95");

  /* ---------- 2 · LA FRANJA DEL ACENTO ---------- */
  const yH = 196, hH = 300;
  caja(0, yH, ANCHO, hH, acento);
  /* El corte diagonal de la derecha. */
  g.save(); g.beginPath(); g.rect(0, yH, ANCHO, hH); g.clip();
  g.beginPath();
  g.moveTo(ANCHO - 250, yH); g.lineTo(ANCHO, yH); g.lineTo(ANCHO, yH + hH); g.lineTo(ANCHO - 155, yH + hH);
  g.closePath(); g.fillStyle = rgba(c.sobre, 0.08); g.fill();
  g.restore();

  /* La cifra que manda, con su raya a la izquierda. */
  caja(MARGEN, yH + 46, 9, 150, sobre);
  const xP = MARGEN + 32;
  t("ADHERENCIA", xP, yH + 76, `700 17px ${sans}`, sobre, "left", 2.4);
  t(pc(p.adherencia), xP, yH + 160, `900 96px ${sans}`, sobre, "left", -4);
  t(p.bajo, xP, yH + 196, `600 21px ${cuerpo}`, sobre);

  /* La cinta y su leyenda. */
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

  /* Las cuatro tarjetas blancas. */
  const nM = p.mini.length, gap = 2;
  const wM = Math.floor((wC - gap * (nM - 1)) / nM);
  p.mini.forEach((m, i) => {
    const x = xC + i * (wM + gap), y = yH + 144, h = 108;
    caja(x, y, wM, h, "#fff");
    /* EL RÓTULO SE ENCOGE HASTA QUE CABE. «CARGA MOVIDA» con el cuerpo
       de «PLANEADOS» se salía de su tarjeta y se leía «CARGA MOVIDA»
       partido por el borde de la de al lado. */
    let tam = 14;
    esp(1.2); g.font = `700 ${tam}px ${sans}`;
    while (g.measureText(m.rot).width > wM - 28 && tam > 10) { tam -= 0.5; g.font = `700 ${tam}px ${sans}` }
    esp(0);
    t(m.rot, x + 14, y + 34, `700 ${tam}px ${sans}`, gris, "left", 1.2);
    const col = m.tono === "bien" ? VERDE : m.tono === "mal" ? ROJO : tinta;
    t(m.valor, x + 14, y + 82, `900 36px ${sans}`, col, "left", -0.5);
  });

  let y = yH + hH;

  /* ---------- 3 · POR TIPO ---------- */
  if (p.tipos.length) {
    t("Por tipo de viaje", MARGEN, y + 42, `900 27px ${sans}`, tinta);
    t("cumplido sobre planeado", ANCHO - MARGEN, y + 42, `500 19px ${cuerpo}`, gris, "right");
    y += 58;
    /* LAS COLUMNAS, MEDIDAS Y NO A OJO. La primera versión las puso a
       «tanto desde la derecha» sin comprobar que la anterior cupiera, y
       «Plan» y «Cumplido» se pisaron: en la foto se leía «PCamplido».
       Aquí van con su ancho, de derecha a izquierda, y cada una empieza
       donde termina la otra.

       LA BARRA Y SU NÚMERO VAN AL FINAL, pegados: son una sola cosa. */
    const xBarra = ANCHO - MARGEN - 96;      // la barrita
    const xPct = xBarra - 16;                // el número, a su izquierda
    const COL = 118;                         // cada columna de cifras
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
      /* El nombre se encoge si hace falta: «Averías / isotanque» no
         puede meterse debajo de la columna de Plan. */
      let tn = 22;
      g.font = `700 ${tn}px ${cuerpo}`;
      while (g.measureText(x.nombre).width > cPlan - MARGEN - 70 && tn > 14) {
        tn -= 1; g.font = `700 ${tn}px ${cuerpo}`;
      }
      t(x.nombre, MARGEN, yy + 36, `700 ${tn}px ${cuerpo}`, tinta);
      t(x.plan, cPlan, yy + 36, `500 22px ${cuerpo}`, tinta, "right");
      t(x.cumplido, cCump, yy + 36, `500 22px ${cuerpo}`, tinta, "right");
      t(x.adicional, cAdic, yy + 36, `500 22px ${cuerpo}`, tinta, "right");
      t(x.falta, cFalta, yy + 36, `500 22px ${cuerpo}`, x.falta === "—" ? tinta : ROJO, "right");
      /* La barrita: ver el 50% al lado de una barra a la mitad dice más
         que el número solo. */
      const col = x.pct == null ? gris : x.pct >= 100 ? VERDE : x.pct > 0 ? acento : ROJO;
      caja(xBarra, yy + 24, 96, 9, "#F0F0EC");
      if (x.pct != null) caja(xBarra, yy + 24, Math.round(96 * Math.min(x.pct, 100) / 100), 9, col);
      t(pc(x.pct), xPct, yy + 36, `800 22px ${sans}`, col, "right");
      caja(MARGEN, yy + 55, ANCHO - MARGEN * 2, 1, claro(c.tinta, 0.07));
    });
    y += p.tipos.length * 56;
  }

  /* ---------- 4 · EL PIE ---------- */
  caja(0, y, ANCHO, ALTO - y, claro(c.tinta, 0.04));
  caja(0, y, ANCHO, 1, linea);
  t(p.pie, MARGEN, y + 42, `500 19px ${cuerpo}`, gris);
  t(p.enlace, MARGEN, y + 76, `500 18px ${cuerpo}`, claro(c.tinta, 0.72));

  return new Promise((ok, mal) =>
    cv.toBlob((b) => (b ? ok(b) : mal(new Error("sin imagen"))), "image/png"));
}

/**
 * ENTREGARLA. En el celular se abre el menú de compartir —de ahí sale
 * WhatsApp— y en el computador se copia al portapapeles, que es lo que
 * se pidió: pegar la foto, no un archivo. Si ninguna de las dos se
 * puede, se baja.
 *
 * Devuelve QUÉ pasó, para que el botón diga la verdad: «Copiado» cuando
 * de verdad quedó en el portapapeles y «Descargada» cuando no.
 */
export async function entregarFoto(b: Blob, nombre: string, titulo: string):
  Promise<"compartido" | "copiado" | "bajado"> {
  const f = new File([b], nombre, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [f] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await nav.share({ files: [f], title: titulo }); return "compartido" } catch { /* cancelado */ }
  }
  /* El portapapeles de imágenes solo acepta PNG y solo con permiso; si
     no está, se baja, que nunca falla. */
  try {
    const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (CI && navigator.clipboard?.write) {
      await navigator.clipboard.write([new CI({ "image/png": b })]);
      return "copiado";
    }
  } catch { /* sin permiso */ }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return "bajado";
}
