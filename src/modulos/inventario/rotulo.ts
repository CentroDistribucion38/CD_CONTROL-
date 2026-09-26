/**
 * LA TARJETA DE ARRUME — A4, una por estiba.
 *
 * Es el papel que se pega en la estiba cuando entra al CD. El formato
 * lo puso Cristian y esto lo reproduce: cabecera negra con la estiba
 * «3 / 12» en ámbar, la ficha del producto, la banda del vencimiento en
 * tres casillas, las cuatro fechas, el QR grande con el logo al centro,
 * el folio y las dos firmas.
 *
 * ---------------------------------------------------------------------
 * SE DIBUJA EN PDF Y NO SE IMPRIME EL HTML, y la razón es de bodega:
 * el navegador NO imprime fondos salvo que quien imprime entre a
 * «Opciones» y active «Gráficos de fondo». Sin eso, la cabecera negra,
 * el código en ámbar y toda la banda del vencimiento salen EN BLANCO, y
 * la tarjeta pierde justo lo que se ve desde el pasillo. En un PDF los
 * fondos son relleno vectorial y salen siempre, en cualquier impresora
 * y sin tocar ninguna casilla.
 *
 * ---------------------------------------------------------------------
 * EL QR LLEVA EL ENLACE **Y** LOS DATOS
 * La tarjeta promete «con señal abre la estiba en CONTROL; sin señal se
 * lee igual como texto», y eso obliga a un solo contenido que sirva
 * para las dos cosas: la primera línea es la dirección —que es lo que
 * el lector ofrece abrir— y debajo van los datos en texto plano, que es
 * lo que queda cuando no hay señal.
 *
 * VA EN NIVEL «H» DE CORRECCIÓN, y esto lo medí en vez de suponerlo.
 * Con el logo al 19 % del ancho, el nivel medio TAMBIÉN se lee: probé
 * los dos con un decodificador de verdad. Así que H no está por eso.
 * Está por lo que el arnés no puede probar: ese papel se pega a una
 * estiba, se moja, se raya con el montacargas y se imprime con poco
 * tóner. H aguanta hasta un 30 % del código destruido; M, la mitad.
 * El precio es densidad —93 módulos contra 69—, y a los 80 mm que mide
 * el código en la hoja cada módulo queda en 0,86 mm, muy por encima de
 * lo que lee la cámara de un teléfono. Sobra margen; se paga.
 *
 * DONDE SÍ HAY UN LÍMITE DURO es en el tamaño del logo: al 50 % del
 * ancho el código deja de leerse, medido. Por eso está en 0.19 y el
 * arnés decodifica las cuatro hojas — si alguien lo agranda, se cae en
 * rojo en vez de descubrirse en el muelle.
 */
import qrcode from "qrcode-generator";

export type TipoRecibo = "producto" | "envase";

/** Lo que se pinta en UNA tarjeta. Una estiba, un papel. */
export type Rotulo = {
  /** Lo que identifica ESTA estiba y lo que lleva el QR. */
  folio: string;
  tipo: TipoRecibo;
  sku: string;
  nombre: string;
  /** Cajas (o unidades) en ESTA estiba. */
  cantidad: number;
  unidad: "cajas" | "unidades";
  /** Todo el arrume: lo de una estiba por cuántas estibas son. */
  arrume: number;
  /** Cuál de cuántas: «3 / 12». Sin esto, doce papeles iguales. */
  numero: number;
  total: number;
  /** Cómo está armado el arrume: ancho × alto × largo, en estibas. */
  ancho: number | null;
  alto: number | null;
  largo: number | null;
  ubicacion: string | null;
  /* ---- solo producto ---- */
  producido?: string | null;
  vence?: string | null;
  /** Vence menos los días que el maestro exige tener antes de vencer. */
  limite?: string | null;
  linea?: string | null;
  hora?: string | null;
  /* ---- solo envase ---- */
  color?: string | null;
  origen?: string | null;
  /* ---- de los dos ---- */
  recibido?: string | null;
  placa?: string | null;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** Una fecha `2026-09-26` como «26/09/2026». Nunca inventa una. */
export const fechaCorta = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? s + "T00:00:00" : s)
        .toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

/** Los tres pedazos de la banda del vencimiento: día, mes y año corto. */
export const partesFecha = (s: string | null | undefined) => {
  if (!s) return null;
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  if (Number.isNaN(d.getTime())) return null;
  return [String(d.getDate()).padStart(2, "0"),
          String(d.getMonth() + 1).padStart(2, "0"),
          String(d.getFullYear()).slice(2)];
};

/** Suma días a una fecha. Devuelve null si falta cualquiera de los dos. */
export function sumarDias(desde: string | null, dias: number | null): string | null {
  if (!desde || dias == null) return null;
  const d = new Date(desde.length === 10 ? desde + "T00:00:00" : desde);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * CUÁNDO VENCE, calculado de la vida útil del maestro.
 *
 * NO SE INVENTA CUANDO FALTA EL DATO: sin fecha de producción o sin
 * vida útil devuelve null, y la tarjeta sale diciendo que falta. Un
 * vencimiento calculado a ojo en un papel pegado a la estiba es peor
 * que ningún vencimiento: nadie va a dudar de lo que está impreso.
 */
export function calcularVence(producido: string | null, vidaUtil: number | null): string | null {
  if (!producido || vidaUtil == null || vidaUtil <= 0) return null;
  return sumarDias(producido, vidaUtil);
}

/**
 * HASTA CUÁNDO SE PUEDE DESPACHAR: el vencimiento menos los días que el
 * maestro exige que le queden al salir. Un producto que vence en tres
 * días no se manda a un cliente que lo va a tener dos semanas.
 */
export function limiteDespacho(vence: string | null, diasMinimo: number | null): string | null {
  if (!vence || diasMinimo == null) return null;
  return sumarDias(vence, -diasMinimo);
}

/**
 * LO QUE VA DENTRO DEL QR. La dirección primero —es lo que el lector
 * ofrece abrir— y los datos debajo, que es lo que queda sin señal.
 *
 * TODO EN ASCII a propósito: los acentos y el «·» obligan al código a
 * cambiar de modo de codificación y a crecer, y en el archivo que sirvió
 * de modelo el «·» ya había salido convertido en basura. Un dato que se
 * lee mal en el único sitio donde no hay señal no sirve de nada.
 */
export function textoQr(r: Rotulo, base: string | null): string {
  const L: string[] = [];
  if (base) L.push(`${base.replace(/\/$/, "")}/a/${r.folio}`);
  L.push("BAVARIA CD38 - ARRUME");
  L.push(`PROD: ${sinTildes(r.nombre)}`);
  L.push(`COD: ${r.sku}`);
  L.push(`ESTIBA: ${r.numero} de ${r.total}`);
  L.push(`${r.unidad.toUpperCase()} ESTIBA: ${r.cantidad}`);
  L.push(`ARRUME: ${nf.format(r.arrume)}`);
  if (r.ancho && r.alto && r.largo) L.push(`ARMADO: ${r.ancho}x${r.alto}x${r.largo}`);
  if (r.ubicacion) L.push(`UBICACION: ${r.ubicacion}`);
  if (r.tipo === "producto") {
    if (r.producido) L.push(`PRODUCCION: ${fechaCorta(r.producido)}`);
    if (r.recibido) L.push(`RECIBO: ${fechaCorta(r.recibido)}`);
    if (r.limite) L.push(`LIM DESPACHO: ${fechaCorta(r.limite)}`);
    L.push(`VENCE: ${fechaCorta(r.vence) ?? "SIN FECHA"}`);
    if (r.linea) L.push(`LINEA: ${r.linea}${r.hora ? `  HORA: ${r.hora}` : ""}`);
  } else {
    if (r.color) L.push(`COLOR: ${sinTildes(r.color)}`);
    if (r.origen) L.push(`VIENE DE: ${sinTildes(r.origen)}`);
    if (r.recibido) L.push(`RECIBO: ${fechaCorta(r.recibido)}`);
  }
  if (r.placa) L.push(`PLACA: ${r.placa}`);
  return L.join("\n");
}

const sinTildes = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, " ");

/**
 * EL QR COMO PNG, EN NIVEL «H» — el que aguanta hasta un 30 % del
 * código destruido. No hace falta para el logo (al 19 % también se lee
 * en nivel medio, medido); hace falta para el papel mojado y rayado de
 * una bodega, que es lo que el arnés no puede probar. Ver la cabecera
 * del archivo para los números.
 */
function qrPng(texto: string): string {
  const q = qrcode(0, "H");
  q.addData(texto);
  q.make();
  return q.createDataURL(10, 0);
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

/* La paleta de la tarjeta es fija y no sigue el tema: es un formato
   impreso, y el papel de la estiba tiene que verse igual lo haya sacado
   quien lo haya sacado. */
const TINTA: [number, number, number] = [13, 13, 13];
const AMBAR: [number, number, number] = [255, 196, 0];
const GRIS: [number, number, number] = [94, 98, 94];
const LINEA: [number, number, number] = [228, 228, 223];
const PANEL: [number, number, number] = [244, 245, 242];
const MAL: [number, number, number] = [176, 0, 32];

/**
 * LAS TARJETAS DE UN RECIBO, todas en un PDF. Una por hoja: se manda a
 * imprimir una vez y salen las doce.
 */
export async function rotulosPdf(
  rotulos: Rotulo[],
  o: { base?: string | null } = {},
) {
  if (rotulos.length === 0) throw new Error("No hay ninguna tarjeta que imprimir.");
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 12, AN = W - M * 2;

  const sello = await comoDataUrl("/marca/logo-b.png").catch(() => null);

  /** Una caja con su rótulo negro encima, como las `.bx` del modelo. */
  const caja = (x: number, y: number, an: number, al: number) => {
    pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.6);
    pdf.rect(x, y, an, al, "S");
  };
  const rotulo = (x: number, y: number, an: number, t: string, centro = false) => {
    pdf.setFillColor(...TINTA); pdf.rect(x, y, an, 5.6, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7); pdf.setTextColor(...AMBAR);
    pdf.text(t, centro ? x + an / 2 : x + 3, y + 3.8, centro ? { align: "center" } : undefined);
  };

  rotulos.forEach((r, i) => {
    if (i > 0) pdf.addPage();
    const esProd = r.tipo === "producto";

    /* ====================== LA CABECERA ====================== */
    const hCab = 17;
    pdf.setFillColor(...TINTA); pdf.rect(0, 0, W, hCab, "F");
    /* LAS RAYAS DIAGONALES del modelo. jsPDF no pinta degradados ni
       tramas, así que se dibujan: líneas finas ámbar muy apagadas, cada
       5 mm, recortadas por la banda. */
    pdf.setDrawColor(70, 62, 30); pdf.setLineWidth(0.5);
    for (let x = -hCab; x < W + hCab; x += 5) pdf.line(x, hCab, x + hCab * 0.5, 0);

    if (sello) {
      try {
        pdf.setFillColor(255, 255, 255);
        pdf.circle(M + 5, hCab / 2, 5.4, "F");
        pdf.addImage(sello, "PNG", M + 0.9, hCab / 2 - 4.1, 8.2, 8.2);
      } catch { /* sigue sin sello */ }
    }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.setTextColor(255, 255, 255);
    pdf.text("BARRANQUILLA", M + 12, hCab / 2 - 0.3);
    pdf.setFontSize(6.6); pdf.setTextColor(...AMBAR);
    pdf.text("TARJETA DE ARRUME  ·  UNA POR ESTIBA", M + 12, hCab / 2 + 4.2);

    /* LA ESTIBA «3 / 12», EN ÁMBAR Y A LA DERECHA. Doce papeles iguales
       en una mano no se pueden repartir entre doce estibas. */
    const anEst = 34;
    pdf.setFillColor(...AMBAR); pdf.rect(W - M - anEst, 2.4, anEst, hCab - 4.8, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.6); pdf.setTextColor(90, 70, 0);
    pdf.text("ESTIBA", W - M - anEst / 2, 7.4, { align: "center" });
    pdf.setFontSize(17); pdf.setTextColor(...TINTA);
    pdf.text(`${r.numero} / ${r.total}`, W - M - anEst / 2, 13.6, { align: "center" });

    /* ====================== LA FICHA ====================== */
    let y = hCab + 7;

    /* --- Producto y código --- */
    const anCod = 46, anProd = AN - anCod - 3;
    caja(M, y, anProd, 18); rotulo(M, y, anProd, "PRODUCTO");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.setTextColor(...TINTA);
    /* EL NOMBRE SE PARTE SI NO CABE. Un nombre recortado en el papel de
       la estiba manda a buscar el código a mano. */
    const nom = pdf.splitTextToSize(r.nombre.toUpperCase(), anProd - 6);
    pdf.text(nom.slice(0, 2), M + 3, y + 11.5);

    caja(M + anProd + 3, y, anCod, 18);
    rotulo(M + anProd + 3, y, anCod, "CÓDIGO", true);
    pdf.setFillColor(...AMBAR);
    pdf.rect(M + anProd + 3.3, y + 5.9, anCod - 0.6, 11.8, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(23); pdf.setTextColor(...TINTA);
    pdf.text(r.sku, M + anProd + 3 + anCod / 2, y + 14.6, { align: "center" });
    y += 21;

    /* --- Cajas, arrume y dimensiones --- */
    const c3 = (AN - 6) / 3.2, c3b = c3 * 1.2;
    caja(M, y, c3, 17);
    rotulo(M, y, c3, `${r.unidad.toUpperCase()} EN ESTA ESTIBA`, true);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(20); pdf.setTextColor(...TINTA);
    /* (ver la nota de la caja de al lado: el color hay que reponerlo
       después de cada `rotulo()`) */
    pdf.text(nf.format(r.cantidad), M + c3 / 2, y + 14, { align: "center" });

    caja(M + c3 + 3, y, c3, 17);
    rotulo(M + c3 + 3, y, c3, "TOTAL DEL ARRUME", true);
    /* LA TINTA SE VUELVE A PONER, y no es redundante: `rotulo()` deja el
       color en ÁMBAR —es lo que usa para su texto sobre negro— y jsPDF
       no lo devuelve solo. Sin esta línea, el total del arrume salía
       ámbar sobre blanco mientras el de al lado salía negro: dos cifras
       hermanas de distinto color, que en el papel parece que una de las
       dos significa algo especial. */
    pdf.setFontSize(20); pdf.setTextColor(...TINTA);
    pdf.text(nf.format(r.arrume), M + c3 + 3 + c3 / 2, y + 14, { align: "center" });

    const xd = M + (c3 + 3) * 2;
    caja(xd, y, c3b, 17); rotulo(xd, y, c3b, "DIMENSIONES", true);
    ([["ANCHO", r.ancho], ["ALTO", r.alto], ["LARGO", r.largo]] as const)
      .forEach(([k, v], j) => {
        const cx = xd + (c3b / 3) * (j + 0.5);
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(6); pdf.setTextColor(...GRIS);
        pdf.text(k, cx, y + 10, { align: "center" });
        pdf.setFontSize(13);
        /* LO QUE FALTA SE DICE. Un renglón vacío parece papel mal
           impreso; «—» dice que el dato no estaba al recibir. */
        pdf.setTextColor(...(v != null ? TINTA : GRIS));
        pdf.text(v != null ? String(v) : "—", cx, y + 15.4, { align: "center" });
      });
    y += 20;

    if (esProd) {
      /* --- La banda del vencimiento: día, mes y año en tres casillas --- */
      const p = partesFecha(r.vence);
      const alB = 14, anC = 22;
      pdf.setFillColor(...(p ? AMBAR : [253, 235, 238] as [number, number, number]));
      pdf.rect(M, y, AN, alB, "F");
      pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.6);
      pdf.rect(M, y, AN, alB, "S");
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
      pdf.setTextColor(...(p ? TINTA : MAL));
      pdf.text(p ? "FECHA DE VENCIMIENTO" : "SIN FECHA DE VENCIMIENTO: NO SE PUEDE ORDENAR POR FEFO",
               M + 5, y + alB / 2 + 1.2);
      if (p) {
        p.forEach((t, j) => {
          const x = W - M - anC * (3 - j);
          pdf.setDrawColor(120, 92, 0); pdf.setLineWidth(0.3);
          pdf.line(x, y + 1, x, y + alB - 1);
          pdf.setFont("helvetica", "bold"); pdf.setFontSize(20); pdf.setTextColor(...TINTA);
          pdf.text(t, x + anC / 2, y + alB / 2 + 3.4, { align: "center" });
        });
      }
      y += alB + 3;

      /* --- Las otras tres fechas y la línea --- */
      const otras: Array<[string, string | null]> = [
        ["PRODUCCIÓN", fechaCorta(r.producido)],
        ["RECIBO", fechaCorta(r.recibido)],
        ["LÍM. DESPACHO", fechaCorta(r.limite)],
        ["LÍNEA · HORA", r.linea ? `${r.linea}${r.hora ? ` · ${r.hora}` : ""}` : null],
      ];
      pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.6);
      pdf.rect(M, y, AN, 13, "S");
      otras.forEach(([k, v], j) => {
        const x = M + (AN / 4) * j;
        if (j > 0) {
          pdf.setDrawColor(...LINEA); pdf.setLineWidth(0.3);
          pdf.line(x, y + 1, x, y + 12);
        }
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(6); pdf.setTextColor(...GRIS);
        pdf.text(k, x + 3, y + 5);
        pdf.setFontSize(11); pdf.setTextColor(...(v ? TINTA : GRIS));
        pdf.text(v ?? "—", x + 3, y + 10.5);
      });
      y += 16;
    } else {
      /* EL ENVASE RETORNABLE NO VENCE, así que no lleva la banda ni las
         fechas: pedirle un vencimiento sería inventar un dato, y dejarle
         el renglón vacío mandaría a alguien a buscarlo. En su sitio van
         el color del vidrio y de dónde vino, que es lo suyo. */
      const otras: Array<[string, string | null]> = [
        ["COLOR DEL VIDRIO", r.color ?? null],
        ["VIENE DE", r.origen ?? null],
        ["RECIBO", fechaCorta(r.recibido)],
      ];
      pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.6);
      pdf.rect(M, y, AN, 13, "S");
      otras.forEach(([k, v], j) => {
        const x = M + (AN / 3) * j;
        if (j > 0) {
          pdf.setDrawColor(...LINEA); pdf.setLineWidth(0.3);
          pdf.line(x, y + 1, x, y + 12);
        }
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(6); pdf.setTextColor(...GRIS);
        pdf.text(k, x + 3, y + 5);
        pdf.setFontSize(11); pdf.setTextColor(...(v ? TINTA : GRIS));
        pdf.text(pdf.splitTextToSize(v ?? "—", AN / 3 - 6)[0], x + 3, y + 10.5);
      });
      y += 16;
    }

    /* --- La ubicación, en su propia banda --- */
    pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.6);
    pdf.rect(M, y, AN, 13, "S");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(6); pdf.setTextColor(...GRIS);
    pdf.text("UBICACIÓN", M + 3, y + 5);
    pdf.setFontSize(r.ubicacion ? 13 : 9);
    pdf.setTextColor(...(r.ubicacion ? TINTA : GRIS));
    pdf.text(r.ubicacion ?? "sin asignar", M + 3, y + 10.5);
    if (r.placa) {
      pdf.setFontSize(6); pdf.setTextColor(...GRIS);
      pdf.text("PLACA", W - M - 3, y + 5, { align: "right" });
      pdf.setFontSize(11); pdf.setTextColor(...TINTA);
      pdf.text(r.placa, W - M - 3, y + 10.5, { align: "right" });
    }
    y += 16;

    /* ====================== LA ZONA DEL CÓDIGO ====================== */
    const yPie = H - 24;
    const zAl = yPie - y - 3;
    pdf.setFillColor(...PANEL); pdf.rect(M, y, AN, zAl, "F");
    pdf.setFillColor(...AMBAR); pdf.rect(M, y, AN, 1.6, "F");

    /* EL CÓDIGO SE MIDE DEJANDO SITIO A LO QUE VA DEBAJO, y esto salió
       de mirar la hoja impresa: con el alto libre a secas, el código se
       comía la zona entera y la cinta del folio caía ENCIMA de la línea
       de las firmas. Se resta lo que ocupan las tres líneas de texto
       (≈16 mm), la cinta del folio (8) y los aires. */
    const bajoQr = 33;
    const lado = Math.max(60, Math.min(zAl - 7 - bajoQr, AN - 60));
    const qx = M + (AN - lado) / 2, qy = y + 7;
    try {
      pdf.setFillColor(255, 255, 255);
      pdf.rect(qx - 3, qy - 3, lado + 6, lado + 6, "F");
      pdf.setDrawColor(...TINTA); pdf.setLineWidth(1);
      pdf.rect(qx - 3, qy - 3, lado + 6, lado + 6, "S");
      pdf.addImage(qrPng(textoQr(r, o.base ?? null)), "PNG", qx, qy, lado, lado);

      /* EL LOGO AL CENTRO, sobre su parche blanco. El parche NO es
         adorno: pegar el logo directo sobre los módulos deja pedazos de
         código asomando por los bordes y confunde al lector. */
      if (sello) {
        /* 0.19 DEL ANCHO, Y NO MÁS: al 0.50 el código deja de leerse
           —medido con el decodificador—. Agrandarlo no da ningún error:
           simplemente el teléfono no lee nada. */
        const l = lado * 0.19, cx = qx + lado / 2, cy = qy + lado / 2;
        pdf.setFillColor(255, 255, 255);
        pdf.rect(cx - l / 2 - 1.5, cy - l / 2 - 1.5, l + 3, l + 3, "F");
        pdf.addImage(sello, "PNG", cx - l / 2, cy - l / 2, l, l);
      }

      /* Las cuatro esquinas ámbar del modelo. */
      pdf.setDrawColor(...AMBAR); pdf.setLineWidth(1.6);
      const e = 9, x0 = qx - 3.8, y0 = qy - 3.8, x1 = qx + lado + 3.8, y1 = qy + lado + 3.8;
      pdf.line(x0, y0, x0 + e, y0); pdf.line(x0, y0, x0, y0 + e);
      pdf.line(x1 - e, y0, x1, y0); pdf.line(x1, y0, x1, y0 + e);
      pdf.line(x0, y1, x0 + e, y1); pdf.line(x0, y1 - e, x0, y1);
      pdf.line(x1 - e, y1, x1, y1); pdf.line(x1, y1 - e, x1, y1);
    } catch { /* sin QR la tarjeta sigue sirviendo: lo demás está impreso */ }

    let yz = qy + lado + 11;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(...TINTA);
    pdf.text("Toda la estiba está en este código", W / 2, yz, { align: "center" });
    yz += 5.5;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(...GRIS);
    pdf.text(esProd
      ? "Producto, cajas, arrume, las cuatro fechas, línea y hora."
      : "Envase, unidades, arrume, color y de dónde vino.", W / 2, yz, { align: "center" });
    yz += 4.2;
    pdf.text("Con señal abre la estiba en CONTROL; sin señal se lee igual como texto.",
             W / 2, yz, { align: "center" });

    /* EL FOLIO, EN LA CINTA NEGRA. Es lo que se dicta por radio cuando
       el teléfono no lee. */
    yz += 4;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9.5);
    const anF = pdf.getTextWidth(r.folio) + 12;
    pdf.setFillColor(...TINTA); pdf.rect(W / 2 - anF / 2, yz, anF, 8, "F");
    pdf.setTextColor(...AMBAR);
    pdf.text(r.folio, W / 2, yz + 5.5, { align: "center" });

    /* ====================== LAS FIRMAS ====================== */
    pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.6);
    pdf.line(M, yPie, W - M, yPie);
    ([["RESPONSABLE DE LA MARCACIÓN", 0], ["VERIFICÓ", 1]] as const).forEach(([k, j]) => {
      const x = M + (AN / 2) * j;
      if (j > 0) {
        pdf.setDrawColor(...LINEA); pdf.setLineWidth(0.3);
        pdf.line(x, yPie + 1, x, yPie + 18);
      }
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.4); pdf.setTextColor(...GRIS);
      pdf.text(k, x + 4, yPie + 6);
      pdf.setDrawColor(181, 181, 176); pdf.setLineWidth(0.3);
      pdf.setLineDashPattern([1.2, 1.2], 0);
      pdf.line(x + 4, yPie + 15, x + AN / 2 - 8, yPie + 15);
      pdf.setLineDashPattern([], 0);
    });
  });

  return pdf;
}
