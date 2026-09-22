/**
 * EL INFORME DE RIESGO DE VENCIMIENTO, EN PDF.
 *
 * Carta vertical, para mandar o imprimir: encabezado con el logo de
 * public/marca, las alertas por franja, cuándo tiene que salir por
 * semana, y cada material en riesgo CON SUS UBICACIONES debajo —que es lo
 * que alguien necesita para ir a sacarlo—. Al final, las firmas.
 * Con `material`, el mismo informe de uno solo.
 */
import { FRANJAS, enRiesgo, type Franja, type MaterialRiesgo } from "@/modulos/inventario/riesgo";
import type { DatosRiesgo } from "./Riesgo";

type RGB = [number, number, number];
const TINTA: RGB = [4, 32, 63], GRIS: RGB = [91, 107, 127], LINEA: RGB = [213, 220, 229], FONDO: RGB = [243, 245, 248];
const COLOR: Record<Franja, RGB> = {
  vencido: [140, 12, 30], pasado: [200, 38, 43], semana: [217, 109, 31], quince: [201, 150, 0],
  mes: [120, 140, 60], ok: [31, 122, 69], sinfecha: [140, 150, 160],
};
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const f = (s: string | null) => s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const d = (x: number | null) => x == null ? "—" : String(x);
const rot = (k: Franja) => FRANJAS.find((x) => x.clave === k)!;

async function comoDataUrl(url: string) {
  const r = await fetch(url); const b = await r.blob();
  return await new Promise<string>((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = mal; fr.readAsDataURL(b) });
}

export async function informeRiesgo(r: DatosRiesgo, o: { bodega: string; unidad: "cajas" | "unidades"; material?: MaterialRiesgo }) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "letter" });
  const W = 216, H = 279, M = 14, AN = W - M * 2;
  const U = o.unidad === "unidades";
  const hoy = new Date();
  const hoyTx = hoy.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const cant = (c: number, u: number | null) => U ? (u == null ? "—" : nf.format(u)) : nf.format(c);
  let logo: string | null = null;
  try { logo = await comoDataUrl("/marca/logo-b.png") } catch { /* sin logo se sigue */ }

  /* ---------- ENCABEZADO ---------- */
  const encabezado = (primera: boolean) => {
    pdf.setFillColor(...TINTA); pdf.rect(0, 0, W, primera ? 34 : 14, "F");
    pdf.setFillColor(255, 192, 0); pdf.rect(0, primera ? 34 : 14, W, 1.2, "F");
    if (primera) {
      if (logo) try { pdf.addImage(logo, "PNG", M, 8, 18, 18) } catch { /* nada */ }
      pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(18);
      pdf.text(o.material ? "Riesgo de vencimiento · material" : "Informe de riesgo de vencimiento", M + 23, 16);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5); pdf.setTextColor(210, 220, 232);
      pdf.text(`Inventario · ${o.bodega} · ${hoyTx}`, M + 23, 22.5);
      pdf.text(`Foto de ${r.recorridos} recorrido${r.recorridos === 1 ? "" : "s"} enviado${r.recorridos === 1 ? "" : "s"}${r.desde ? ` · ${f(r.desde)}${r.hasta !== r.desde ? ` al ${f(r.hasta)}` : ""}` : ""} · cifras en ${o.unidad}`, M + 23, 27.5);
    } else {
      pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
      pdf.text(`Riesgo de vencimiento · ${o.bodega}`, M, 9);
      pdf.setFont("helvetica", "normal"); pdf.text(hoyTx, W - M, 9, { align: "right" });
    }
  };
  let y = 0;
  const nueva = () => { pdf.addPage(); encabezado(false); y = 24 };
  const cabe = (alto: number) => { if (y + alto > H - 18) nueva() };
  const titulo = (t: string, sub?: string) => {
    cabe(16);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(...TINTA); pdf.text(t, M, y);
    if (sub) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...GRIS); pdf.text(sub, W - M, y, { align: "right" }) }
    y += 6;
  };
  encabezado(true); y = 46;

  /* ---------- TABLA DE UBICACIONES DE UN MATERIAL ---------- */
  const COLS = [["Ubicación", 38], ["Franja", 26], ["Vence", 20], ["P/vencer", 16], ["P/salir", 15], ["Est.", 11], ["Cajas", 13], ["Saldo", 12], ["Total", 18], ["Contó", 19]] as const;
  const cabSitios = () => {
    pdf.setFillColor(...FONDO); pdf.rect(M, y - 3.8, AN, 5.4, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.8); pdf.setTextColor(...GRIS);
    let x = M + 1.5; COLS.forEach(([c, w]) => { pdf.text(c.toUpperCase(), x, y); x += w }); y += 4.2;
  };
  const sitios = (m: MaterialRiesgo) => {
    cabSitios();
    for (const s of m.sitios) {
      cabe(6); if (y === 24) cabSitios();
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.6); pdf.setTextColor(...TINTA);
      const total = U ? (s.unidades == null ? "—" : nf.format(s.unidades)) : nf.format(s.total_cajas);
      const vals = [s.ubicacion, rot(s.franja).corto, f(s.vencimiento), d(s.dias_para_vencer), d(s.dias_para_salir),
        nf.format(s.estibas), nf.format(s.cajas), nf.format(s.saldo), total, (s.conto ?? "—").split(" ")[0]];
      let x = M + 1.5;
      vals.forEach((v, i) => {
        if (i === 1) { pdf.setFillColor(...COLOR[s.franja]); pdf.circle(x + 0.9, y - 1.1, 0.9, "F"); pdf.text(String(v), x + 3, y) }
        else {
          if (i === 4 && s.dias_para_salir != null && s.dias_para_salir < 0) { pdf.setTextColor(...COLOR.pasado); pdf.setFont("helvetica", "bold") }
          if (i === 8) pdf.setFont("helvetica", "bold");
          pdf.text(pdf.splitTextToSize(String(v), COLS[i][1] - 1.5)[0], x, y);
          pdf.setTextColor(...TINTA); pdf.setFont("helvetica", "normal");
        }
        x += COLS[i][1];
      });
      if (s.averia || s.pnc || s.nota) {
        y += 3.4; pdf.setFontSize(6.6); pdf.setTextColor(...GRIS);
        pdf.text([s.averia && "AVERÍA", s.pnc && "PNC", s.nota].filter(Boolean).join(" · ").slice(0, 150), M + 3, y);
      }
      pdf.setDrawColor(...LINEA); pdf.line(M, y + 1.6, W - M, y + 1.6); y += 5.2;
    }
  };

  const materialCab = (m: MaterialRiesgo) => {
    cabe(22);
    pdf.setFillColor(...COLOR[m.franja]); pdf.rect(M, y - 4, 1.4, 10, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(...TINTA);
    pdf.text(pdf.splitTextToSize(m.nombre, 118)[0], M + 4, y);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.8); pdf.setTextColor(...GRIS);
    pdf.text(`${m.codigo}${m.familia ? ` · ${m.familia}` : ""} · ${rot(m.franja).rot} · sale ${m.diasSalir == null ? "—" : m.diasSalir < 0 ? `hace ${-m.diasSalir} días` : `en ${m.diasSalir} días`}`, M + 4, y + 4.4);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9.5); pdf.setTextColor(...COLOR.pasado);
    pdf.text(`${cant(m.enRiesgoCajas, m.enRiesgoUnidades)} en riesgo`, W - M, y, { align: "right" });
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.8); pdf.setTextColor(...GRIS);
    pdf.text(`de ${cant(m.cajas, m.unidades)} ${o.unidad} · ${m.sitios.length} ubicaci${m.sitios.length === 1 ? "ón" : "ones"}`, W - M, y + 4.4, { align: "right" });
    y += 10.5;
  };

  if (o.material) {
    const m = o.material;
    materialCab(m);
    titulo("Dónde está", "la primera en salir, arriba");
    sitios(m);
  } else {
    /* ---------- LAS ALERTAS ---------- */
    const alerta: Franja[] = ["vencido", "pasado", "semana", "quince", "mes"];
    const cw = (AN - 4 * 3) / 5;
    alerta.forEach((k, i) => {
      const x = M + i * (cw + 3), a = r.franjas[k];
      pdf.setFillColor(...FONDO); pdf.rect(x, y, cw, 27, "F");
      pdf.setFillColor(...COLOR[k]); pdf.rect(x, y, cw, 1.6, "F");
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.6); pdf.setTextColor(...GRIS);
      pdf.text(pdf.splitTextToSize(rot(k).rot.toUpperCase(), cw - 4), x + 2.5, y + 6);
      pdf.setFontSize(16); pdf.setTextColor(...(a.renglones ? COLOR[k] : TINTA));
      pdf.text(cant(a.cajas, a.unidades), x + 2.5, y + 17);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.8); pdf.setTextColor(...GRIS);
      pdf.text(`${a.materiales} mat. · ${a.renglones} ubic.`, x + 2.5, y + 23);
    });
    y += 34;

    /* ---------- LA FRASE ---------- */
    const urg = r.franjas.vencido.materiales + r.franjas.pasado.materiales;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5); pdf.setTextColor(...TINTA);
    const frase = `${urg ? `${urg} material${urg === 1 ? "" : "es"} ya ${urg === 1 ? "está vencido o no alcanza" : "están vencidos o no alcanzan"} a salir con la vida útil mínima.` : "Nada vencido ni pasado de salida."} `
      + `${r.franjas.semana.materiales ? `${r.franjas.semana.materiales} tienen que salir esta semana. ` : ""}`
      + `En total hay ${nf.format(U ? r.totalUnidades : r.totalCajas)} ${o.unidad} contadas en ${r.ubicaciones} ubicaciones.`;
    pdf.text(pdf.splitTextToSize(frase, AN), M, y); y += 13;

    /* ---------- POR SEMANA ---------- */
    titulo("Cuándo tiene que salir", `${o.unidad} por semana de salida`);
    const gh = 34, bw = AN / r.semanas.length;
    const max = Math.max(1, ...r.semanas.map((s) => U ? s.unidades : s.cajas));
    pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.4); pdf.line(M, y + gh, W - M, y + gh); pdf.setLineWidth(0.2);
    r.semanas.forEach((s, i) => {
      const v = U ? s.unidades : s.cajas, h = (v / max) * (gh - 5), x = M + i * bw + bw * 0.18;
      const c: RGB = i === 0 ? COLOR.pasado : i === 1 ? COLOR.semana : i <= 3 ? COLOR.quince : [150, 162, 176];
      if (v) { pdf.setFillColor(...c); pdf.rect(x, y + gh - h, bw * 0.64, h, "F");
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(7); pdf.setTextColor(...TINTA); pdf.text(nf.format(v), x + bw * 0.32, y + gh - h - 1.2, { align: "center" }) }
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(...GRIS); pdf.text(s.rot, x + bw * 0.32, y + gh + 4, { align: "center" });
    });
    y += gh + 12;

    /* ---------- REPARTO ---------- */
    titulo("Cómo está la bodega");
    const tot = Math.max(1, U ? r.totalUnidades : r.totalCajas);
    let x = M;
    FRANJAS.forEach((k) => { const v = U ? r.franjas[k.clave].unidades : r.franjas[k.clave].cajas; const w = (v / tot) * AN;
      if (w > 0) { pdf.setFillColor(...COLOR[k.clave]); pdf.rect(x, y, w, 6, "F"); x += w } });
    y += 11;
    FRANJAS.forEach((k, i) => { const v = U ? r.franjas[k.clave].unidades : r.franjas[k.clave].cajas; const lx = M + (i % 4) * (AN / 4), ly = y + Math.floor(i / 4) * 5;
      pdf.setFillColor(...COLOR[k.clave]); pdf.rect(lx, ly - 2.4, 2.6, 2.6, "F");
      pdf.setFontSize(7.6); pdf.setTextColor(...TINTA); pdf.text(`${k.corto}: ${nf.format(v)} (${Math.round((v / tot) * 100)} %)`, lx + 4, ly) });
    y += 14;

    /* ---------- CADA MATERIAL CON SUS UBICACIONES ---------- */
    const riesgo = r.materiales.filter((m) => enRiesgo(m.franja));
    titulo("Materiales en riesgo y dónde están", `${riesgo.length} material${riesgo.length === 1 ? "" : "es"} · lo más urgente primero`);
    if (!riesgo.length) { pdf.setFontSize(9); pdf.setTextColor(...GRIS); pdf.text("Nada en riesgo: todo sale con más de 30 días de margen.", M, y); y += 8 }
    for (const m of riesgo) { materialCab(m); sitios({ ...m, sitios: m.sitios.filter((s) => enRiesgo(s.franja)) }); y += 3 }
  }

  /* ---------- FIRMAS ---------- */
  cabe(30); y += 12;
  const fw = (AN - 20) / 2;
  ["Elaboró", "Revisó"].forEach((t, i) => {
    const x = M + i * (fw + 20);
    pdf.setDrawColor(...TINTA); pdf.line(x, y, x + fw, y);
    pdf.setFontSize(8); pdf.setTextColor(...GRIS); pdf.text(`${t} · nombre, cargo y fecha`, x, y + 4.5);
  });

  /* ---------- PIE EN TODAS ---------- */
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i); pdf.setDrawColor(...LINEA); pdf.line(M, H - 12, W - M, H - 12);
    pdf.setFontSize(7); pdf.setTextColor(...GRIS);
    pdf.text("CONTROL · Inventario · «días para salir» = vencimiento − hoy − mínimo de vida útil del material", M, H - 8);
    pdf.text(`Página ${i} de ${n}`, W - M, H - 8, { align: "right" });
  }

  const dia = hoy.toISOString().slice(0, 10);
  pdf.save(o.material ? `riesgo-${o.material.codigo}-${dia}.pdf` : `riesgo-vencimiento-${o.bodega}-${dia}.pdf`);
}
