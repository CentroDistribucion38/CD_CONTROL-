/**
 * EL INFORME EN PDF — lo mismo de la pantalla, listo para mandar.
 * Carta vertical, con el logo de public/marca, las cifras con su meta, la
 * tendencia en barras, los tiempos, lo que más sale, dónde se repite y
 * quién las tiene. Se arma en el navegador: no pasa por el servidor.
 */
import { horas, type Medida } from "@/modulos/acciones/medir";

async function comoDataUrl(url: string) {
  const r = await fetch(url); const b = await r.blob();
  return await new Promise<string>((ok, mal) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = mal; f.readAsDataURL(b) });
}

export async function informePdf(m: Medida, hoy: Date) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "letter" });
  const W = 216, M = 14;
  const tinta: [number, number, number] = [4, 32, 63], gris: [number, number, number] = [91, 107, 127];
  const rojo: [number, number, number] = [228, 0, 43], verde: [number, number, number] = [15, 122, 74];
  const fecha = hoy.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  let y = 14;
  try { pdf.addImage(await comoDataUrl("/marca/logo-b.png"), "PNG", M, y - 2, 14, 14) } catch { /* sin logo se sigue */ }
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(17); pdf.setTextColor(...tinta);
  pdf.text("Acciones correctivas y preventivas", M + 18, y + 4);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5); pdf.setTextColor(...gris);
  pdf.text(`Indicadores · últimos ${m.dias} días · ${fecha}`, M + 18, y + 10);
  y += 20;

  /* LAS CIFRAS */
  const k = m.kpis;
  const cif: [string, string, string][] = [
    ["Abiertas", String(k.abiertas), `${k.vencidas} vencidas`],
    ["A tiempo", k.aTiempo === null ? "—" : `${k.aTiempo}%`, `meta ${k.metas.aTiempo}%`],
    ["Efectividad", k.efectividad === null ? "—" : `${k.efectividad}%`, `real ${m.reincidencia.real ?? "—"}% · meta ${k.metas.efectividad}%`],
    ["Cierre", horas(k.cierreMedianaH), "mediana"],
  ];
  const cw = (W - M * 2 - 9) / 4;
  cif.forEach(([r, n, p], i) => {
    const x = M + i * (cw + 3);
    pdf.setFillColor(238, 241, 245); pdf.rect(x, y, cw, 24, "F");
    pdf.setFontSize(7.5); pdf.setTextColor(...gris); pdf.text(r.toUpperCase(), x + 3, y + 5.5);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(18); pdf.setTextColor(...tinta); pdf.text(n, x + 3, y + 15);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(...gris); pdf.text(p, x + 3, y + 21);
  });
  y += 32;

  const titulo = (t: string) => {
    if (y > 250) { pdf.addPage(); y = 16 }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11.5); pdf.setTextColor(...tinta); pdf.text(t, M, y); y += 6;
    pdf.setFont("helvetica", "normal");
  };

  /* LA TENDENCIA */
  titulo("Entran contra salen, por semana");
  const s = m.semanas, gh = 38, gw = W - M * 2;
  const max = Math.max(4, ...s.flatMap((x) => [x.entran, x.cierran, x.quedan]));
  const bw = gw / s.length;
  pdf.setDrawColor(213, 220, 229); pdf.line(M, y + gh, M + gw, y + gh);
  s.forEach((x, i) => {
    const bx = M + i * bw, b = Math.max(1, bw / 2 - 1.2);
    pdf.setFillColor(...tinta); pdf.rect(bx + 0.6, y + gh - (x.entran / max) * gh, b, (x.entran / max) * gh, "F");
    pdf.setFillColor(...verde); pdf.rect(bx + 0.6 + b + 0.6, y + gh - (x.cierran / max) * gh, b, (x.cierran / max) * gh, "F");
    if (i % Math.ceil(s.length / 8) === 0) { pdf.setFontSize(6.5); pdf.setTextColor(...gris); pdf.text(x.etiqueta, bx, y + gh + 4) }
  });
  pdf.setDrawColor(...rojo); pdf.setLineWidth(0.6);
  s.forEach((x, i) => { if (i) pdf.line(M + (i - .5) * bw, y + gh - (s[i - 1].quedan / max) * gh, M + (i + .5) * bw, y + gh - (x.quedan / max) * gh) });
  pdf.setLineWidth(0.2);
  pdf.setFontSize(7); pdf.setTextColor(...gris);
  pdf.text("Azul: entran · Verde: se cierran · Rojo: abiertas al final de la semana", M, y + gh + 9);
  y += gh + 16;

  /* LA TABLA GENÉRICA */
  const tabla = (cab: string[], filas: string[][], anchos: number[]) => {
    pdf.setFontSize(7.5); pdf.setTextColor(...gris); pdf.setFont("helvetica", "bold");
    let x = M; cab.forEach((c, i) => { pdf.text(c.toUpperCase(), x, y); x += anchos[i] }); y += 2;
    pdf.setDrawColor(213, 220, 229); pdf.line(M, y, W - M, y); y += 4.5;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(...tinta);
    for (const f of filas) {
      if (y > 262) { pdf.addPage(); y = 16 }
      let x2 = M; f.forEach((c, i) => { pdf.text(pdf.splitTextToSize(c, anchos[i] - 2)[0] ?? "", x2, y); x2 += anchos[i] }); y += 5.5;
    }
    y += 5;
  };

  titulo("Tiempos por prioridad");
  tabla(["Prioridad", "Plazo", "Asignar", "Cerrar", "El 90 %", "Verificar", "A tiempo"],
    m.tiempos.map((t) => [t.prioridad[0].toUpperCase() + t.prioridad.slice(1), horas(t.plazoH), horas(t.asignarH), horas(t.cerrarH),
      horas(t.cerrarP90H), horas(t.verificarH), t.aTiempo === null ? "—" : `${t.aTiempo}%`]),
    [26, 26, 26, 26, 26, 26, 26]);

  titulo("Qué es lo que más sale");
  tabla(["Motivo", "Cantidad", "Acumulado"], m.pareto.slice(0, 10).map((p) => [p.motivo, String(p.n), `${p.acumulado}%`]), [120, 30, 30]);

  if (m.reincidencia.repiten.length) {
    titulo("Dónde se repite");
    tabla(["Motivo", "Zona", "Veces", "Abiertas"], m.reincidencia.repiten.slice(0, 8).map((r) => [r.motivo, r.zona, String(r.n), String(r.abiertas)]), [70, 70, 22, 22]);
  }

  titulo("Quién las tiene");
  tabla(["Responsable", "Abiertas", "Vencidas", "Cerradas", "A tiempo", "Efectividad"],
    m.responsables.slice(0, 20).map((r) => [r.nombre, String(r.carga), String(r.vencidas), String(r.cerradas),
      r.aTiempo === null ? "—" : `${r.aTiempo}%`, r.efectividad === null ? "—" : `${r.efectividad}%`]),
    [66, 22, 22, 22, 22, 26]);

  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i); pdf.setFontSize(7); pdf.setTextColor(...gris);
    pdf.text(`CONTROL · Acciones · página ${i} de ${n}`, M, 272);
  }
  pdf.save(`acciones-indicadores-${hoy.toISOString().slice(0, 10)}.pdf`);
}
