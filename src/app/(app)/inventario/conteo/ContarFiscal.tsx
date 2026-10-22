"use client";

/* ===================================================================
   CONTAR · LA HOJA DEL INVENTARIO FISCAL

   «Debería aparecer la opción de fiscal y de una un toolbox para contar.»

   Es el mismo renglón del conteo diario —dónde, qué, vence, cuánto— y se ve
   igual a propósito: quien cuenta el fiscal ya sabe contar el FEFO. Cambia lo
   que se guarda y a dónde va:

     · Es un conteo APARTE, atado a la hoja de esta persona. No entra en La base
       ni en el Tablero.
     · A CIEGAS. Cada persona de la pareja ve solo lo suyo; el cruce entre los
       dos es un paso posterior.
     · Cada renglón se guarda al momento, con su nombre. Sin cola de señal: si no
       hay red, avisa y el renglón sigue en pantalla para volver a darle «Anotar».
     · El cero cuenta: contar que ahí no hay nada es un dato.
     · Quitar un renglón es de quien lo anotó, mientras el inventario siga abierto.
     · «TERMINÉ MI HOJA»: cuando la persona termina de contar avisa, y desde ahí no
       anota ni quita nada hasta que REABRA su hoja. Cuando las dos personas de
       la pareja terminan, quien arma el plan puede cruzar (pantalla «Inventario
       fiscal»). Aquí solo se sabe SI la pareja terminó, nunca lo que contó.
   =================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Buscador } from "@/components/Buscador";
import { RevisionesFiscal } from "./RevisionesFiscal";
import { useConfirmar } from "@/components/Confirmar";
import { useAvisos } from "@/components/Aviso";
import type { Material, Ubicacion } from "@/modulos/inventario/fefo";
import { MODULOS_DE_LA_HOJA, moduloConLados, modulosQueFaltan } from "@/modulos/inventario/modulos-hoja";
import { fechaConDia, type HojaParaContar } from "@/modulos/inventario/fiscal";
import {
  VACIO_FISCAL, argumentosFiscal, revisarFiscal, totalCajas, pideEstadoFiscal, esCilindroFiscal, opcionesEstadoFiscal,
  type BorradorFiscal, type RenglonFiscal,
} from "@/modulos/inventario/fiscal-contar";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const claveBase = (u: { calle: string; modulo: string }) => `${u.calle}|${u.modulo}`;
const ordenCalle = (a: string, b: string) => {
  const suelta = (x: string) => (x.length === 1 ? 0 : 1);
  return suelta(a) - suelta(b) || a.localeCompare(b, "es", { numeric: true });
};
const nombreLado = (l: string) => l === "" ? "Este módulo no tiene lados" : l === "IZQ" ? "Izquierdo" : "Derecho";
const dosDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 2);
const dd = (n: number | null) => n == null ? "··" : String(n).padStart(2, "0");

/** «3 estibas + 10 cajas» / «12 cajas». */
export function textoCantidad(r: Pick<RenglonFiscal, "estibas" | "saldo" | "cajas">): string {
  if (r.cajas != null) return `${nf.format(r.cajas)} caja${r.cajas === 1 ? "" : "s"}`;
  const e = r.estibas, s = r.saldo ?? 0;
  const est = e != null ? `${nf.format(e)} estiba${e === 1 ? "" : "s"}` : "";
  const caj = s > 0 ? `${nf.format(s)} caja${s === 1 ? "" : "s"}` : "";
  return [est, caj].filter(Boolean).join(" + ") || "0 cajas";
}

export function ContarFiscal({
  hojas, bodegaId, materiales, ubicaciones,
}: {
  hojas: HojaParaContar[];
  bodegaId: string;
  materiales: Material[];
  ubicaciones: Ubicacion[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [pedir, dialogo] = useConfirmar();
  const [avisar, avisos] = useAvisos();

  /* LA HOJA QUE SE CUENTA. Casi siempre es una sola; si la persona está en
     dos inventarios, se escoge. Las que todavía no son de hoy no se pueden
     escoger para contar, pero se avisa de ellas. */
  const contables = hojas.filter((h) => h.puedeContar);
  const [hojaId, setHojaId] = useState<string>((contables[0] ?? hojas[0])?.hojaId ?? "");
  const hoja = hojas.find((h) => h.hojaId === hojaId) ?? contables[0] ?? hojas[0];

  const [b, setB] = useState<BorradorFiscal>(VACIO_FISCAL);
  const [mios, setMios] = useState<RenglonFiscal[] | null>(null);
  /* LAS DOS PESTAÑAS, IGUAL QUE EN «FEFO diario»: Anotar y El borrador (lo que llevo). */
  const [mas, setMas] = useState(false);
  const [pestania, setPestania] = useState<"anotar" | "borrador">("anotar");
  const [guardando, setGuardando] = useState(false);
  const router = useRouter();
  /* Lo que se terminó o reabrió desde que se abrió la pantalla; sin eso valen los datos que trajo la página. */
  const [terminos, setTerminos] = useState<Record<string, { termine: boolean; parejaTermino: boolean }>>({});
  const pon = <K extends keyof BorradorFiscal>(k: K, v: BorradorFiscal[K]) => setB((x) => ({ ...x, [k]: v }));

  const campoCalle = useRef<HTMLInputElement>(null);
  const campoCodigo = useRef<HTMLInputElement>(null);
  const campoDia = useRef<HTMLInputElement>(null);
  const campoMes = useRef<HTMLInputElement>(null);
  const campoAnio = useRef<HTMLInputElement>(null);
  const campoCantidad = useRef<HTMLInputElement>(null);
  const campoSaldo = useRef<HTMLInputElement>(null);

  /* ---------- LO QUE YA LLEVO ANOTADO ---------- */
  const leer = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc("inv_fiscal_contar_mios", { p_hoja: id });
    if (error) { avisar.mal(error.message); setMios([]); return }
    setMios((data ?? []) as RenglonFiscal[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);
  useEffect(() => { if (hoja?.hojaId) { setMios(null); void leer(hoja.hojaId) } }, [hoja?.hojaId, leer]);

  /* ---------- EL RENGLÓN A MEDIO ESCRIBIR NO SE PIERDE ----------
     Se guarda en el teléfono (no en la base) y con la llave de la hoja: si se
     cae la señal o se recarga, el renglón sigue donde estaba. */
  const llave = hoja ? `fiscal.renglon.${hoja.hojaId}` : null;
  useEffect(() => {
    if (!llave) return;
    try {
      const crudo = localStorage.getItem(llave);
      if (crudo) {
        const g = JSON.parse(crudo) as Record<string, unknown>;
        const limpio = { ...VACIO_FISCAL };
        for (const k of Object.keys(VACIO_FISCAL) as (keyof BorradorFiscal)[]) if (k in g) (limpio[k] as unknown) = g[k];
        setB(limpio);
      } else setB(VACIO_FISCAL);
    } catch { /* sin almacenamiento la pantalla funciona igual */ }
  }, [llave]);
  useEffect(() => {
    if (!llave) return;
    try {
      const hayAlgo = Object.entries(b).some(([k, v]) => v !== VACIO_FISCAL[k as keyof BorradorFiscal] && v !== "");
      if (hayAlgo) localStorage.setItem(llave, JSON.stringify(b)); else localStorage.removeItem(llave);
    } catch { /* ver arriba */ }
  }, [b, llave]);

  /* ---------- LAS LISTAS (igual que en el conteo diario) ---------- */
  const calles = useMemo(
    () => [...new Set([...ubicaciones.filter((u) => u.activa).map((u) => u.calle), ...Object.keys(MODULOS_DE_LA_HOJA)])].sort(ordenCalle),
    [ubicaciones]);
  const modulos = useMemo(() => {
    const m = new Map<string, { base: string; calle: string; modulo: string }>();
    for (const u of ubicaciones) {
      if (!u.activa) continue;
      if (b.calle !== "" && u.calle !== b.calle) continue;
      const k = claveBase(u);
      if (!m.has(k)) m.set(k, { base: k, calle: u.calle, modulo: u.modulo });
    }
    for (const f of modulosQueFaltan(ubicaciones.filter((u) => u.activa), b.calle)) {
      const k = claveBase(f);
      if (!m.has(k)) m.set(k, { base: k, calle: f.calle, modulo: f.modulo });
    }
    /* CADA UNO DE LA PAREJA EMPIEZA POR UN EXTREMO DE LA CALLE: el operador logístico ve los módulos del 01
       hacia arriba y Bavaria del último hacia abajo. Así los dos cuentan la misma calle sin ir uno detrás del
       otro ni copiarse, y se encuentran a mitad de camino; el cruce de los conteos se hace después. Los
       sitios que no son una posición numerada (PASILLO, TANDEM, DEPA…) quedan al final para los dos. */
    const alReves = hoja?.equipo === "Bavaria";
    const esNum = (v: string) => /^\d+$/.test(v);
    return [...m.values()].sort((x, y) => {
      const c = ordenCalle(x.calle, y.calle);
      if (c) return c;
      if (alReves && esNum(x.modulo) && esNum(y.modulo)) return Number(y.modulo) - Number(x.modulo);
      return x.modulo.localeCompare(y.modulo, "es", { numeric: true });
    });
  }, [ubicaciones, b.calle, hoja?.equipo]);
  /** «01 → 36» u «36 → 01»: por dónde empieza esta persona en la calle escogida (solo con una calle puesta). */
  const miOrden = useMemo(() => {
    if (b.calle === "") return null;
    const num = modulos.filter((m) => /^\d+$/.test(m.modulo));
    if (num.length < 2) return null;
    return `${num[0].modulo} → ${num[num.length - 1].modulo}`;
  }, [modulos, b.calle]);
  const lados = useMemo(() => {
    const delModulo = ubicaciones.filter((u) => u.activa && claveBase(u) === b.base);
    if (delModulo.length > 0 && delModulo.every((u) => (u.lado ?? "") === "")) return [""];
    if (delModulo.length === 0 && b.base && !moduloConLados(b.base.split("|")[1] ?? "")) return [""];
    return ["IZQ", "DER"];
  }, [ubicaciones, b.base]);
  const ubicacion = useMemo(() => {
    if (!b.base) return null;
    const delModulo = ubicaciones.filter((u) => u.activa && claveBase(u) === b.base);
    if (delModulo.length === 1 && (delModulo[0].lado ?? "") === "") return delModulo[0];
    return delModulo.find((u) => (u.lado ?? "") === b.lado) ?? null;
  }, [ubicaciones, b.base, b.lado]);
  const claveEscogida = useMemo(() => {
    if (!b.base) return null;
    const [calle, modulo] = b.base.split("|");
    if (lados.length === 1 && lados[0] === "") return `${calle}${modulo}`;
    if (!b.lado) return null;
    return `${calle}${modulo}_${b.lado}`;
  }, [b.base, b.lado, lados]);

  const material = useMemo(() => materiales.find((m) => m.activo && m.sku === b.codigo.trim()) ?? null, [materiales, b.codigo]);
  const esEnvase = pideEstadoFiscal(material);
  const esCilindro = esCilindroFiscal(material);
  /* Si cambia el material y el estado ya no aplica (o no está en su lista), se limpia. */
  useEffect(() => {
    if (b.estado && (!esEnvase || !opcionesEstadoFiscal(material).includes(b.estado))) setB((x) => ({ ...x, estado: "" }));
  }, [b.estado, esEnvase, material]);
  const cuenta = useMemo(() => totalCajas(b, material), [b, material]);

  /* ---------- EL SALTO ENTRE CASILLAS ---------- */
  function tecleaFecha(k: "dia" | "mes" | "anio", v: string, siguiente?: RefObject<HTMLInputElement | null>) {
    const limpio = dosDigitos(v);
    pon(k, limpio);
    if (limpio.length !== 2) return;
    if (siguiente?.current) { siguiente.current.focus(); siguiente.current.select(); return }
    document.activeElement instanceof HTMLElement && document.activeElement.blur();
  }
  function saltaCon(e: KeyboardEvent<HTMLInputElement>, destino?: RefObject<HTMLInputElement | null>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (destino?.current) { destino.current.focus(); destino.current.select(); return }
    e.currentTarget.blur();
  }
  function atrasFecha(e: KeyboardEvent<HTMLInputElement>, valor: string, anterior?: RefObject<HTMLInputElement | null>) {
    if (e.key !== "Backspace" || valor !== "" || !anterior?.current) return;
    e.preventDefault(); anterior.current.focus(); anterior.current.select();
  }
  function saltarSiCompleto(v: string) {
    const c = v.trim();
    if (!c) return;
    const activos = materiales.filter((m) => m.activo);
    if (!activos.find((m) => m.sku === c) || activos.some((m) => m.sku !== c && m.sku.startsWith(c))) return;
    setTimeout(() => campoDia.current?.focus(), 0);
  }

  /* ---------- ANOTAR ---------- */
  async function anotar() {
    if (!hoja || guardando) return;
    const mal = revisarFiscal(b, material, claveEscogida);
    if (mal || !material) { avisar.mal(mal ?? "Falta el código del material."); return }
    setGuardando(true);
    let idU = ubicacion?.id ?? null;
    if (!idU) {
      const [calle, modulo] = b.base.split("|");
      const r = await supabase.rpc("conteo_ubicacion_asegurar", { p_bodega: bodegaId, p_calle: calle, p_modulo: modulo, p_lado: b.lado || null });
      if (r.error) { setGuardando(false); avisar.mal(r.error.message); return }
      idU = r.data as string;
    }
    const { error } = await supabase.rpc("inv_fiscal_contar_agregar", argumentosFiscal(hoja.hojaId, idU, material, b));
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${material.sku} anotado en ${claveEscogida}${cuenta?.total != null ? ` · ${nf.format(cuenta.total)} cajas` : ""}.`);
    /* Igual que el conteo normal: el renglón se vacía pero el sitio (calle, módulo y lado) se queda para el siguiente. */
    setB((x) => ({ ...VACIO_FISCAL, calle: x.calle, base: x.base, lado: x.lado }));
    await leer(hoja.hojaId);
    setTimeout(() => campoCodigo.current?.focus(), 0);
  }

  async function quitar(r: RenglonFiscal) {
    const ok = await pedir({
      titulo: "¿Quitar este renglón?",
      dice: <>{r.sku} · {r.material} en {r.ubicacion} — {textoCantidad(r)}.</>,
      confirmar: "Quitarlo", peligro: true,
    });
    if (!ok || !hoja) return;
    setGuardando(true);
    const { error } = await supabase.rpc("inv_fiscal_contar_quitar", { p_id: r.id });
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien("Renglón quitado.");
    await leer(hoja.hojaId);
  }

  /* ---------- TERMINÉ MI HOJA / REABRIR ---------- */
  async function terminar(activo: boolean) {
    if (!hoja) return;
    if (activo) {
      if (!mios || mios.length === 0) { avisar.mal("Anota al menos un renglón antes de terminar tu hoja."); return }
      const ok = await pedir({
        titulo: "¿Terminaste tu hoja?",
        dice: <>Llevas {mios.length} {mios.length === 1 ? "renglón" : "renglones"}. Al terminar ya no podrás anotar ni quitar nada;
          si te equivocas, puedes reabrir tu hoja.</>,
        confirmar: "Sí, terminé mi hoja",
      });
      if (!ok) return;
    }
    setGuardando(true);
    const { error } = await supabase.rpc("inv_fiscal_terminar", { p_hoja: hoja.hojaId, p_terminado: activo });
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }
    setTerminos((t) => ({ ...t, [hoja.hojaId]: { termine: activo, parejaTermino: (t[hoja.hojaId] ?? hoja).parejaTermino } }));
    avisar.bien(activo ? "Hoja terminada." : "Hoja reabierta: ya puedes anotar y quitar renglones.");
    router.refresh();
  }

  if (!hoja) return null;
  const estadoT = terminos[hoja.hojaId] ?? { termine: hoja.termine, parejaTermino: hoja.parejaTermino };
  /* Terminada: solo si la base ya sabe terminar hojas y la persona la terminó. */
  const cerrada = hoja.puedeContar && hoja.puedeTerminar && estadoT.termine;
  const totalMio = (mios ?? []).reduce((s, r) => s + Number(r.total_cajas || 0), 0);

  return (
    <>
      {dialogo}
      {avisos}

      {hojas.length > 1 && (
        <label className="fc-hoja-sel"><span>Hoja que cuentas</span>
          <select value={hoja.hojaId} onChange={(e) => setHojaId(e.target.value)}>
            {hojas.map((h) => (
              <option key={h.hojaId} value={h.hojaId} disabled={!h.puedeContar}>
                {h.nombre} · Hoja {h.numero}{h.puedeContar ? "" : ` (se cuenta el ${fechaConDia(h.fecha)})`}
              </option>
            ))}
          </select></label>
      )}

      {hoja.puedeContar && (
        <RevisionesFiscal hojaId={hoja.hojaId} mios={mios} materiales={materiales} avisar={avisar} alCambiar={() => leer(hoja.hojaId)} />
      )}

      {hoja.puedeContar && (
        <div className="fe-pes fe-pes-conteo fc-pes" role="tablist">
          <button type="button" role="tab" aria-selected={pestania === "anotar"}
                  className={pestania === "anotar" ? "on" : ""} onClick={() => setPestania("anotar")}>
            Anotar
          </button>
          <button type="button" role="tab" aria-selected={pestania === "borrador"}
                  className={pestania === "borrador" ? "on" : ""} onClick={() => setPestania("borrador")}>
            El borrador<em>{mios?.length ?? 0}</em>
          </button>
        </div>
      )}

      {!hoja.puedeContar ? (
        <section className="fe-faltan" role="status">
          <p><b>Todavía no es el día.</b> La hoja {hoja.numero} de «{hoja.nombre}» se cuenta el{" "}
          <b>{fechaConDia(hoja.fecha)}</b>. Ese día aquí aparece el formulario para anotar.</p>
        </section>
      ) : (
        <section className="fe-anotar fc-anotar" hidden={pestania !== "anotar" || cerrada}>
          <div className="fe-anotar-cab">
            <p className="fe-paso">Hoja {hoja.numero} · anotar lo que hay</p>
          </div>
          <p className="fc-ciego">Cuentas a ciegas: solo ves lo que anotas tú. El cruce con tu pareja se hace después.</p>

          {/* ===== DÓNDE ===== */}
          <div className="fe-bloque">
            <p className="fe-bloque-cab">Dónde</p>
            <div className="fe-tres dos fe-donde3">
              <label><span>Calle</span>
                <Buscador campo={campoCalle} valor={b.calle} marcador="Todas" teclado="ninguno" desdeElSiguiente
                  opciones={[{ valor: "", texto: "Todas" }, ...calles.map((c) => ({ valor: c, texto: c }))]}
                  onEscoge={(nueva) => {
                    const sigue = b.base.startsWith(nueva + "|");
                    setB((x) => ({ ...x, calle: nueva, base: nueva === "" || sigue ? x.base : "", lado: nueva === "" || sigue ? x.lado : "" }));
                  }} /></label>
              <label><span>Módulo{miOrden && <small className="fc-orden" title="Por dónde empiezas tú en esta calle; tu pareja empieza por el otro extremo"> · tu orden {miOrden}</small>}</span>
                <Buscador valor={b.base} marcador="Escribe o escoge…" sinOpciones="Esa calle no tiene módulos activos."
                  teclado="numerico" desdeElSiguiente
                  opciones={modulos.map((m) => ({ valor: m.base, texto: m.modulo, pista: b.calle === "" ? `Calle ${m.calle}` : null }))}
                  onEscoge={(base) => {
                    const posibles = ubicaciones.filter((x) => x.activa && claveBase(x) === base);
                    setB((x) => ({ ...x, base, calle: posibles[0]?.calle ?? base.split("|")[0] ?? x.calle,
                                   lado: posibles.length === 1 ? (posibles[0].lado ?? "") : "" }));
                  }} /></label>
              <div className="fe-lado-campo">
                <span className="fe-lado-rot" id="fc-rot-lado">Lado</span>
                {!b.base ? (
                  <output className="fe-lado">Escoge primero el módulo</output>
                ) : lados.length === 1 ? (
                  <output className="fe-lado">{nombreLado(lados[0])}</output>
                ) : (
                  <div className="fe-segmento" role="group" aria-labelledby="fc-rot-lado">
                    {lados.map((l) => (
                      <button key={l} type="button" className={b.lado === l ? "on" : ""} aria-pressed={b.lado === l}
                        onClick={() => { pon("lado", l); setTimeout(() => campoCodigo.current?.focus(), 0) }}>{nombreLado(l)}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===== QUÉ ===== */}
          <div className="fe-bloque">
            <p className="fe-bloque-cab">Qué</p>
            <div className="fe-cod-dos fe-que3">
              <label><span>Código</span>
                <input ref={campoCodigo} inputMode="numeric" value={b.codigo} placeholder="Teclea el código"
                  onChange={(e) => { pon("codigo", e.target.value); saltarSiCompleto(e.target.value) }}
                  onKeyDown={(e) => saltaCon(e, campoDia)} /></label>
              <label className="fe-que-desc"><span>Descripción</span>
                <output className={"fe-desc-campo" + (b.codigo && !material ? " mal" : material ? " leido" : "")}>
                  {!b.codigo ? <i>Teclea el código y te digo qué es.</i>
                    : material ? <span className="fe-desc-tx"><span className="fe-tic" aria-hidden>✓</span>{material.nombre}
                        {material.cajas_por_estiba != null && <em> · {material.cajas_por_estiba} cajas/estiba</em>}</span>
                    : <i>Ese código no está en el maestro.</i>}
                </output></label>
              <div className={"fe-fecha fe-que-vence" + (esEnvase ? " opcional" : "")}>
                <div className="fe-que-fecha">
                  <span className="fe-etiq-fecha">Vence</span>
                  {esEnvase && <em className="fe-opcional">sin fecha</em>}
                </div>
                <div className="fe-dma">
                  <input ref={campoDia} inputMode="numeric" maxLength={2} placeholder="DD" aria-label="Día del vencimiento" value={b.dia}
                    onChange={(e) => tecleaFecha("dia", e.target.value, campoMes)} />
                  <input ref={campoMes} inputMode="numeric" maxLength={2} placeholder="MM" aria-label="Mes del vencimiento" value={b.mes}
                    onChange={(e) => tecleaFecha("mes", e.target.value, campoAnio)} onKeyDown={(e) => atrasFecha(e, b.mes, campoDia)} />
                  <input ref={campoAnio} inputMode="numeric" maxLength={2} placeholder="AA" aria-label="Año del vencimiento" value={b.anio}
                    onChange={(e) => tecleaFecha("anio", e.target.value, campoCantidad)} onKeyDown={(e) => atrasFecha(e, b.anio, campoMes)} />
                </div>
              </div>
            </div>
            {material && material.cajas_por_estiba == null && (
              <p className="fe-eco"><b className="ojo">sin factor estibado</b> — las estibas darían cero: cuéntalo por cajas</p>
            )}
          </div>

          {/* ===== ESTADO DEL ENVASE (igual que en el conteo normal; solo si lo contado es envase) ===== */}
          {esEnvase && (
            <div className="fe-bloque fe-estenv">
              <p className="fe-bloque-cab">Estado del envase</p>
              <p className="fe-obliga">Obligatorio: {esCilindro ? "escoge lleno o vacío" : "escoge uno"}.</p>
              <div className="fe-estados" role="group" aria-label={esCilindro ? "Cilindro lleno o vacío" : "Estado del envase"}>
                {opcionesEstadoFiscal(material).map((e) => (
                  <button key={e} type="button" className={b.estado === e ? "on" : ""} aria-pressed={b.estado === e}
                          onClick={() => { pon("estado", b.estado === e ? "" : e); if (b.estado !== e) setTimeout(() => campoCantidad.current?.focus(), 60) }}>{e}</button>
                ))}
              </div>
            </div>
          )}

          {/* ===== CUÁNTO ===== */}
          <div className="fe-bloque">
            <p className="fe-bloque-cab">Cuánto</p>
            <div className={"fe-cuanto4" + (b.modo === "cajas" ? " cajas" : "")}>
              <div className="fe-cuanto-modo">
                <span className="fe-cuanto-rot" id="fc-rot-modo">Qué cuentas</span>
                <div className="fe-segmento" role="group" aria-labelledby="fc-rot-modo">
                  <button type="button" className={b.modo === "estibas" ? "on" : ""} aria-pressed={b.modo === "estibas"} onClick={() => pon("modo", "estibas")}>Estibas</button>
                  <button type="button" className={b.modo === "cajas" ? "on" : ""} aria-pressed={b.modo === "cajas"} onClick={() => pon("modo", "cajas")}>Cajas</button>
                </div>
              </div>
              {b.modo === "estibas" ? (
                <>
                  <label className="fe-cuanto-campo"><span>Estibas completas</span>
                    <input ref={campoCantidad} inputMode="numeric" value={b.estibas} onChange={(e) => pon("estibas", e.target.value)} onKeyDown={(e) => saltaCon(e, campoSaldo)} /></label>
                  <label className="fe-cuanto-campo"><span>Saldo · cajas</span>
                    <input ref={campoSaldo} inputMode="numeric" value={b.saldo} onChange={(e) => pon("saldo", e.target.value)} onKeyDown={(e) => saltaCon(e)} /></label>
                </>
              ) : (
                <label className="fe-cuanto-campo ancho"><span>Cajas</span>
                  <input ref={campoCantidad} inputMode="numeric" value={b.cajas} onChange={(e) => pon("cajas", e.target.value)} onKeyDown={(e) => saltaCon(e)} /></label>
              )}
              <div className="fe-cuanto-total">
                <span className="fe-cuanto-rot">Total</span>
                <output className={"fe-total-caja" + (cuenta?.total == null ? " esperando" : "")}>
                  <b>{cuenta?.total != null ? nf.format(cuenta.total) : "—"}</b><span>cajas</span>
                </output>
              </div>
            </div>
            {cuenta && (
              <p className="fe-cuenta-linea">
                {cuenta.total == null
                  ? <><b className="ojo">Sin factor estibado</b> — cuéntalo por cajas o avísale a quien lleva el maestro.</>
                  : <>{cuenta.formula} = <b>{nf.format(cuenta.total)}</b> cajas</>}
              </p>
            )}
          </div>

          {/* ===== DATOS ADICIONALES · AVERÍA · PNC · OBSERVACIÓN (igual que en el conteo normal) ===== */}
          <details className="fe-mas" open={mas} onToggle={(e) => setMas((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>
              <span className="fe-mas-tx"><b>Datos adicionales</b><span>Avería · PNC · observación</span></span>
              <span className="fe-mas-marcas">
                {([b.averia && "AVERÍA", b.pnc && "PNC"].filter(Boolean) as string[]).map((m) => <em key={m}>{m}</em>)}
              </span>
              <span className="fe-mas-fl" aria-hidden>▾</span>
            </summary>
            <div className="fe-mas-dentro">
              <div className="fe-mas-dos">
                <div className="fe-rota">
                  <span id="fc-rot-averia">¿Está averiada?</span>
                  <div className="fe-si-no" role="group" aria-labelledby="fc-rot-averia">
                    <button type="button" className={!b.averia ? "on" : ""} aria-pressed={!b.averia}
                            onClick={() => setB((x) => ({ ...x, averia: false }))}>No</button>
                    <button type="button" className={b.averia ? "on" : ""} aria-pressed={b.averia}
                            onClick={() => setB((x) => ({ ...x, averia: true, pnc: false, pncRotulo: null, pncBloqueo: null }))}>Sí, avería</button>
                  </div>
                </div>
                <div className="fe-marca-campo">
                  <span id="fc-rot-marca">PNC <em>(opcional)</em></span>
                  <div className="fe-marcas uno" role="group" aria-labelledby="fc-rot-marca">
                    <button type="button" className={"fe-marca" + (b.pnc ? " on" : "")} aria-pressed={b.pnc}
                            onClick={() => setB((x) => ({ ...x, averia: false, pnc: !x.pnc, pncRotulo: null, pncBloqueo: null }))}>PNC</button>
                  </div>
                </div>
              </div>
              {b.pnc && (
                <div className="fe-pnc-pol" role="group" aria-label="Política de bloqueo del PNC">
                  <p className="fe-pnc-cab">Política de bloqueo <em className="fe-obliga">· obligatorio</em></p>
                  {([["rotulo", "¿Tiene rótulo?", b.pncRotulo], ["bloqueo", "¿Tiene bloqueo mecánico?", b.pncBloqueo]] as const).map(([k, txt, v]) => (
                    <div className="fe-rota" key={k}>
                      <span id={`fc-pnc-${k}`}>{txt}</span>
                      <div className="fe-si-no" role="group" aria-labelledby={`fc-pnc-${k}`}>
                        <button type="button" className={v === false ? "on" : ""} aria-pressed={v === false}
                                onClick={() => setB((x) => ({ ...x, [k === "rotulo" ? "pncRotulo" : "pncBloqueo"]: false }))}>No</button>
                        <button type="button" className={v === true ? "on" : ""} aria-pressed={v === true}
                                onClick={() => setB((x) => ({ ...x, [k === "rotulo" ? "pncRotulo" : "pncBloqueo"]: true }))}>Sí</button>
                      </div>
                    </div>
                  ))}
                  {b.pncRotulo != null && b.pncBloqueo != null && (
                    <p className={"fe-pnc-veredicto " + (b.pncRotulo && b.pncBloqueo ? "cumple" : "falta")}>
                      {b.pncRotulo && b.pncBloqueo
                        ? "Cumple la política de bloqueo."
                        : `No cumple la política de bloqueo: falta ${[!b.pncRotulo && "el rótulo", !b.pncBloqueo && "el bloqueo mecánico"].filter(Boolean).join(" y ")}.`}
                    </p>
                  )}
                </div>
              )}
              <label className="fe-nota"><span>Observación</span>
                <input value={b.nota} placeholder="Opcional — lo que haya que decir de esta estiba" onChange={(e) => pon("nota", e.target.value)} /></label>
            </div>
          </details>

          <div className="fe-barra-fija">
            <p className="fe-fija-cuenta"><b>{mios?.length ?? 0}</b> anotados</p>
            {hoja.puedeTerminar && (
              <button type="button" className="btn plano fc-terminar-ir" disabled={guardando || (mios?.length ?? 0) === 0}
                      title={(mios?.length ?? 0) === 0 ? "Anota al menos un renglón" : undefined} onClick={() => terminar(true)}>
                Terminé mi hoja
              </button>
            )}
            <button type="button" className="btn grande" disabled={guardando} onClick={anotar}>
              {guardando ? "Guardando…" : "Anotar renglón"}
            </button>
          </div>
        </section>
      )}

      {/* ===== HOJA TERMINADA ===== */}
      {cerrada && (
        <section className="fe-anotar fc-terminada" hidden={pestania !== "anotar"} role="status" aria-label="Hoja terminada">
          <div className="fe-anotar-cab"><p className="fe-paso">Hoja {hoja.numero} · terminada</p></div>
          <p className="fc-term-dice"><b>Terminaste tu hoja.</b>{" "}
            {estadoT.parejaTermino
              ? "Tu pareja también terminó: quien arma el plan ya puede cruzar las dos hojas."
              : `Falta que ${hoja.pareja ?? "tu pareja"} termine la suya.`}</p>
          <p className="fc-term-cuenta">Llevas {mios?.length ?? 0} {(mios?.length ?? 0) === 1 ? "renglón" : "renglones"} · {nf.format(totalMio)} cajas.</p>
          <div className="cl-botones">
            <button type="button" className="btn plano fc-reabrir" disabled={guardando} onClick={() => terminar(false)}>Reabrir mi hoja</button>
          </div>
        </section>
      )}

      {/* ===== LO QUE LLEVO ===== */}
      <section className="fe-recorrido fc-mios" aria-label="Lo que llevas anotado" hidden={hoja.puedeContar && pestania !== "borrador"}>
        <div className="fe-rec-cab">
          <div>
            <h2>Lo que llevas anotado</h2>
            <p className="fe-rec-dice">Es solo lo tuyo. Si algo quedó mal, quítalo y vuelve a anotarlo.</p>
          </div>
          <span>
            {mios == null ? "Cargando…" : `${mios.length} ${mios.length === 1 ? "renglón" : "renglones"} · ${nf.format(totalMio)} cajas`}
          </span>
        </div>
        {mios != null && mios.length === 0 && <p className="fc-vacio">Todavía no has anotado nada en esta hoja.</p>}
        {mios != null && mios.length > 0 && (
          <ul className="fc-lista">
            {mios.map((r) => (
              <li key={r.id}>
                <div className="fc-ren">
                  <b>{r.ubicacion}</b> · {r.sku} · {r.material}
                  <br />
                  <span>{[r.estado_envase, r.averia && "AVERÍA", r.pnc && "PNC"].filter(Boolean).join(" · ")}{r.estado_envase || r.averia || r.pnc ? " · " : ""}{textoCantidad(r)} = <b>{nf.format(Number(r.total_cajas))}</b> cajas
                    {r.venc_dia != null && <> · vence {dd(r.venc_dia)}/{dd(r.venc_mes)}/{dd(r.venc_anio)}</>}
                    {r.nota && <> · {r.nota}</>}</span>
                </div>
                <button type="button" className="fe-mini" disabled={guardando || cerrada} onClick={() => quitar(r)}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
        {cerrada && (
          <p className="fc-nota-term" role="status">Tu hoja está terminada: para cambiar algo, reábrela.{" "}
            <button type="button" className="fe-mini fc-reabrir" disabled={guardando} onClick={() => terminar(false)}>Reabrir mi hoja</button></p>
        )}
        {!cerrada && hoja.puedeTerminar && hoja.puedeContar && (mios?.length ?? 0) > 0 && (
          <div className="fc-terminar">
            <p>¿Ya contaste toda tu hoja? Avísalo para que se pueda cruzar con tu pareja.</p>
            <button type="button" className="btn fc-terminar-fin" disabled={guardando} onClick={() => terminar(true)}>Terminé mi hoja</button>
          </div>
        )}
      </section>
    </>
  );
}
