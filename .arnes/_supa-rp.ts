/* Una base de mentira que hace lo mismo que las funciones de rotulos-plan.sql, para probar la pantalla. */
const W = window as any;
const db: any[] = (W.__filas ||= []);
const llamadas: any[] = (W.__rpc ||= []);
const q = new URLSearchParams(location.hash.slice(1));
const clave = (a: any) => [a.fecha, a.turno, a.tren, a.sap].join("|");
export const createClient = () => ({
  rpc: async (n: string, a: any) => {
    llamadas.push({ n, a });
    if (q.get("sinsql")) return { data: null, error: { message: "Could not find the function public." + n + " in the schema cache" } };
    if (n === "rotulos_plan_imprimir") {
      const bloque = db.filter((r) => r.anio === a.p_anio && r.semana === a.p_semana && clave(r) === [a.p_fecha, a.p_turno, a.p_tren, a.p_sap].join("|"));
      const ult = bloque.reduce((m, r) => Math.max(m, r.numero), 0);
      const lote = "lote" + (W.__lote = (W.__lote || 0) + 1);
      const out = [];
      for (let i = 1; i <= a.p_cantidad; i++) {
        const numero = ult + i, tipo = numero <= a.p_planeadas ? "plan" : "adicional";
        const folio = `${a.p_sap}-${a.p_fecha.replace(/-/g, "")}-L${a.p_tren.replace("TREN-", "")}-T${a.p_turno}-${String(numero).padStart(3, "0")}`;
        db.push({ folio, anio: a.p_anio, semana: a.p_semana, fecha: a.p_fecha, turno: a.p_turno, tren: a.p_tren, sap: a.p_sap, numero, cajas: a.p_cajas, planeadas: a.p_planeadas, tipo, estado: "impreso", reimpresion_de: null, motivo: null, lote, en: new Date().toISOString() });
        out.push({ folio, numero, tipo, lote });
      }
      return { data: out, error: null };
    }
    if (n === "rotulos_plan_reimprimir_rango") {
      const lote = "lote" + (W.__lote = (W.__lote || 0) + 1);
      const sel = db.filter((r) => r.estado === "impreso" && clave(r) === [a.p_fecha, a.p_turno, a.p_tren, a.p_sap].join("|") && r.numero >= a.p_desde && r.numero <= a.p_hasta);
      if (!sel.length) return { data: null, error: { message: "No hay rótulos vigentes entre el " + a.p_desde + " y el " + a.p_hasta } };
      const out = sel.map((o) => { o.estado = "reemplazado"; o.motivo = a.p_motivo; const base = o.folio.replace(/R\d+$/, ""); const k = db.filter((r) => r.folio.startsWith(base + "R")).length + 1;
        const nuevo = { ...o, folio: base + "R" + k, estado: "impreso", reimpresion_de: o.folio, motivo: a.p_motivo, lote, en: new Date().toISOString() }; db.push(nuevo); return nuevo });
      return { data: out, error: null };
    }
    if (n === "rotulos_plan_resumen") {
      const m = new Map<string, any>();
      for (const r of db.filter((r) => r.anio === a.p_anio && r.semana === a.p_semana)) {
        const k = clave(r); const x = m.get(k) ?? { fecha: r.fecha, turno: r.turno, tren: r.tren, sap: r.sap, impresos: 0, adicionales: 0, reimpresos: 0, ultima: r.en };
        if (r.estado === "impreso" && r.tipo === "plan") x.impresos++; if (r.estado === "impreso" && r.tipo === "adicional") x.adicionales++; if (r.reimpresion_de) x.reimpresos++; m.set(k, x);
      }
      return { data: [...m.values()], error: null };
    }
    if (n === "rotulos_plan_lotes") {
      const m = new Map<string, any>();
      for (const r of db.filter((r) => r.anio === a.p_anio && r.semana === a.p_semana)) {
        const k = r.lote + clave(r); const x = m.get(k) ?? { lote: r.lote, impreso_en: r.en, quien: "Ana", fecha: r.fecha, turno: r.turno, tren: r.tren, sap: r.sap, cantidad: 0, desde: 9999, hasta: 0, reimpresion: !!r.reimpresion_de, motivo: r.motivo, vigentes: 0, primero: r.folio, ultimo: r.folio };
        x.cantidad++; x.desde = Math.min(x.desde, r.numero); x.hasta = Math.max(x.hasta, r.numero); if (r.estado === "impreso") x.vigentes++; m.set(k, x);
      }
      return { data: [...m.values()].reverse(), error: null };
    }
    return { data: null, error: { message: "rpc desconocida " + n } };
  },
});
