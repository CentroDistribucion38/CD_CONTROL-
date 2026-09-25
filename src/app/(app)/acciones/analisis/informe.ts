/**
 * ACCIONES · INDICADORES — el PDF que se manda.
 *
 * «Mejoremos ese informe cuando se exporta en PDF: el logo, el
 *  encabezado, todo.»
 *
 * ---------------------------------------------------------------------
 * LO QUE TENÍA Y POR QUÉ NO SERVÍA
 * ---------------------------------------------------------------------
 * Tenía el logo y las cifras, sí. Lo que le faltaba era lo que hace que
 * un informe se pueda leer sin que esté el que lo hizo al lado:
 *
 *   · LAS CIFRAS NO DECÍAN SI ESTABAN BIEN. «A tiempo 68 %» no dice
 *     nada si no se sabe que la meta es 85. La meta estaba escrita en
 *     letra chica, del mismo color, sin comparar.
 *   · LA GRÁFICA NO TENÍA ESCALA. Tres series de barras y una línea sin
 *     un solo número en el eje: no se podía saber si el pico era de
 *     cinco o de cincuenta.
 *   · LA LEYENDA ERA UNA FRASE. «Azul: entran · Verde: se cierran ·
 *     Rojo: abiertas» — impreso en blanco y negro, que es como se
 *     imprime casi siempre, eso deja de significar nada.
 *   · LAS TABLAS SE CORTABAN. El motivo se recortaba a la primera
 *     línea, sin avisar, así que dos motivos largos que empiezan igual
 *     salían idénticos.
 *
 * ---------------------------------------------------------------------
 * LOS COLORES ESTÁN MEDIDOS, NO ESCOGIDOS A OJO
 * ---------------------------------------------------------------------
 * Los tres de la gráfica pasaron las comprobaciones de daltonismo
 * —el peor par se separa 11.1 en deuteranopía— sobre papel blanco. El
 * trío de antes no: el azul oscuro de la marca es casi gris y se
 * confundía con el verde al imprimir.
 *
 * Y AUN ASÍ NO SE CONFÍA SOLO EN EL COLOR: cada serie lleva su nombre
 * escrito al lado de su marca, y las dos barras se distinguen también
 * por posición —una al lado de la otra— y la tercera por ser línea.
 * Esto se imprime en blanco y negro en la oficina de la bodega.
 *
 * ---------------------------------------------------------------------
 * UN SOLO EJE, SIEMPRE
 * ---------------------------------------------------------------------
 * El Pareto clásico lleva dos escalas —la cantidad a la izquierda y el
 * acumulado a la derecha— y eso hace que dos líneas que no se pueden
 * comparar parezca que se cruzan. Aquí el acumulado va escrito como
 * texto al final de cada barra. Se lee igual y no miente.
 *
 * Se arma en el navegador: no pasa por el servidor.
 */
import { horas, type Medida } from "@/modulos/acciones/medir";

type RGB = [number, number, number];

/* ---------------------------------------------------------------------
   LA TINTA

   Los dos primeros son para TEXTO, y por eso son oscuros: un texto de
   8 pt con el color de una barra no se lee. Los tres de abajo son para
   MARCAS, y están medidos contra papel blanco.
   ------------------------------------------------------------------ */
const TINTA: RGB = [4, 32, 63];
const GRIS: RGB = [91, 107, 127];
const LINEA: RGB = [213, 220, 229];
const PAPEL: RGB = [242, 245, 248];

/** Entran · se cierran · siguen abiertas. Validadas para daltonismo. */
const AZUL: RGB = [29, 111, 191];
const VERDE: RGB = [18, 128, 90];
const ROJO: RGB = [228, 0, 43];

const nf = new Intl.NumberFormat("es-CO");

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

export async function informePdf(m: Medida, hoy: Date) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "letter" });
  const W = 216, H = 279, M = 14, ANCHO = W - M * 2;
  const fecha = hoy.toLocaleDateString("es-CO",
    { day: "numeric", month: "long", year: "numeric" });

  let y = 14;

  /* ================= EL ENCABEZADO ================= */
  try {
    pdf.addImage(await comoDataUrl("/marca/logo-b.png"), "PNG", M, y - 2, 14, 14);
  } catch { /* sin logo se sigue: el informe no depende de una imagen */ }

  pdf.setFont("helvetica", "bold"); pdf.setFontSize(17); pdf.setTextColor(...TINTA);
  pdf.text("Acciones correctivas y preventivas", M + 18, y + 4);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5); pdf.setTextColor(...GRIS);
  pdf.text(`Indicadores · últimos ${m.dias} días · CD38 AG01 · ${fecha}`, M + 18, y + 10);
  y += 20;
  pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.6);
  pdf.line(M, y, W - M, y); pdf.setLineWidth(0.2);
  y += 8;

  /* =====================================================================
     LAS CUATRO CIFRAS — cada una CONTRA SU META

     Un número suelto no dice si está bien. «A tiempo 68 %» solo
     significa algo al lado de «meta 85 %», y la diferencia se marca con
     una palabra —«bajo la meta»— y no solo con un color: esto se
     imprime en blanco y negro.
     ===================================================================== */
  const k = m.kpis;
  type Cifra = { rot: string; n: string; pie: string; mal: boolean };
  const cif: Cifra[] = [
    {
      rot: "Abiertas hoy", n: nf.format(k.abiertas),
      pie: k.vencidas > 0 ? `${nf.format(k.vencidas)} ya vencidas` : "ninguna vencida",
      mal: k.vencidas > 0,
    },
    {
      rot: "Cerradas a tiempo", n: k.aTiempo === null ? "—" : `${k.aTiempo}%`,
      pie: k.aTiempo === null ? "nada cerrado en el periodo"
        : k.aTiempo >= k.metas.aTiempo ? `meta ${k.metas.aTiempo}% · cumple`
        : `meta ${k.metas.aTiempo}% · bajo la meta`,
      mal: k.aTiempo !== null && k.aTiempo < k.metas.aTiempo,
    },
    {
      rot: "Efectividad", n: k.efectividad === null ? "—" : `${k.efectividad}%`,
      /* SE DICE POR QUÉ NO HAY NÚMERO. Un guion sin explicación se lee
         como que la pantalla falló, y lo que pasa es que todavía no hay
         suficientes verificadas para que el dato signifique algo. */
      pie: k.efectividad === null
        ? `faltan verificadas (${nf.format(k.verificadas)})`
        : k.efectividad >= k.metas.efectividad ? `meta ${k.metas.efectividad}% · cumple`
        : `meta ${k.metas.efectividad}% · bajo la meta`,
      mal: k.efectividad !== null && k.efectividad < k.metas.efectividad,
    },
    {
      rot: "Cierre (mediana)", n: horas(k.cierreMedianaH),
      pie: `${nf.format(k.cerradas)} cerradas en el periodo`,
      mal: false,
    },
  ];

  const cw = (ANCHO - 9) / 4;
  cif.forEach((c, i) => {
    const x = M + i * (cw + 3);
    pdf.setFillColor(...PAPEL); pdf.rect(x, y, cw, 25, "F");
    /* EL FILO ROJO A LA IZQUIERDA es la segunda señal, además de la
       palabra: en color salta a la vista y en blanco y negro sigue
       siendo una raya más oscura. */
    if (c.mal) { pdf.setFillColor(...ROJO); pdf.rect(x, y, 1.2, 25, "F") }

    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(...GRIS);
    pdf.text(c.rot.toUpperCase(), x + 4, y + 5.5);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(19);
    pdf.setTextColor(...(c.mal ? ROJO : TINTA));
    pdf.text(c.n, x + 4, y + 15.5);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(...GRIS);
    pdf.text(pdf.splitTextToSize(c.pie, cw - 7)[0] ?? "", x + 4, y + 21.5);
  });
  y += 33;

  /* ---------- El título de sección, con su salto de página ---------- */
  const titulo = (t: string, sub?: string) => {
    if (y > H - 55) { pdf.addPage(); y = 16 }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(...TINTA);
    pdf.text(t, M, y); y += 5;
    if (sub) {
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...GRIS);
      pdf.text(sub, M, y); y += 4.5;
    }
    pdf.setDrawColor(...LINEA); pdf.line(M, y, W - M, y); y += 6;
    pdf.setFont("helvetica", "normal");
  };

  /* =====================================================================
     LA TENDENCIA — barras agrupadas y una línea, en UN SOLO EJE

     Las tres series cuentan lo mismo —acciones— así que comparten
     escala. Si midieran cosas distintas irían en dos gráficas: dos ejes
     hacen que dos líneas que no se pueden comparar parezca que se
     cruzan, y de ahí salen conclusiones que no están en los datos.
     ===================================================================== */
  titulo("Entran contra salen, por semana",
         "Las tres cuentan acciones, así que comparten la misma escala.");
  {
    const s = m.semanas;
    const gh = 42, gw = ANCHO - 12;      // 12 mm para los números del eje
    const gx = M + 12;
    const crudo = Math.max(1, ...s.flatMap((x) => [x.entran, x.cierran, x.quedan]));
    /* EL PASO DEL EJE SALE DE UNA LISTA DE NÚMEROS QUE SE LEEN.
       Dividir el máximo entre cuatro y redondear da ejes como
       «0 · 11 · 22 · 33 · 44»: no está mal, pero nadie lee eso de un
       vistazo. Se busca el paso más pequeño de la lista con el que
       todo cabe, y salen ejes de 0 · 15 · 30 · 45. */
    const PASOS = [1, 2, 5, 10, 15, 20, 25, 50, 100, 200, 250, 500, 1000];
    const paso = PASOS.find((x) => x * 4 >= crudo) ?? Math.ceil(crudo / 4);
    const max = paso * 4;

    /* LA REJILLA, RECESIVA: cuatro rayas claras y sus números. Sin
       ellas no se puede saber si el pico es de cinco o de cincuenta. */
    pdf.setFontSize(7); pdf.setTextColor(...GRIS);
    for (let i = 0; i <= 4; i++) {
      const yy = y + gh - (i / 4) * gh;
      pdf.setDrawColor(...(i === 0 ? LINEA : [235, 239, 244] as RGB));
      pdf.line(gx, yy, gx + gw, yy);
      pdf.text(nf.format(paso * i), gx - 2, yy + 1.2, { align: "right" });
    }

    const bw = gw / s.length;
    const b = Math.max(0.8, bw / 2 - 1.4);
    s.forEach((x, i) => {
      const bx = gx + i * bw;
      /* 1.2 mm DE AIRE ENTRE LAS DOS BARRAS: pegadas parecen una sola
         partida en dos colores. */
      pdf.setFillColor(...AZUL);
      pdf.rect(bx + 0.7, y + gh - (x.entran / max) * gh, b, (x.entran / max) * gh, "F");
      pdf.setFillColor(...VERDE);
      pdf.rect(bx + 0.7 + b + 1.2, y + gh - (x.cierran / max) * gh, b, (x.cierran / max) * gh, "F");
    });

    /* LA LÍNEA DE LO QUE QUEDA ABIERTO, por encima de las barras. */
    pdf.setDrawColor(...ROJO); pdf.setLineWidth(0.7);
    s.forEach((x, i) => {
      if (!i) return;
      pdf.line(gx + (i - .5) * bw, y + gh - (s[i - 1].quedan / max) * gh,
               gx + (i + .5) * bw, y + gh - (x.quedan / max) * gh);
    });
    pdf.setLineWidth(0.2);

    /* LAS ETIQUETAS DE ABAJO, SALTEADAS. Con veinte semanas, todas
       juntas se pisan y no se lee ninguna. */
    const cada = Math.max(1, Math.ceil(s.length / 8));
    pdf.setFontSize(6.5); pdf.setTextColor(...GRIS);
    s.forEach((x, i) => {
      if (i % cada === 0) pdf.text(x.etiqueta, gx + i * bw + bw / 2, y + gh + 4, { align: "center" });
    });
    y += gh + 8;

    /* LA LEYENDA, CON SU MARCA AL LADO DEL NOMBRE.
       Antes era una frase —«Azul: entran…»— y eso deja de significar
       nada impreso en blanco y negro, que es como se imprime casi
       siempre. Con la marca dibujada al lado, la forma y el tono de
       gris siguen diciendo cuál es cuál. */
    const leyenda: [RGB, string, boolean][] = [
      [AZUL, "Entran", false], [VERDE, "Se cierran", false],
      [ROJO, "Siguen abiertas al cerrar la semana", true],
    ];
    let lx = gx;
    pdf.setFontSize(7.5);
    leyenda.forEach(([color, texto, esLinea]) => {
      pdf.setFillColor(...color); pdf.setDrawColor(...color);
      if (esLinea) { pdf.setLineWidth(0.7); pdf.line(lx, y + 1.4, lx + 5, y + 1.4); pdf.setLineWidth(0.2) }
      else pdf.rect(lx, y - 0.6, 3.4, 3.4, "F");
      pdf.setTextColor(...GRIS);
      pdf.text(texto, lx + 7, y + 2.4);
      lx += 7 + pdf.getTextWidth(texto) + 8;
    });
    y += 12;
  }

  /* =====================================================================
     LA TABLA — con cabecera, filas que se alternan y texto que se parte

     EL TEXTO LARGO SE PARTE EN DOS RENGLONES en vez de cortarse: antes
     se quedaba con la primera línea y sin avisar, así que dos motivos
     largos que empiezan igual salían idénticos en el papel.
     ===================================================================== */
  const tabla = (cab: string[], filas: string[][], anchos: number[],
                 derecha: number[] = []) => {
    const alto = 6.2;
    const cabecera = () => {
      pdf.setFillColor(...PAPEL); pdf.rect(M, y - 4, ANCHO, 6.6, "F");
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(...GRIS);
      let x = M + 2;
      cab.forEach((c, i) => {
        pdf.text(c.toUpperCase(), derecha.includes(i) ? x + anchos[i] - 4 : x, y,
                 derecha.includes(i) ? { align: "right" } : undefined);
        x += anchos[i];
      });
      y += 6;
      pdf.setFont("helvetica", "normal");
    };
    cabecera();

    filas.forEach((f, n) => {
      const trozos = f.map((c, i) => pdf.splitTextToSize(c, anchos[i] - 4).slice(0, 2));
      const renglones = Math.max(...trozos.map((t) => t.length));
      const altoFila = alto + (renglones - 1) * 3.6;

      if (y + altoFila > H - 18) {
        pdf.addPage(); y = 16;
        cabecera();
      }
      /* UNA DE CADA DOS CON FONDO: con veinte responsables y seis
         columnas, el ojo se salta de renglón a mitad de la tabla. */
      if (n % 2 === 1) { pdf.setFillColor(248, 250, 252); pdf.rect(M, y - 4, ANCHO, altoFila, "F") }

      pdf.setFontSize(8.5); pdf.setTextColor(...TINTA);
      let x = M + 2;
      trozos.forEach((t, i) => {
        t.forEach((linea: string, j: number) => {
          pdf.text(linea, derecha.includes(i) ? x + anchos[i] - 4 : x, y + j * 3.6,
                   derecha.includes(i) ? { align: "right" } : undefined);
        });
        x += anchos[i];
      });
      y += altoFila;
    });
    y += 8;
  };

  /* ---------- TIEMPOS POR PRIORIDAD ---------- */
  titulo("Cuánto se demora cada prioridad",
         "«El 90 %» es el tiempo en que se cierran nueve de cada diez: la mediana esconde las que se quedan.");
  tabla(["Prioridad", "Plazo", "Asignar", "Cerrar", "El 90 %", "Verificar", "A tiempo"],
    m.tiempos.map((t) => [
      t.prioridad[0].toUpperCase() + t.prioridad.slice(1),
      horas(t.plazoH), horas(t.asignarH), horas(t.cerrarH),
      horas(t.cerrarP90H), horas(t.verificarH),
      t.aTiempo === null ? "—" : `${t.aTiempo}%`,
    ]),
    [30, 26, 26, 26, 26, 26, 28], [1, 2, 3, 4, 5, 6]);

  /* =====================================================================
     QUÉ ES LO QUE MÁS SALE — Pareto con UN SOLO EJE

     El Pareto de manual lleva dos escalas: la cantidad a la izquierda y
     el acumulado a la derecha. Aquí no. El acumulado va como TEXTO al
     final de cada barra, que se lee igual de bien y no hace que dos
     cosas incomparables parezca que se cruzan.
     ===================================================================== */
  if (m.pareto.length) {
    titulo("Qué es lo que más sale",
           "Ordenado de mayor a menor. El porcentaje es lo que llevan sumado hasta ahí.");
    const top = m.pareto.slice(0, 10);
    const maxN = Math.max(1, ...top.map((p) => p.n));
    const anchoTxt = 74, anchoBar = ANCHO - anchoTxt - 30;

    top.forEach((p) => {
      if (y > H - 24) { pdf.addPage(); y = 16 }
      pdf.setFontSize(8.5); pdf.setTextColor(...TINTA);
      pdf.text(pdf.splitTextToSize(p.motivo, anchoTxt - 3)[0] ?? "", M, y + 2.6);

      const largo = Math.max(0.8, (p.n / maxN) * anchoBar);
      pdf.setFillColor(...AZUL);
      pdf.rect(M + anchoTxt, y, largo, 3.8, "F");

      /* LA CANTIDAD PEGADA A SU BARRA y el acumulado al final del
         renglón: así la cifra que se compara está donde está la marca
         que se compara. */
      pdf.setFontSize(8); pdf.setTextColor(...TINTA);
      pdf.text(nf.format(p.n), M + anchoTxt + largo + 2, y + 3);
      pdf.setTextColor(...GRIS);
      pdf.text(`${p.acumulado}% acum.`, W - M, y + 3, { align: "right" });
      y += 7;
    });
    y += 8;
  }

  /* ---------- DÓNDE SE REPITE ---------- */
  if (m.reincidencia.repiten.length) {
    titulo("Dónde se repite lo mismo",
           "El mismo motivo en la misma zona. Es lo que dice que la corrección no corrigió.");
    tabla(["Motivo", "Zona", "Veces", "Sigue abierta"],
      m.reincidencia.repiten.slice(0, 8).map((r) =>
        [r.motivo, r.zona, nf.format(r.n), nf.format(r.abiertas)]),
      [74, 62, 26, 26], [2, 3]);
  }

  /* ---------- QUIÉN LAS TIENE ---------- */
  titulo("Quién las tiene",
         "Ordenado por carga. «A tiempo» y «efectividad» son del periodo, no de siempre.");
  tabla(["Responsable", "Abiertas", "Vencidas", "Cerradas", "A tiempo", "Efectividad"],
    m.responsables.slice(0, 20).map((r) => [
      r.nombre, nf.format(r.carga), nf.format(r.vencidas), nf.format(r.cerradas),
      r.aTiempo === null ? "—" : `${r.aTiempo}%`,
      r.efectividad === null ? "—" : `${r.efectividad}%`,
    ]),
    [64, 24, 24, 24, 26, 30], [1, 2, 3, 4, 5]);

  /* ================= EL PIE, EN TODAS LAS PÁGINAS ================= */
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(...LINEA); pdf.line(M, H - 12, W - M, H - 12);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(...GRIS);
    pdf.text(`CONTROL · Acciones · Indicadores · ${fecha}`, M, H - 7);
    pdf.text(`página ${i} de ${n}`, W - M, H - 7, { align: "right" });
  }

  pdf.save(`acciones-indicadores-${hoy.toISOString().slice(0, 10)}.pdf`);
}
