/**
 * 5S · EL PDF DEL INFORME, DIBUJADO DE VERDAD (vectorial).
 *
 * «Mira cómo se descarga todo sobrepuesto; lo necesito HD.» La primera versión fotografiaba la pantalla
 * (html2canvas) y la pegaba como imagen: las letras salían borrosas y los textos se montaban (html2canvas no
 * respeta bien la altura de línea de las fuentes web). Aquí cada texto, raya y tabla se dibuja con jsPDF:
 * nítido a cualquier zoom, se puede seleccionar y buscar, y pesa menos. Solo las fotos son imágenes, y van
 * recortadas a su recuadro a buena resolución.
 *
 * Mismo formato que la pantalla: encabezado de calidad en cada hoja (logo, título, código, versión, fecha,
 * página X de N), 1 datos generales, 2 resultado (bloque grande + barras por S), 3 matriz, 4 hallazgos y plan de
 * acción, 5 registro fotográfico, 6 observaciones, 7 firmas (Supervisor OL y Warehouse Supervisor ABI).
 */
import type { jsPDF as JsPDF } from "jspdf";
import { FORMATO_5S, type ClaveS, type ItemInspeccion } from "./cinco-s";
import { es5S, seccionDe, siglaDe, tituloSeccion } from "./informe";
import type { DatosInforme } from "./informe";

type RGB = [number, number, number];
const TINTA: RGB = [20, 20, 20], GRIS: RGB = [107, 114, 128], LINEA: RGB = [156, 163, 175], SUAVE: RGB = [201, 205, 211];
const ROJO: RGB = [227, 6, 19], CARBON: RGB = [47, 47, 47], RIEL: RGB = [238, 240, 242], BANDA: RGB = [241, 242, 244];
const LABEL: RGB = [243, 244, 246], CREMA: RGB = [255, 241, 194];
const VERSION = "01";

const W = 612, H = 792, MX = 36, TOP = 28, CAB = 58, PIE = 36;
const ANCHO = W - 2 * MX;
const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fecha = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const cap = (s: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : "");
const RES = { cumple: "C", no_cumple: "NC", na: "N/A" } as const;

/** Una imagen a data URL JPEG, recortada para llenar w×h (como object-fit: cover), a 4× su tamaño en el PDF (≈290 ppp). */
async function recortar(url: string, w: number, h: number): Promise<string | null> {
  try {
    const r = await fetch(url);
    const bm = await createImageBitmap(await r.blob());
    const esc = 4, cw = Math.round(w * esc), ch = Math.round(h * esc);
    const c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const ctx = c.getContext("2d")!;
    const k = Math.max(cw / bm.width, ch / bm.height);
    const sw = cw / k, sh = ch / k;
    ctx.drawImage(bm, (bm.width - sw) / 2, (bm.height - sh) / 2, sw, sh, 0, 0, cw, ch);
    return c.toDataURL("image/jpeg", 0.92);
  } catch { return null }
}
async function logo(): Promise<string | null> {
  try {
    const r = await fetch("/marca/logo-bavaria.png");
    const b = await r.blob();
    return await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => ok(null); f.readAsDataURL(b) });
  } catch { return null }
}

export async function pdfInforme5S(JsPDFc: typeof JsPDF, d: DatosInforme, generado: Date): Promise<JsPDF> {
  const doc = new JsPDFc({ unit: "pt", format: "letter", compress: true });
  const { insp } = d;
  const secs = (d.formato ?? FORMATO_5S).secciones;
  const sigla = siglaDe(d), CODIGO = `CD38-${sigla.toUpperCase()}-F01`;
  const iS = (s: string) => { const i = secs.findIndex((x) => x.clave === s); return i < 0 ? 99 : i };
  const items = [...d.items].sort((a, b) => iS(a.s) - iS(b.s) || a.orden - b.orden);
  const num = new Map(items.map((x, i) => [x.id, i + 1]));
  const gen = `${generado.toLocaleDateString("es-CO")} ${generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`;
  const imgLogo = await logo();
  const nAntes = d.fotos.filter((f) => f.momento !== "despues").length;
  const corta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

  /* ---------------- herramientas ---------------- */
  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const relleno = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const trazo = (c: RGB, g = 0.6) => { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(g) };
  const letra = (tam: number, negrita = false) => { doc.setFont("helvetica", negrita ? "bold" : "normal"); doc.setFontSize(tam) };
  const texto = (s: string, x: number, y: number, o: { tam?: number; b?: boolean; c?: RGB; al?: "left" | "right" | "center"; esp?: number } = {}) => {
    letra(o.tam ?? 8.5, o.b); color(o.c ?? TINTA);
    doc.text(s, x, y, { align: o.al ?? "left", baseline: "middle", charSpace: o.esp ?? 0 });
  };
  const partir = (s: string, ancho: number, tam: number, b = false): string[] => { letra(tam, b); return doc.splitTextToSize(s || "", ancho) as string[] };
  const caja = (x: number, y: number, w: number, h: number, f?: RGB, t?: RGB, g = 0.6) => {
    if (f) { relleno(f); doc.rect(x, y, w, h, "F") }
    if (t) { trazo(t, g); doc.rect(x, y, w, h, "S") }
  };

  let y = TOP + CAB + 12;
  const LIMITE = H - PIE - 8;
  const hoja = () => { doc.addPage("letter", "portrait"); y = TOP + CAB + 12 };
  /** Si no cabe `h`, hoja nueva. Devuelve true si cambió de hoja. */
  const cabe = (h: number) => { if (y + h > LIMITE) { hoja(); return true } return false };

  const seccion = (n: number, t: string, siguiente = 40) => {
    cabe(22 + siguiente);
    y += 6;
    caja(MX, y, ANCHO, 17, BANDA); relleno(ROJO); doc.rect(MX, y, 3.5, 17, "F");
    texto(`${n}. ${t.toUpperCase()}`, MX + 10, y + 8.8, { tam: 8.5, b: true, esp: 0.6 });
    y += 17 + 6;
  };

  /* ================= 1. DATOS GENERALES ================= */
  seccion(1, "Datos generales", 60);
  {
    const cw = [ANCHO * 0.2, ANCHO * 0.32, ANCHO * 0.18, ANCHO * 0.3];
    const filas: [string, string, string, string][] = [
      ["Área auditada", insp.area, "Fecha / semana", `${fecha(insp.fecha)} · S${semana(insp.fecha)}`],
      ["Responsable del área", (insp.responsable ?? "Sin asignar") + (d.cargo ? ` · ${d.cargo}` : ""), "Auditor", insp.auditor_nombre ?? "—"],
      ["Meta del área", `${nf1.format(insp.meta).replace(",0", "")} %`, "Inspección N.º", d.numero],
    ];
    for (const f of filas) {
      let x = MX;
      const lineas = f.map((v, i) => partir(v, cw[i] - 10, 8, i === 1 && f[0] === "Área auditada"));
      const h = Math.max(19, Math.max(...lineas.map((l) => l.length)) * 10 + 8);
      f.forEach((v, i) => {
        caja(x, y, cw[i], h, i % 2 === 0 ? LABEL : undefined, LINEA);
        lineas[i].forEach((ln, j) => texto(ln, x + 5, y + 9.5 + j * 10, { tam: 8, b: i % 2 === 0 || (i === 1 && f[0] === "Área auditada"), c: i % 2 === 0 ? [55, 65, 81] : TINTA }));
        x += cw[i];
      });
      y += h;
    }
  }

  /* ================= 2. RESULTADO ================= */
  seccion(2, "Resultado", 230);
  {
    const bajo = insp.cumplimiento < insp.meta;
    const y0 = y + 4;
    relleno(bajo ? ROJO : TINTA); doc.rect(MX, y0, 3.5, 92, "F");
    texto("CUMPLIMIENTO", MX + 12, y0 + 8, { tam: 6.5, b: true, c: GRIS, esp: 1.2 });
    texto(`${nf1.format(insp.cumplimiento)} %`, MX + 10, y0 + 38, { tam: 40, b: true, c: bajo ? ROJO : TINTA });
    texto(`${bajo ? "Bajo" : "Cumple"} la meta de ${nf1.format(insp.meta).replace(",0", "")} %`, MX + 12, y0 + 64, { tam: 8.5, b: true });
    const dif = insp.cumplimiento - insp.meta;
    texto(`${nf1.format(Math.abs(dif))} puntos ${dif < 0 ? "por debajo" : "por encima"} de la meta`, MX + 12, y0 + 76, { tam: 7.5, c: GRIS });
    texto(d.anterior != null ? `Inspección anterior: ${nf1.format(d.anterior)} %` : "Primera inspección del área", MX + 12, y0 + 85.5, { tam: 7.5, c: GRIS });

    /* El resumen, a la derecha. */
    const rx = MX + 190, rw = ANCHO - 190;
    const evaluados = items.filter((i) => i.resultado !== "na").length;
    const na = items.length - evaluados;
    const nc = items.filter((i) => i.resultado === "no_cumple");
    const altas = nc.filter((i) => i.severidad === "alta").length;
    const filas: [string, string][] = [
      ["Responsable del área", (insp.responsable ?? "Sin asignar") + (d.cargo ? ` · ${d.cargo}` : "")],
      ["Auditor", insp.auditor_nombre ?? "—"],
      ["Puntos evaluados", `${evaluados} de ${items.length}${na ? ` (${na} N/A)` : ""}`],
      ["No cumple", `${nc.length}${altas ? ` · ${altas === 1 ? "uno" : altas} de severidad alta` : ""}`],
      ["Evidencia fotográfica", `${nAntes} ${nAntes === 1 ? "foto" : "fotos"}`],
    ];
    filas.forEach(([a, b], i) => {
      const fy = y0 + i * 19;
      texto(a, rx, fy + 9, { tam: 8, c: GRIS });
      texto(b, rx + rw, fy + 9, { tam: 8, b: true, al: "right" });
      trazo([229, 231, 235], 0.6); doc.line(rx, fy + 18, rx + rw, fy + 18);
    });
    y = y0 + Math.max(100, filas.length * 19) + 10;

    /* Cumplimiento por S: barra contra la meta y cuántos C / NC / N/A. */
    const cS = (s: ClaveS, r: string) => items.filter((i) => i.s === s && i.resultado === r).length;
    const xb = MX + 150, wb = 220, xc = xb + wb + 14;
    const cols = [xc + 16, xc + 64, xc + 112];
    texto(es5S(d) ? "CUMPLIMIENTO POR S" : "CUMPLIMIENTO POR SECCIÓN", MX, y + 5, { tam: 6.5, b: true, c: GRIS, esp: 1 });
    texto(`META ${nf1.format(insp.meta).replace(",0", "")} %`, xb + wb, y + 5, { tam: 6.5, b: true, c: GRIS, al: "right", esp: 1 });
    ["C", "NC", "N/A"].forEach((t, i) => texto(t, cols[i], y + 5, { tam: 6.5, b: true, c: GRIS, al: "center" }));
    texto("%", MX + ANCHO, y + 5, { tam: 6.5, b: true, c: GRIS, al: "right" });
    y += 10; trazo(TINTA, 1); doc.line(MX, y, MX + ANCHO, y);
    for (const s of secs) {
      const v = insp.por_s[s.clave];
      if (v === undefined) continue;
      const b2 = v != null && v < insp.meta;
      texto(s.corto, MX, y + 9.5, { tam: s.corto.length > 2 ? 8 : 10, b: true });
      texto(s.nombre, MX + 26, y + 9.5, { tam: 8, b: true });
      letra(8, true); const wn = doc.getTextWidth(s.nombre);
      if (s.jp) texto(s.jp, MX + 30 + wn, y + 9.5, { tam: 7.5, c: [156, 163, 175] });
      relleno(RIEL); doc.rect(xb, y + 6.5, wb, 6, "F");
      relleno(b2 ? ROJO : CARBON); doc.rect(xb, y + 6.5, (wb * (v ?? 0)) / 100, 6, "F");
      relleno(TINTA); doc.rect(xb + (wb * insp.meta) / 100 - 0.6, y + 4, 1.2, 11, "F");
      const n = [cS(s.clave, "cumple"), cS(s.clave, "no_cumple"), cS(s.clave, "na")];
      n.forEach((k, i) => texto(String(k), cols[i], y + 9.5, { tam: 8, b: i === 1 && k > 0, c: i === 1 && k > 0 ? ROJO : TINTA, al: "center" }));
      texto(v == null ? "—" : `${nf1.format(v)} %`, MX + ANCHO, y + 9.5, { tam: 9, b: true, c: b2 ? ROJO : TINTA, al: "right" });
      y += 19; trazo([240, 241, 243], 0.6); doc.line(MX, y, MX + ANCHO, y);
    }
    y += 4;
  }

  /* ================= 3. MATRIZ DE VERIFICACIÓN ================= */
  seccion(3, "Matriz de verificación", 60);
  {
    const cw = [22, 0, 22, 22, 24, 34, 150];
    cw[1] = ANCHO - cw.reduce((a, b) => a + b, 0);
    const xs = cw.reduce<number[]>((acc, w, i) => [...acc, i ? acc[i - 1] + cw[i - 1] : MX], []);
    const cabeza = () => {
      const t = ["#", "REQUISITO", "C", "NC", "N/A", "SEV.", "OBSERVACIÓN"];
      cw.forEach((w, i) => { caja(xs[i], y, w, 15, LABEL, LINEA); texto(t[i], i === 1 || i === 6 ? xs[i] + 4 : xs[i] + w / 2, y + 7.8, { tam: 6.5, b: true, al: i === 1 || i === 6 ? "left" : "center", esp: 0.3 }) });
      y += 15;
    };
    cabeza();
    let grupo = "";
    for (const it of items) {
      if (it.s !== grupo) {
        grupo = it.s;
        if (cabe(14 + 18)) cabeza();
        caja(MX, y, ANCHO, 14, CREMA, SUAVE);
        texto(tituloSeccion(seccionDe(d, it.s), it.s), MX + 4, y + 7.5, { tam: 7.5, b: true, esp: 0.3 });
        y += 14;
      }
      const req = partir(it.pregunta, cw[1] - 8, 7.8);
      const obs = partir([it.zona, it.observacion].filter(Boolean).join(" · "), cw[6] - 8, 7.5);
      const h = Math.max(req.length, obs.length, 1) * 9.2 + 6;
      if (cabe(h)) cabeza();
      cw.forEach((w, i) => caja(xs[i], y, w, h, undefined, SUAVE, 0.5));
      texto(String(num.get(it.id)), xs[0] + cw[0] / 2, y + 7.6, { tam: 7.8, al: "center" });
      req.forEach((l, j) => texto(l, xs[1] + 4, y + 7.6 + j * 9.2, { tam: 7.8 }));
      const col = it.resultado === "cumple" ? 2 : it.resultado === "no_cumple" ? 3 : 4;
      texto("X", xs[col] + cw[col] / 2, y + 7.6, { tam: 8.5, b: true, c: col === 3 ? ROJO : TINTA, al: "center" });
      if (it.severidad) texto(cap(it.severidad), xs[5] + cw[5] / 2, y + 7.6, { tam: 7.5, al: "center" });
      obs.forEach((l, j) => texto(l, xs[6] + 4, y + 7.6 + j * 9.2, { tam: 7.5 }));
      y += h;
    }
  }

  /* ================= 4. HALLAZGOS Y PLAN DE ACCIÓN ================= */
  const malos = items.filter((i) => i.resultado === "no_cumple")
    .sort((a, b) => ({ alta: 0, media: 1, baja: 2 }[a.severidad ?? "media"] - ({ alta: 0, media: 1, baja: 2 }[b.severidad ?? "media"])));
  seccion(4, "Hallazgos y plan de acción", 60);
  if (malos.length === 0) {
    caja(MX, y, ANCHO, 22, undefined, LINEA); texto("Sin hallazgos: todo lo evaluado cumple.", MX + 8, y + 11, { tam: 8.5 }); y += 22;
  } else {
    const cw = [22, 0, 36, 130, 90, 64];
    cw[1] = ANCHO - cw.reduce((a, b) => a + b, 0);
    const xs = cw.reduce<number[]>((acc, w, i) => [...acc, i ? acc[i - 1] + cw[i - 1] : MX], []);
    const cabeza = () => {
      ["#", "HALLAZGO", "SEV.", "ACCIÓN CORRECTIVA", "RESPONSABLE", "FECHA"].forEach((t, i) => { caja(xs[i], y, cw[i], 15, LABEL, LINEA); texto(t, xs[i] + 4, y + 7.8, { tam: 6.5, b: true, esp: 0.3 }) });
      y += 15;
    };
    cabeza();
    for (const it of malos) {
      const pre = `${seccionDe(d, it.s as ClaveS)?.corto ?? it.s}${it.zona ? ` · ${it.zona}` : ""}. `;
      const lineas = partir(pre + (it.observacion ?? ""), cw[1] - 8, 7.8);
      /* El plan, si ya lo tiene: lo cerrado dice qué se hizo; lo abierto, qué se va a hacer. */
      const acc = it.cerrada_el ? partir(`Cerrado. ${it.cierre_nota ?? ""}`, cw[3] - 8, 7.5) : partir(it.accion ?? "", cw[3] - 8, 7.5);
      const rs = partir(it.accion_resp ?? "", cw[4] - 8, 7.5);
      const fe = it.cerrada_el ? `Cerrado ${corta(it.cerrada_el.slice(0, 10))}` : it.accion_fecha ? fecha(it.accion_fecha) : "";
      const h = Math.max(36, Math.max(lineas.length, acc.length, rs.length) * 9.2 + 10);
      if (cabe(h)) cabeza();
      cw.forEach((w, i) => caja(xs[i], y, w, h, undefined, SUAVE, 0.5));
      texto(String(num.get(it.id)), xs[0] + 4, y + 9, { tam: 7.8 });
      lineas.forEach((l, j) => {
        if (j === 0 && l.startsWith(pre.trim())) {
          texto(pre, xs[1] + 4, y + 9, { tam: 7.8, b: true });
          letra(7.8, true); const wp = doc.getTextWidth(pre);
          texto(l.slice(pre.length), xs[1] + 4 + wp, y + 9, { tam: 7.8 });
        } else texto(l, xs[1] + 4, y + 9 + j * 9.2, { tam: 7.8 });
      });
      texto(cap(it.severidad), xs[2] + 4, y + 9, { tam: 7.8 });
      acc.forEach((l, j) => {
        if (j === 0 && it.cerrada_el && l.startsWith("Cerrado.")) {
          texto("Cerrado.", xs[3] + 4, y + 9, { tam: 7.5, b: true });
          letra(7.5, true); const wc = doc.getTextWidth("Cerrado. ");
          texto(l.slice(9), xs[3] + 4 + wc, y + 9, { tam: 7.5 });
        } else texto(l, xs[3] + 4, y + 9 + j * 9.2, { tam: 7.5 });
      });
      rs.forEach((l, j) => texto(l, xs[4] + 4, y + 9 + j * 9.2, { tam: 7.5 }));
      if (fe) texto(fe, xs[5] + 4, y + 9, { tam: 7.5, b: !!it.cerrada_el });
      y += h;
    }
  }

  /* ================= 5. REGISTRO FOTOGRÁFICO ================= */
  const orden = [...malos, ...items.filter((i) => i.resultado !== "no_cumple")];
  const fotos = orden.flatMap((it) => d.fotos.filter((f) => f.item_id === it.id)
    .sort((a, b) => Number(a.momento === "despues") - Number(b.momento === "despues"))
    .map((f) => ({ url: f.url, it, despues: f.momento === "despues" })));
  const encab = (f: (typeof fotos)[number], n: number) => f.despues
    ? `Foto ${n} · Punto ${num.get(f.it.id)} · DESPUÉS (cierre).`
    : `Foto ${n} · Punto ${num.get(f.it.id)} (${RES[f.it.resultado]}${f.it.severidad ? `, ${f.it.severidad}` : ""}).`;
  const pie = (f: (typeof fotos)[number]) => f.despues ? f.it.cierre_nota ?? "" : f.it.observacion ?? f.it.pregunta;
  seccion(5, "Registro fotográfico", fotos.length ? 190 : 30);
  if (fotos.length === 0) {
    caja(MX, y, ANCHO, 22, undefined, LINEA); texto("Sin fotos en esta inspección.", MX + 8, y + 11, { tam: 8.5 }); y += 22;
  } else {
    const gap = 10, fw = (ANCHO - gap) / 2, ih = 150;
    const recortes = await Promise.all(fotos.map((f) => recortar(f.url, fw - 10, ih)));
    for (let i = 0; i < fotos.length; i += 2) {
      const par = fotos.slice(i, i + 2);
      const caps = par.map((f, j) => partir(`${encab(f, i + j + 1)} ${pie(f)}`, fw - 12, 7.5));
      const h = 5 + ih + 6 + Math.max(...caps.map((c) => c.length)) * 9 + 6;
      cabe(h + gap);
      par.forEach((f, j) => {
        const x = MX + j * (fw + gap);
        caja(x, y, fw, h, undefined, LINEA);
        const img = recortes[i + j];
        if (img) doc.addImage(img, "JPEG", x + 5, y + 5, fw - 10, ih, undefined, "FAST");
        else { caja(x + 5, y + 5, fw - 10, ih, RIEL); texto("Foto no disponible", x + fw / 2, y + 5 + ih / 2, { tam: 8, c: GRIS, al: "center" }) }
        caps[j].forEach((l, k) => {
          const yy = y + 5 + ih + 10 + k * 9;
          if (k === 0) {
            const cab = encab(f, i + j + 1);
            if (l.startsWith(cab)) {
              texto(cab, x + 6, yy, { tam: 7.5, b: true });
              letra(7.5, true); const wc = doc.getTextWidth(cab + " ");
              texto(l.slice(cab.length + 1), x + 6 + wc, yy, { tam: 7.5 });
              return;
            }
          }
          texto(l, x + 6, yy, { tam: 7.5 });
        });
      });
      y += h + gap;
    }
  }

  /* ================= 6. OBSERVACIONES ================= */
  {
    const lineas = partir(insp.nota || "Sin observaciones.", ANCHO - 16, 8.5);
    const h = lineas.length * 11 + 12;
    seccion(6, "Observaciones del auditor", h);
    caja(MX, y, ANCHO, h, undefined, LINEA);
    lineas.forEach((l, j) => texto(l, MX + 8, y + 11 + j * 11, { tam: 8.5 }));
    y += h;
  }

  /* ================= 7. FIRMAS ================= */
  seccion(7, "Firmas", 74);
  {
    const fw = ANCHO / 2, h = 70;
    [["Supervisor OL", insp.firma_ol ?? ""], ["Warehouse Supervisor ABI", insp.firma_abi ?? ""]].forEach(([rol, nombre], i) => {
      const x = MX + i * fw;
      caja(x, y, fw, h, undefined, LINEA);
      trazo(TINTA, 0.8); doc.line(x + 10, y + h - 26, x + fw - 10, y + h - 26);
      if (nombre) texto(nombre, x + 10, y + h - 17, { tam: 8, b: true });
      texto(rol, x + 10, y + h - 7, { tam: 7.5, c: [55, 65, 81] });
    });
    y += h;
  }

  /* ================= ENCABEZADO Y PIE DE CADA HOJA (ahora que se sabe cuántas son) ================= */
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const w1 = 130, w3 = 132, w2 = ANCHO - w1 - w3;
    trazo(TINTA, 1);
    doc.rect(MX, TOP, w1, CAB, "S"); doc.rect(MX + w1, TOP, w2, CAB, "S"); doc.rect(MX + w1 + w2, TOP, w3, CAB, "S");
    if (imgLogo) { const lh = 26, lw = lh * 540 / 160; doc.addImage(imgLogo, "PNG", MX + (w1 - lw) / 2, TOP + (CAB - lh) / 2, lw, lh, "logo", "FAST") }
    texto(`INFORME DE AUDITORÍA ${sigla.toUpperCase()}`, MX + w1 + w2 / 2, TOP + 24, { tam: 12.5, b: true, al: "center", esp: 0.3 });
    texto(`Sistema de gestión · ${es5S(d) ? "Orden y aseo" : (d.formato?.nombre.split("·")[1] ?? "").trim() || "Evaluación"} · CD38`, MX + w1 + w2 / 2, TOP + 38, { tam: 7.5, c: GRIS, al: "center" });
    const cx = MX + w1 + w2 + 8;
    [["Código:", CODIGO], ["Versión:", VERSION], ["Fecha:", fecha(insp.fecha)], ["Página:", `${p} de ${total}`]].forEach(([a, b], i) => {
      const yy = TOP + 12 + i * 11.5;
      texto(a, cx, yy, { tam: 7.5, b: true });
      letra(7.5, true); const wa = doc.getTextWidth(a + " ");
      texto(b, cx + wa, yy, { tam: 7.5 });
    });
    texto(`Documento generado por CONTROL · ${gen}`, MX, H - 18, { tam: 6.5, c: GRIS });
    texto(`${CODIGO} · v${VERSION}`, W - MX, H - 18, { tam: 6.5, c: GRIS, al: "right" });
  }
  doc.setProperties({ title: `Informe de auditoría ${sigla} · ${insp.area} · ${insp.fecha}`, author: insp.auditor_nombre ?? "CONTROL", creator: "CONTROL · CD38" });
  return doc;
}

function semana(f: string) {
  const d = new Date(f + "T12:00:00Z"); const dia = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dia + 3);
  const p = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - p.getTime()) / 86400000 - 3 + ((p.getUTCDay() + 6) % 7)) / 7);
}

export type { ItemInspeccion };
