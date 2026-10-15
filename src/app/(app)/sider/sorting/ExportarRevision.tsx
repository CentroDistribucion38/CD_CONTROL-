"use client";

/**
 * EXPORTAR LA REVISIÓN AI A EXCEL — con todo y la foto de cada revisión.
 *
 * Se arma en el navegador (ver libro-revision-ai.ts): lee con la sesión de quien exporta (RLS),
 * baja las fotos de a seis, las achica a ~1000 px y arma el libro de cuatro hojas.
 */
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Defecto, DetalleAi, Revision } from "@/modulos/sider/ai";
import type { FotoRevision, RevisionLibro } from "@/modulos/sider/libro-revision-ai";
import "./exportar.css";

type Clase = "" | "ai" | "sorting";
type Rango = "hoy" | "7" | "mes" | "pasado" | "todo" | "otro";

const hoyCol = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const masDias = (f: string, n: number) => new Date(Date.parse(f + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const diaTxt = (f: string) => f.split("-").reverse().join("/");
const sello = () => new Date().toLocaleString("sv", { timeZone: "America/Bogota" }).replace(/[-:]/g, "").replace(" ", "-").slice(0, 13);
const LADO = 1000;
const A_LA_VEZ = 6;

async function achicar(b: Blob): Promise<FotoRevision | null> {
  try {
    const img = await createImageBitmap(b);
    const k = Math.min(1, LADO / Math.max(img.width, img.height));
    const w = Math.round(img.width * k), h = Math.round(img.height * k);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
    img.close?.();
    return { base64: cv.toDataURL("image/jpeg", 0.72), ancho: w, alto: h };
  } catch { return null }
}

export function ExportarRevision({ nombres }: { nombres: Record<string, string> }) {
  const supabase = useMemo(() => createClient(), []);
  const [abierto, setAbierto] = useState(false);
  const hoy = hoyCol();
  const [rango, setRango] = useState<Rango>("mes");
  const [desde, setDesde] = useState(hoy.slice(0, 8) + "01");
  const [hasta, setHasta] = useState(hoy);
  const [clase, setClase] = useState<Clase>("");
  const [conFotos, setConFotos] = useState(true);
  const [avance, setAvance] = useState<string | null>(null);
  const [mal, setMal] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const escoger = (r: Rango) => {
    setRango(r);
    if (r === "hoy") { setDesde(hoy); setHasta(hoy) }
    if (r === "7") { setDesde(masDias(hoy, -6)); setHasta(hoy) }
    if (r === "mes") { setDesde(hoy.slice(0, 8) + "01"); setHasta(hoy) }
    if (r === "pasado") {
      const fin = masDias(hoy.slice(0, 8) + "01", -1);
      setDesde(fin.slice(0, 8) + "01"); setHasta(fin);
    }
    if (r === "todo") { setDesde(""); setHasta("") }
  };

  async function porTandas<T>(ids: string[], leer: (t: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<{ filas: T[]; error: string | null }> {
    const filas: T[] = [];
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await leer(ids.slice(i, i + 150));
      if (error) return { filas, error: error.message };
      filas.push(...((data ?? []) as T[]));
    }
    return { filas, error: null };
  }

  async function exportar() {
    if (avance) return;
    setMal(null); setOk(null); setAvance("Leyendo las revisiones…");
    try {
      let q = supabase.from("v_sider_ai").select("*").not("viaje_id", "is", null);
      if (desde) q = q.gte("fecha", desde);
      if (hasta) q = q.lte("fecha", hasta);
      if (clase) q = q.eq("tipo", clase);
      const { data, error } = await q.order("fecha", { ascending: false }).limit(5000);
      if (error) { setMal(`No pude leer las revisiones: ${error.message}`); return }
      const revs = (data ?? []) as Revision[];
      if (!revs.length) { setMal("No hay revisiones cerradas en ese período."); return }
      const ids = revs.map((r) => r.id);
      const vids = [...new Set(revs.map((r) => r.viaje_id).filter(Boolean))] as string[];

      setAvance("Leyendo defectos y materiales…");
      const [det, via, fot, defs, yo] = await Promise.all([
        porTandas<DetalleAi>(ids, (t) => supabase.from("v_sider_ai_detalle").select("*").in("revision_id", t)),
        porTandas<{ id: string; sku: string; descripcion: string; cd_origen: string }>(vids, (t) => supabase.from("v_sider_viajes").select("id, sku, descripcion, cd_origen").in("id", t)),
        porTandas<{ id: string; foto_ruta: string | null }>(ids, (t) => supabase.from("sider_ai_revisiones").select("id, foto_ruta").in("id", t)),
        supabase.from("sider_ai_defectos").select("*").order("orden"),
        supabase.auth.getUser().then(async ({ data: { user } }) => {
          if (!user) return "—";
          const { data: p } = await supabase.from("perfiles").select("nombre, usuario").eq("id", user.id).maybeSingle();
          return (p?.nombre as string) || (p?.usuario as string) || user.email || "—";
        }),
      ]);
      if (det.error) { setMal(`No pude leer los defectos: ${det.error}`); return }
      const vMap = new Map(via.filas.map((v) => [v.id, v]));
      const revisiones: RevisionLibro[] = revs.map((r) => {
        const v = r.viaje_id ? vMap.get(r.viaje_id) : undefined;
        return { ...r, sku: v?.sku ?? null, material: v?.descripcion ?? null, cd_origen: v?.cd_origen ?? null };
      });

      /* LAS FOTOS: una por revisión, de a seis a la vez. */
      const fotos: Record<string, FotoRevision> = {};
      let fallaron = 0;
      const conRuta = fot.error ? [] : fot.filas.filter((x) => x.foto_ruta);
      if (conFotos && conRuta.length) {
        let hechas = 0;
        for (let i = 0; i < conRuta.length; i += A_LA_VEZ) {
          setAvance(`Bajando fotos ${hechas} de ${conRuta.length}…`);
          await Promise.all(conRuta.slice(i, i + A_LA_VEZ).map(async (x) => {
            try {
              const { data: b, error: e } = await supabase.storage.from("sider").download(x.foto_ruta!);
              const f = !e && b ? await achicar(b) : null;
              if (f) fotos[x.id] = f; else fallaron++;
            } catch { fallaron++ }
            hechas++;
          }));
        }
      }

      setAvance("Armando el Excel…");
      const { armarLibroRevisionAi } = await import("@/modulos/sider/libro-revision-ai");
      const periodo = !desde && !hasta ? "Todas las fechas" : desde === hasta ? diaTxt(desde) : `${desde ? diaTxt(desde) : "inicio"} a ${hasta ? diaTxt(hasta) : "hoy"}`;
      const buf = await armarLibroRevisionAi({
        revisiones, detalle: det.filas, defectos: ((defs.data ?? []) as Defecto[]), fotos, fotosFallaron: fallaron,
        nombres, periodo, filtros: clase === "ai" ? "solo certificadas" : clase === "sorting" ? "solo normales" : "certificadas y normales",
        quien: yo,
      });
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = ["revision-ai", clase === "ai" ? "certificada" : clase === "sorting" ? "normal" : null,
        desde && hasta ? (desde === hasta ? desde : `${desde}_${hasta}`) : "todo", sello()].filter(Boolean).join("-") + ".xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      const nf = Object.keys(fotos).length;
      setOk(`${revs.length} revisi${revs.length === 1 ? "ón" : "ones"} · ${nf} foto${nf === 1 ? "" : "s"}${fallaron ? ` · ${fallaron} no se pudieron bajar` : ""}.`);
    } catch (e) {
      setMal(e instanceof Error ? `No se pudo armar el Excel: ${e.message}` : "No se pudo armar el Excel.");
    } finally { setAvance(null) }
  }

  return (
    <div className="rx">
      <button type="button" className="rx-abrir" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m0 0L5 7m3 3 3-3M3 12.5h10" /></svg>
        Exportar Excel con fotos
      </button>
      {abierto && (
        <div className="rx-panel" role="group" aria-label="Exportar la Revisión AI">
          <div className="rx-fila">
            <span className="rx-rot">Período</span>
            {([["hoy", "Hoy"], ["7", "Últimos 7 días"], ["mes", "Este mes"], ["pasado", "Mes pasado"], ["todo", "Todo"], ["otro", "Escoger fechas"]] as [Rango, string][]).map(([k, t]) => (
              <button key={k} type="button" className={"rx-ch" + (rango === k ? " on" : "")} onClick={() => escoger(k)}>{t}</button>
            ))}
          </div>
          {rango !== "todo" && (
            <div className="rx-fila">
              <label className="rx-f"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={(e) => { setDesde(e.target.value); setRango("otro") }} /></label>
              <label className="rx-f"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={(e) => { setHasta(e.target.value); setRango("otro") }} /></label>
            </div>
          )}
          <div className="rx-fila">
            <span className="rx-rot">Clase</span>
            {([["", "Las dos"], ["ai", "Certificada"], ["sorting", "Normal"]] as [Clase, string][]).map(([k, t]) => (
              <button key={k || "dos"} type="button" className={"rx-ch" + (clase === k ? " on" : "") + (k ? ` rx-${k}` : "")} onClick={() => setClase(k)}>{t}</button>
            ))}
            <label className="rx-check"><input type="checkbox" checked={conFotos} onChange={(e) => setConFotos(e.target.checked)} /> Con fotos</label>
          </div>
          <p className="rx-dice">
            Sale un Excel de cuatro hojas: <b>Resumen</b> (KPI, % AI por socio, envase, origen y defecto), <b>Revisiones</b> (una fila por
            camión con todo), <b>Defectos</b> (camión × defecto) y <b>Evidencias</b> (la ficha de cada revisión con su foto).
          </p>
          <div className="rx-fila rx-pie">
            <button type="button" className="btn" disabled={!!avance} onClick={exportar}>{avance ?? "↓ Exportar"}</button>
            {mal && <span className="rx-mal" role="alert">{mal}</span>}
            {ok && <span className="rx-ok" role="status">✓ {ok}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
