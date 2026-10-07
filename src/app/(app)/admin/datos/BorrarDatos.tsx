"use client";

/**
 * BORRAR DATOS — tres pasos, en el orden en que se hacen:
 *
 *   1. QUÉ     cada módulo es una tira PLEGADA; al abrirla salen todos sus
 *              datos y se marcan, en casillas cuadradas, los que se quieren
 *              borrar (uno, varios o todo el módulo; de varios módulos a la vez).
 *   2. CUÁNDO  todo, o un rango de fechas. Al cambiar, se cuenta solo:
 *              se ve cuántas filas y archivos se van ANTES de hacer nada.
 *   3. BORRAR  primero se baja la copia en Excel (una hoja por dato marcado)
 *              —sin eso no se habilita— y después se escribe BORRAR.
 *              El botón dice cuántas filas.
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
  const [sel, setSel] = useState<string[]>([]);
  const [abiertos, setAbiertos] = useState<string[]>([]);   // módulos desplegados: al entrar, todos plegados
  const [todo, setTodo] = useState(false);
  const [desde, setDesde] = useState(hoy.slice(0, 8) + "01");
  const [hasta, setHasta] = useState(hoy);
  const [conteosC, setConteos] = useState<Record<string, Conteo> | null>(null);
  const [contando, setContando] = useState(false);
  const [copia, setCopia] = useState(false);
  const [escrito, setEscrito] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [aviso, setAviso] = useState<{ bien: boolean; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0);

  const grupos = useMemo(() => {
    const m = new Map<string, Punto[]>();
    for (const p of puntos) (m.get(p.modulo) ?? m.set(p.modulo, []).get(p.modulo)!).push(p);
    return [...m.entries()];
  }, [puntos]);
  // En el orden de la lista, no en el orden en que se fueron marcando.
  const elegidos = useMemo(() => puntos.filter((p) => sel.includes(p.clave)), [puntos, sel]);
  const clavesKey = elegidos.map((p) => p.clave).join(",");
  const rangoMalo = !todo && (!desde || !hasta || desde > hasta);
  const pD = todo ? null : desde, pH = todo ? null : hasta;

  const alternar = (clave: string) => { setSel((a) => a.includes(clave) ? a.filter((x) => x !== clave) : [...a, clave]); setAviso(null) };
  const alternarModulo = (ps: Punto[]) => {
    const todos = ps.every((p) => sel.includes(p.clave));
    setSel((a) => todos ? a.filter((c) => !ps.some((p) => p.clave === c)) : [...new Set([...a, ...ps.map((p) => p.clave)])]);
    setAviso(null);
  };
  const plegar = (mod: string) => setAbiertos((a) => a.includes(mod) ? a.filter((x) => x !== mod) : [...a, mod]);

  /* CUENTA SOLO al marcar, al desmarcar o al cambiar el rango. Lo que se ve
     es lo que se va: la copia y el BORRAR se reinician, porque eran de otro conteo. */
  useEffect(() => {
    setCopia(false); setEscrito(""); setConteos(null);
    if (!clavesKey || rangoMalo) return;
    let vivo = true;
    setContando(true);
    const t = setTimeout(async () => {
      const res = await Promise.all(clavesKey.split(",").map(async (c) => {
        const { data, error } = await supabase.rpc("admin_borrado_contar", { p_clave: c, p_desde: pD, p_hasta: pH });
        return { c, data, error };
      }));
      if (!vivo) return;
      setContando(false);
      const mal = res.find((x) => x.error);
      if (mal?.error) { setAviso({ bien: false, texto: mal.error.message }); return }
      const o: Record<string, Conteo> = {};
      for (const { c, data } of res) {
        const r = (Array.isArray(data) ? data[0] : data) as Conteo;
        o[c] = { filas: Number(r.filas), archivos: Number(r.archivos), primera: r.primera, ultima: r.ultima };
      }
      setConteos(o);
    }, 250);
    return () => { vivo = false; clearTimeout(t) };
  }, [clavesKey, pD, pH, rangoMalo, supabase, vuelta]);

  /* Entre marcar y que la base conteste hay un instante en que el conteo es de la marca anterior:
     si falta alguno de los marcados, todavía no se cuenta nada. */
  const conteos = conteosC && elegidos.every((p) => conteosC[p.clave]) ? conteosC : null;
  const con = conteos ? elegidos.filter((p) => (conteos[p.clave]?.filas ?? 0) > 0) : [];
  const filasT = con.reduce((a, p) => a + (conteos?.[p.clave]?.filas ?? 0), 0);
  const archT = con.reduce((a, p) => a + (conteos?.[p.clave]?.archivos ?? 0), 0);
  const hayAlgo = !!conteos && filasT > 0;

  const qs = new URLSearchParams({ claves: con.map((p) => p.clave).join(","), ...(pD ? { desde: pD } : {}), ...(pH ? { hasta: pH } : {}) });
  const puedeBorrar = hayAlgo && copia && escrito === "BORRAR" && !borrando;

  async function borrar() {
    if (!conteos || !hayAlgo) return;
    setBorrando(true); setAviso(null);
    const esperadas = Object.fromEntries(con.map((p) => [p.clave, conteos[p.clave].filas]));
    const r = await fetch("/api/admin/datos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claves: con.map((p) => p.clave), desde: pD, hasta: pH, confirmacion: escrito, esperadas }),
    });
    const j = await r.json().catch(() => ({} as Record<string, unknown>));
    setBorrando(false);
    const res = (Array.isArray(j.resultados) ? j.resultados : []) as { clave: string; filas?: number; archivos?: number; quedaron?: number; error?: string }[];
    if (!r.ok && !res.length) { setAviso({ bien: false, texto: String(j.error ?? "No se pudo borrar.") }); setVuelta((v) => v + 1); return }
    const nombre = (c: string) => { const p = puntos.find((x) => x.clave === c); return p ? `${p.modulo} · ${p.nombre}` : c };
    const buenos = res.filter((x) => !x.error), malos = res.filter((x) => x.error);
    const filas = buenos.reduce((a, x) => a + Number(x.filas ?? 0), 0);
    const arch = buenos.reduce((a, x) => a + Number(x.archivos ?? 0), 0);
    const quedaron = buenos.reduce((a, x) => a + Number(x.quedaron ?? 0), 0);
    let texto = buenos.length
      ? `Listo: se borraron ${nf(filas)} ${filas === 1 ? "fila" : "filas"} de ${buenos.map((x) => nombre(x.clave)).join(", ")}` +
        (arch ? ` y ${nf(arch)} ${arch === 1 ? "archivo" : "archivos"}` : "") + "."
      : "No se borró nada.";
    if (quedaron) texto += ` ${nf(quedaron)} archivos quedaron en Storage${hayLlave ? " (Storage no respondió)" : " porque falta la llave del servidor"}; los datos sí se borraron.`;
    if (malos.length) texto += " No se pudo borrar: " + malos.map((x) => `${nombre(x.clave)} (${x.error})`).join("; ") + ".";
    setAviso({ bien: !malos.length && quedaron === 0, texto });
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
            <p>Abre un módulo y marca, en las casillas, lo que quieres borrar: uno, varios o todo el
              módulo. Lo que cuelga de cada dato se va con él: un viaje se lleva sus tipos y sus
              correcciones; un reporte, sus fotos.</p>
          </div></div>
          <div className="bd-grupos">
            {grupos.map(([mod, ps]) => {
              const abierto = abiertos.includes(mod);
              const marcados = ps.filter((p) => sel.includes(p.clave)).length;
              return (
                <div key={mod} className={"bd-mod" + (abierto ? " abierto" : "") + (marcados ? " con" : "")}>
                  <button type="button" className="bd-mod-cab" aria-expanded={abierto} onClick={() => plegar(mod)}>
                    <span className="nom">{mod}</span>
                    <span className="cuantos">{marcados ? <b>{marcados} de {ps.length} marcados</b> : `${ps.length} ${ps.length === 1 ? "dato" : "datos"}`}</span>
                    <svg className="bd-chev" viewBox="0 0 24 24" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  {abierto && (
                    <div className="bd-mod-cuerpo" role="group" aria-label={`Datos de ${mod}`}>
                      {ps.length > 1 && (
                        <label className="bd-punto bd-todos">
                          <input type="checkbox" className="bd-cuadro" checked={marcados === ps.length}
                                 ref={(el) => { if (el) el.indeterminate = marcados > 0 && marcados < ps.length }}
                                 onChange={() => alternarModulo(ps)} />
                          <span><b>Marcar todo {mod}</b></span>
                        </label>
                      )}
                      {ps.map((p) => (
                        <label key={p.clave} className={"bd-punto" + (sel.includes(p.clave) ? " aqui" : "")}>
                          <input type="checkbox" className="bd-cuadro" name="punto" value={p.clave} checked={sel.includes(p.clave)}
                                 onChange={() => alternar(p.clave)} />
                          <span><b>{p.nombre}</b><i>{p.detalle}</i></span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
          <section className={"tarjeta bd-paso bd-final" + (hayAlgo ? " listo" : "")}>
            <div className="cab"><div>
              <h2><span className="bd-n">3</span> Copia y borrar</h2>
              <p>Primero baja la copia en Excel. Después escribe BORRAR.</p>
            </div></div>
            <div className="bd-cuenta" aria-live="polite">
              {!elegidos.length ? <p className="bd-vacio">Marca qué borrar en el paso 1.</p>
                : contando || !conteos ? <p className="bd-vacio">{rangoMalo ? "Corrige las fechas." : "Contando…"}</p>
                : filasT === 0 ? <p className="bd-vacio">No hay nada de {elegidos.length === 1 ? <b>{elegidos[0].nombre}</b> : "lo marcado"} {todo ? "" : `del ${dia(desde)} al ${dia(hasta)}`}. No hay qué borrar.</p>
                : (
                  <>
                    <p className="bd-cifra"><b>{nf(filasT)}</b> {filasT === 1 ? "fila" : "filas"}
                      {archT > 0 && <> · <b>{nf(archT)}</b> {archT === 1 ? "archivo" : "archivos"}</>}</p>
                    <ul className="bd-lista">
                      {elegidos.map((p) => {
                        const c = conteos[p.clave];
                        return (
                          <li key={p.clave} className={c.filas === 0 ? "cero" : ""}>
                            <span>{p.modulo} · {p.nombre}
                              {c.filas > 0 && c.primera && <small> — del {dia(c.primera)} al {dia(c.ultima ?? c.primera)}</small>}</span>
                            <b>{c.filas === 0 ? "nada" : `${nf(c.filas)}${c.archivos ? ` · ${nf(c.archivos)} arch.` : ""}`}</b>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
            </div>
            <div className="bd-acciones">
              <a className={"btn bd-copia" + (copia ? " hecha" : "")}
                 aria-disabled={!hayAlgo}
                 href={hayAlgo ? `/api/admin/datos?${qs}` : undefined}
                 onClick={(e) => { if (!hayAlgo) { e.preventDefault(); return } setCopia(true) }}>
                {copia ? "Copia bajada ✓ (bajar otra vez)" : "1 · Bajar copia en Excel"}
              </a>
              <label className="bd-escribe">
                <span>2 · Escribe <b>BORRAR</b> para confirmar</span>
                <input value={escrito} onChange={(e) => setEscrito(e.target.value)} disabled={!copia}
                       autoComplete="off" spellCheck={false} placeholder={copia ? "BORRAR" : "Primero baja la copia"}
                       aria-label="Escribe BORRAR para confirmar" />
              </label>
              <button type="button" className="btn bd-borrar" disabled={!puedeBorrar} onClick={borrar}>
                {borrando ? "Borrando…" : hayAlgo ? `Borrar ${nf(filasT)} ${filasT === 1 ? "fila" : "filas"}` : "Borrar"}
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
