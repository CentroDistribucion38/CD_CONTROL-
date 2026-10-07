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
import { PALETA_MARCA, paletaDeTema, aRGB, type Paleta } from "@/modulos/rotlinea/hoja";

/** Los colores del tema de quien lo genera, como la hoja de rotura: el
 *  oficial sale con la marca; ámbar, gris… cambian la cinta, las rayas y
 *  los títulos. Los logos van siempre tal cual. */
export function leerPaleta(dentro: Element | null): Paleta {
  const conTema = dentro?.closest("[data-tema]");
  if (!conTema) return PALETA_MARCA;
  const leer = (v: string) => {
    const t = document.createElement("span"); t.style.color = `var(${v})`; t.style.display = "none";
    conTema.appendChild(t); const c = aRGB(getComputedStyle(t).color); t.remove(); return c;
  };
  const tinta = leer("--c-04203f"), acento = leer("--c-marca"), hondo = leer("--c-marca-hondo");
  return tinta && acento ? paletaDeTema(tinta, acento, hondo ?? acento) : PALETA_MARCA;
}

type RGB = [number, number, number];
const GRIS: RGB = [91, 107, 127], LINEA: RGB = [213, 220, 229], FONDO: RGB = [243, 245, 248];
const COLOR: Record<Franja, RGB> = {
  vencido: [140, 12, 30], pasado: [200, 38, 43], semana: [217, 109, 31], quince: [201, 150, 0],
  mes: [120, 140, 60], ok: [31, 122, 69], sinfecha: [140, 150, 160],
};
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const f = (s: string | null) => s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const d = (x: number | null) => x == null ? "—" : String(x);
const rot = (k: Franja) => FRANJAS.find((x) => x.clave === k)!;

async function comoDataUrl(url: string) {
  const r = await fetch(url); if (!r.ok) throw new Error(url); const b = await r.blob();
  return await new Promise<string>((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = mal; fr.readAsDataURL(b) });
}

export async function informeRiesgo(r: DatosRiesgo, o: { bodega: string; unidad: "cajas" | "unidades" | "hl"; material?: MaterialRiesgo; dentro?: Element | null }) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "letter" });
  const W = 216, H = 279, M = 14, AN = W - M * 2;
  const U = o.unidad === "unidades", HL = o.unidad === "hl";
  const unid = HL ? "hectolitros" : o.unidad;
  const fh = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: n < 10 ? 2 : 1 });
  const fmt = (n: number | null) => n == null ? "—" : HL ? fh(n) : nf.format(n);
  const pick = (c: number, u: number | null, h: number | null) => HL ? (h ?? 0) : U ? (u ?? 0) : c;
  /* SIEMPRE LAS TRES MEDIDAS: lo que se escogió arriba manda en las gráficas, pero cada cifra del informe trae sus
     cajas, sus unidades y sus hectolitros, para que el papel sea la información completa y no haya que pedirlo otra vez. */
  const nu = (n: number | null) => n == null ? "—" : nf.format(n);
  const tri = (c: number, u: number | null, h: number | null) => `${nf.format(c)} cajas · ${nu(u)} unid. · ${h == null ? "—" : fh(h)} hl`;
  const ajusta = (t: string, ancho: number, tam: number) => { let z = tam; pdf.setFontSize(z); while (z > 5.5 && pdf.getTextWidth(t) > ancho) { z -= 0.3; pdf.setFontSize(z) } };
  const hoy = new Date();
  const hoyTx = hoy.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const cant = (c: number, u: number | null, h: number | null = null) => HL ? fmt(h) : U ? fmt(u) : nf.format(c);
  const P = leerPaleta(o.dentro ?? null);
  const TINTA = P.tinta;
  const [palabra, sello] = await Promise.all([
    comoDataUrl("/marca/logo-bavaria.png").catch(() => null),
    comoDataUrl("/marca/logo-b.png").catch(() => null),
  ]);

  /* LA CINTA DEL TEMA, como la hoja de rotura: jsPDF no pinta degradados,
     así que se arma con franjas angostas que se pisan un pelo. */
  const cinta = (x: number, yy: number, ancho: number, alto: number) => {
    const N = Math.max(12, Math.round(ancho / 1.5)), paso = ancho / N;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1); let k = 0;
      while (k < P.cinta.length - 2 && t > P.cinta[k + 1][0]) k++;
      const [ta, a] = P.cinta[k], [tb, b] = P.cinta[k + 1];
      const u = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
      pdf.setFillColor(Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u));
      pdf.rect(x + i * paso, yy, paso + 0.15, alto, "F");
    }
  };
  const titular = o.material ? "Riesgo de vencimiento" : "Informe de riesgo de vencimiento";

  /* ---------- ENCABEZADO: el logo a la izquierda, qué es a la derecha,
     sobre blanco. El logo es rojo sobre transparente: sobre una banda
     oscura perdería el rojo, y el rojo ES la marca. ---------- */
  const encabezado = (primera: boolean) => {
    if (primera) {
      cinta(0, 0, W, 4.5);
      let conLogo = false;
      if (palabra) try { pdf.addImage(palabra, "PNG", M, 11, 15 * 540 / 160, 15, "palabra", "FAST"); conLogo = true } catch { /* sigue */ }
      if (!conLogo) { pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.setTextColor(255, 0, 15); pdf.text("Bavaria", M, 21) }
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(...GRIS);
      pdf.text(`CENTRO DE DISTRIBUCIÓN CD38 · INVENTARIO · ${o.bodega}`, W - M, 13.5, { align: "right" });
      pdf.setFontSize(18); pdf.setTextColor(...TINTA);
      pdf.text(titular, W - M, 21.5, { align: "right" });
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...GRIS);
      const foto = `Foto de ${r.recorridos} recorrido${r.recorridos === 1 ? "" : "s"}${r.desde ? ` · ${f(r.desde)}${r.hasta !== r.desde ? ` al ${f(r.hasta)}` : ""}` : ""}`;
      pdf.text(`${hoyTx.charAt(0).toUpperCase() + hoyTx.slice(1)} · ${foto} · gráficas en ${unid}`, W - M, 27.5, { align: "right" });
      pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.5); pdf.line(M, 32, W - M, 32); pdf.setLineWidth(0.2);
    } else {
      cinta(0, 0, W, 2.2);
      const x = sello ? M + 12 : M;
      if (sello) try { pdf.addImage(sello, "PNG", M, 7, 9, 9, "sello", "FAST") } catch { /* sigue */ }
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(...TINTA);
      pdf.text(titular, x, 12.2);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(...GRIS);
      pdf.text(`Inventario · ${o.bodega} · ${hoyTx}`, x, 15.8);
      pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.3); pdf.line(M, 19.5, W - M, 19.5); pdf.setLineWidth(0.2);
    }
  };
  let y = 0;
  const nueva = () => { pdf.addPage(); encabezado(false); y = 26 };
  const cabe = (alto: number) => { if (y + alto > H - 18) nueva() };
  const titulo = (t: string, sub?: string) => {
    cabe(16);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(...TINTA); pdf.text(t, M, y);
    if (sub) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...GRIS); pdf.text(sub, W - M, y, { align: "right" }) }
    y += 6;
  };
  encabezado(true); y = 42;

  /* ---------- TABLA DE UBICACIONES DE UN MATERIAL ---------- */
  const COLS = [["Ubicación", 28], ["Franja", 28], ["Vence", 17], ["P/vencer", 13], ["P/salir", 12], ["Est.", 9], ["Cajas", 11], ["Saldo", 12], ["T. cajas", 14], ["Unidades", 17], ["Hl", 12], ["Contó", 15]] as const;
  const cabSitios = () => {
    pdf.setFillColor(...FONDO); pdf.rect(M, y - 3.8, AN, 5.4, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.8); pdf.setTextColor(...GRIS);
    let x = M + 1.5; COLS.forEach(([c, w]) => { pdf.text(c.toUpperCase(), x, y); x += w }); y += 4.2;
  };
  const sitios = (m: MaterialRiesgo) => {
    cabSitios();
    for (const s of m.sitios) {
      cabe(6); if (y === 26) cabSitios();
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.6); pdf.setTextColor(...TINTA);
      const vals = [s.ubicacion, rot(s.franja).corto, f(s.vencimiento), d(s.dias_para_vencer), d(s.dias_para_salir),
        nf.format(s.estibas), nf.format(s.cajas), nf.format(s.saldo), nf.format(s.total_cajas), nu(s.unidades), s.hl == null ? "—" : fh(s.hl), (s.conto ?? "—").split(" ")[0]];
      let x = M + 1.5;
      vals.forEach((v, i) => {
        if (i === 1) { pdf.setFillColor(...COLOR[s.franja]); pdf.circle(x + 0.9, y - 1.1, 0.9, "F"); ajusta(String(v), COLS[1][1] - 4, 7.6); pdf.text(String(v), x + 3, y); pdf.setFontSize(7.6) }
        else {
          if (i === 4 && s.dias_para_salir != null && s.dias_para_salir < 0) { pdf.setTextColor(...COLOR.pasado); pdf.setFont("helvetica", "bold") }
          if (i === (HL ? 10 : U ? 9 : 8)) pdf.setFont("helvetica", "bold");
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
    pdf.text(pdf.splitTextToSize(m.nombre, 100)[0], M + 4, y);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.8); pdf.setTextColor(...GRIS);
    pdf.text(pdf.splitTextToSize(`${m.codigo}${m.familia ? ` · ${m.familia}` : ""} · ${rot(m.franja).rot} · sale ${m.diasSalir == null ? "—" : m.diasSalir < 0 ? `hace ${-m.diasSalir} días` : `en ${m.diasSalir} días`}`, 100)[0], M + 4, y + 4.4);
    pdf.setFont("helvetica", "bold"); pdf.setTextColor(...COLOR.pasado);
    ajusta(`En riesgo: ${tri(m.enRiesgoCajas, m.enRiesgoUnidades, m.enRiesgoHl)}`, 78, 8.6);
    pdf.text(`En riesgo: ${tri(m.enRiesgoCajas, m.enRiesgoUnidades, m.enRiesgoHl)}`, W - M, y, { align: "right" });
    pdf.setFont("helvetica", "normal"); pdf.setTextColor(...GRIS);
    ajusta(`Total: ${tri(m.cajas, m.unidades, m.hl)}`, 78, 7.8);
    pdf.text(`Total: ${tri(m.cajas, m.unidades, m.hl)}`, W - M, y + 4.4, { align: "right" });
    ajusta(`${m.sitios.length} ubicaci${m.sitios.length === 1 ? "ón" : "ones"}`, 78, 7.8);
    pdf.text(`${m.sitios.length} ubicaci${m.sitios.length === 1 ? "ón" : "ones"}`, W - M, y + 8.6, { align: "right" });
    y += 13.5;
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
      pdf.setFillColor(...FONDO); pdf.rect(x, y, cw, 36, "F");
      pdf.setFillColor(...COLOR[k]); pdf.rect(x, y, cw, 1.6, "F");
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.6); pdf.setTextColor(...GRIS);
      pdf.text(pdf.splitTextToSize(rot(k).rot.toUpperCase(), cw - 4), x + 2.5, y + 6);
      const filas: [string, string, boolean][] = [["CAJAS", nf.format(a.cajas), !HL && !U], ["UNIDADES", nu(a.unidades), U], ["HECTOLITROS", a.hl == null ? "—" : fh(a.hl), HL]];
      filas.forEach(([et, v, sel], n) => {
        const yy = y + 13 + n * 6.4;
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(5.8); pdf.setTextColor(...GRIS); pdf.text(et, x + 2.5, yy);
        pdf.setFont("helvetica", "bold"); pdf.setTextColor(...(sel && a.renglones ? COLOR[k] : TINTA));
        ajusta(v, cw - 22, sel ? 10.5 : 8.5); pdf.text(v, x + cw - 2.5, yy, { align: "right" });
      });
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.8); pdf.setTextColor(...GRIS);
      pdf.text(`${a.materiales} mat. · ${a.renglones} ubic.`, x + 2.5, y + 33);
    });
    y += 43;

    /* ---------- LA FRASE ---------- */
    const urg = r.franjas.vencido.materiales + r.franjas.pasado.materiales;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5); pdf.setTextColor(...TINTA);
    const frase = `${urg ? `${urg} material${urg === 1 ? "" : "es"} ${urg === 1 ? "vencido o fuera de despacho" : "vencidos o fuera de despacho"} (ya pasó su fecha límite de salida).` : "Sin producto vencido ni fuera de despacho."} `
      + `${r.franjas.semana.materiales ? `${r.franjas.semana.materiales} con salida crítica (0–7 días). ` : ""}`
      + `En total hay ${tri(r.totalCajas, r.totalUnidades, r.totalHl)} contados en ${r.ubicaciones} ubicaciones.`;
    pdf.text(pdf.splitTextToSize(frase, AN), M, y); y += 13;

    /* ---------- POR SEMANA ---------- */
    titulo("Cuándo tiene que salir", `${unid} por semana de salida`);
    const gh = 34, L = 17, bw = (AN - L) / r.semanas.length;
    const max = Math.max(1, ...r.semanas.map((s) => pick(s.cajas, s.unidades, s.hl)));
    pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.4); pdf.line(M + L, y + gh, W - M, y + gh); pdf.setLineWidth(0.2);
    r.semanas.forEach((s, i) => {
      const v = pick(s.cajas, s.unidades, s.hl), h = (v / max) * (gh - 5), x = M + L + i * bw + bw * 0.18;
      const c: RGB = i === 0 ? COLOR.pasado : i === 1 ? COLOR.semana : i <= 3 ? COLOR.quince : [150, 162, 176];
      if (v) { pdf.setFillColor(...c); pdf.rect(x, y + gh - h, bw * 0.64, h, "F"); }
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(...GRIS); pdf.text(s.rot, x + bw * 0.32, y + gh + 4, { align: "center" });
    });
    /* debajo de cada barra, las tres medidas de esa semana */
    [["Cajas", (s: typeof r.semanas[number]) => nf.format(s.cajas), !HL && !U], ["Unidades", (s: typeof r.semanas[number]) => nu(s.unidades), U], ["Hl", (s: typeof r.semanas[number]) => s.hl == null ? "—" : fh(s.hl), HL]]
      .forEach(([et, g, sel], n) => {
        const yy = y + gh + 9 + n * 4.4;
        pdf.setFillColor(...(n % 2 ? [255, 255, 255] as RGB : FONDO)); pdf.rect(M, yy - 3.2, AN, 4.4, "F");
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.4); pdf.setTextColor(...GRIS); pdf.text(String(et).toUpperCase(), M + 1, yy);
        r.semanas.forEach((s, i) => {
          const t = (g as (s: typeof r.semanas[number]) => string)(s);
          pdf.setFont("helvetica", sel ? "bold" : "normal"); pdf.setTextColor(...TINTA);
          ajusta(t, bw - 0.8, 6.6); pdf.text(t, M + L + i * bw + bw / 2, yy, { align: "center" });
        });
      });
    y += gh + 26;

    /* ---------- REPARTO: la barra y, debajo, la tabla con las tres medidas ---------- */
    titulo("Cómo está la bodega", `la barra va en ${unid}`);
    const tot = Math.max(1, pick(r.totalCajas, r.totalUnidades, r.totalHl));
    let x = M;
    FRANJAS.forEach((k) => { const v = pick(r.franjas[k.clave].cajas, r.franjas[k.clave].unidades, r.franjas[k.clave].hl); const w = (v / tot) * AN;
      if (w > 0) { pdf.setFillColor(...COLOR[k.clave]); pdf.rect(x, y, w, 6, "F"); x += w } });
    y += 12;
    const RC = [["Estado", 50], ["Cajas", 27], ["Unidades", 31], ["Hectolitros", 27], ["% bodega", 17], ["Mat.", 14], ["Ubic.", 22]] as const;
    cabe(8 * 5.4 + 4);
    pdf.setFillColor(...FONDO); pdf.rect(M, y - 3.8, AN, 5.4, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.8); pdf.setTextColor(...GRIS);
    let cx0 = M + 1.5; RC.forEach(([c, w], i) => { pdf.text(c.toUpperCase(), i === 0 ? cx0 : cx0 + w - 3, y, { align: i === 0 ? "left" : "right" }); cx0 += w }); y += 5.4;
    const fila = (txt: string, v: (string | null)[], color: RGB | null, negrita: boolean) => {
      pdf.setFont("helvetica", negrita ? "bold" : "normal"); pdf.setFontSize(8); pdf.setTextColor(...TINTA);
      let cx = M + 1.5;
      if (color) { pdf.setFillColor(...color); pdf.rect(cx, y - 2.4, 2.6, 2.6, "F") }
      pdf.text(txt, cx + (color ? 4 : 0), y); cx += RC[0][1];
      v.forEach((t, i) => { pdf.text(t ?? "—", cx + RC[i + 1][1] - 3, y, { align: "right" }); cx += RC[i + 1][1] });
      pdf.setDrawColor(...LINEA); pdf.line(M, y + 1.7, W - M, y + 1.7); y += 5.4;
    };
    FRANJAS.forEach((k) => {
      const a = r.franjas[k.clave], pv = pick(a.cajas, a.unidades, a.hl);
      fila(k.corto, [nf.format(a.cajas), nu(a.unidades), a.hl == null ? "—" : fh(a.hl), `${(pv / tot * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`, String(a.materiales), String(a.renglones)], COLOR[k.clave], false);
    });
    fila("Total bodega", [nf.format(r.totalCajas), nu(r.totalUnidades), r.totalHl == null ? "—" : fh(r.totalHl), "100 %", "", String(r.ubicaciones)], null, true);
    y += 8;

    /* ---------- CADA MATERIAL CON SUS UBICACIONES ---------- */
    const riesgo = r.materiales.filter((m) => enRiesgo(m.franja));
    cabe(46);
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
