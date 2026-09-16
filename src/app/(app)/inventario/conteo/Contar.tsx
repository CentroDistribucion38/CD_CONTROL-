"use client";

/**
 * LA PLANTILLA DE CONTEO — se usa de pie, frente a un módulo, con una
 * sola mano.
 *
 * LA UBICACIÓN SE ESCOGE UNA VEZ Y SE QUEDA. En la hoja real hay 88
 * cambios de ubicación en 151 saltos de renglón: se camina módulo por
 * módulo, no se salta. Volver a escribir la ubicación en cada renglón
 * sería teclear tres veces lo mismo frente a la misma estiba.
 *
 * Y SE ESCOGE, NO SE TECLEA, que es lo que arregla el problema de
 * verdad: 38 de las 152 filas de la hoja —un cuarto— apuntan a una
 * ubicación que no existe. No porque falte el módulo: «A29», «C08»,
 * «E01» existen, pero como A29_DER y A29_IZQ, y la fila se dejó SIN
 * LADO. Más «E6» donde el maestro dice «E06». Un cuarto del conteo no
 * podía decir de qué lado del pasillo estaba.
 *
 * CADA RENGLÓN SE GUARDA AL MOMENTO. No hay un «Guardar» al final: una
 * señal que se cae no puede borrar la mañana. Y el renglón no dice quién
 * lo contó — eso lo saca la base de la sesión, que es la única forma de
 * que no se pueda contar a nombre de otro.
 */

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useConfirmar } from "@/components/Confirmar";
import { useAvisos } from "@/components/Aviso";
import type { Material, Ubicacion, Renglon } from "@/modulos/inventario/fefo";

type Conteo = { id: string; codigo: string; estado: string; iniciado_en: string | null };

const ent = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function Contar({
  bodegaId, conteoInicial, renglonesIniciales, materiales, ubicaciones, estados,
}: {
  bodegaId: string;
  conteoInicial: Conteo | null;
  renglonesIniciales: Renglon[];
  materiales: Material[];
  ubicaciones: Ubicacion[];
  estados: string[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [pedir, dialogo] = useConfirmar();
  const [avisar, avisos] = useAvisos();

  const [conteo, setConteo] = useState(conteoInicial);
  const [renglones, setRenglones] = useState(renglonesIniciales);
  const [guardando, setGuardando] = useState(false);

  /* ---------- DÓNDE ESTOY ---------- */
  const [calle, setCalle] = useState<string>("");
  const [ubicacionId, setUbicacionId] = useState<string>("");
  /* Mientras se cambia de módulo, el paso 1 se despliega otra vez. */
  const [cambiando, setCambiando] = useState(false);

  /* Las calles y los módulos salen del maestro de ubicaciones, no de una
     lista escrita aquí: el día que abran una calle nueva, se agrega en
     el maestro y aparece sola. */
  const calles = useMemo(() => {
    const s = new Set(ubicaciones.filter((u) => u.activa).map((u) => u.calle));
    return [...s].sort();
  }, [ubicaciones]);

  const modulos = useMemo(
    () => ubicaciones
      .filter((u) => u.activa && u.calle === calle)
      .sort((a, b) => a.clave.localeCompare(b.clave, undefined, { numeric: true })),
    [ubicaciones, calle]);

  const ubicacion = ubicaciones.find((u) => u.id === ubicacionId) ?? null;

  /* ---------- EL RENGLÓN ---------- */
  const [codigo, setCodigo] = useState("");
  const [modo, setModo] = useState<"estibas" | "cajas">("estibas");
  const [cuantas, setCuantas] = useState("");
  const [rot, setRot] = useState<boolean | null>(null);
  const [dia, setDia] = useState(""); const [mes, setMes] = useState(""); const [anio, setAnio] = useState("");
  const [averia, setAveria] = useState(false);
  const [pnc, setPnc] = useState(false);
  const [estado, setEstado] = useState("");
  const campoCodigo = useRef<HTMLInputElement>(null);

  /* El material se reconoce MIENTRAS SE TECLEA: en el Excel un código
     malo solo se notaba al final, cuando la descripción decía «VALIDAR
     CODIGO» y ya nadie estaba frente a esa estiba. */
  const material = useMemo(
    () => materiales.find((m) => m.activo && m.sku === codigo.trim()) ?? null,
    [materiales, codigo]);
  const esEnvase = material?.tipo_material === "ENVASE";

  function limpiarRenglon(dejarFecha: boolean) {
    setCodigo(""); setCuantas(""); setRot(null);
    setAveria(false); setPnc(false); setEstado("");
    /* LA FECHA SE QUEDA A PROPÓSITO. Dentro de un mismo módulo las
       estibas suelen ser del mismo lote: volver a teclear 11-3-27 en
       cada renglón es la mitad de las pulsaciones de la jornada.
       Se borra sola al cambiar de módulo. */
    if (!dejarFecha) { setDia(""); setMes(""); setAnio("") }
    campoCodigo.current?.focus();
  }

  async function abrir() {
    setGuardando(true);
    const { data, error } = await supabase.rpc("conteo_fefo_abrir", { p_bodega: bodegaId });
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }
    setConteo({ id: data as string, codigo: "…", estado: "en_proceso", iniciado_en: null });
    router.refresh();
  }

  async function agregar() {
    if (!conteo) return;
    if (!ubicacion) { avisar.mal("Primero escoge el módulo."); return }
    if (!material) { avisar.mal(`El código «${codigo}» no está en el maestro.`); return }
    const n = ent(cuantas);
    if (n == null) { avisar.mal(`¿Cuántas ${modo}?`); return }
    if (rot == null) { avisar.mal("Falta decir si rota."); return }
    if (!esEnvase && (ent(dia) == null || ent(mes) == null || anio.trim() === "")) {
      avisar.mal("Falta la fecha de vencimiento."); return;
    }

    setGuardando(true);
    const { error } = await supabase.rpc("conteo_fefo_agregar", {
      p_conteo: conteo.id,
      p_sku: material.sku,
      p_ubicacion: ubicacion.id,
      p_rotacion: rot,
      p_estibas: modo === "estibas" ? n : null,
      p_cajas: modo === "cajas" ? n : null,
      p_venc_dia: ent(dia), p_venc_mes: ent(mes),
      p_venc_anio: anio.trim() === "" ? null : Number(anio.trim()),
      p_averia: averia, p_pnc: pnc,
      p_estado: estado || null,
      p_nota: null,
    });
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }

    /* Se vuelve a leer la vista en vez de armar el renglón aquí: las seis
       cuentas las hace la base, y calcularlas otra vez en la pantalla es
       tener dos versiones de la verdad esperando a discrepar. */
    const { data } = await supabase.from("v_conteo_fefo").select("*")
      .eq("conteo_id", conteo.id)
      .order("contado_en", { ascending: false }).limit(2000);
    setRenglones((data ?? []) as Renglon[]);
    avisar.bien(`${material.sku} · ${n} ${modo} anotadas.`);
    limpiarRenglon(true);
  }

  async function borrar(r: Renglon) {
    const ok = await pedir({
      titulo: "¿Borrar este renglón?",
      dice: <>{r.codigo} · {r.material} — {r.total_cajas.toLocaleString("es-CO")} cajas en {r.ubicacion}.</>,
      confirmar: "Borrarlo", peligro: true,
    });
    if (!ok) return;
    setGuardando(true);
    const { error } = await supabase.rpc("conteo_fefo_borrar", { p_linea: r.id });
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }
    setRenglones((xs) => xs.filter((x) => x.id !== r.id));
    avisar.bien("Renglón borrado.");
  }

  /* Lo de ESTE módulo, arriba: es lo que se mira para saber si ya se
     acabó con él. Lo demás queda abajo, en el recorrido. */
  const deAqui = renglones.filter((r) => r.ubicacion === ubicacion?.clave);
  const cajasAqui = deAqui.reduce((a, r) => a + Number(r.total_cajas), 0);
  const cajasTotal = renglones.reduce((a, r) => a + Number(r.total_cajas), 0);
  const modulosHechos = new Set(renglones.map((r) => r.ubicacion)).size;

  if (!conteo) {
    return (
      <>
        {avisos}
        <section className="fe-arranque">
          <h2>Empezar un recorrido</h2>
          <p>
            Se abre uno a tu nombre y queda abierto: si sales a almorzar y vuelves, sigues
            en el mismo. Cada renglón se guarda al momento, así que una señal que se cae no
            borra lo que ya anotaste.
          </p>
          <button type="button" className="btn grande" disabled={guardando} onClick={abrir}>
            {guardando ? "Abriendo…" : "Empezar a contar"}
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      {dialogo}
      {avisos}

      {/* ---------- PASO 1: DÓNDE ESTOY ----------
          SE PLIEGA APENAS SE ESCOGE. La ubicación se escoge UNA vez y se
          camina: en la hoja real hay 88 cambios de módulo en 151 saltos
          de renglón. Dejar los dos desplegables abiertos toda la jornada
          le cuesta 90 px a la pantalla — y con ellos abiertos el botón
          de «Anotar» quedaba 499 px bajo el pliegue en un celular de
          390×740, o sea un scroll por cada estiba. */}
      {ubicacion && !cambiando ? (
        <section className="fe-donde plegada">
          <div>
            <p className="fe-paso">Estás en</p>
            <p className="fe-aqui-cab">
              <b>{ubicacion.clave}</b>
              {ubicacion.familia && <span> · {ubicacion.familia}</span>}
              {deAqui.length > 0 && (
                <span> — {deAqui.length} renglón{deAqui.length > 1 ? "es" : ""} aquí
                  ({cajasAqui.toLocaleString("es-CO")} cajas)</span>
              )}
            </p>
          </div>
          <button type="button" className="fe-mini" onClick={() => setCambiando(true)}>
            Cambiar módulo
          </button>
        </section>
      ) : (
      <section className="fe-donde">
        <p className="fe-paso">1 · En qué módulo estás</p>
        <div className="fe-campos dos">
          <label><span>Calle</span>
            <select value={calle} onChange={(e) => {
              setCalle(e.target.value); setUbicacionId("");
              setDia(""); setMes(""); setAnio("");
            }}>
              <option value="">Escoge…</option>
              {calles.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></label>
          <label><span>Módulo</span>
            <select value={ubicacionId} disabled={!calle}
                    onChange={(e) => {
                      setUbicacionId(e.target.value); setCambiando(false);
                      /* La fecha se borra al cambiar de módulo: se
                         conserva DENTRO de un módulo —las estibas suelen
                         ser del mismo lote— pero arrastrarla al
                         siguiente es cómo se cuela una fecha ajena. */
                      setDia(""); setMes(""); setAnio("");
                    }}>
              <option value="">{calle ? "Escoge…" : "Primero la calle"}</option>
              {modulos.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.clave}{u.familia ? ` · ${u.familia}` : ""}
                </option>
              ))}
            </select></label>
        </div>
        {ubicacion && (
          <p className="fe-aqui">
            <b>{ubicacion.clave}</b>
            {ubicacion.familia && <> · {ubicacion.familia}</>}
            {ubicacion.capacidad != null && <> · capacidad {ubicacion.capacidad}</>}
          </p>
        )}
      </section>
      )}

      {/* ---------- PASO 2: QUÉ HAY ---------- */}
      <section className={"fe-anotar" + (ubicacion ? "" : " dormida")}>
        <p className="fe-paso">2 · Qué hay ahí</p>

        <label className="fe-cod-campo">
          <span>Código</span>
          <input ref={campoCodigo} inputMode="numeric" value={codigo} disabled={!ubicacion}
                 placeholder="3128"
                 onChange={(e) => setCodigo(e.target.value)} />
        </label>
        {/* El material se confirma aquí mismo, no al final. */}
        <p className={"fe-eco" + (codigo && !material ? " mal" : "")}>
          {!codigo ? "Teclea el código y te digo qué es."
            : material
              ? <>{material.nombre}
                  {material.cajas_por_estiba != null
                    ? <> · <b>{material.cajas_por_estiba}</b> cajas por estiba</>
                    : <> · <b className="ojo">sin factor estibado</b> — las estibas darían cero</>}
                  {esEnvase && <> · envase</>}</>
              : <>Ese código no está en el maestro.</>}
        </p>

        <div className="fe-campos dos">
          <label><span>Qué cuentas</span>
            <select value={modo} disabled={!ubicacion}
                    onChange={(e) => setModo(e.target.value as "estibas" | "cajas")}>
              <option value="estibas">Estibas completas</option>
              <option value="cajas">Cajas sueltas</option>
            </select></label>
          <label><span>Cuántas</span>
            <input inputMode="numeric" value={cuantas} disabled={!ubicacion}
                   onChange={(e) => setCuantas(e.target.value)} /></label>
        </div>

        {/* ROTA SE CONTESTA SIEMPRE: en las 152 filas de la hoja real hay
            94 «SI» y 58 «NO». No es una casilla rara, es una pregunta, y
            por eso arranca sin respuesta en vez de en «no». */}
        <div className="fe-rota">
          <span>¿Rota?</span>
          <div className="fe-si-no">
            <button type="button" disabled={!ubicacion}
                    className={rot === true ? "on" : ""} onClick={() => setRot(true)}>Sí</button>
            <button type="button" disabled={!ubicacion}
                    className={rot === false ? "on" : ""} onClick={() => setRot(false)}>No</button>
          </div>
        </div>

        {/* La fecha va en tres pedazos porque así está impresa en la
            estiba y así se lee. Y se queda de un renglón al otro: dentro
            del mismo módulo las estibas suelen ser del mismo lote. */}
        <div className={"fe-fecha" + (esEnvase ? " opcional" : "")}>
          <span>Vence {esEnvase && <em>— el envase no trae fecha</em>}</span>
          <div className="fe-dma">
            <input inputMode="numeric" maxLength={2} placeholder="DD" value={dia}
                   disabled={!ubicacion} onChange={(e) => setDia(e.target.value)} />
            <input inputMode="numeric" maxLength={2} placeholder="MM" value={mes}
                   disabled={!ubicacion} onChange={(e) => setMes(e.target.value)} />
            <input inputMode="numeric" maxLength={2} placeholder="AA" value={anio}
                   disabled={!ubicacion} onChange={(e) => setAnio(e.target.value)} />
          </div>
        </div>

        {/* Lo raro va abajo y sin abultar: avería salió en 2 filas de 152
            y PNC en 1. Ponerlo con el mismo peso que el código sería
            cobrarle a los 150 renglones normales el costo de los dos
            raros. */}
        <div className="fe-marcas">
          <label className="fe-check">
            <input type="checkbox" checked={averia} disabled={!ubicacion}
                   onChange={(e) => setAveria(e.target.checked)} />
            <span>Avería</span>
          </label>
          <label className="fe-check">
            <input type="checkbox" checked={pnc} disabled={!ubicacion}
                   onChange={(e) => setPnc(e.target.checked)} />
            <span>PNC</span>
          </label>
          {esEnvase && (
            <label className="fe-estado">
              <span className="sr">Estado del envase</span>
              <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="">Estado del envase…</option>
                {estados.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
          )}
        </div>

        <button type="button" className="btn grande" disabled={!ubicacion || guardando}
                onClick={agregar}>
          {guardando ? "Guardando…" : "Anotar renglón"}
        </button>
        {!ubicacion && <p className="fe-cuenta">Escoge el módulo para empezar a anotar.</p>}
      </section>

      {/* ---------- LO QUE VA ---------- */}
      <section className="fe-recorrido">
        <div className="fe-rec-cab">
          <h2>El recorrido</h2>
          <span>
            {renglones.length} renglón{renglones.length === 1 ? "" : "es"} ·{" "}
            {modulosHechos} módulo{modulosHechos === 1 ? "" : "s"} ·{" "}
            {cajasTotal.toLocaleString("es-CO")} cajas
          </span>
        </div>

        {renglones.length === 0 ? (
          <p className="fe-vacio">Todavía no has anotado nada. Escoge el módulo y arranca.</p>
        ) : (
          <div className="fe-lista">
            {renglones.map((r) => (
              <article key={r.id}
                       className={"fe-fila" + (r.dias_para_salir != null && r.dias_para_salir < 0 ? " urgente" : "")}>
                <div className="fe-cab">
                  <b className="fe-cod">{r.codigo}</b>
                  <span className="fe-desc">{r.material}</span>
                  <span className="fe-ubi">{r.ubicacion_combinada ?? r.ubicacion}</span>
                  <button type="button" className="fe-mini" disabled={guardando}
                          onClick={() => borrar(r)}>Borrar</button>
                </div>
                <dl className="fe-cifras">
                  <div><dt>Total cajas</dt>
                    <dd>{Number(r.total_cajas).toLocaleString("es-CO")}</dd></div>
                  <div><dt>{r.estibas != null ? "Estibas" : "Cajas sueltas"}</dt>
                    <dd>{r.estibas ?? r.cajas}</dd></div>
                  <div><dt>Vence</dt>
                    <dd>{r.vencimiento
                      ? new Date(r.vencimiento + "T00:00:00").toLocaleDateString("es-CO")
                      : "—"}</dd></div>
                  {/* «DÍAS PARA SALIR» ES LA CIFRA DEL FEFO. No es cuándo
                      vence: es cuándo TIENE QUE HABER SALIDO para llegar
                      con vida útil suficiente. En negativo ya se pasó. */}
                  <div><dt>Días para salir</dt>
                    <dd className={r.dias_para_salir != null && r.dias_para_salir < 0 ? "falta" : undefined}>
                      {r.dias_para_salir ?? "—"}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
