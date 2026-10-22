"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MODULOS_DE_LA_HOJA } from "@/modulos/inventario/modulos-hoja";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type { FilaCruce } from "@/modulos/inventario/fiscal-cruce";

/* ===================================================================
   VALIDAR Y APROBAR LAS UBICACIONES DE UNA HOJA (lo hace el fiscal)

   1. Escoge las ubicaciones con diferencia y las MANDA A VALIDAR: las dos personas de la hoja
      reciben «revisa esta ubicación» (sin el número de su pareja). Cada vez que lo hace, la
      ubicación entra en una ronda nueva.
   2. Cada persona responde: «está bien» o vuelve a contar (lo nuevo reemplaza lo suyo).
   3. Cuando las dos respondieron, el cruce se actualiza solo y el fiscal APRUEBA con un clic.
      Si una persona no respondió, solo se aprueba forzando (se avisa antes).
   =================================================================== */
export type RevisionBD = {
  hoja_id: string; numero: number; ubicacion_id: string; ubicacion: string; estado: "A_VALIDAR" | "APROBADA";
  ronda: number; nota: string | null; ol_envio: boolean; bavaria_envio: boolean; pedido_en: string | null; aprobado_en: string | null;
  /** Si el módulo siguió difiriendo, el conteo que el fiscal dejó como definitivo. */
  adoptado?: "OL" | "BAVARIA" | null;
  /** El fiscal aprobó dando por compensadas las diferencias iguales y contrarias. */
  compensado?: boolean;
};

/** Lo que ya está en La base de esta hoja (inv_fiscal_consolidados). */
export type ConsolidadoBD = { hoja_id: string; numero: number; conteo: string; ubicaciones: number; renglones: number; cajas: number | string; enviado_en: string | null };

/* La validación es por CALLE Y MÓDULO (A01), nunca por lado: el lado es muy perceptivo y delataría dónde está cada cosa.
   Un módulo junta sus dos lados; el SQL expande al aprobar/validar. */
/** Lo que la gente marcó de un módulo en Contar: mezclado o sin acceso, con su foto de evidencia. */
type MarcaMod = { ubicacion_id: string; ubicacion: string; equipo: "OL" | "BAVARIA"; mezclado: boolean; sin_acceso: boolean; ruta: string | null; tomada_en: string | null };
type Ub = { id: string | null; clave: string; dif: boolean; comp: number; renglones: number; revs: RevisionBD[]; rev?: RevisionBD };
const orden = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
export const moduloDe = (clave: string) => clave.replace(/_(IZQ|DER)$/i, "");

export function ValidarHoja({ hojaId, numero, calle, filas, revs, consol, puedeEditar, ol, bavaria, onCambio, unaSola = null, compensando = false, cerrada = false, reabrir = [], onOkReabrir, cajaAbierta, onCaja, selExt, onSelExt }: {
  /** El fiscal pulsó «Compensar»: las diferencias compensadas no cuentan y al aprobar se manda p_compensar. */
  compensando?: boolean;
  /** El fiscal ya cerró esta hoja: nadie más cuenta en ella hasta que la reabra o pase a otra calle. */
  cerrada?: boolean;
  /** Quién terminó su hoja y si pidió reabrir / ya tiene el OK del fiscal. */
  reabrir?: { equipo: "OL" | "BAVARIA"; nombre: string; pidio: boolean; ok: boolean }[];
  onOkReabrir?: (equipo: "OL" | "BAVARIA", si: boolean) => Promise<string | null>;
  /** Ubicaciones marcadas desde las fichas de arriba (el panel las guarda para poder tocarlas ahí). */
  selExt?: Set<string>; onSelExt?: (s: Set<string>) => void;
  /** La caja de pasos puede abrirla desde fuera (la campanita). */
  cajaAbierta?: boolean; onCaja?: (v: boolean) => void;
  /** Nombre de la única persona que terminó (la otra aún no): no hay cruce y se aprueba confirmando. */
  unaSola?: string | null;
  hojaId: string | null; numero: number; calle?: string; filas: FilaCruce[]; revs: RevisionBD[]; consol?: ConsolidadoBD | null; puedeEditar: boolean;
  ol: string; bavaria: string; onCambio: () => Promise<void>;
}) {
  const [selInt, setSelInt] = useState<Set<string>>(new Set());
  const sel = selExt ?? selInt;
  const setSel = (v: Set<string> | ((s: Set<string>) => Set<string>)) => { const n = typeof v === "function" ? v(sel) : v; if (onSelExt) onSelExt(n); else setSelInt(n) };
  const [nota, setNota] = useState("");
  const [todas, setTodas] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [forzar, setForzar] = useState<Ub[] | null>(null);
  const [confUna, setConfUna] = useState<Ub[] | null>(null);
  /** Al aprobar un módulo que sigue difiriendo: de quién queda el conteo definitivo (null = ninguno, solo pasa si coinciden). */
  const [adoptar, setAdoptar] = useState<"OL" | "BAVARIA" | null>(null);
  const router = useRouter();
  const [nueva, setNueva] = useState("");
  const [mas, setMas] = useState(false);
  const [cajaInt, setCajaInt] = useState(false);
  const abierta = cajaAbierta ?? cajaInt;
  const setCaja = (v: boolean) => { if (onCaja) onCaja(v); else setCajaInt(v) };
  const [esperaCaja, setEsperaCaja] = useState(false);
  const [seguro, setSeguro] = useState(false);

  /* Lo que marcaron en Contar (mezclado / sin acceso). Si a la base le falta el SQL, simplemente no hay marcas. */
  const [marcas, setMarcas] = useState<MarcaMod[]>([]);
  useEffect(() => {
    if (!hojaId || !puedeEditar) { setMarcas([]); return }
    let vivo = true;
    void createClient().rpc("inv_fiscal_modulos_hoja", { p_hoja: hojaId }).then(({ data, error }) => {
      if (vivo) setMarcas(error ? [] : ((data ?? []) as MarcaMod[]));
    });
    return () => { vivo = false };
  }, [hojaId, puedeEditar, filas, revs]);
  async function verFoto(ruta: string) {
    const w = window.open("", "_blank");
    const { data, error } = await createClient().storage.from("inventario").createSignedUrl(ruta, 600);
    if (error || !data?.signedUrl) { w?.close(); setMal("No pude abrir la foto: " + (error?.message ?? "sin enlace")); return }
    if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  }
  const marcasDe = (clave: string) => marcas.filter((m) => moduloDe(m.ubicacion) === clave);

  const ubs = useMemo<Ub[]>(() => {
    const porClave = new Map<string, Ub>();
    for (const f of filas) {
      const m = moduloDe(f.ubicacion);
      const u = porClave.get(m) ?? { id: f.ubicacionId ?? null, clave: m, dif: false, comp: 0, renglones: 0, revs: [] };
      u.renglones++;
      if (f.estado !== "COINCIDE" && !f.compensada) u.dif = true;
      if (f.compensada) u.comp++;
      if (!u.id && f.ubicacionId) u.id = f.ubicacionId;
      porClave.set(m, u);
    }
    for (const r of revs.filter((x) => x.numero === numero)) {
      const m = moduloDe(r.ubicacion);
      const u = porClave.get(m) ?? { id: r.ubicacion_id, clave: m, dif: false, comp: 0, renglones: 0, revs: [] };
      if (!u.id) u.id = r.ubicacion_id;
      u.revs.push(r);
      porClave.set(m, u);
    }
    /* Un módulo marcado «sin acceso» puede no tener renglones: igual se muestra, para que el fiscal lo decida. */
    for (const mk of marcas) {
      const m = moduloDe(mk.ubicacion);
      const u = porClave.get(m) ?? { id: mk.ubicacion_id, clave: m, dif: false, comp: 0, renglones: 0, revs: [] };
      if (mk.sin_acceso && u.renglones === 0) u.dif = true;
      if (!u.id) u.id = mk.ubicacion_id;
      porClave.set(m, u);
    }
    /* Estado del módulo = lo que dicen sus lados juntos. */
    for (const u of porClave.values()) {
      if (u.revs.length === 0) continue;
      const abiertas = u.revs.filter((r) => r.estado === "A_VALIDAR");
      if (abiertas.length === 0) { u.rev = u.revs[0]; continue }
      u.rev = {
        ...abiertas[0],
        ronda: Math.max(...abiertas.map((r) => r.ronda)),
        ol_envio: abiertas.every((r) => r.ol_envio),
        bavaria_envio: abiertas.every((r) => r.bavaria_envio),
        nota: abiertas.find((r) => r.nota)?.nota ?? null,
      };
    }
    return [...porClave.values()].sort((a, b) => orden(a.clave, b.clave));
  }, [filas, revs, numero, marcas]);

  /* En validación: falta que respondan. Cuando las dos personas ya respondieron: si ahora coincide, es verde; si aún difiere, decide el fiscal. */
  const estado = (u: Ub): "aprobada" | "validando" | "respondida" | "difiere" | "compensada" | "coincide" =>
    u.rev?.estado === "APROBADA" ? "aprobada"
      : u.rev?.estado === "A_VALIDAR" ? (!u.dif ? (u.comp > 0 ? "compensada" : "coincide") : u.rev.ol_envio && u.rev.bavaria_envio ? "respondida" : "validando")
      : u.dif ? "difiere" : u.comp > 0 ? "compensada" : "coincide";
  const TEXTO = { aprobada: "Aprobada", validando: "En validación", respondida: "Respondieron · decide el fiscal", difiere: "Difiere", compensada: "Compensada", coincide: "Coincide" } as const;

  const nAprobadas = ubs.filter((u) => estado(u) === "aprobada").length;
  const visibles = ubs.filter((u) => todas || estado(u) !== "coincide");
  const coincidenSinAprobar = ubs.filter((u) => estado(u) === "coincide");
  const marcadas = ubs.filter((u) => sel.has(u.clave));
  /* Todo en verde: lo que falta por aprobar coincide por completo (nada difiere, nada espera respuesta). */
  /* Lo compensado también es verde: cuadra en total, y se aprueba junto con lo que coincide. */
  const porAprobar = ubs.filter((u) => estado(u) === "coincide" || estado(u) === "compensada");
  const todoVerde = porAprobar.length > 0 && ubs.every((u) => ["coincide", "compensada", "aprobada"].includes(estado(u)));
  /* El sitio junto al título de la hoja (lo pone el panel): ahí va el check de aprobar, para verlo de una. */
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [slotSel, setSlotSel] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlot(document.getElementById(`vf-acc-h${numero}`)); setSlotSel(document.getElementById(`vf-sel-h${numero}`)) }, [numero]);

  const alternar = (c: string) => setSel((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n });
  const marcar = (f: (u: Ub) => boolean) => setSel(new Set(ubs.filter(f).map((u) => u.clave)));

  async function correr(fn: "inv_fiscal_validar" | "inv_fiscal_aprobar", lista: Ub[], extra: Record<string, unknown>, listo: string) {
    setMal(null); setOk(null);
    const ids = lista.map((u) => u.id).filter((x): x is string => !!x);
    if (!hojaId || ids.length === 0 || ids.length !== lista.length) { setMal("No se pudo identificar la hoja o alguna ubicación. Actualiza la pantalla e intenta de nuevo."); return }
    setOcupado(true);
    const { error } = await createClient().rpc(fn, { p_hoja: hojaId, p_ubicaciones: ids, ...extra });
    setOcupado(false);
    if (error) { setMal(traducirError(error.message)); return }
    setOk(listo);
    setSel(new Set()); setForzar(null); setConfUna(null);
    if (fn === "inv_fiscal_validar") setNota("");
    /* Al aprobar, lo aprobado y coincidente se manda solo a La base (si falta el SQL de consolidar, se aprueba igual). */
    if (fn === "inv_fiscal_aprobar") {
      const c = await consolidar();
      if (c) setOk(`${listo} ${c}`);
      setEsperaCaja(true); setTimeout(() => setEsperaCaja(false), 8000);
    }
    await onCambio();
  }

  /** Manda a La base lo aprobado y coincidente de esta hoja. Devuelve el mensaje, o null si falta el SQL. */
  async function consolidar(): Promise<string | null> {
    if (!hojaId) return null;
    const { data, error } = await createClient().rpc("inv_fiscal_consolidar", { p_hoja: hojaId });
    if (error) {
      if (/inv_fiscal_consolidar|schema cache|does not exist|no existe la funci/i.test(error.message)) return null;
      if (/no hay nada que consolidar/i.test(error.message)) return "Todavía no hay nada aprobado que coincida para mandar a La base.";
      setMal(traducirError(error.message)); return null;
    }
    const r = ((data ?? []) as { ubicaciones: number; renglones: number; sin_consolidar: number; conteo: string }[])[0];
    if (!r) return null;
    return `En La base (${r.conteo}): ${r.ubicaciones} ${r.ubicaciones === 1 ? "ubicación" : "ubicaciones"}, ${r.renglones} ${r.renglones === 1 ? "renglón" : "renglones"}.` +
      (r.sin_consolidar > 0 ? ` ${r.sin_consolidar} aprobada${r.sin_consolidar === 1 ? "" : "s"} no se mandó porque aún difiere.` : "");
  }
  async function consolidarYa() {
    setMal(null); setOk(null); setOcupado(true);
    const m = await consolidar();
    setOcupado(false);
    setOk(m ?? "Falta correr 2026-10-fiscal-consolidar.sql en Supabase.");
    await onCambio();
  }

  const validar = () => correr("inv_fiscal_validar", marcadas, { p_nota: nota.trim() || null },
    `${marcadas.length} ${marcadas.length === 1 ? "ubicación enviada" : "ubicaciones enviadas"} a validar. Las dos personas ya la ven en Contar.`);

  function aprobar(lista: Ub[], forzando = false, quedaCon: "OL" | "BAVARIA" | null = adoptar) {
    setAdoptar(quedaCon);
    /* Con una sola persona no hay cruce: se pide confirmar antes de aprobar. */
    if (unaSola && !forzando) { setConfUna(lista); return }
    /* Si ya no difiere (coincide o quedó compensado) no hace falta esperar la respuesta: se aprueba directo. */
    const sinRespuesta = lista.filter((u) => u.rev?.estado === "A_VALIDAR" && !(u.rev.ol_envio && u.rev.bavaria_envio));
    const faltan = sinRespuesta.filter((u) => u.dif);
    const forzarSrv = forzando || sinRespuesta.length > faltan.length;
    if (faltan.length > 0 && !forzando) { setForzar(faltan); return }
    void correr("inv_fiscal_aprobar", lista, { p_forzar: forzarSrv, ...(quedaCon ? { p_adoptar: quedaCon } : {}), ...(compensando ? { p_compensar: true } : {}) },
      `${lista.length} ${lista.length === 1 ? "ubicación aprobada" : "ubicaciones aprobadas"}${quedaCon ? `, dejando como definitivo lo de ${quedaCon === "OL" ? (ol || "el operador") : (bavaria || "Bavaria")}` : ""}.`);
  }

  async function cerrarHoja(abrir: boolean) {
    setMal(null); setOk(null);
    if (!hojaId) return;
    setOcupado(true);
    const { error } = await createClient().rpc(abrir ? "inv_fiscal_reabrir_hoja" : "inv_fiscal_cerrar_hoja", { p_hoja: hojaId });
    setOcupado(false);
    if (error) {
      setMal(/inv_fiscal_cerrar_hoja|inv_fiscal_reabrir_hoja|schema cache|does not exist|no existe la funci/i.test(error.message) ? "Falta correr 2026-10-fiscal-TODO.sql en Supabase." : traducirError(error.message));
      return;
    }
    /* Al reabrir, quien ya había pedido reabrir su hoja recibe el OK en el mismo paso. */
    if (abrir && onOkReabrir) for (const r of reabrir.filter((x) => x.pidio && !x.ok)) await onOkReabrir(r.equipo, true);
    setOk(abrir ? "Hoja reabierta: las dos personas pueden volver a contar." : "Hoja cerrada: lo aprobado quedó en La base y nadie más cuenta en ella.");
    await onCambio();
    router.refresh();
  }

  /* SIGUIENTE CALLE: solo cuando no queda nada por validar ni con diferencia sin aprobar. */
  const hayAbierto = ubs.some((u) => ["difiere", "validando", "respondida"].includes(estado(u)));
  const estiloCheck = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "10px 18px", border: 0, borderRadius: 0,
    fontSize: "1rem", fontWeight: 800 } as const;
  const iconoCheck = <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="square" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6.5" /></svg>;
  /* Todo en verde: UN clic aprueba a las dos personas a la vez. */
  const botonAprobar = puedeEditar && todoVerde ? (
    <button type="button" disabled={ocupado} onClick={() => aprobar(porAprobar, false, null)}
            title="Aprueba a las dos personas de una vez; lo aprobado pasa a La base"
            style={{ ...estiloCheck, background: "#0b7a3e", color: "#fff", cursor: ocupado ? "wait" : "pointer", opacity: ocupado ? 0.7 : 1 }}>
      {iconoCheck} Aprobar {porAprobar.length === 1 ? "la ubicación" : `las ${porAprobar.length} ubicaciones`}
    </button>
  ) : null;
  const listoParaCerrar = puedeEditar && !hayAbierto && porAprobar.length === 0 && nAprobadas > 0;
  const nPidieron = reabrir.filter((r) => r.pidio && !r.ok).length;
  /* Aprobado todo, se abre sola la caja de pasos (La base · cerrar · siguiente calle · reabrir). */
  useEffect(() => {
    if (esperaCaja && listoParaCerrar) { setCaja(true); setEsperaCaja(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esperaCaja, listoParaCerrar]);
  const botonCaja = puedeEditar && !botonAprobar && (listoParaCerrar || cerrada || nPidieron > 0) ? (
    <button type="button" onClick={() => setCaja(true)} title="Abre los pasos de la hoja: La base, cerrar, siguiente calle y reabrir"
            style={{ ...estiloCheck, background: cerrada ? "transparent" : "#0b7a3e", color: cerrada ? "#0b7a3e" : "#fff", boxShadow: cerrada ? "inset 0 0 0 2px #0b7a3e" : "none", cursor: "pointer" }}>
      {iconoCheck} {cerrada ? "Hoja cerrada · Pasos" : listoParaCerrar ? "Aprobada · Siguiente paso" : `${nPidieron} ${nPidieron === 1 ? "pidió" : "pidieron"} reabrir`}
    </button>
  ) : null;
  const botones = (botonAprobar || botonCaja) ? <>{botonAprobar}{botonCaja}</> : null;
  /* Se ofrece también la calle actual: sirve para seguir contando lo que falta de ella (la hoja se reabre para las dos personas). */
  const otras = Object.keys(MODULOS_DE_LA_HOJA);
  async function siguienteCalle() {
    setMal(null); setOk(null);
    if (!hojaId || !nueva) { setMal("Escoge la calle a la que pasan."); return }
    setOcupado(true);
    const { error } = await createClient().rpc("inv_fiscal_siguiente_calle", { p_hoja: hojaId, p_calle: nueva });
    setOcupado(false);
    if (error) { setMal(traducirError(error.message)); return }
    setOk(`La hoja pasó a la calle ${nueva}. Las dos personas la ven reabierta en Contar.`);
    setSeguro(false); setNueva(""); setCaja(false);
    await onCambio();
    router.refresh();
  }

  /* ── LA CAJA DE PASOS: lo que sigue después de aprobar, en un solo lugar y en orden ── */
  const [okReab, setOkReab] = useState<string | null>(null);
  async function okReabrir(eq: "OL" | "BAVARIA", si: boolean) {
    if (!onOkReabrir) return;
    setOkReab(null); setOcupado(true);
    const m = await onOkReabrir(eq, si);
    setOcupado(false);
    if (m) setOkReab(m);
  }
  const bloqueada = hayAbierto || ubs.length === 0;
  const textoBase = consol
    ? `${consol.ubicaciones} ${consol.ubicaciones === 1 ? "ubicación" : "ubicaciones"} · ${consol.renglones} ${consol.renglones === 1 ? "renglón" : "renglones"} · ${Number(consol.cajas).toLocaleString("es-CO")} cajas`
    : "Todavía no se manda nada.";
  const caja = abierta && typeof document !== "undefined" ? createPortal(
    <div className="vvc-velo" onClick={() => setCaja(false)}>
      <div className="vvc" role="dialog" aria-modal="true" aria-label={`Pasos de la hoja ${numero}`} onClick={(e) => e.stopPropagation()}>
        <header className="vvc-cab">
          <b>Hoja {numero}{calle ? ` · calle ${calle}` : ""}</b>
          <button type="button" onClick={() => setCaja(false)} aria-label="Cerrar esta ventana">✕</button>
        </header>
        <div className="vvc-cuerpo">
          {(mal || ok) && <p className={mal ? "vvc-msg mal" : "vvc-msg"} role={mal ? "alert" : "status"}>{mal ?? ok}</p>}

          <section className="vvc-paso">
            <span className={"vvc-n" + (bloqueada ? "" : " ok")}>{bloqueada ? "1" : "✓"}</span>
            <div><b>Validado</b><p>{bloqueada ? "Faltan ubicaciones por aprobar en esta hoja." : `${nAprobadas} de ${ubs.length} ubicaciones aprobadas.`}</p></div>
          </section>

          <section className="vvc-paso">
            <span className={"vvc-n" + (consol ? " ok" : "")}>{consol ? "✓" : "2"}</span>
            <div><b>En La base</b><p>{textoBase}</p></div>
            {puedeEditar && <button type="button" className="vvc-b" disabled={ocupado || nAprobadas === 0} onClick={consolidarYa}>Actualizar</button>}
          </section>

          <section className="vvc-paso vvc-dos">
            <span className="vvc-n">3</span>
            <div className="vvc-opc">
              <b>Y ahora, ¿qué sigue?</b>
              <div className="vvc-cols">
                <div className="vvc-col">
                  <small>Seguir con otra calle</small>
                  <select value={nueva} disabled={bloqueada || ocupado} onChange={(e) => { setNueva(e.target.value); setSeguro(false) }} aria-label="Calle a la que pasan">
                    <option value="">Escoge la calle…</option>
                    {otras.map((c) => <option key={c} value={c}>Calle {c}{c === (calle ?? "") ? " (la actual)" : ""}</option>)}
                  </select>
                  {!seguro ? (
                    <button type="button" className="vvc-b" disabled={bloqueada || ocupado || !nueva} onClick={() => setSeguro(true)}>Pasar a esa calle</button>
                  ) : (
                    <div className="vvc-conf">
                      <button type="button" className="vvc-b fuerte" disabled={ocupado} onClick={siguienteCalle}>Sí, pasar a la calle {nueva}</button>
                      <button type="button" className="vvc-b" onClick={() => setSeguro(false)}>No</button>
                    </div>
                  )}
                  <p>La misma hoja cambia de calle y las dos personas la ven reabierta. Lo de esta calle se conserva.</p>
                </div>
                <div className="vvc-col">
                  <small>Terminar el conteo</small>
                  {cerrada ? (
                    <>
                      <p className="vvc-ok">Hoja cerrada ✓ · nadie más cuenta en ella.</p>
                      <button type="button" className="vvc-b" disabled={ocupado} onClick={() => cerrarHoja(true)}>Reabrir la hoja</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="vvc-b fuerte" disabled={!listoParaCerrar || ocupado} onClick={() => cerrarHoja(false)}>Cerrar la hoja</button>
                      <p>{listoParaCerrar ? "Lo aprobado queda en La base y nadie más cuenta en esta hoja." : "Se puede cerrar cuando todo esté aprobado."}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>

          {reabrir.length > 0 && (
            <section className="vvc-reab">
              <b>Reabrir a las personas</b>
              <p>Una hoja terminada solo se reabre con tu OK; esa persona la reabre desde Contar y vuelve a terminar.</p>
              {okReab && <p className="vvc-msg mal" role="alert">{okReab}</p>}
              <ul>
                {reabrir.map((r) => (
                  <li key={r.equipo}>
                    <span>{r.pidio && !r.ok && <i className="vvc-camp" title="Pidió reabrir">🔔</i>}<b>{r.nombre}</b> <small>{r.ok ? "· OK dado" : r.pidio ? "· pidió reabrir su hoja" : "· hoja terminada"}</small></span>
                    {puedeEditar && (r.ok
                      ? <button type="button" className="vvc-b" disabled={ocupado} onClick={() => okReabrir(r.equipo, false)}>Quitar el OK</button>
                      : <button type="button" className={"vvc-b" + (r.pidio ? " fuerte" : "")} disabled={ocupado} onClick={() => okReabrir(r.equipo, true)}>Dar el OK</button>)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>, document.body) : null;

  const quien = (u: Ub) => {
    if (u.rev?.estado !== "A_VALIDAR") return null;
    const r = u.rev;
    return (
      <small className="vv-resp">
        Ronda {r.ronda} · {ol || "Operador"} {r.ol_envio ? "✓ respondió" : "… falta"} · {bavaria || "Bavaria"} {r.bavaria_envio ? "✓ respondió" : "… falta"}
      </small>
    );
  };

  return (
    <div className="vv">
      <style>{`
        .vv .vv-cab{padding:6px 12px;font-size:.78rem;min-height:0}
        .vv .vv-cab b{font-size:.78rem;letter-spacing:.04em}
        .vv .btn{padding:4px 10px;font-size:.78rem;min-height:0;line-height:1.3}
        .vv .vv-mas{border-bottom:1px solid rgba(127,127,127,.25)}
        .vv .vv-mas>summary{cursor:pointer;padding:6px 12px;font-size:.76rem;opacity:.75;list-style:none}
        .vv .vv-mas>summary::before{content:"▸ "}
        .vv .vv-mas[open]>summary::before{content:"▾ "}
        .vv .vv-mas[open]:not(.vv-compacto)>summary{display:none}
        .vv .vv-barra{padding:8px 12px;display:flex;flex-direction:column;gap:8px}
        .vv .vv-fila1,.vv .vv-fila2{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .vv .vv-et{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;opacity:.65;margin-right:2px}
        .vv .vv-fila2 input{flex:1 1 220px;padding:4px 8px;font-size:.78rem;min-height:0}
        .vv .vv-otros{position:relative}
        .vv .vv-otros>summary{list-style:none;cursor:pointer;display:inline-block}
        .vv .vv-otros>summary::-webkit-details-marker,.vv .vv-mas>summary::-webkit-details-marker{display:none}
        .vv .vv-menu{position:absolute;right:0;top:100%;z-index:5;display:flex;flex-direction:column;gap:4px;padding:6px;background:var(--fondo,#fff);border:1px solid rgba(127,127,127,.4);box-shadow:0 4px 12px rgba(0,0,0,.15);min-width:230px}
        .vv .vv-sig{padding:5px 12px;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;margin:0;border:0;border-top:1px solid rgba(127,127,127,.25);background:transparent}
        .vv .vv-sig b{font-size:.74rem;text-transform:uppercase;letter-spacing:.05em}
        .vv .vv-sig p{margin:0;font-size:.74rem;opacity:.75;flex:1 1 auto}
        .vv .vv-sig select{padding:3px 6px;font-size:.78rem;min-height:0}
        .vv .vv-sig .vv-acc{display:flex;gap:6px;align-items:center;margin-left:auto}
        .vv .vv-base{border-left:3px solid #0b7a3e}
        .vv .cl-nota{font-size:.74rem;margin:4px 12px}
        .vv .vv-detalle>summary{cursor:pointer;padding:8px 12px;font-size:.8rem;list-style:none;border-bottom:1px solid rgba(127,127,127,.25)}
        .vv .vv-detalle>summary::-webkit-details-marker{display:none}
        .vv .vv-detalle>summary::before{content:"▸ "}
        .vv .vv-detalle[open]>summary::before{content:"▾ "}
        .vvs{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;padding:8px 10px;margin:8px 0;border:1px solid #b71c1c;background:rgba(183,28,28,.06)}
        .vvs b{font-size:.8rem}
        .vvs input{flex:1 1 220px;padding:4px 8px;font-size:.78rem;min-height:0;border-radius:0}
        .vvs .btn{padding:4px 12px;font-size:.78rem;min-height:0;border-radius:0}
        .vvc-velo{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}
        .vvc{width:min(580px,100%);max-height:92vh;overflow:auto;background:var(--c-fdfdff,#fff);color:var(--c-04203f,#1a1a1a);border-radius:0;box-shadow:0 18px 50px rgba(0,0,0,.35)}
        .vvc-cab{display:flex;align-items:center;justify-content:space-between;background:#111;color:#fff;padding:12px 16px;font-size:.95rem;letter-spacing:.02em}
        .vvc-cab button{background:transparent;border:0;color:#fff;font-size:1.1rem;cursor:pointer;padding:2px 8px}
        .vvc-cuerpo{padding:4px 0 8px}
        .vvc-paso{display:flex;gap:14px;align-items:flex-start;padding:14px 16px;border-bottom:1px solid rgba(127,127,127,.22)}
        .vvc-paso>div{flex:1;min-width:0}
        .vvc-paso b{font-size:.92rem}
        .vvc-paso p{margin:2px 0 0;font-size:.78rem;opacity:.72}
        .vvc-n{flex:0 0 28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid currentColor;font-size:.82rem;font-weight:800;opacity:.55}
        .vvc-n.ok{background:#0b7a3e;border-color:#0b7a3e;color:#fff;opacity:1}
        .vvc-b{padding:7px 14px;font-size:.8rem;font-weight:700;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;border-radius:0;white-space:nowrap}
        .vvc-b:disabled{opacity:.4;cursor:not-allowed}
        .vvc-b.fuerte{background:#0b7a3e;border-color:#0b7a3e;color:#fff}
        .vvc-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:10px}
        .vvc-col{display:flex;flex-direction:column;gap:8px;align-items:stretch;padding-left:12px;border-left:2px solid rgba(127,127,127,.3)}
        .vvc-col small{font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;opacity:.65}
        .vvc-col select{padding:7px 8px;font-size:.82rem;border-radius:0}
        .vvc-conf{display:flex;gap:6px;flex-wrap:wrap}
        .vvc-ok{color:#0b7a3e;font-weight:700}
        .vvc-reab{padding:14px 16px}
        .vvc-reab p{margin:2px 0 8px;font-size:.76rem;opacity:.7}
        .vvc-reab ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
        .vvc-reab li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border:1px solid rgba(127,127,127,.3)}
        .vvc-camp{font-style:normal;margin-right:6px}
        .vvc-msg{margin:10px 16px 0;padding:8px 10px;font-size:.8rem;border-left:3px solid #0b7a3e;background:rgba(11,122,62,.08)}
        .vvc-msg.mal{border-left-color:#b71c1c;background:rgba(183,28,28,.08)}
        @media (max-width:560px){.vvc-cols{grid-template-columns:1fr}}
      `}</style>
      {slot && botones && createPortal(botones, slot)}
      {slotSel && puedeEditar && sel.size > 0 && createPortal(
        <div className="vvs">
          <b>{sel.size} {sel.size === 1 ? "ubicación marcada" : "ubicaciones marcadas"}</b>
          <input value={nota} maxLength={200} placeholder="Nota para las dos personas (opcional)" aria-label="Nota para las dos personas" onChange={(e) => setNota(e.target.value)} />
          <button type="button" className="btn" disabled={ocupado || marcadas.length === 0 || !!unaSola} onClick={validar}
                  title={unaSola ? "Se manda a recontar cuando las dos personas terminen" : "Las dos personas vuelven a contar solo lo marcado y se comparan otra vez"}>
            Recontar y validar ({marcadas.length})
          </button>
          <button type="button" className="btn" disabled={ocupado || marcadas.length === 0} onClick={() => aprobar(marcadas, false, null)} style={{ background: "#0b7a3e", color: "#fff", borderColor: "#0b7a3e" }}>
            Aprobar ({marcadas.length})
          </button>
          <button type="button" className="btn plano" onClick={() => setSel(new Set())}>Quitar marcas</button>
        </div>, slotSel)}
      <header className="vv-cab">
        <b>Validar y aprobar</b>
        <span>{nAprobadas} de {ubs.length} {ubs.length === 1 ? "ubicación aprobada" : "ubicaciones aprobadas"}</span>
      </header>

      {puedeEditar && (
        <details className={"vv-mas" + (listoParaCerrar || cerrada ? " vv-compacto" : "")} open={!(listoParaCerrar || cerrada) || mas} onToggle={(e) => setMas(e.currentTarget.open)}>
          <summary>Marcar y validar a mano</summary>
          <div className="vv-barra">
            {!slot && botones}
            <div className="vv-fila1">
              <span className="vv-et">Marcar</span>
              <button type="button" className="btn plano" onClick={() => marcar((u) => estado(u) === "difiere")}>Las que difieren</button>
              <button type="button" className="btn plano" onClick={() => marcar((u) => estado(u) === "respondida")}>Las ya respondidas</button>
              {compensando && ubs.some((u) => estado(u) === "compensada") && (
                <button type="button" className="btn plano" onClick={() => marcar((u) => estado(u) === "compensada")}>Las compensadas</button>
              )}
              {sel.size > 0 && <button type="button" className="btn plano" onClick={() => setSel(new Set())}>Quitar marcas ({sel.size})</button>}
            </div>
            <div className="vv-fila2">
              <input value={nota} maxLength={200} placeholder="Nota para las dos personas (opcional)" aria-label="Nota para las dos personas" onChange={(e) => setNota(e.target.value)} />
              <button type="button" className="btn" disabled={ocupado || marcadas.length === 0 || !!unaSola} title={unaSola ? "Se manda a validar cuando las dos personas terminen" : "Las dos personas vuelven a contar lo marcado"} onClick={validar}>
                Recontar y validar{marcadas.length > 0 ? ` (${marcadas.length})` : ""}
              </button>
              <button type="button" className="btn" disabled={ocupado || marcadas.length === 0} onClick={() => aprobar(marcadas, false, null)}>
                Aprobar{marcadas.length > 0 ? ` (${marcadas.length})` : ""}
              </button>
              {(!unaSola || (coincidenSinAprobar.length > 0 && !todoVerde)) && (
                <details className="vv-otros">
                  <summary className="btn plano">Más</summary>
                  <div className="vv-menu">
                    {!unaSola && (
                      <>
                        <button type="button" className="btn plano" disabled={ocupado || marcadas.length === 0} onClick={() => aprobar(marcadas, false, "OL")}
                                title="Si el módulo sigue difiriendo, queda como definitivo lo que contó el operador y pasa a La base">
                          Aprobar con lo de {ol || "el operador"}
                        </button>
                        <button type="button" className="btn plano" disabled={ocupado || marcadas.length === 0} onClick={() => aprobar(marcadas, false, "BAVARIA")}
                                title="Si el módulo sigue difiriendo, queda como definitivo lo que contó Bavaria y pasa a La base">
                          Aprobar con lo de {bavaria || "Bavaria"}
                        </button>
                      </>
                    )}
                    {coincidenSinAprobar.length > 0 && !todoVerde && (
                      <button type="button" className="btn plano" disabled={ocupado} onClick={() => aprobar(coincidenSinAprobar, false, null)}>
                        Aprobar las {coincidenSinAprobar.length} que coinciden
                      </button>
                    )}
                  </div>
                </details>
              )}
            </div>
          </div>
        </details>
      )}

      {unaSola && (
        <p className="cl-nota" role="note">Solo terminó {unaSola}. Todavía no hay cruce: puedes aprobar módulos con su conteo, sin que los compare la otra persona.</p>
      )}
      {confUna && (
        <div className="cl-mal vv-forzar" role="alert">
          <p>Solo terminó {unaSola}. Si apruebas {confUna.map((u) => u.clave).join(", ")}, pasa a La base con el conteo de una sola persona, sin cruce. ¿Aprobar de todos modos?</p>
          <div className="cl-botones">
            <button type="button" className="btn plano mal" disabled={ocupado} onClick={() => aprobar(confUna, true, null)}>Sí, aprobar con una sola persona</button>
            <button type="button" className="btn plano" onClick={() => setConfUna(null)}>No, esperar a la otra</button>
          </div>
        </div>
      )}
      {forzar && (
        <div className="cl-mal vv-forzar" role="alert">
          <p>Todavía falta la respuesta de alguna persona en {forzar.map((u) => u.clave).join(", ")}. Lo normal es avisarle antes. ¿Aprobar de todos modos?</p>
          <div className="cl-botones">
            <button type="button" className="btn plano mal" disabled={ocupado} onClick={() => aprobar(marcadas, true, adoptar)}>Sí, aprobar sin su respuesta</button>
            <button type="button" className="btn plano" onClick={() => setForzar(null)}>No, esperar</button>
          </div>
        </div>
      )}
      {mal && <p className="cl-mal" role="alert">{mal}</p>}
      {ok && <p className="cl-ok" role="status">{ok}</p>}

      <details className="vv-detalle" open={hayAbierto || todas}>
        <summary>{hayAbierto ? "Ubicaciones por resolver" : `Ver las ${nAprobadas} ${nAprobadas === 1 ? "ubicación aprobada" : "ubicaciones aprobadas"}`}</summary>
      <ul className="vv-lista">
        {visibles.map((u) => {
          const e = estado(u);
          return (
            <li key={u.clave} className={"vv-fila " + e} style={e === "respondida" ? { boxShadow: "inset 6px 0 0 #b7791f", background: "rgba(183,121,31,.08)" } : e === "compensada" ? { boxShadow: "inset 6px 0 0 #0b7a3e", background: "rgba(11,122,62,.08)" } : undefined}>
              {puedeEditar ? (
                <label className="vv-chk"><input type="checkbox" checked={sel.has(u.clave)} onChange={() => alternar(u.clave)} /><b>{u.clave}</b></label>
              ) : <b className="vv-chk">{u.clave}</b>}
              <i className={"vv-e " + e} style={e === "respondida" ? { background: "#b7791f", color: "#fff" } : e === "compensada" ? { background: "#0b7a3e", color: "#fff" } : undefined}>{e === "compensada" ? "✓ Compensada" : TEXTO[e]}</i>
              {quien(u)}
              {u.rev?.estado === "APROBADA" && u.rev.adoptado && (
                <small className="vv-resp">Definitivo: lo que contó {u.rev.adoptado === "OL" ? (ol || "el operador") : (bavaria || "Bavaria")}</small>
              )}
              {u.rev?.estado === "APROBADA" && u.rev.compensado && (
                <small className="vv-resp">Aprobado dando por compensadas las diferencias iguales y contrarias del módulo</small>
              )}
              {u.rev?.estado === "A_VALIDAR" && u.rev.nota && <small className="vv-resp">Nota: {u.rev.nota}</small>}
              {marcasDe(u.clave).map((m) => (
                <small key={m.ubicacion + m.equipo} className="vv-resp vv-marca">
                  <b>{m.sin_acceso ? "SIN ACCESO" : "MEZCLADO"}</b> · {m.equipo === "OL" ? (ol || "Operador") : (bavaria || "Bavaria")}
                  {m.ruta && <> · <button type="button" className="fe-mini" onClick={() => verFoto(m.ruta as string)}>Ver foto</button></>}
                </small>
              ))}
            </li>
          );
        })}
        {visibles.length === 0 && <li className="vv-fila"><span>Todas las ubicaciones coinciden.</span></li>}
      </ul>
      </details>
      {caja}
      {ubs.some((u) => estado(u) === "coincide") && (
        <button type="button" className="btn plano vv-todas" aria-pressed={todas} onClick={() => setTodas(!todas)}>
          {todas ? "Ocultar las que coinciden" : `Ver también las ${ubs.filter((u) => estado(u) === "coincide").length} que coinciden`}
        </button>
      )}
    </div>
  );
}
