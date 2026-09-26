/**
 * EL RÓTULO DE LA ESTIBA, EN PDF — carta vertical, uno por hoja.
 *
 * Es el papel que se pega en la estiba cuando entra al CD, y lo lee
 * alguien de pie en un pasillo, a dos o tres metros, con un montacargas
 * andando. Eso manda sobre todo lo demás:
 *
 *   · EL CÓDIGO Y LA CANTIDAD, ENORMES. Son las dos cosas que se buscan
 *     desde lejos; el resto solo se lee cuando ya se llegó a la estiba.
 *   · POCOS DATOS Y GRANDES, no muchos y pequeños. Un rótulo con catorce
 *     campos de ocho puntos es un rótulo que nadie lee: se camina hasta
 *     la estiba, se mira, y se sigue sin haber resuelto nada.
 *   · CONTRASTE DE FOTOCOPIA. Sale de una impresora de oficina, a veces
 *     con poco tóner, y se pega en una estiba que se moja. Nada de gris
 *     claro sobre blanco para un dato que importa.
 *
 * LO QUE CAMBIA ENTRE PRODUCTO Y ENVASE
 * El envase retornable NO vence: pedirle fecha de vencimiento sería
 * inventar un dato, y pintarle un renglón vacío sería enseñar que ahí
 * falta algo. El envase lleva color de vidrio y de qué CD vino, que es
 * lo suyo. Son dos rótulos parecidos, no el mismo con huecos.
 *
 * EL QR LLEVA LA ESTIBA, NO EL MATERIAL. Dos estibas del mismo producto
 * que entraron en días distintos tienen que poder distinguirse desde el
 * teléfono: si el QR llevara el SKU, escanear cualquiera de las dos
 * abriría lo mismo y el FEFO no serviría de nada.
 */
import qrcode from "qrcode-generator";
import { PALETA_MARCA, paletaDeTema, aRGB, type Paleta } from "@/modulos/rotlinea/hoja";

export type TipoRecibo = "producto" | "envase";

/** Lo que se pinta en UN rótulo. Una estiba, un papel. */
export type Rotulo = {
  /** Lo que identifica ESTA estiba y lo que lleva el QR. */
  folio: string;
  tipo: TipoRecibo;
  sku: string;
  nombre: string;
  /** Cajas o unidades, según lo que se reciba. */
  cantidad: number;
  unidad: "cajas" | "unidades";
  /** Dónde queda. Vacío mientras no se haya asignado. */
  ubicacion: string | null;
  /** Cuál de cuántas: «3 de 12». Sin esto, doce papeles iguales. */
  numero: number;
  total: number;
  /* ---- solo producto ---- */
  producido?: string | null;
  vence?: string | null;
  lote?: string | null;
  /* ---- solo envase ---- */
  color?: string | null;
  origen?: string | null;
  /* ---- de los dos ---- */
  placa?: string | null;
  recibido_por?: string | null;
  recibido_en?: string;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** Una fecha `2026-09-26` como «26/09/2026». Nunca inventa una. */
export const fechaCorta = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? s + "T00:00:00" : s)
        .toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

/**
 * CUÁNDO VENCE, calculado de la vida útil del maestro.
 *
 * NO SE INVENTA CUANDO FALTA EL DATO: sin fecha de producción o sin
 * vida útil devuelve null, y el rótulo sale diciendo que falta. Un
 * vencimiento calculado a ojo en un papel pegado a la estiba es peor
 * que ningún vencimiento: nadie va a dudar de lo que está impreso.
 */
export function calcularVence(producido: string | null, vidaUtil: number | null): string | null {
  if (!producido || vidaUtil == null || vidaUtil <= 0) return null;
  const d = new Date(producido.length === 10 ? producido + "T00:00:00" : producido);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + vidaUtil);
  return d.toISOString().slice(0, 10);
}

/** El QR como PNG. El mismo generador del libro de accesos. */
function qrPng(texto: string): string {
  const q = qrcode(0, "M");
  q.addData(texto);
  q.make();
  return q.createDataURL(8, 0);
}

/** Los colores del tema de quien lo genera, como los demás informes. */
export function leerPaleta(dentro: Element | null): Paleta {
  const conTema = dentro?.closest("[data-tema]");
  if (!conTema) return PALETA_MARCA;
  const leer = (v: string) => {
    const t = document.createElement("span");
    t.style.color = `var(${v})`; t.style.display = "none";
    conTema.appendChild(t); const c = aRGB(getComputedStyle(t).color); t.remove(); return c;
  };
  const tinta = leer("--c-04203f"), acento = leer("--c-marca"), hondo = leer("--c-marca-hondo");
  return tinta && acento ? paletaDeTema(tinta, acento, hondo ?? acento) : PALETA_MARCA;
}

async function comoDataUrl(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url);
  const b = await r.blob();
  return await new Promise<string>((ok, mal) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result));
    fr.onerror = mal;
    fr.readAsDataURL(b);
  });
}

/**
 * LOS RÓTULOS DE UN RECIBO, todos en un PDF.
 *
 * Uno por hoja: se manda a imprimir una vez y salen los doce.
 *
 * `base` es de dónde cuelga el QR —el dominio de la plataforma—, para
 * que escanearlo abra la estiba. Si no llega, el QR lleva solo el
 * folio: un QR que abre una dirección equivocada es peor que uno que
 * solo dice un número.
 */
export async function rotulosPdf(
  rotulos: Rotulo[],
  o: { base?: string | null; dentro?: Element | null } = {},
) {
  if (rotulos.length === 0) throw new Error("No hay ningún rótulo que imprimir.");
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "letter" });
  const W = 216, H = 279, M = 14, AN = W - M * 2;
  const P = leerPaleta(o.dentro ?? null);
  const TINTA = P.tinta;
  const GRIS: [number, number, number] = [91, 107, 127];
  const LINEA: [number, number, number] = [200, 208, 219];

  const [palabra, sello] = await Promise.all([
    comoDataUrl("/marca/logo-bavaria.png").catch(() => null),
    comoDataUrl("/marca/logo-b.png").catch(() => null),
  ]);

  rotulos.forEach((r, i) => {
    if (i > 0) pdf.addPage();
    let y = M;

    /* ---------- LA BANDA DE ARRIBA ---------- */
    pdf.setFillColor(...TINTA);
    pdf.rect(0, 0, W, 6, "F");
    y = 18;
    if (sello) { try { pdf.addImage(sello, "PNG", M, y - 6, 13, 13) } catch { /* sigue sin sello */ } }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(...GRIS);
    pdf.text("CD38 · AG01 · BARRANQUILLA", M + (sello ? 17 : 0), y);
    pdf.setFontSize(20); pdf.setTextColor(...TINTA);
    pdf.text(r.tipo === "producto" ? "PRODUCTO TERMINADO" : "ENVASE RETORNABLE",
             M + (sello ? 17 : 0), y + 9);

    /* CUÁL DE CUÁNTAS, ARRIBA A LA DERECHA. Doce papeles iguales en una
       mano son doce papeles que no se pueden repartir. */
    pdf.setFontSize(26); pdf.setTextColor(...TINTA);
    pdf.text(`${r.numero}/${r.total}`, W - M, y + 7, { align: "right" });

    y += 18;
    pdf.setDrawColor(...LINEA); pdf.setLineWidth(0.4);
    pdf.line(M, y, W - M, y);

    /* ---------- EL CÓDIGO, QUE ES LO QUE SE BUSCA DESDE LEJOS ---------- */
    y += 16;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(64); pdf.setTextColor(...TINTA);
    pdf.text(r.sku, M, y);

    /* EL NOMBRE DEBAJO, PARTIDO SI NO CABE. Un nombre que se sale del
       papel o se pisa con el QR es un rótulo impreso para nada. */
    y += 10;
    pdf.setFontSize(19);
    const nom = pdf.splitTextToSize(r.nombre.toUpperCase(), AN - 46);
    pdf.text(nom.slice(0, 2), M, y);
    y += nom.length > 1 ? 16 : 8;

    /* ---------- EL QR, ARRIBA A LA DERECHA DEL BLOQUE ---------- */
    try {
      const destino = o.base ? `${o.base.replace(/\/$/, "")}/inventario/estiba/${r.folio}` : r.folio;
      pdf.addImage(qrPng(destino), "PNG", W - M - 40, y - 34, 40, 40);
    } catch { /* sin QR el rótulo sigue sirviendo: lo demás está impreso */ }
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...GRIS);
    pdf.text(r.folio, W - M, y + 10, { align: "right" });

    /* ---------- LA CANTIDAD, EL SEGUNDO DATO DE LEJOS ---------- */
    y += 14;
    pdf.setDrawColor(...LINEA);
    pdf.line(M, y, W - M, y);
    y += 20;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(52); pdf.setTextColor(...TINTA);
    const cifra = nf.format(r.cantidad);
    pdf.text(cifra, M, y);
    /* «cajas» PEGADO A LA CIFRA, y por eso se mide ANTES de bajar el
       tamaño: `getTextWidth` usa el tamaño que esté puesto en ese
       momento, así que medir después de poner 16 devolvería el ancho de
       un número que no se pintó y la palabra caería encima de la cifra.
       Y se mide, no se calcula: «1.080» y «96» no ocupan lo mismo. */
    const anchoCifra = pdf.getTextWidth(cifra);
    pdf.setFontSize(16); pdf.setTextColor(...GRIS);
    pdf.text(r.unidad, M + anchoCifra + 4, y);

    /* LA UBICACIÓN, AL LADO Y DEL MISMO TAMAÑO QUE LA CANTIDAD: es lo
       que contesta «¿dónde la pongo?», que es la otra pregunta del que
       está manejando el montacargas. */
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(...GRIS);
    pdf.text("UBICACIÓN", W - M, y - 14, { align: "right" });
    pdf.setFontSize(r.ubicacion ? 34 : 15);
    pdf.setTextColor(...(r.ubicacion ? TINTA : GRIS));
    pdf.text(r.ubicacion ?? "sin asignar", W - M, y, { align: "right" });

    /* ---------- LO QUE DEPENDE DE QUÉ SE RECIBIÓ ---------- */
    y += 16;
    pdf.setDrawColor(...LINEA);
    pdf.line(M, y, W - M, y);
    y += 12;

    /* UN DATO POR COLUMNA, con su rótulo encima. El rótulo en gris y el
       dato en tinta: así se distingue de un vistazo qué es etiqueta y
       qué es contenido, sin leer. */
    const dato = (x: number, rot: string, val: string | null, ancho: number) => {
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5); pdf.setTextColor(...GRIS);
      pdf.text(rot, x, y);
      pdf.setFontSize(15);
      /* LO QUE FALTA SE DICE, y en gris: un renglón en blanco parece que
         el papel salió mal impreso; «falta» dice que el dato no estaba
         cuando se recibió, que es otra cosa y se arregla en otro sitio. */
      pdf.setTextColor(...(val ? TINTA : GRIS));
      pdf.text(pdf.splitTextToSize(val ?? "falta", ancho)[0], x, y + 8);
    };

    const col = (AN - 10) / 3;
    if (r.tipo === "producto") {
      /* AQUÍ NO VA EL VENCIMIENTO, Y ESTO SE VIO EN EL PAPEL IMPRESO:
         salía en esta fila Y otra vez en el recuadro grande, a diez
         centímetros y con un peso parecido. Dos veces el mismo dato tan
         cerca no se lee como énfasis, se lee como un error de armado —y
         deja dudando de cuál de los dos manda. Se queda el grande, que
         es el que se ve desde el pasillo. */
      dato(M, "PRODUCIDO", fechaCorta(r.producido), col);
      dato(M + col + 5, "LOTE", r.lote ?? null, col);
    } else {
      dato(M, "COLOR DEL VIDRIO", r.color ?? null, col);
      dato(M + col + 5, "VIENE DE", r.origen ?? null, col);
      dato(M + (col + 5) * 2, "PLACA", r.placa ?? null, col);
    }

    /* EL VENCIMIENTO, OTRA VEZ Y ENORME, SOLO EN PRODUCTO. Es el dato
       que decide el FEFO —qué sale antes— y el que alguien busca
       caminando por el pasillo. Repetirlo grande no es redundancia: el
       de arriba está en el bloque de datos, este es el que se ve de
       lejos. Y si falta, se dice en rojo: una estiba sin vencimiento no
       se puede ordenar por FEFO. */
    if (r.tipo === "producto") {
      /* EL RECUADRO CRECE PARA LLENAR EL PAPEL. Sobraba un tercio de
         hoja en blanco debajo, y un rótulo con el dato más importante
         pequeño y media carta vacía debajo desperdicia justo lo que se
         vino a comprar: que se lea desde el pasillo. */
      y += 26;
      const v = fechaCorta(r.vence);
      const alto = 48;
      pdf.setFillColor(...(v ? [246, 248, 251] : [253, 235, 238]) as [number, number, number]);
      pdf.rect(M, y, AN, alto, "F");
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(11);
      pdf.setTextColor(...(v ? GRIS : [176, 0, 32] as [number, number, number]));
      pdf.text("VENCE", M + 10, y + 14);
      pdf.setFontSize(v ? 46 : 17);
      pdf.setTextColor(...(v ? TINTA : [176, 0, 32] as [number, number, number]));
      /* EL TEXTO CORTO SUBE. La fecha ocupa 46 puntos y el aviso 17:
         dejándolos en la misma base, el aviso quedaba pegado al borde
         de abajo con un hueco encima y el recuadro se veía mal armado. */
      pdf.text(v ?? "SIN FECHA: NO SE PUEDE ORDENAR POR FEFO", M + 10, y + (v ? 38 : 31));
      y += alto;
    } else {
      y += 26;
    }

    /* ---------- EL PIE: QUIÉN Y CUÁNDO ---------- */
    pdf.setDrawColor(...LINEA);
    pdf.line(M, H - 26, W - M, H - 26);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...GRIS);
    const pie = [
      r.recibido_por ? `Recibió ${r.recibido_por}` : null,
      r.recibido_en ?? null,
      r.placa && r.tipo === "producto" ? `Placa ${r.placa}` : null,
    ].filter(Boolean).join("  ·  ");
    pdf.text(pie, M, H - 18);
    if (palabra) {
      try { pdf.addImage(palabra, "PNG", W - M - 30, H - 24, 30, 8) } catch { /* sigue */ }
    }
  });

  return pdf;
}
