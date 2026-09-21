"use client";

/**
 * BORRAR DATOS — tres pasos, en el orden en que se hacen:
 *
 *   1. QUÉ     un punto específico de la lista, agrupado por módulo.
 *   2. CUÁNDO  todo, o un rango de fechas. Al cambiar, se cuenta solo:
 *              se ve cuántas filas y archivos se van ANTES de hacer nada.
 *   3. BORRAR  primero se baja la copia en Excel —sin eso no se habilita—
 *              y después se escribe BORRAR. El botón dice cuántas filas.
 *
 * La base vuelve a contar al borrar: si alguien registró algo mientras
 * se miraba, no borra y pide contar otra vez.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Punto = { clave: string; modulo: string; nombre: string; detalle: string; bucket: string | null };
export type Borrado = {
  id: number; nombre: string; desde: string | null; hasta: string | null;
  filas: number; archivos: number; borrado_nombre: string | null; borrado_en: string;
};
type Conteo = { filas: number; archivos: number; primera: string | null; ultima: string | null };

const nf = (n: number) => n.toLocaleString("es-CO");
const dia = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
const cuando = (s: string) => new Date(s).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function BorrarDatos({ puntos, historial, hoy, hayLlave }: {
  puntos: Punto[]; historial: Borrado[]; hoy: string; hayLlave: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [clave, setClave] = useState<string | null>(null);
  const [todo, setTodo] = useState(false);
  const [desde, setDesde] = useState(hoy.slice(0, 8) + "01");
  const [hasta, setHasta] = useState(hoy);
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [contando, setContando] = useState(false);
  const [copia, setCopia] = useState(false);
  const [escrito, setEscrito] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [aviso, setAviso] = useState<{ bien: boolean; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0);

  const punto = puntos.find((p) => p.clave === clave) ?? null;
  const grupos = useMemo(() => {
    const m = new Map<string, Punto[]>();
    for (const p of puntos) (m.get(p.modulo) ?? m.set(p.modulo, []).get(p.modulo)!).push(p);
    return [...m.entries()];
  }, [puntos]);
  const rangoMalo = !todo && (!desde || !hasta || desde > hasta);
  const pD = todo ? null : desde, pH = todo ? null : hasta;

  /* CUENTA SOLO al elegir o cambiar el rango. Lo que se ve es lo que se
     va: la copia y el BORRAR se reinician, porque eran de otro conteo. */
  useEffect(() => {
    setCopia(false); setEscrito(""); setConteo(null);
    if (!clave || rangoMalo) return;
    let vivo = true;
    setContando(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("admin_borrado_contar", { p_clave: clave, p_desde: pD, p_hasta: pH });
      if (!vivo) return;
      setContando(false);
      if (error) { setAviso({ bien: false, texto: error.message }); return }
      const r = (Array.isArray(data) ? data[0] : data) as Conteo;
      setConteo({ filas: Number(r.filas), archivos: Number(r.archivos), primera: r.primera, ultima: r.ultima });
    }, 250);
    return () => { vivo = false; clearTimeout(t) };
  }, [clave, pD, pH, rangoMalo, supabase, vuelta]);

  const qs = new URLSearchParams({ clave: clave ?? "", ...(pD ? { desde: pD } : {}), ...(pH ? { hasta: pH } : {}) });
  const puedeBorrar = !!conteo && conteo.filas > 0 && copia && escrito === "BORRAR" && !borrando;

  async function borrar() {
    if (!conteo || !punto) return;
    setBorrando(true); setAviso(null);
    const r = await fetch("/api/admin/datos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave, desde: pD, hasta: pH, confirmacion: escrito, esperadas: conteo.filas }),
    });
    const j = await r.json().catch(() => ({} as Record<string, unknown>));
    setBorrando(false);
    if (!r.ok) { setAviso({ bien: false, texto: String(j.error ?? "No se pudo borrar.") }); setVuelta((v) => v + 1); return }
    const filas = Number(j.filas ?? 0), arch = Number(j.archivos ?? 0), quedaron = Number(j.quedaron ?? 0);
    setAviso({
      bien: quedaron === 0,
      texto: `Listo: se borraron ${nf(filas)} ${filas === 1 ? "fila" : "filas"} de ${punto.modulo} · ${punto.nombre}` +
        (arch ? ` y ${nf(arch)} ${arch === 1 ? "archivo" : "archivos"}` : "") + "." +
        (quedaron ? ` ${nf(quedaron)} archivos quedaron en Storage${hayLlave ? " (Storage no respondió)" : " porque falta la llave del servidor"}; los datos sí se borraron.` : ""),
    });
    setVuelta((v) => v + 1);
    router.refresh();
  }

  return (
    <>
      <div className="bd-marco">
        {/* 1 · QUÉ */}
        <section className="tarjeta bd-paso">
          <div className="cab"><div>
            <h2><span className="bd-n">1</span> Qué quieres borrar</h2>
            <p>Un punto específico. Lo que cuelga de él se va con él: un viaje se lleva sus tipos y
              sus correcciones; un reporte, sus fotos.</p>
          </div></div>
          <div className="bd-grupos">
            {grupos.map(([mod, ps]) => (
              <fieldset key={mod} className="bd-grupo">
                <legend>{mod}</legend>
                {ps.map((p) => (
                  <label key={p.clave} className={"bd-punto" + (p.clave === clave ? " aqui" : "")}>
                    <input type="radio" name="punto" value={p.clave} checked={p.clave === clave}
                           onChange={() => { setClave(p.clave); setAviso(null) }} />
                    <span><b>{p.nombre}</b><i>{p.detalle}</i></span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </section>

        <div className="bd-lado">
          {/* 2 · CUÁNDO */}
          <section className="tarjeta bd-paso">
            <div className="cab"><div>
              <h2><span className="bd-n">2</span> De qué fechas</h2>
              <p>Un rango, o todo lo que haya.</p>
            </div></div>
            <div className="bd-rango">
              <div className="bd-seg" role="group" aria-label="Rango">
                <button type="button" className={!todo ? "on" : ""} onClick={() => setTodo(false)}>Un rango</button>
                <button type="button" className={todo ? "on" : ""} onClick={() => setTodo(true)}>Todo</button>
              </div>
              {!todo && (
                <div className="bd-fechas">
                  <label><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} /></label>
                  <label><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} /></label>
                </div>
              )}
              {rangoMalo && <p className="bd-mal">La fecha inicial tiene que ir antes de la final.</p>}
            </div>
          </section>

          {/* 3 · BORRAR */}
          <section className={"tarjeta bd-paso bd-final" + (conteo && conteo.filas > 0 ? " listo" : "")}>
            <div className="cab"><div>
              <h2><span className="bd-n">3</span> Copia y borrar</h2>
              <p>Primero baja la copia en Excel. Después escribe BORRAR.</p>
            </div></div>
            <div className="bd-cuenta" aria-live="polite">
              {!punto ? <p className="bd-vacio">Elige qué borrar en el paso 1.</p>
                : contando || !conteo ? <p className="bd-vacio">{rangoMalo ? "Corrige las fechas." : "Contando…"}</p>
                : conteo.filas === 0 ? <p className="bd-vacio">No hay nada de <b>{punto.nombre}</b> {todo ? "" : `del ${dia(desde)} al ${dia(hasta)}`}. No hay qué borrar.</p>
                : (
                  <>
                    <p className="bd-cifra"><b>{nf(conteo.filas)}</b> {conteo.filas === 1 ? "fila" : "filas"}
                      {conteo.archivos > 0 && <> · <b>{nf(conteo.archivos)}</b> {conteo.archivos === 1 ? "archivo" : "archivos"}</>}</p>
                    <p className="bd-que">{punto.modulo} · {punto.nombre}
                      {conteo.primera && <> — del {dia(conteo.primera)} al {dia(conteo.ultima ?? conteo.primera)}</>}</p>
                  </>
                )}
            </div>
            <div className="bd-acciones">
              <a className={"btn bd-copia" + (copia ? " hecha" : "")}
                 aria-disabled={!conteo || conteo.filas === 0}
                 href={conteo && conteo.filas > 0 ? `/api/admin/datos?${qs}` : undefined}
                 onClick={(e) => { if (!conteo || conteo.filas === 0) { e.preventDefault(); return } setCopia(true) }}>
                {copia ? "Copia bajada ✓ (bajar otra vez)" : "1 · Bajar copia en Excel"}
              </a>
              <label className="bd-escribe">
                <span>2 · Escribe <b>BORRAR</b> para confirmar</span>
                <input value={escrito} onChange={(e) => setEscrito(e.target.value)} disabled={!copia}
                       autoComplete="off" spellCheck={false} placeholder={copia ? "BORRAR" : "Primero baja la copia"}
                       aria-label="Escribe BORRAR para confirmar" />
              </label>
              <button type="button" className="btn bd-borrar" disabled={!puedeBorrar} onClick={borrar}>
                {borrando ? "Borrando…" : conteo && conteo.filas > 0 ? `Borrar ${nf(conteo.filas)} ${conteo.filas === 1 ? "fila" : "filas"}` : "Borrar"}
              </button>
            </div>
            {aviso && <p className={"aviso " + (aviso.bien ? "bien" : "mal")} role="status">{aviso.texto}</p>}
          </section>
        </div>
      </div>

      {/* EL REGISTRO: quién borró qué. No se puede editar ni borrar. */}
      <section className="tarjeta">
        <div className="cab"><div>
          <h2>Lo que se ha borrado</h2>
          <p>Los últimos 15. Queda escrito quién, cuándo, qué y de qué fechas.</p>
        </div></div>
        {historial.length === 0 ? <p className="bd-vacio bd-pad">Todavía no se ha borrado nada desde aquí.</p> : (
          <div className="bd-tabla-env">
            <table className="bd-tabla">
              <thead><tr><th>Cuándo</th><th>Qué</th><th>Fechas</th><th className="num">Filas</th><th className="num">Archivos</th><th>Quién</th></tr></thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id}>
                    <td>{cuando(h.borrado_en)}</td>
                    <td>{h.nombre}</td>
                    <td>{h.desde || h.hasta ? `${h.desde ? dia(h.desde) : "inicio"} – ${h.hasta ? dia(h.hasta) : "hoy"}` : "Todo"}</td>
                    <td className="num">{nf(Number(h.filas))}</td>
                    <td className="num">{nf(Number(h.archivos))}</td>
                    <td>{h.borrado_nombre ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
