/**
 * EL INFORME DE HALLAZGOS EN PDF.
 *
 * «Mejoremos ese informe cuando se exporta en PDF: el logo, el
 *  encabezado, todo. Que tenga las imágenes del antes, el después, el
 *  hallazgo, todo.»
 *
 * ---------------------------------------------------------------------
 * MISMA CARA QUE LOS OTROS INFORMES DE LA PLATAFORMA
 * ---------------------------------------------------------------------
 * Carta vertical, el logo de `public/marca`, el mismo azul y el mismo
 * gris, y el pie con «página N de M». No es decoración: estos PDF se
 * mandan por correo a gerencia y uno con otra tipografía y otro azul
 * parece de otra empresa. La tabla, el título y el pie se copian de
 * `acciones/analisis/informe.ts` a propósito.
 *
 * ---------------------------------------------------------------------
 * LO QUE SALE ES LA REDACCIÓN APROBADA, NUNCA EL DICTADO
 * ---------------------------------------------------------------------
 * `lo_que_se_vio` es lo que alguien dijo caminando, con guante y de
 * pie. No sale aquí. Un hallazgo sin redacción aprobada NO ENTRA en el
 * informe, y el informe dice cuántos quedaron por fuera: publicar el
 * dictado es publicar algo que nadie revisó, y no decir que faltaron es
 * peor —quien lo recibe cree que eso fue todo lo que se encontró—.
 *
 * ---------------------------------------------------------------------
 * LAS FOTOS SE ARMAN EN EL NAVEGADOR
 * ---------------------------------------------------------------------
 * Se piden firmadas, se bajan, se encogen a lo que cabe en la hoja y
 * se meten como JPEG. SE ENCOGEN A PROPÓSITO: seis hallazgos con dos
 * fotos de doce megapíxeles cada una dan un PDF de cuarenta megas que
 * el correo rebota, y en una hoja carta esas fotos se ven exactamente
 * igual que a 900 px de ancho.
 *
 * Y SI UNA FOTO NO BAJA, EL INFORME SIGUE. Se deja el hueco dicho con
 * palabras —«no se pudo traer»— en vez de caerse: un informe que no
 * sale por una foto es un informe que no sale.
 */

import type { Hallazgo, FotoHallazgo } from "@/modulos/acciones/hallazgos";

export type FotoLista = FotoHallazgo & { url: string };

const TINTA: [number, number, number] = [4, 32, 63];
const GRIS: [number, number, number] = [91, 107, 127];
const LINEA: [number, number, number] = [213, 220, 229];
const ROJO: [number, number, number] = [228, 0, 43];

const SEV: Record<string, { t: string; c: [number, number, number]; f: [number, number, number] }> = {
  /* PARES FIJOS Y ESCRITOS AQUÍ, no tomados del tema de la pantalla:
     el PDF sale siempre sobre papel blanco, y un color que se lee en
     el tema oscuro puede desaparecer impreso. */
  observacion: { t: "OBSERVACIÓN", c: [36, 56, 79], f: [232, 237, 243] },
  hallazgo:    { t: "HALLAZGO",    c: [106, 74, 0],  f: [253, 239, 208] },
  critico:     { t: "CRÍTICO",     c: [255, 196, 0], f: [17, 17, 17] },
};

async function comoDataUrl(url: string) {
  const r = await fetch(url);
  const b = await r.blob();
  return await new Promise<string>((ok, mal) => {
    const f = new FileReader();
    f.onload = () => ok(String(f.result));
    f.onerror = mal;
    f.readAsDataURL(b);
  });
}

/** Baja la foto y la encoge a lo que de verdad cabe en la hoja. */
async function fotoLista(url: string, anchoMax = 900):
  Promise<{ datos: string; w: number; h: number } | null> {
  try {
    const crudo = await comoDataUrl(url);
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = mal;
      i.src = crudo;
    });
    const escala = Math.min(1, anchoMax / (img.naturalWidth || anchoMax));
    const w = Math.max(1, Math.round((img.naturalWidth || anchoMax) * escala));
    const h = Math.max(1, Math.round((img.naturalHeight || anchoMax) * escala));
    const lienzo = document.createElement("canvas");
    lienzo.width = w; lienzo.height = h;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;
    /* FONDO BLANCO ANTES DE PINTAR: un PNG con transparencia metido en
       un JPEG sin fondo sale con las zonas transparentes en negro. */
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { datos: lienzo.toDataURL("image/jpeg", 0.72), w, h };
  } catch {
    return null;
  }
}

export type DatosInforme = {
  hallazgos: Hallazgo[];
  /** Ya firmadas y listas para bajar. */
  fotos: FotoLista[];
  nombres: Record<string, string>;
  desde: string;
  hasta: string;
  /** Cuántos se quedaron por fuera por no tener redacción aprobada. */
  sinRedaccion: number;
  /** Para el pie de la portada: quién lo generó. */
  quien?: string;
};

const dma = (f: string) => f.split("-").reverse().join("/");

export async function informeHallazgosPdf(d: DatosInforme, hoy: Date) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "letter" });
  const W = 216, H = 279, M = 14, ANCHO = W - M * 2;

  const fecha = hoy.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  let y = 14;

  /* ================= EL ENCABEZADO ================= */
  try {
    pdf.addImage(await comoDataUrl("/marca/logo-b.png"), "PNG", M, y - 2, 14, 14);
  } catch { /* sin logo se sigue: el informe no depende de una imagen */ }

  pdf.setFont("helvetica", "bold"); pdf.setFontSize(17); pdf.setTextColor(...TINTA);
  pdf.text("Informe de hallazgos de auditoría", M + 18, y + 4);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5); pdf.setTextColor(...GRIS);
  pdf.text(`ABI · CD38 AG01 · del ${dma(d.desde)} al ${dma(d.hasta)}`, M + 18, y + 10);
  y += 20;

  pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.6);
  pdf.line(M, y, W - M, y); pdf.setLineWidth(0.2);
  y += 8;

  /* ================= LAS CIFRAS ================= */
  const porSev = (s: string) => d.hallazgos.filter((h) => h.severidad === s).length;
  const conAccion = d.hallazgos.filter((h) => h.tiene_accion).length;
  const cif: [string, string, string][] = [
    ["Hallazgos", String(d.hallazgos.length), "en el informe"],
    ["Críticos", String(porSev("critico")), `${porSev("hallazgo")} hallazgos · ${porSev("observacion")} observaciones`],
    ["Con acción", String(conAccion), "abrieron acción en OL"],
    ["Sin redactar", String(d.sinRedaccion), "quedaron por fuera"],
  ];
  const cw = (ANCHO - 9) / 4;
  cif.forEach(([r, n, p], i) => {
    const x = M + i * (cw + 3);
    pdf.setFillColor(238, 241, 245); pdf.rect(x, y, cw, 24, "F");
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(...GRIS);
    pdf.text(r.toUpperCase(), x + 3, y + 5.5);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(18);
    pdf.setTextColor(...(r === "Sin redactar" && d.sinRedaccion > 0 ? ROJO : TINTA));
    pdf.text(n, x + 3, y + 15);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(...GRIS);
    pdf.text(pdf.splitTextToSize(p, cw - 6)[0] ?? "", x + 3, y + 21);
  });
  y += 30;

  /* LO QUE QUEDÓ POR FUERA, DICHO Y NO ESCONDIDO. Quien recibe esto
     tiene que saber que no es todo lo que se encontró. */
  if (d.sinRedaccion > 0) {
    pdf.setFillColor(255, 244, 245); pdf.rect(M, y, ANCHO, 12, "F");
    pdf.setDrawColor(...ROJO); pdf.setLineWidth(0.8);
    pdf.line(M, y, M, y + 12); pdf.setLineWidth(0.2);
    pdf.setFontSize(8.5); pdf.setTextColor(154, 16, 32);
    pdf.text(
      `${d.sinRedaccion} hallazgo${d.sinRedaccion === 1 ? "" : "s"} del periodo no ` +
      `entra${d.sinRedaccion === 1 ? "" : "n"} aquí: falta aprobar su redacción técnica.`,
      M + 4, y + 7.4);
    y += 18;
  }

  /* ================= EL RESUMEN POR TEMA ================= */
  const temas = new Map<string, number>();
  for (const h of d.hallazgos) {
    const k = h.tema_nombre ?? h.tema;
    temas.set(k, (temas.get(k) ?? 0) + 1);
  }
  if (temas.size) {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11.5); pdf.setTextColor(...TINTA);
    pdf.text("Por tema", M, y); y += 5;
    pdf.setDrawColor(...LINEA); pdf.line(M, y, W - M, y); y += 5;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...TINTA);
    const orden = [...temas.entries()].sort((a, b) => b[1] - a[1]);
    const max = Math.max(...orden.map(([, n]) => n));
    for (const [t, n] of orden) {
      if (y > H - 30) { pdf.addPage(); y = 16 }
      pdf.text(t, M, y + 3);
      const bw = (ANCHO - 90) * (n / max);
      pdf.setFillColor(...TINTA); pdf.rect(M + 78, y, Math.max(0.8, bw), 3.6, "F");
      pdf.setTextColor(...GRIS); pdf.text(String(n), W - M - 6, y + 3);
      pdf.setTextColor(...TINTA);
      y += 6.5;
    }
    y += 6;
  }

  /* ================= CADA HALLAZGO ================= */
  const porHallazgo = new Map<string, FotoLista[]>();
  for (const f of d.fotos) {
    const arr = porHallazgo.get(f.hallazgo_id) ?? [];
    arr.push(f);
    porHallazgo.set(f.hallazgo_id, arr);
  }

  /* LAS FOTOS SE BAJAN TODAS ANTES DE EMPEZAR A PINTAR. Bajar una en
     mitad de la página obliga a esperar con la hoja a medio armar, y si
     falla queda un hueco en el sitio equivocado. */
  const bajadas = new Map<string, { datos: string; w: number; h: number } | null>();
  await Promise.all(d.fotos.map(async (f) => { bajadas.set(f.id, await fotoLista(f.url)) }));

  pdf.addPage(); y = 16;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(...TINTA);
  pdf.text("Hallazgos, uno por uno", M, y); y += 8;

  for (const h of d.hallazgos) {
    const fs = porHallazgo.get(h.id) ?? [];
    const antes = fs.filter((f) => f.momento === "antes").slice(0, 1)[0];
    const despues = fs.filter((f) => f.momento === "despues").slice(0, 1)[0];
    const conFotos = Boolean(antes || despues);

    /* CUÁNTO MIDE ESTE HALLAZGO, ANTES DE EMPEZARLO. Un hallazgo
       partido entre dos páginas —el texto arriba y las fotos en la
       siguiente— es exactamente lo que hace que alguien lea el texto de
       uno con la foto de otro. */
    const texto = (h.redaccion ?? "").trim();
    const lineas = pdf.splitTextToSize(texto, ANCHO);
    const reco = (h.recomendacion ?? "").trim();
    const lreco = reco ? pdf.splitTextToSize(reco, ANCHO - 6) : [];
    const altoFoto = conFotos ? 56 : 0;
    const alto = 16 + lineas.length * 4.6 + (lreco.length ? lreco.length * 4.2 + 8 : 0) + altoFoto + 10;
    if (y + alto > H - 18) { pdf.addPage(); y = 16 }

    pdf.setDrawColor(...LINEA); pdf.line(M, y, W - M, y); y += 6;

    /* EL RENGLÓN DE ARRIBA: código, fecha, severidad. */
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(...TINTA);
    pdf.text(h.codigo, M, y + 3);
    const anchoCod = pdf.getTextWidth(h.codigo);

    const sv = SEV[h.severidad] ?? SEV.hallazgo;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7);
    const wSev = pdf.getTextWidth(sv.t) + 5;
    pdf.setFillColor(...sv.f); pdf.rect(M + anchoCod + 5, y - 1.4, wSev, 5.4, "F");
    pdf.setTextColor(...sv.c); pdf.text(sv.t, M + anchoCod + 7.5, y + 2.4);

    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(...GRIS);
    const cola = [
      dma(h.fecha),
      h.tema_nombre ?? h.tema,
      [h.zona_nombre ?? h.zona, h.ubicacion].filter(Boolean).join(" · "),
      h.tiene_accion ? `acción ${h.accion_codigo ?? ""}`.trim() : "",
    ].filter(Boolean).join("  ·  ");
    pdf.text(pdf.splitTextToSize(cola, ANCHO)[0] ?? "", W - M, y + 3, { align: "right" });
    y += 9;

    /* LA REDACCIÓN APROBADA. */
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(...TINTA);
    for (const l of lineas) {
      if (y > H - 18) { pdf.addPage(); y = 16 }
      pdf.text(l, M, y); y += 4.6;
    }
    y += 2;

    if (lreco.length) {
      if (y + lreco.length * 4.2 + 8 > H - 18) { pdf.addPage(); y = 16 }
      const altoR = lreco.length * 4.2 + 6;
      pdf.setFillColor(242, 245, 248); pdf.rect(M, y - 2, ANCHO, altoR, "F");
      pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.8);
      pdf.line(M, y - 2, M, y - 2 + altoR); pdf.setLineWidth(0.2);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(7); pdf.setTextColor(...GRIS);
      pdf.text("RECOMENDACIÓN", M + 4, y + 1.6);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...TINTA);
      let yr = y + 5.8;
      for (const l of lreco) { pdf.text(l, M + 4, yr); yr += 4.2 }
      y += altoR + 4;
    }

    /* EL ANTES Y EL DESPUÉS, DEL MISMO TAMAÑO Y UNO AL LADO DEL OTRO.
       Distintos tamaños harían ver una más importante que la otra, y
       la gracia del par es justamente compararlas. */
    if (conFotos) {
      if (y + 56 > H - 18) { pdf.addPage(); y = 16 }
      const fw = (ANCHO - 6) / 2, fh = 46;
      const par: [string, FotoLista | undefined][] = [["ANTES", antes], ["DESPUÉS", despues]];
      par.forEach(([rot, f], i) => {
        const x = M + i * (fw + 6);
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(7); pdf.setTextColor(...GRIS);
        pdf.text(rot, x, y + 3);
        const im = f ? bajadas.get(f.id) : null;
        if (im) {
          /* SE ENCAJA DENTRO DEL HUECO SIN DEFORMARLA. Estirar una foto
             para llenar el recuadro cambia lo que muestra: una estiba
             torcida se endereza y el hallazgo deja de verse. */
          const esc = Math.min(fw / im.w, fh / im.h);
          const iw = im.w * esc, ih = im.h * esc;
          pdf.addImage(im.datos, "JPEG", x + (fw - iw) / 2, y + 5, iw, ih);
          pdf.setDrawColor(...LINEA); pdf.rect(x, y + 5, fw, fh);
        } else {
          pdf.setDrawColor(...LINEA); pdf.rect(x, y + 5, fw, fh);
          pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...GRIS);
          pdf.text(f ? "No se pudo traer la foto" : "Sin foto",
            x + fw / 2, y + 5 + fh / 2, { align: "center" });
        }
      });
      y += 56;
    }

    y += 4;
  }

  /* ================= EL PIE, EN TODAS LAS PÁGINAS ================= */
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(...GRIS);
    pdf.text(`CONTROL · ABI · Hallazgos · ${fecha}${d.quien ? ` · ${d.quien}` : ""}`, M, H - 7);
    pdf.text(`página ${i} de ${n}`, W - M, H - 7, { align: "right" });
  }

  pdf.save(`abi-hallazgos-${d.desde}-a-${d.hasta}.pdf`);
}
