"use client";

/* ===================================================================
   «REVISA ESTA UBICACIÓN» — LO QUE VE CADA PERSONA CUANDO EL FISCAL MANDA A VALIDAR

   El fiscal ve diferencias en el cruce y manda a validar unas ubicaciones. A las DOS
   personas de la hoja les sale aquí, por cada ubicación, lo que ellas mismas anotaron
   (nunca lo de su pareja: el conteo sigue a ciegas) y dos caminos:

     · «Está bien»: lo que conté es correcto. No cambia nada, solo avisa que ya revisó.
     · «Contar de nuevo»: se abre lo que anotó en ese módulo; lo corrige, agrega o quita
       renglones (o dice «aquí no hay nada») y lo envía. Lo enviado REEMPLAZA lo anterior
       de ese módulo; todo o nada.

   La revisión es por CALLE Y MÓDULO (A01): el lado no se muestra ni se pregunta, porque delataría
   dónde está cada cosa. El cruce tampoco lo cuenta: lo de los dos lados suma en el módulo.

   Sigue funcionando aunque la persona ya haya terminado su hoja: la base deja tocar solo
   las ubicaciones que el fiscal mandó a validar. Cuando las dos responden, el fiscal ve el
   cruce otra vez y aprueba (o la manda a otra ronda).
   =================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import { usePosicion, sellar, type Foto } from "@/lib/evidencia";
import type { Material } from "@/modulos/inventario/fefo";
import { argumentosFiscal, revisarFiscal, totalCajas, VACIO_FISCAL, pideEstadoFiscal, opcionesEstadoFiscal, type BorradorFiscal, type RenglonFiscal } from "@/modulos/inventario/fiscal-contar";

type RevisionMia = {
  fiscal_id: string; hoja_id: string; hoja: number; ubicacion_id: string; ubicacion: string;
  ronda: number; nota: string | null; pedido_en: string | null; ya_envie: boolean;
};
type Reng = BorradorFiscal & { k: number; ub: string; origen?: string };
/** Un módulo (A01) = sus dos lados juntos. */
type Modulo = { modulo: string; filas: RevisionMia[]; ronda: number; nota: string | null; yaEnvie: boolean };
const moduloDe = (clave: string) => clave.replace(/_(IZQ|DER)$/i, "");

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const dd = (n: number | null) => (n == null ? "··" : String(n).padStart(2, "0"));
const dos = (v: string) => v.replace(/\D/g, "").slice(0, 2);

/** Cantidad contada → texto de la casilla. */
const aTexto = (n: number | null) => (n == null ? "" : String(n));
function desdeRenglon(r: RenglonFiscal, k: number): Reng {
  return {
    ...VACIO_FISCAL, k, ub: r.ubicacion_id, origen: r.id,
    base: "x", lado: "x", codigo: r.sku,
    dia: r.venc_dia == null ? "" : dd(r.venc_dia), mes: r.venc_mes == null ? "" : dd(r.venc_mes), anio: r.venc_anio == null ? "" : dd(r.venc_anio),
    modo: r.cajas != null ? "cajas" : "estibas",
    estibas: aTexto(r.estibas), saldo: aTexto(r.saldo), cajas: aTexto(r.cajas), nota: r.nota ?? "", estado: r.estado_envase ?? "",
    averia: !!r.averia, pnc: !!r.pnc, pncRotulo: r.pnc ? r.pnc_rotulo ?? null : null, pncBloqueo: r.pnc ? r.pnc_bloqueo_mecanico ?? null : null,
  };
}

export function RevisionesFiscal({ hojaId, mios, materiales, alCambiar, avisar }: {
  hojaId: string;
  /** Lo que esta persona lleva anotado en su hoja (todas las ubicaciones). */
  mios: RenglonFiscal[] | null;
  materiales: Material[];
  /** Después de enviar: la hoja vuelve a leer lo suyo. */
  alCambiar: () => Promise<void>;
  avisar: { bien: (m: string) => void; mal: (m: string) => void };
}) {
  const supabase = useMemo(() => createClient(), []);
  const [revs, setRevs] = useState<RevisionMia[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [rengs, setRengs] = useState<Reng[]>([]);
  const [mal, setMal] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /* Ids de MIS renglones que no cuadran con mi pareja. null = la base aún no tiene la función (se muestra todo, como antes). */
  const [difieren, setDifieren] = useState<Set<string> | null>(null);
  /* FOTOS: las que ya tenían mis renglones (conteo → ruta) y las nuevas que se toman en el editor (por renglón del editor). */
  const { ubi: ubiFoto, direccion: dirFoto, pedir: pedirUbi } = usePosicion();
  const [fotosPrev, setFotosPrev] = useState<Record<string, string>>({});
  const [fotosNuevas, setFotosNuevas] = useState<Record<number, Foto>>({});
  const camara = useRef<HTMLInputElement>(null);
  const kDeFoto = useRef<number | null>(null);
  const [sellando, setSellando] = useState(false);

  const leer = useCallback(async () => {
    const { data, error } = await supabase.rpc("inv_fiscal_mis_revisiones");
    /* Si a la base le falta 2026-10-fiscal-validar.sql, la persona no ve nada y cuenta como siempre. */
    if (error) { setRevs([]); return }
    setRevs(((data ?? []) as RevisionMia[]).filter((r) => r.hoja_id === hojaId));
    const d = await supabase.rpc("inv_fiscal_mis_diferencias", { p_hoja: hojaId });
    setDifieren(d.error ? null : new Set(((d.data ?? []) as { conteo_id: string }[]).map((x) => x.conteo_id)));
  }, [supabase, hojaId]);

  useEffect(() => {
    void leer();
    const t = setInterval(() => { if (!document.hidden && editando === null) void leer() }, 20_000);
    return () => clearInterval(t);
  }, [leer, editando]);

  const modulos = useMemo<Modulo[]>(() => {
    const m = new Map<string, Modulo>();
    for (const r of revs) {
      const k = moduloDe(r.ubicacion);
      const x = m.get(k) ?? { modulo: k, filas: [], ronda: 0, nota: null, yaEnvie: true };
      x.filas.push(r);
      x.ronda = Math.max(x.ronda, r.ronda);
      x.nota = x.nota ?? r.nota;
      if (!r.ya_envie) x.yaEnvie = false;
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => a.modulo.localeCompare(b.modulo, "es", { numeric: true }));
  }, [revs]);
  const pendientes = modulos.filter((m) => !m.yaEnvie);
  const enviadas = modulos.filter((m) => m.yaEnvie);
  if (revs.length === 0) return null;

  const matDe = (sku: string) => materiales.find((m) => m.activo && m.sku === sku.trim()) ?? null;
  const todosDe = (m: Modulo) => (mios ?? []).filter((r) => m.filas.some((f) => f.ubicacion_id === r.ubicacion_id));
  /** Solo lo que no cuadra: lo que coincide con la pareja no se muestra, para no enredar. */
  const misDe = (m: Modulo) => todosDe(m).filter((r) => difieren === null || difieren.has(r.id));
  const textoCant = (r: RenglonFiscal) => {
    if (r.cajas != null) return `${nf.format(r.cajas)} caja${r.cajas === 1 ? "" : "s"}`;
    const e = r.estibas ?? 0, s = r.saldo ?? 0;
    return [e > 0 || s === 0 ? `${nf.format(e)} estiba${e === 1 ? "" : "s"}` : "", s > 0 ? `${nf.format(s)} caja${s === 1 ? "" : "s"}` : ""].filter(Boolean).join(" + ");
  };

  async function enviar(m: Modulo, renglones: object[] | null) {
    setOcupado(true); setMal(null);
    const { error } = await supabase.rpc("inv_fiscal_revision_enviar_modulo", { p_hoja: hojaId, p_ubicaciones: m.filas.map((f) => f.ubicacion_id), p_renglones: renglones });
    setOcupado(false);
    if (error) {
      setMal(/inv_fiscal_revision_enviar_modulo|schema cache|does not exist|no existe la funci/i.test(error.message)
        ? "Falta correr 2026-10-fiscal-modulo.sql en Supabase."
        : traducirError(error.message));
      return false;
    }
    avisar.bien(renglones === null ? `${m.modulo}: enviaste que está bien.` : `${m.modulo}: enviaste tu nuevo conteo.`);
    setEditando(null);
    await Promise.all([leer(), alCambiar()]);
    return true;
  }

  async function verFotoPrev(ruta: string) {
    const w = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("inventario").createSignedUrl(ruta, 600);
    if (error || !data?.signedUrl) { w?.close(); setMal("No pude abrir la foto."); return }
    if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  }
  async function tomarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    const k = kDeFoto.current;
    if (!archivo || k == null) return;
    const r = rengs.find((x) => x.k === k);
    setSellando(true);
    try {
      const f = await sellar(archivo, { titulo: (r?.codigo ? `${r.codigo} · ${editando ?? ""}` : "CONTEO").toUpperCase(), ubi: ubiFoto, direccion: dirFoto, etiqueta: "CONTEO FISCAL" });
      if (f) setFotosNuevas((x) => ({ ...x, [k]: f }));
    } catch (er) {
      setMal(er instanceof Error ? er.message : "No se pudo preparar la foto.");
    } finally { setSellando(false) }
  }

  function abrirEditor(m: Modulo) {
    setMal(null);
    setFotosNuevas({});
    pedirUbi();
    void supabase.rpc("inv_fiscal_mis_fotos", { p_hoja: hojaId }).then(({ data, error }) => {
      if (!error) setFotosPrev(Object.fromEntries(((data ?? []) as { conteo_id: string; ruta: string }[]).map((f) => [f.conteo_id, f.ruta])));
    });
    setRengs(misDe(m).map((x, i) => desdeRenglon(x, i)));
    setEditando(m.modulo);
  }
  const ponRen = (k: number, cambio: Partial<BorradorFiscal>) => setRengs((l) => l.map((x) => (x.k === k ? { ...x, ...cambio } : x)));

  async function enviarNuevo(m: Modulo) {
    const salida: object[] = [];
    for (const x of rengs) {
      const mat = matDe(x.codigo);
      const falla = revisarFiscal(x, mat, "x");
      if (falla || !mat) { setMal(`${x.codigo.trim() || "Un renglón"}: ${falla ?? "falta el código del material."}`); return }
      if (x.averia && !fotosNuevas[x.k] && !(x.origen && fotosPrev[x.origen])) {
        setMal(`${x.codigo.trim()}: avería sin foto. Toma la foto de la estiba antes de enviar.`); return;
      }
    }
    setOcupado(true);
    for (const x of rengs) {
      const mat = matDe(x.codigo)!;
      /* El lado no se pregunta: lo que ya tenía conserva su sitio y lo nuevo va al primero del módulo. */
      const ub = x.ub || m.filas[0].ubicacion_id;
      const a = argumentosFiscal(hojaId, ub, mat, x);
      const fo = fotosNuevas[x.k];
      let foto: object | null = null;
      if (fo) {
        const ruta = `fiscal/${hojaId}/rev-${crypto.randomUUID()}.jpg`;
        const { error: eS } = await supabase.storage.from("inventario").upload(ruta, fo.blob, { contentType: "image/jpeg", upsert: true });
        if (eS) { setOcupado(false); setMal("La foto no subió: " + eS.message); return }
        foto = { ruta, bytes: fo.blob.size, ancho: fo.ancho, alto: fo.alto, tomada: fo.tomada,
                 lat: ubiFoto?.lat ?? null, lng: ubiFoto?.lng ?? null, precision: ubiFoto ? Math.round(ubiFoto.precision) : null };
      }
      salida.push({ ubicacion_id: ub, producto_id: a.p_producto, estibas: a.p_estibas, saldo: a.p_saldo, cajas: a.p_cajas, dia: a.p_dia, mes: a.p_mes, anio: a.p_anio, nota: a.p_nota, estado: a.p_estado,
        averia: a.p_averia, pnc: a.p_pnc, pnc_rotulo: a.p_pnc_rotulo, pnc_bloqueo: a.p_pnc_bloqueo,
        desde: x.origen ?? null, foto });
    }
    /* Los renglones que cuadraban no se mostraron, pero siguen tal cual (con su foto): solo viaja su id. */
    const mostrados = new Set(misDe(m).map((x) => x.id));
    for (const x of todosDe(m)) if (!mostrados.has(x.id)) salida.push({ id: x.id });
    setOcupado(false);
    void enviar(m, salida);
  }

  return (
    <section className="rv" aria-label="Módulos que te pidieron revisar" role="region">
      <header className="rv-cab">
        <b>{pendientes.length > 0 ? `Revisa ${pendientes.length === 1 ? "este módulo" : `estos ${pendientes.length} módulos`}` : "Revisión enviada"}</b>
        <span>{pendientes.length > 0 ? "El fiscal te pide confirmar tu conteo" : "Falta la aprobación del fiscal"}</span>
      </header>
      <ul className="rv-lista">
        {pendientes.map((r) => {
          const mias = misDe(r);
          const abierto = editando === r.modulo;
          return (
            <li key={r.modulo} className="rv-ub">
              <h3>{r.modulo}<span className="rv-ronda">Ronda {r.ronda}</span></h3>
              {r.nota && <p className="rv-nota"><b>Nota del fiscal:</b> {r.nota}</p>}
              {!abierto && (
                <>
                  {mias.length === 0 ? <p className="rv-vacio">En este módulo no tienes renglones con diferencia. Si crees que falta algo por anotar, usa «Contar de nuevo» y agrégalo.</p> : (
                    <ul className="rv-mios" aria-label={`Lo que anotaste en ${r.modulo}`}>
                      {mias.map((x) => (
                        <li key={x.id}><b>{x.sku}</b> {x.material}{[x.estado_envase, x.averia && "AVERÍA", x.pnc && "PNC"].filter(Boolean).length > 0 ? <> · {[x.estado_envase, x.averia && "AVERÍA", x.pnc && "PNC"].filter(Boolean).join(" · ")}</> : null}<br /><span>{textoCant(x)} = <b>{nf.format(Number(x.total_cajas))}</b> cajas
                          {x.venc_dia != null && <> · vence {dd(x.venc_dia)}/{dd(x.venc_mes)}/{dd(x.venc_anio)}</>}</span></li>
                      ))}
                    </ul>
                  )}
                  <div className="rv-acc">
                    <button type="button" className="btn" disabled={ocupado} onClick={() => enviar(r, null)}>Está bien, lo que conté es correcto</button>
                    <button type="button" className="btn plano" disabled={ocupado} onClick={() => abrirEditor(r)}>Contar de nuevo</button>
                  </div>
                </>
              )}
              {abierto && (
                <div className="rv-ed">
                  <input ref={camara} type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" hidden onChange={tomarFoto} />
                  <p>Estos son solo los renglones que no cuadran. Corrígelos, <b>quita</b> el que no deba estar o agrega uno que falte. Lo que cuadraba se queda como estaba.</p>
                  {mal && <p className="cl-mal" role="alert">{mal}</p>}
                  {rengs.map((x) => {
                    const mat = matDe(x.codigo);
                    const env = mat?.tipo_material === "ENVASE";
                    const cuenta = totalCajas(x, mat);
                    return (
                      <div key={x.k} className="rv-ren">
                        <label className="rv-w"><span>Código</span>
                          <input inputMode="numeric" value={x.codigo} placeholder="Teclea el código" onChange={(e) => ponRen(x.k, { codigo: e.target.value })} /></label>
                        <p className={"rv-desc" + (x.codigo && !mat ? " mal" : "")}>
                          {!x.codigo ? "Teclea el código y te digo qué es." : mat ? `✓ ${mat.nombre}${mat.cajas_por_estiba != null ? ` · ${mat.cajas_por_estiba} cajas/estiba` : ""}` : "Ese código no está en el maestro."}
                        </p>
                        <div className="rv-w">
                          <span className="fe-etiq-fecha">Vence{env ? " (sin fecha)" : ""}</span>
                          <div className="rv-fecha">
                            <input inputMode="numeric" maxLength={2} placeholder="DD" aria-label="Día" value={x.dia} onChange={(e) => ponRen(x.k, { dia: dos(e.target.value) })} />
                            <input inputMode="numeric" maxLength={2} placeholder="MM" aria-label="Mes" value={x.mes} onChange={(e) => ponRen(x.k, { mes: dos(e.target.value) })} />
                            <input inputMode="numeric" maxLength={2} placeholder="AA" aria-label="Año" value={x.anio} onChange={(e) => ponRen(x.k, { anio: dos(e.target.value) })} />
                          </div>
                        </div>
                        {pideEstadoFiscal(mat) && (
                          <div className="rv-modo rv-w" role="group" aria-label="Estado del envase">
                            {opcionesEstadoFiscal(mat).map((e) => (
                              <button key={e} type="button" className={x.estado === e ? "on" : ""} aria-pressed={x.estado === e}
                                      onClick={() => ponRen(x.k, { estado: x.estado === e ? "" : e })}>{e}</button>
                            ))}
                          </div>
                        )}
                        <div className="rv-modo rv-w" role="group" aria-label="Avería o PNC">
                          <button type="button" className={x.averia ? "on" : ""} aria-pressed={x.averia}
                                  onClick={() => ponRen(x.k, { averia: !x.averia, pnc: false, pncRotulo: null, pncBloqueo: null })}>Avería</button>
                          <button type="button" className={x.pnc ? "on" : ""} aria-pressed={x.pnc}
                                  onClick={() => ponRen(x.k, { pnc: !x.pnc, averia: false, pncRotulo: null, pncBloqueo: null })}>PNC</button>
                        </div>
                        {x.pnc && (
                          <>
                            <div className="rv-modo rv-w" role="group" aria-label="¿Tiene rótulo?">
                              <span>¿Tiene rótulo?</span>
                              <button type="button" className={x.pncRotulo === false ? "on" : ""} aria-pressed={x.pncRotulo === false} onClick={() => ponRen(x.k, { pncRotulo: false })}>No</button>
                              <button type="button" className={x.pncRotulo === true ? "on" : ""} aria-pressed={x.pncRotulo === true} onClick={() => ponRen(x.k, { pncRotulo: true })}>Sí</button>
                            </div>
                            <div className="rv-modo rv-w" role="group" aria-label="¿Tiene bloqueo mecánico?">
                              <span>¿Tiene bloqueo mecánico?</span>
                              <button type="button" className={x.pncBloqueo === false ? "on" : ""} aria-pressed={x.pncBloqueo === false} onClick={() => ponRen(x.k, { pncBloqueo: false })}>No</button>
                              <button type="button" className={x.pncBloqueo === true ? "on" : ""} aria-pressed={x.pncBloqueo === true} onClick={() => ponRen(x.k, { pncBloqueo: true })}>Sí</button>
                            </div>
                          </>
                        )}
                        <div className="rv-modo rv-w" role="group" aria-label="Qué cuentas">
                          <button type="button" className={x.modo === "estibas" ? "on" : ""} aria-pressed={x.modo === "estibas"} onClick={() => ponRen(x.k, { modo: "estibas" })}>Estibas</button>
                          <button type="button" className={x.modo === "cajas" ? "on" : ""} aria-pressed={x.modo === "cajas"} onClick={() => ponRen(x.k, { modo: "cajas" })}>Cajas</button>
                        </div>
                        {x.modo === "estibas" ? (
                          <>
                            <label><span>Estibas completas</span><input inputMode="numeric" value={x.estibas} onChange={(e) => ponRen(x.k, { estibas: e.target.value })} /></label>
                            <label><span>Saldo · cajas</span><input inputMode="numeric" value={x.saldo} onChange={(e) => ponRen(x.k, { saldo: e.target.value })} /></label>
                          </>
                        ) : (
                          <label className="rv-w"><span>Cajas</span><input inputMode="numeric" value={x.cajas} onChange={(e) => ponRen(x.k, { cajas: e.target.value })} /></label>
                        )}
                        <p className="rv-desc rv-w">{cuenta?.total != null ? <>Total: <b>{nf.format(cuenta.total)}</b> cajas</> : "Total: —"}</p>
                        <label className="rv-w"><span>Observación</span><input value={x.nota} placeholder="Opcional" onChange={(e) => ponRen(x.k, { nota: e.target.value })} /></label>
                        <div className="rv-w rv-foto">
                          <span>Foto{x.averia ? " (obligatoria en avería)" : " (opcional)"}</span>
                          {fotosNuevas[x.k] ? <p className="rv-desc">✓ Foto nueva tomada.</p>
                            : x.origen && fotosPrev[x.origen] ? <p className="rv-desc">✓ Conserva la foto que ya tenía.</p>
                            : <p className={"rv-desc" + (x.averia ? " mal" : "")}>{x.averia ? "Falta la foto." : "Sin foto."}</p>}
                          <div className="rv-acc">
                            <button type="button" className="btn plano" disabled={ocupado || sellando}
                                    onClick={() => { kDeFoto.current = x.k; camara.current?.click() }}>
                              {sellando ? "Preparando…" : fotosNuevas[x.k] || (x.origen && fotosPrev[x.origen]) ? "Cambiar foto" : "Tomar foto"}
                            </button>
                            {x.origen && fotosPrev[x.origen] && !fotosNuevas[x.k] && (
                              <button type="button" className="btn plano" disabled={ocupado} onClick={() => verFotoPrev(fotosPrev[x.origen as string])}>Ver foto</button>
                            )}
                          </div>
                        </div>
                        <button type="button" className="btn plano rv-w" disabled={ocupado} onClick={() => setRengs((l) => l.filter((y) => y.k !== x.k))}>Quitar este renglón</button>
                      </div>
                    );
                  })}
                  <div className="rv-acc">
                    <button type="button" className="btn plano" disabled={ocupado}
                            onClick={() => setRengs((l) => [...l, { ...VACIO_FISCAL, base: "x", lado: "x", ub: "", k: Math.max(-1, ...l.map((y) => y.k)) + 1 }])}>
                      Agregar un renglón
                    </button>
                  </div>
                  <div className="rv-acc">
                    <button type="button" className="btn" disabled={ocupado} onClick={() => enviarNuevo(r)}>
                      {rengs.length === 0 ? "Enviar: quitar estos renglones" : "Enviar mi nuevo conteo"}
                    </button>
                    <button type="button" className="btn plano" disabled={ocupado} onClick={() => { setEditando(null); setMal(null) }}>Cancelar</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {enviadas.map((r) => (
          <li key={r.modulo} className="rv-ub">
            <h3>{r.modulo}<span className="rv-ronda">Ronda {r.ronda}</span></h3>
            <p className="rv-enviada">Ya enviaste este módulo. Falta la aprobación del fiscal.</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
