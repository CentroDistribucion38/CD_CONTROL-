/**
 * EL INFORME EN PDF DE LA SALIDA DE VIDRIO — lo mismo de la pantalla,
 * listo para mandar. Carta vertical, con el logo de public/marca.
 *
 * ---------------------------------------------------------------------
 * NO CALCULA NADA. RECIBE LO YA CALCULADO.
 * ---------------------------------------------------------------------
 * Esta es la única decisión importante del archivo. Lo natural sería
 * pasarle las salidas y que el PDF sacara sus totales; y el día que
 * alguien cambie una regla en la pantalla —qué entra, qué es «completa»,
 * qué fecha manda— el informe seguiría con la regla vieja y diría OTRA
 * CIFRA. Nadie se daría cuenta: las dos son creíbles, y la que se manda
 * por correo es la del PDF.
 *
 * Así que la pantalla calcula UNA VEZ y aquí solo se dibuja. Si una
 * cifra está mal, está mal en los dos lados — que es la única forma de
 * que se note.
 *
 * SE ARMA EN EL NAVEGADOR: no pasa por el servidor, no se guarda en
 * ninguna parte y no hay nada que se pueda quedar desfasado.
 *
 * ---------------------------------------------------------------------
 * LLEVA ESCRITOS LOS FILTROS, Y ESO NO ES ADORNO
 * ---------------------------------------------------------------------
 * Un PDF se manda por correo y se lee tres semanas después, sin la
 * pantalla al lado. Un informe filtrado por una placa que no diga que
 * está filtrado por una placa es un informe que alguien va a leer como
 * el total del mes. Va en la segunda línea de la primera página y en el
 * pie de TODAS.
 */

export type FilaInforme = {
  codigo: string;
  fecha: string;
  placa: string;
  tolvas: number;
  bruto: number;
  tara: number;
  neto: number;
  estado: string;
};

export type DatosInforme = {
  /** El día en que se genera, para el encabezado y el nombre del archivo. */
  hoy: string;
  /** Cómo se lee el período: «del 01/09 al 23/09», «todo el histórico». */
  periodo: string;
  /** Los filtros puestos, ya en palabras. Vacío = ninguno. */
  filtros: string;
  mirando: { de: number; total: number } | null;

  kg: number; bruto: number; tara: number;
  completas: number; tolvas: number; promedio: number;
  porSalir: number; abiertas: number;

  meses: { etiqueta: string; kg: number }[];
  colores: { etiqueta: string; kg: number }[];
  salidas: FilaInforme[];
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

const nf = (n: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);

export async function informeSalidaPdf(d: DatosInforme) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "letter" });
  const W = 216, M = 14;
  const tinta: [number, number, number] = [4, 32, 63];
  const gris: [number, number, number] = [91, 107, 127];
  const oro: [number, number, number] = [245, 197, 24];
  const ambar: [number, number, number] = [166, 108, 12];

  const fecha = new Date(d.hoy + "T12:00:00")
    .toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  let y = 14;
  try {
    pdf.addImage(await comoDataUrl("/marca/logo-b.png"), "PNG", M, y - 2, 14, 14);
  } catch { /* sin logo se sigue: el informe vale por las cifras */ }
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(17); pdf.setTextColor(...tinta);
  pdf.text("Cuánto vidrio salió", M + 18, y + 4);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5); pdf.setTextColor(...gris);
  pdf.text(`Roturas · Salida · ${d.periodo} · generado el ${fecha}`, M + 18, y + 10);
  y += 20;

  /* LOS FILTROS, SI HAY. En su propia franja y no en letra chica al pie:
     es lo que decide si la cifra de abajo es el total o un pedazo. */
  if (d.filtros) {
    pdf.setFillColor(255, 247, 214); pdf.rect(M, y, W - M * 2, 9, "F");
    pdf.setDrawColor(...oro); pdf.setLineWidth(0.8);
    pdf.line(M, y, M, y + 9); pdf.setLineWidth(0.2);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(...ambar);
    pdf.text("FILTRADO", M + 3, y + 5.6);
    pdf.setFont("helvetica", "normal"); pdf.setTextColor(...tinta);
    pdf.text(pdf.splitTextToSize(d.filtros, W - M * 2 - 26)[0] ?? "", M + 22, y + 5.6);
    y += 14;
  }

  /* LA CIFRA GRANDE, Y DE DÓNDE SALE. Van juntas a propósito: un neto
     suelto no se puede comprobar; bruto menos tara sí. */
  pdf.setFillColor(...oro); pdf.rect(M, y, 96, 30, "F");
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(60, 48, 6);
  pdf.text("NETO DESPACHADO", M + 5, y + 7);
  pdf.setFontSize(26); pdf.setTextColor(20, 16, 2);
  pdf.text(nf(d.kg), M + 5, y + 20);
  pdf.setFontSize(10);
  pdf.text("kg", M + 7 + pdf.getTextWidth(nf(d.kg)) * 26 / 10, y + 20);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5);
  pdf.text(`${nf(d.completas)} salida${d.completas === 1 ? "" : "s"} completa${d.completas === 1 ? "" : "s"}`
           + ` · ${nf(d.tolvas)} tolva${d.tolvas === 1 ? "" : "s"}`, M + 5, y + 26);

  const cx = M + 100, cw = W - M - cx;
  pdf.setDrawColor(213, 220, 229); pdf.rect(cx, y, cw, 30);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(7); pdf.setTextColor(...gris);
  pdf.text("DE DÓNDE SALE", cx + 4, y + 6);
  const caja = (x: number, an: number, rot: string, val: string, fuerte = false) => {
    if (fuerte) { pdf.setFillColor(...tinta); pdf.rect(x, y + 9, an, 15, "F") }
    else { pdf.setDrawColor(213, 220, 229); pdf.rect(x, y + 9, an, 15) }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(6);
    pdf.setTextColor(...(fuerte ? oro : gris));
    pdf.text(rot, x + 3, y + 14);
    pdf.setFontSize(13); pdf.setTextColor(...(fuerte ? [255, 255, 255] as [number, number, number] : tinta));
    pdf.text(val, x + 3, y + 21);
  };
  const an = (cw - 18) / 3;
  caja(cx + 3, an, "BRUTO", nf(d.bruto));
  caja(cx + 3 + an + 6, an, "TARA", nf(d.tara));
  caja(cx + 3 + (an + 6) * 2, an, "NETO KG", nf(d.kg), true);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.5); pdf.setTextColor(...gris);
  pdf.text("El neto sale de sumar las tolvas. No hay ningún total guardado en la base.",
           cx + 4, y + 28);
  y += 38;

  /* LAS CUATRO CIFRAS */
  const cif: [string, string, string][] = [
    ["Tolvas despachadas", nf(d.tolvas), "en esas mismas salidas"],
    ["Promedio por tolva", nf(d.promedio), "kg netos"],
    ["Esperando Vh", nf(d.porSalir), "cerradas sin salir · no cuentan aquí"],
    ["Abiertas", nf(d.abiertas), "todavía pesándose"],
  ];
  const kw = (W - M * 2 - 9) / 4;
  cif.forEach(([r, n, p], i) => {
    const x = M + i * (kw + 3);
    pdf.setFillColor(238, 241, 245); pdf.rect(x, y, kw, 22, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.5); pdf.setTextColor(...gris);
    pdf.text(r.toUpperCase(), x + 3, y + 5);
    pdf.setFontSize(17); pdf.setTextColor(...tinta); pdf.text(n, x + 3, y + 14);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.3); pdf.setTextColor(...gris);
    pdf.text(pdf.splitTextToSize(p, kw - 6), x + 3, y + 19);
  });
  y += 30;

  const titulo = (t: string, nota?: string) => {
    if (y > 240) { pdf.addPage(); y = 16 }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11.5); pdf.setTextColor(...tinta);
    pdf.text(t, M, y);
    if (nota) {
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(...gris);
      pdf.text(nota, W - M - pdf.getTextWidth(nota) * 7.5 / 10, y);
    }
    y += 6; pdf.setFont("helvetica", "normal");
  };

  /* LAS DOS GRÁFICAS, UNA AL LADO DE LA OTRA. Contestan preguntas
     distintas —cuándo y de qué— y ponerlas juntas es lo que deja ver
     que un mes malo fue de un solo color. */
  const barras = (x: number, an: number, filas: { etiqueta: string; kg: number }[],
                  tono: [number, number, number]) => {
    const max = Math.max(1, ...filas.map((f) => f.kg));
    let yy = y;
    for (const f of filas) {
      pdf.setFontSize(8); pdf.setTextColor(...tinta);
      pdf.text(pdf.splitTextToSize(f.etiqueta, 22)[0] ?? "", x, yy + 3);
      const bx = x + 24, bw = an - 24 - 20;
      pdf.setFillColor(233, 236, 240); pdf.rect(bx, yy, bw, 4.2, "F");
      if (f.kg > 0) { pdf.setFillColor(...tono); pdf.rect(bx, yy, bw * (f.kg / max), 4.2, "F") }
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(8);
      pdf.setTextColor(...(f.kg > 0 ? tinta : gris));
      const t = f.kg > 0 ? nf(f.kg) : "—";
      pdf.text(t, x + an - pdf.getTextWidth(t) * 8 / 10, yy + 3.4);
      pdf.setFont("helvetica", "normal");
      yy += 8;
    }
    return yy;
  };

  if (d.meses.length || d.colores.length) {
    const mitad = (W - M * 2 - 8) / 2;
    const yTit = y;
    titulo("Por mes");
    const yBar = y;
    const y1 = d.meses.length ? barras(M, mitad, d.meses, oro) : yBar;

    y = yTit;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11.5); pdf.setTextColor(...tinta);
    pdf.text("Por color del vidrio", M + mitad + 8, y);
    y = yBar;
    const y2 = d.colores.length ? barras(M + mitad + 8, mitad, d.colores, ambar) : yBar;

    y = Math.max(y1, y2) + 8;
    pdf.setFontSize(7); pdf.setTextColor(...gris);
    pdf.text("Kilos netos. El mes es aquel en que la salida quedó despachada, no en el que se abrió.", M, y);
    y += 10;
  }

  /* LA TABLA. Es la que convierte el informe en algo que se puede
     revisar contra la báscula: cada renglón es una salida con su placa
     y sus kilos. */
  titulo("Las salidas", `${d.salidas.length} en el período`);
  const anchos = [24, 30, 24, 34, 22, 22, 24, 8];
  const cab = ["Salida", "Fecha", "Placa", "Tolvas", "Bruto", "Tara", "Neto kg", ""];
  const cabecera = () => {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7); pdf.setTextColor(...gris);
    let x = M; cab.forEach((c, i) => { pdf.text(c.toUpperCase(), x, y); x += anchos[i] });
    y += 2; pdf.setDrawColor(213, 220, 229); pdf.line(M, y, W - M, y); y += 4.5;
    pdf.setFont("helvetica", "normal");
  };
  cabecera();
  if (d.salidas.length === 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(...gris);
    pdf.text("No hay salidas en este período con estos filtros.", M, y);
    y += 6;
  }
  for (const f of d.salidas) {
    if (y > 258) { pdf.addPage(); y = 16; cabecera() }
    pdf.setFontSize(8.5); pdf.setTextColor(...tinta);
    const celdas = [f.codigo, f.fecha, f.placa, f.tolvas > 0 ? String(f.tolvas) : "—",
                    nf(f.bruto), nf(f.tara), nf(f.neto), ""];
    let x = M;
    celdas.forEach((c, i) => {
      if (i === 6) pdf.setFont("helvetica", "bold");
      pdf.text(pdf.splitTextToSize(c, anchos[i] - 2)[0] ?? "", x, y);
      if (i === 6) pdf.setFont("helvetica", "normal");
      x += anchos[i];
    });
    pdf.setFontSize(6.5); pdf.setTextColor(...gris);
    pdf.text(f.estado.toUpperCase(), M + anchos.slice(0, 7).reduce((a, b) => a + b, 0), y);
    y += 5.5;
  }

  /* EL PIE REPITE LOS FILTROS EN TODAS LAS PÁGINAS. La hoja 3 se saca
     de la grapa y se lee sola. */
  const pie = d.filtros ? `FILTRADO · ${d.filtros}` : "Sin filtros · todas las salidas del período";
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(...gris);
    pdf.text(`CONTROL · Roturas · Salida · ${d.periodo} · página ${i} de ${n}`, M, 272);
    pdf.text(pdf.splitTextToSize(pie, W - M * 2)[0] ?? "", M, 276);
  }

  pdf.save(`vidrio-salida-${d.hoy}.pdf`);
}
