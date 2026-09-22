"use client";

/**
 * EL MAESTRO DEL CD — materiales y ubicaciones.
 *
 * SON 494 MATERIALES Y 428 UBICACIONES, y eso cambia la forma de la
 * pantalla. El patrón de los otros maestros de la plataforma —cargar
 * todo en un formulario, editar lo que sea y dar Guardar— funciona con
 * treinta y siete filas y no con novecientas: sería una página de dos
 * mil campos que el navegador dibuja entera para cambiar un factor.
 *
 * ASÍ QUE AQUÍ SE BUSCA Y SE EDITA UNO. El buscador filtra en el
 * navegador —los datos ya están— así que responde por tecla sin ir al
 * servidor, que es lo que se siente lento con señal de bodega. Y lo que
 * se cambia se guarda en ese momento: no hay un Guardar general que
 * decida el destino de novecientas filas de una vez.
 *
 * DESACTIVAR NO ES BORRAR. Un material que ya salió en un conteo no se
 * puede borrar sin dejar ese histórico sin descripción —el conteo de la
 * semana pasada quedaría con un código pelado— así que se apaga. Deja de
 * ofrecerse al contar y lo contado antes se sigue leyendo.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useConfirmar } from "@/components/Confirmar";
import { useAvisos } from "@/components/Aviso";
import type { Material, Ubicacion, Bodega } from "@/modulos/inventario/fefo";

/* TRES BASES Y NO DOS. La bodega tenía su propia pantalla en el menú
   —herencia de la plantilla de demostración— y era el tercer sitio donde
   se editaba lo mismo. Un maestro que deja fuera una de sus bases obliga
   a salir del maestro para completarlo. */
type Pestania = "materiales" | "ubicaciones" | "bodegas";

const ent = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const txt = (v: number | null | undefined) => (v == null ? "" : String(v));

/* Cuántas filas se dibujan de una. Con 494 materiales, pintarlos todos
   son 494 filas con seis campos cada una: el celular tarda un segundo
   largo en el primer dibujo y otro en cada tecla del buscador. Se
   muestran las primeras y el buscador es lo que lleva a las demás — que
   es como se usa un maestro: nadie recorre 494 de arriba abajo. */
const TOPE = 60;

export function Maestro({ materiales: matIni, ubicaciones: ubiIni, bodegas, esEditor }: {
  materiales: Material[];
  ubicaciones: Ubicacion[];
  bodegas: Bodega[];
  esEditor: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [pedir, dialogo] = useConfirmar();
  const [avisar, avisos] = useAvisos();

  const [pestania, setPestania] = useState<Pestania>("materiales");
  const [busca, setBusca] = useState("");
  /* LA CALLE, COMO FILTRO. Sin esto, al maestro solo se llegaba
     escribiendo, y las calles del final del abecedario —P, sobre todo—
     nunca entraban en las primeras 60 filas: «me estás limitando en el
     maestro, filtro la calle P y no la veo». */
  const [fCalle, setFCalle] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [materiales, setMateriales] = useState(matIni);
  const [ubicaciones, setUbicaciones] = useState(ubiIni);
  const [bods, setBods] = useState(bodegas);
  /* La fila que se está tocando, aparte de la lista: así lo que se
     escribe no se pierde si la lista se reordena, y cancelar es
     devolverse sin haber alterado nada. */
  const [borrador, setBorrador] = useState<Record<string, string>>({});

  const q = busca.trim().toLowerCase();

  const matFiltrados = useMemo(() => materiales.filter((m) =>
    (verInactivos || m.activo) &&
    (q === "" || m.sku.includes(q) || m.nombre.toLowerCase().includes(q) ||
     (m.familia ?? "").toLowerCase().includes(q))),
    [materiales, q, verInactivos]);

  const bodFiltradas = useMemo(() => bods.filter((x) =>
    (verInactivos || x.activo) &&
    (q === "" || x.codigo.toLowerCase().includes(q) || x.nombre.toLowerCase().includes(q))),
    [bods, q, verInactivos]);

  const ubiFiltradas = useMemo(() => ubicaciones.filter((u) =>
    (verInactivos || u.activa) &&
    (fCalle === "" || u.calle === fCalle) &&
    (q === "" || u.clave.toLowerCase().includes(q) ||
     (u.familia ?? "").toLowerCase().includes(q))),
    [ubicaciones, q, verInactivos, fCalle]);

  /* Las calles que existen de verdad, en el orden del almacén: las de
     una letra primero (A, B, … P) y después las nombradas (ALAR, EST…). */
  const calles = useMemo(() => {
    const cs = [...new Set(ubicaciones.map((u) => u.calle).filter(Boolean))] as string[];
    return cs.sort((a, b) => (a.length === 1 ? 0 : 1) - (b.length === 1 ? 0 : 1) || a.localeCompare(b, "es", { numeric: true }));
  }, [ubicaciones]);

  function abrir(clave: string, campos: Record<string, string>) {
    setEditando(clave);
    setBorrador(campos);
  }
  const poner = (k: string, v: string) => setBorrador((b) => ({ ...b, [k]: v }));

  /* ---------- MATERIALES ---------- */
  async function guardarMaterial(m: Material) {
    const nombre = (borrador.nombre ?? "").trim();
    if (nombre === "") { avisar.mal("La descripción no puede quedar en blanco."); return }

    const parche = {
      nombre,
      unidades_por_caja: ent(borrador.unidades_por_caja ?? ""),
      cajas_por_estiba: ent(borrador.cajas_por_estiba ?? ""),
      vida_util: ent(borrador.vida_util ?? ""),
      dias_minimo: ent(borrador.dias_minimo ?? "") ?? 0,
      familia: (borrador.familia ?? "").trim() || null,
      tipo_material: (borrador.tipo_material ?? m.tipo_material) as "PRODUCTO" | "ENVASE",
      activo: borrador.activo === "1",
      actualizado_en: new Date().toISOString(),
    };

    setGuardando(true);
    const { error } = await supabase.from("productos").update(parche).eq("id", m.id);
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }

    /* Se pinta lo guardado en la lista sin volver a consultar: la
       pantalla ya sabe qué quedó, y recargar 494 filas para ver un campo
       cambiado es esperar por nada. */
    setMateriales((xs) => xs.map((x) => (x.id === m.id ? { ...x, ...parche } : x)));
    setEditando(null);
    avisar.bien(`${m.sku} guardado.`);
    router.refresh();
  }

  async function nuevoMaterial() {
    const sku = (borrador.sku ?? "").trim();
    const nombre = (borrador.nombre ?? "").trim();
    if (sku === "") { avisar.mal("Falta el código."); return }
    if (nombre === "") { avisar.mal("Falta la descripción."); return }
    if (materiales.some((m) => m.sku === sku)) {
      avisar.mal(`El código ${sku} ya está en el maestro.`); return;
    }

    const fila = {
      sku, nombre, unidad: "CAJA",
      unidades_por_caja: ent(borrador.unidades_por_caja ?? ""),
      cajas_por_estiba: ent(borrador.cajas_por_estiba ?? ""),
      familia: (borrador.familia ?? "").trim() || null,
      vida_util: ent(borrador.vida_util ?? ""),
      dias_minimo: ent(borrador.dias_minimo ?? "") ?? 0,
      tipo_material: (borrador.tipo_material ?? "PRODUCTO") as "PRODUCTO" | "ENVASE",
      activo: true,
    };

    setGuardando(true);
    const { data, error } = await supabase.from("productos").insert(fila).select().single();
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }

    setMateriales((xs) => [...xs, data as Material].sort((a, b) => a.sku.localeCompare(b.sku)));
    setEditando(null);
    avisar.bien(`${sku} agregado.`);
    router.refresh();
  }

  /* ---------- UBICACIONES ---------- */
  async function guardarUbicacion(u: Ubicacion) {
    const parche = {
      calle: (borrador.calle ?? "").trim().toUpperCase(),
      modulo: (borrador.modulo ?? "").trim(),
      lado: ((borrador.lado ?? "") || null) as "IZQ" | "DER" | null,
      familia: (borrador.familia ?? "").trim() || null,
      capacidad: ent(borrador.capacidad ?? ""),
      activa: borrador.activa === "1",
    };
    if (parche.calle === "") { avisar.mal("La calle no puede quedar en blanco."); return }

    setGuardando(true);
    const { error } = await supabase.from("ubicaciones").update(parche).eq("id", u.id);
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }

    setUbicaciones((xs) => xs.map((x) => (x.id === u.id ? { ...x, ...parche } : x)));
    setEditando(null);
    avisar.bien(`${u.clave} guardada.`);
    router.refresh();
  }

  async function nuevaUbicacion() {
    const clave = (borrador.clave ?? "").trim().toUpperCase();
    const calle = (borrador.calle ?? "").trim().toUpperCase();
    const bodega_id = borrador.bodega_id || bodegas[0]?.id;
    if (clave === "") { avisar.mal("Falta la clave: es lo que la identifica (A01_DER)."); return }
    if (calle === "") { avisar.mal("Falta la calle."); return }
    if (!bodega_id) { avisar.mal("No hay bodegas: crea una primero."); return }
    if (ubicaciones.some((u) => u.clave === clave && u.bodega_id === bodega_id)) {
      avisar.mal(`La ubicación ${clave} ya existe en esa bodega.`); return;
    }

    const fila = {
      bodega_id, clave, calle,
      modulo: (borrador.modulo ?? "").trim(),
      lado: ((borrador.lado ?? "") || null) as "IZQ" | "DER" | null,
      familia: (borrador.familia ?? "").trim() || null,
      capacidad: ent(borrador.capacidad ?? ""),
      activa: true,
    };

    setGuardando(true);
    const { data, error } = await supabase.from("ubicaciones").insert(fila).select().single();
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }

    setUbicaciones((xs) => [...xs, data as Ubicacion].sort((a, b) => a.clave.localeCompare(b.clave)));
    setEditando(null);
    avisar.bien(`${clave} agregada.`);
    router.refresh();
  }

  /* ---------- BODEGAS ---------- */
  async function guardarBodega(x: Bodega) {
    const nombre = (borrador.nombre ?? "").trim();
    if (nombre === "") { avisar.mal("El nombre no puede quedar en blanco."); return }
    const parche = {
      nombre,
      direccion: (borrador.direccion ?? "").trim() || null,
      activo: borrador.activo === "1",
    };
    setGuardando(true);
    const { error } = await supabase.from("bodegas").update(parche).eq("id", x.id);
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }
    setBods((xs) => xs.map((y) => (y.id === x.id ? { ...y, ...parche } : y)));
    setEditando(null);
    avisar.bien(`${x.codigo} guardada.`);
    router.refresh();
  }

  async function nuevaBodega() {
    const codigo = (borrador.codigo ?? "").trim().toUpperCase();
    const nombre = (borrador.nombre ?? "").trim();
    if (codigo === "") { avisar.mal("Falta el código de la bodega."); return }
    if (nombre === "") { avisar.mal("Falta el nombre."); return }
    if (bods.some((x) => x.codigo === codigo)) {
      avisar.mal(`La bodega ${codigo} ya existe.`); return;
    }
    const fila = { codigo, nombre, direccion: (borrador.direccion ?? "").trim() || null, activo: true };
    setGuardando(true);
    const { data, error } = await supabase.from("bodegas").insert(fila).select().single();
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }
    setBods((xs) => [...xs, data as Bodega].sort((a, c) => a.codigo.localeCompare(c.codigo)));
    setEditando(null);
    avisar.bien(`${codigo} agregada.`);
    router.refresh();
  }

  /* ---------- APAGAR ---------- */
  async function apagar(que: "material" | "ubicacion" | "bodega", id: string, nombre: string) {
    const ok = await pedir({
      titulo: `¿Sacar «${nombre}» del maestro?`,
      dice: <>Se <b>apaga</b>: deja de ofrecerse al contar, pero lo que ya se contó con él
             sigue leyéndose con su descripción. Se puede volver a encender desde aquí
             marcando «ver los inactivos».</>,
      confirmar: "Apagarlo",
      peligro: true,
    });
    if (!ok) return;

    setGuardando(true);
    const { error } = que === "material"
      ? await supabase.from("productos").update({ activo: false }).eq("id", id)
      : que === "ubicacion"
        ? await supabase.from("ubicaciones").update({ activa: false }).eq("id", id)
        : await supabase.from("bodegas").update({ activo: false }).eq("id", id);
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }

    if (que === "material") {
      setMateriales((xs) => xs.map((x) => (x.id === id ? { ...x, activo: false } : x)));
    } else if (que === "ubicacion") {
      setUbicaciones((xs) => xs.map((x) => (x.id === id ? { ...x, activa: false } : x)));
    } else {
      setBods((xs) => xs.map((x) => (x.id === id ? { ...x, activo: false } : x)));
    }
    setEditando(null);
    avisar.bien(`${nombre} apagado.`);
    router.refresh();
  }

  const lista = pestania === "materiales" ? matFiltrados
              : pestania === "ubicaciones" ? ubiFiltradas : bodFiltradas;
  const total = pestania === "materiales" ? materiales.length
              : pestania === "ubicaciones" ? ubicaciones.length : bods.length;
  const inactivos = pestania === "materiales" ? materiales.filter((m) => !m.activo).length
              : pestania === "ubicaciones" ? ubicaciones.filter((u) => !u.activa).length
              : bods.filter((x) => !x.activo).length;
  /* Con una calle escogida se ven TODAS las suyas: una calle son 60-90
     posiciones y cortarlas en 60 es esconder media calle. */
  const tope = pestania === "ubicaciones" && fCalle ? 500 : TOPE;
  const mostrados = lista.slice(0, tope);

  return (
    <>
      {dialogo}
      {avisos}

      <section className="fe-barra">
        <div className="fe-pes" role="tablist">
          {(["materiales", "ubicaciones", "bodegas"] as Pestania[]).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={pestania === p}
                    className={pestania === p ? "on" : ""}
                    onClick={() => { setPestania(p); setEditando(null); setBusca(""); setFCalle("") }}>
              {p === "materiales" ? "Materiales" : p === "ubicaciones" ? "Ubicaciones" : "Bodegas"}
              <em>{p === "materiales" ? materiales.length
                   : p === "ubicaciones" ? ubicaciones.length : bods.length}</em>
            </button>
          ))}
        </div>

        <label className="fe-busca">
          <span className="sr">Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
                 placeholder={pestania === "materiales"
                   ? "Código, descripción o familia — 3128, aguila, lata…"
                   : pestania === "ubicaciones"
                     ? "Clave o familia — A01, EST, RB F1000…"
                     : "Código o nombre — CD38…"} />
        </label>

        {pestania === "ubicaciones" && calles.length > 1 && (
          <label className="fe-filtro-calle">
            <span>Calle</span>
            <select value={fCalle} onChange={(e) => setFCalle(e.target.value)}>
              <option value="">Todas</option>
              {calles.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}

        {inactivos > 0 && (
          <label className="fe-check">
            <input type="checkbox" checked={verInactivos}
                   onChange={(e) => setVerInactivos(e.target.checked)} />
            <span>Ver los {inactivos} apagados</span>
          </label>
        )}

        {esEditor && (
          <button type="button" className="btn"
                  onClick={() => abrir("nuevo", pestania === "materiales"
                    ? { tipo_material: "PRODUCTO" }
                    : pestania === "ubicaciones"
                      ? { lado: "", bodega_id: bods[0]?.id ?? "" }
                      : {})}>
            Agregar
          </button>
        )}
      </section>

      {/* CUÁNTOS SE ESTÁN VIENDO, SIEMPRE. Sin esta línea, ver 60 de 494
          se lee como «el maestro tiene 60», que es una afirmación falsa
          sobre la que alguien puede decidir. */}
      <p className="fe-cuenta">
        {lista.length === total ? <>Los {total}.</> : <>{lista.length} de {total}.</>}
        {fCalle && <> Calle <b>{fCalle}</b>.</>}
        {lista.length > tope && <> Se muestran los primeros {tope} — afina la búsqueda para
          llegar al resto.</>}
      </p>

      {editando === "nuevo" && (
        <section className="fe-editor nuevo">
          <h2>{pestania === "materiales" ? "Material nuevo"
               : pestania === "ubicaciones" ? "Ubicación nueva" : "Bodega nueva"}</h2>
          {pestania === "materiales" ? (
            <div className="fe-campos">
              <label><span>Código</span>
                <input inputMode="numeric" value={borrador.sku ?? ""}
                       onChange={(e) => poner("sku", e.target.value)} /></label>
              <label className="ancho"><span>Descripción</span>
                <input value={borrador.nombre ?? ""}
                       onChange={(e) => poner("nombre", e.target.value)} /></label>
              <label><span>Factor estibado (cajas por estiba)</span>
                <input inputMode="numeric" value={borrador.cajas_por_estiba ?? ""}
                       onChange={(e) => poner("cajas_por_estiba", e.target.value)} /></label>
              <label><span>Unidades por caja</span>
                <input inputMode="numeric" value={borrador.unidades_por_caja ?? ""}
                       onChange={(e) => poner("unidades_por_caja", e.target.value)} /></label>
              <label><span>Vida útil (días)</span>
                <input inputMode="numeric" value={borrador.vida_util ?? ""}
                       onChange={(e) => poner("vida_util", e.target.value)} /></label>
              <label><span>Mínimo T1 (días para salir)</span>
                <input inputMode="numeric" value={borrador.dias_minimo ?? ""}
                       onChange={(e) => poner("dias_minimo", e.target.value)} /></label>
              <label><span>Familia</span>
                <input value={borrador.familia ?? ""}
                       onChange={(e) => poner("familia", e.target.value)} /></label>
              <label><span>Tipo</span>
                <select value={borrador.tipo_material ?? "PRODUCTO"}
                        onChange={(e) => poner("tipo_material", e.target.value)}>
                  <option value="PRODUCTO">Producto</option>
                  <option value="ENVASE">Envase</option>
                </select></label>
            </div>
          ) : pestania === "bodegas" ? (
            <div className="fe-campos">
              <label><span>Código</span>
                <input value={borrador.codigo ?? ""} placeholder="CD38"
                       onChange={(e) => poner("codigo", e.target.value)} /></label>
              <label className="ancho"><span>Nombre</span>
                <input value={borrador.nombre ?? ""} placeholder="CD38 · Ag01 Barranquilla"
                       onChange={(e) => poner("nombre", e.target.value)} /></label>
              <label className="ancho"><span>Dirección</span>
                <input value={borrador.direccion ?? ""}
                       onChange={(e) => poner("direccion", e.target.value)} /></label>
            </div>
          ) : (
            <div className="fe-campos">
              {bods.length > 1 && (
                <label><span>Bodega</span>
                  <select value={borrador.bodega_id ?? ""}
                          onChange={(e) => poner("bodega_id", e.target.value)}>
                    {bods.map((b) => <option key={b.id} value={b.id}>{b.codigo}</option>)}
                  </select></label>
              )}
              <label><span>Clave</span>
                <input value={borrador.clave ?? ""} placeholder="A01_DER"
                       onChange={(e) => poner("clave", e.target.value)} /></label>
              <label><span>Calle</span>
                <input value={borrador.calle ?? ""} placeholder="A"
                       onChange={(e) => poner("calle", e.target.value)} /></label>
              <label><span>Módulo</span>
                <input value={borrador.modulo ?? ""} placeholder="01"
                       onChange={(e) => poner("modulo", e.target.value)} /></label>
              <label><span>Lado</span>
                <select value={borrador.lado ?? ""}
                        onChange={(e) => poner("lado", e.target.value)}>
                  <option value="">Sin lado</option>
                  <option value="IZQ">Izquierdo</option>
                  <option value="DER">Derecho</option>
                </select></label>
              <label className="ancho"><span>Familia</span>
                <input value={borrador.familia ?? ""} placeholder="RB F1000"
                       onChange={(e) => poner("familia", e.target.value)} /></label>
              <label><span>Capacidad</span>
                <input inputMode="numeric" value={borrador.capacidad ?? ""}
                       onChange={(e) => poner("capacidad", e.target.value)} /></label>
            </div>
          )}
          <div className="fe-pie">
            <button type="button" className="btn" disabled={guardando}
                    onClick={pestania === "materiales" ? nuevoMaterial
                             : pestania === "ubicaciones" ? nuevaUbicacion : nuevaBodega}>
              {guardando ? "Guardando…" : "Agregar"}
            </button>
            <button type="button" className="btn plano" onClick={() => setEditando(null)}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      <div className="fe-lista">
        {mostrados.length === 0 && (
          <p className="fe-vacio">
            {q ? <>Nada con «{busca}».</> : <>Todavía no hay nada aquí.</>}
          </p>
        )}

        {pestania === "materiales" && (mostrados as Material[]).map((m) => {
          const abierto = editando === m.id;
          return (
            <article key={m.id} className={"fe-fila" + (m.activo ? "" : " apagada")}>
              <div className="fe-cab">
                <b className="fe-cod">{m.sku}</b>
                <span className="fe-desc">{m.nombre}</span>
                <span className={"fe-tipo " + m.tipo_material.toLowerCase()}>{m.tipo_material}</span>
                {!m.activo && <span className="fe-off">apagado</span>}
                {esEditor && !abierto && (
                  <button type="button" className="fe-mini"
                          onClick={() => abrir(m.id, {
                            nombre: m.nombre,
                            unidades_por_caja: txt(m.unidades_por_caja),
                            cajas_por_estiba: txt(m.cajas_por_estiba),
                            vida_util: txt(m.vida_util),
                            dias_minimo: txt(m.dias_minimo),
                            familia: m.familia ?? "",
                            tipo_material: m.tipo_material,
                            activo: m.activo ? "1" : "0",
                          })}>
                    Editar
                  </button>
                )}
              </div>

              {/* LAS TRES CIFRAS QUE DECIDEN LAS CUENTAS, a la vista sin
                  abrir nada: son las que hacen que un conteo dé bien o
                  mal, y revisarlas de un vistazo es para lo que se entra
                  a un maestro. */}
              <dl className="fe-cifras">
                <div><dt>Factor estibado</dt>
                  <dd className={m.cajas_por_estiba == null ? "falta" : undefined}>
                    {m.cajas_por_estiba ?? "falta"}</dd></div>
                <div><dt>Vida útil</dt>
                  <dd>{m.vida_util ? `${m.vida_util} d` : "—"}</dd></div>
                <div><dt>Mínimo T1</dt>
                  <dd>{m.dias_minimo ? `${m.dias_minimo} d` : "—"}</dd></div>
                <div><dt>Familia</dt><dd>{m.familia ?? "—"}</dd></div>
              </dl>

              {abierto && (
                <div className="fe-editor">
                  <div className="fe-campos">
                    <label className="ancho"><span>Descripción</span>
                      <input value={borrador.nombre ?? ""}
                             onChange={(e) => poner("nombre", e.target.value)} /></label>
                    <label><span>Factor estibado</span>
                      <input inputMode="numeric" value={borrador.cajas_por_estiba ?? ""}
                             onChange={(e) => poner("cajas_por_estiba", e.target.value)} /></label>
                    <label><span>Unidades por caja</span>
                      <input inputMode="numeric" value={borrador.unidades_por_caja ?? ""}
                             onChange={(e) => poner("unidades_por_caja", e.target.value)} /></label>
                    <label><span>Vida útil (días)</span>
                      <input inputMode="numeric" value={borrador.vida_util ?? ""}
                             onChange={(e) => poner("vida_util", e.target.value)} /></label>
                    <label><span>Mínimo T1</span>
                      <input inputMode="numeric" value={borrador.dias_minimo ?? ""}
                             onChange={(e) => poner("dias_minimo", e.target.value)} /></label>
                    <label><span>Familia</span>
                      <input value={borrador.familia ?? ""}
                             onChange={(e) => poner("familia", e.target.value)} /></label>
                    <label><span>Tipo</span>
                      <select value={borrador.tipo_material ?? m.tipo_material}
                              onChange={(e) => poner("tipo_material", e.target.value)}>
                        <option value="PRODUCTO">Producto</option>
                        <option value="ENVASE">Envase</option>
                      </select></label>
                    <label className="fe-check"><input type="checkbox"
                             checked={borrador.activo === "1"}
                             onChange={(e) => poner("activo", e.target.checked ? "1" : "0")} />
                      <span>Activo</span></label>
                  </div>
                  <div className="fe-pie">
                    <button type="button" className="btn" disabled={guardando}
                            onClick={() => guardarMaterial(m)}>
                      {guardando ? "Guardando…" : "Guardar"}
                    </button>
                    <button type="button" className="btn plano"
                            onClick={() => setEditando(null)}>Cancelar</button>
                    {m.activo && (
                      <button type="button" className="fe-quitar" disabled={guardando}
                              onClick={() => apagar("material", m.id, m.sku)}>
                        Sacar del maestro
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}

        {pestania === "bodegas" && (mostrados as Bodega[]).map((x) => {
          const abierto = editando === x.id;
          const cuantas = ubicaciones.filter((u) => u.bodega_id === x.id).length;
          return (
            <article key={x.id} className={"fe-fila" + (x.activo ? "" : " apagada")}>
              <div className="fe-cab">
                <b className="fe-cod">{x.codigo}</b>
                <span className="fe-desc">{x.nombre}</span>
                {!x.activo && <span className="fe-off">apagada</span>}
                {esEditor && !abierto && (
                  <button type="button" className="fe-mini"
                          onClick={() => abrir(x.id, {
                            nombre: x.nombre, direccion: x.direccion ?? "",
                            activo: x.activo ? "1" : "0",
                          })}>
                    Editar
                  </button>
                )}
              </div>
              <dl className="fe-cifras">
                {/* CUÁNTAS UBICACIONES CUELGAN DE ELLA es el dato que
                    decide si se puede apagar: apagar una bodega con 428
                    módulos deja el conteo sin dónde caminar. */}
                <div><dt>Ubicaciones</dt><dd>{cuantas}</dd></div>
                <div><dt>Dirección</dt><dd>{x.direccion ?? "—"}</dd></div>
              </dl>
              {abierto && (
                <div className="fe-editor">
                  <div className="fe-campos">
                    <label className="ancho"><span>Nombre</span>
                      <input value={borrador.nombre ?? ""}
                             onChange={(e) => poner("nombre", e.target.value)} /></label>
                    <label className="ancho"><span>Dirección</span>
                      <input value={borrador.direccion ?? ""}
                             onChange={(e) => poner("direccion", e.target.value)} /></label>
                    <label className="fe-check"><input type="checkbox"
                             checked={borrador.activo === "1"}
                             onChange={(e) => poner("activo", e.target.checked ? "1" : "0")} />
                      <span>Activa</span></label>
                  </div>
                  <div className="fe-pie">
                    <button type="button" className="btn" disabled={guardando}
                            onClick={() => guardarBodega(x)}>
                      {guardando ? "Guardando…" : "Guardar"}
                    </button>
                    <button type="button" className="btn plano"
                            onClick={() => setEditando(null)}>Cancelar</button>
                    {x.activo && (
                      <button type="button" className="fe-quitar" disabled={guardando}
                              onClick={() => apagar("bodega", x.id, x.codigo)}>
                        Sacar del maestro
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}

        {pestania === "ubicaciones" && (mostrados as Ubicacion[]).map((u) => {
          const abierto = editando === u.id;
          return (
            <article key={u.id} className={"fe-fila" + (u.activa ? "" : " apagada")}>
              <div className="fe-cab">
                <b className="fe-cod">{u.clave}</b>
                <span className="fe-desc">{u.familia ?? "sin familia"}</span>
                {!u.activa && <span className="fe-off">apagada</span>}
                {esEditor && !abierto && (
                  <button type="button" className="fe-mini"
                          onClick={() => abrir(u.id, {
                            calle: u.calle, modulo: u.modulo, lado: u.lado ?? "",
                            familia: u.familia ?? "", capacidad: txt(u.capacidad),
                            activa: u.activa ? "1" : "0",
                          })}>
                    Editar
                  </button>
                )}
              </div>

              <dl className="fe-cifras">
                <div><dt>Calle</dt><dd>{u.calle}</dd></div>
                <div><dt>Módulo</dt><dd>{u.modulo || "—"}</dd></div>
                <div><dt>Lado</dt><dd>{u.lado ?? "—"}</dd></div>
                <div><dt>Capacidad</dt><dd>{u.capacidad ?? "—"}</dd></div>
              </dl>

              {abierto && (
                <div className="fe-editor">
                  <div className="fe-campos">
                    <label><span>Calle</span>
                      <input value={borrador.calle ?? ""}
                             onChange={(e) => poner("calle", e.target.value)} /></label>
                    <label><span>Módulo</span>
                      <input value={borrador.modulo ?? ""}
                             onChange={(e) => poner("modulo", e.target.value)} /></label>
                    <label><span>Lado</span>
                      <select value={borrador.lado ?? ""}
                              onChange={(e) => poner("lado", e.target.value)}>
                        <option value="">Sin lado</option>
                        <option value="IZQ">Izquierdo</option>
                        <option value="DER">Derecho</option>
                      </select></label>
                    <label className="ancho"><span>Familia</span>
                      <input value={borrador.familia ?? ""}
                             onChange={(e) => poner("familia", e.target.value)} /></label>
                    <label><span>Capacidad</span>
                      <input inputMode="numeric" value={borrador.capacidad ?? ""}
                             onChange={(e) => poner("capacidad", e.target.value)} /></label>
                    <label className="fe-check"><input type="checkbox"
                             checked={borrador.activa === "1"}
                             onChange={(e) => poner("activa", e.target.checked ? "1" : "0")} />
                      <span>Activa</span></label>
                  </div>
                  <div className="fe-pie">
                    <button type="button" className="btn" disabled={guardando}
                            onClick={() => guardarUbicacion(u)}>
                      {guardando ? "Guardando…" : "Guardar"}
                    </button>
                    <button type="button" className="btn plano"
                            onClick={() => setEditando(null)}>Cancelar</button>
                    {u.activa && (
                      <button type="button" className="fe-quitar" disabled={guardando}
                              onClick={() => apagar("ubicacion", u.id, u.clave)}>
                        Sacar del maestro
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
