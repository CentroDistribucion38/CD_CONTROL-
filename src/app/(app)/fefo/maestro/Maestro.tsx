"use client";

/**
 * EL MAESTRO DE FEFO — materiales y ubicaciones.
 *
 * SON 494 MATERIALES Y 428 UBICACIONES, y eso cambia la forma de la
 * pantalla. El patrón de los otros maestros de la plataforma —cargar
 * todo en un formulario, editar lo que sea y dar Guardar— funciona con
 * treinta y siete filas y no con novecientas: sería una página de dos mil
 * campos que el navegador dibuja entero para cambiar un factor.
 *
 * ASÍ QUE AQUÍ SE BUSCA Y SE EDITA UNO. El buscador filtra en el
 * navegador —los datos ya están— así que responde por tecla sin ir al
 * servidor, que es lo que se siente lento con señal de bodega. Y lo que
 * se cambia se guarda en ese momento: no hay un Guardar general que
 * decida el destino de novecientas filas de una vez.
 *
 * QUITAR NO ES BORRAR, Y NO LO DECIDE ESTA PANTALLA. Un material que ya
 * usó un conteo no se puede borrar sin dejar ese histórico sin
 * descripción, así que la base mira si se usó, borra o desactiva, y
 * devuelve cuál de las dos hizo para poder decirlo.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useConfirmar } from "@/components/Confirmar";
import { useAvisos } from "@/components/Aviso";
import type { Material, Ubicacion } from "@/modulos/fefo/datos";

type Pestania = "materiales" | "ubicaciones";

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
   muestran las primeras y el buscador es lo que lleva a las demás —que
   es como se usa un maestro: nadie recorre 494 de arriba abajo. */
const TOPE = 60;

export function Maestro({ materiales: matIni, ubicaciones: ubiIni, esEditor }: {
  materiales: Material[];
  ubicaciones: Ubicacion[];
  esEditor: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [pedir, dialogo] = useConfirmar();
  const [avisar, avisos] = useAvisos();

  const [pestania, setPestania] = useState<Pestania>("materiales");
  const [busca, setBusca] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [materiales, setMateriales] = useState(matIni);
  const [ubicaciones, setUbicaciones] = useState(ubiIni);
  /* La fila que se está tocando, aparte de la lista: así lo que se
     escribe no se pierde si la lista se reordena, y cancelar es
     devolverse sin haber alterado nada. */
  const [borrador, setBorrador] = useState<Record<string, string>>({});

  const q = busca.trim().toLowerCase();

  const matFiltrados = useMemo(() => {
    const l = materiales.filter((m) =>
      (verInactivos || m.activo) &&
      (q === "" || String(m.codigo).includes(q) || m.descripcion.toLowerCase().includes(q)));
    return l;
  }, [materiales, q, verInactivos]);

  const ubiFiltradas = useMemo(() => {
    const l = ubicaciones.filter((u) =>
      (verInactivos || u.activa) &&
      (q === "" || u.clave.toLowerCase().includes(q) ||
       (u.familia ?? "").toLowerCase().includes(q)));
    return l;
  }, [ubicaciones, q, verInactivos]);

  function abrir(clave: string, campos: Record<string, string>) {
    setEditando(clave);
    setBorrador(campos);
  }
  const poner = (k: string, v: string) => setBorrador((b) => ({ ...b, [k]: v }));

  /* ---------- MATERIALES ---------- */
  async function guardarMaterial(m: Material) {
    const desc = (borrador.descripcion ?? "").trim();
    if (desc === "") { avisar.mal("La descripción no puede quedar en blanco."); return }

    const parche = {
      descripcion: desc,
      unidades_por_caja: ent(borrador.unidades_por_caja ?? ""),
      cajas_por_estiba: ent(borrador.cajas_por_estiba ?? ""),
      vida_util: ent(borrador.vida_util ?? ""),
      dias_minimo: ent(borrador.dias_minimo ?? "") ?? 0,
      familia: (borrador.familia ?? "").trim() || null,
      tipo: (borrador.tipo ?? m.tipo) as "PRODUCTO" | "ENVASE",
      activo: borrador.activo === "1",
      actualizado_en: new Date().toISOString(),
    };

    setGuardando(true);
    const { error } = await supabase.from("fefo_materiales")
      .update(parche).eq("codigo", m.codigo);
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }

    /* Se pinta lo guardado en la lista sin volver a consultar: la
       pantalla ya sabe qué quedó, y una recarga de 494 filas para ver un
       campo cambiado es esperar por nada. */
    setMateriales((xs) => xs.map((x) => (x.codigo === m.codigo ? { ...x, ...parche } : x)));
    setEditando(null);
    avisar.bien(`${m.codigo} guardado.`);
    router.refresh();
  }

  async function nuevoMaterial() {
    const codigo = ent(borrador.codigo ?? "");
    const desc = (borrador.descripcion ?? "").trim();
    if (codigo == null || codigo <= 0) { avisar.mal("El código tiene que ser un número."); return }
    if (desc === "") { avisar.mal("Falta la descripción."); return }
    if (materiales.some((m) => m.codigo === codigo)) {
      avisar.mal(`El código ${codigo} ya está en el maestro.`); return;
    }

    const fila = {
      codigo, descripcion: desc,
      unidades_por_caja: ent(borrador.unidades_por_caja ?? ""),
      cajas_por_estiba: ent(borrador.cajas_por_estiba ?? ""),
      unidades_por_estiba: null,
      contenido: null,
      familia: (borrador.familia ?? "").trim() || null,
      presentacion: null,
      vida_util: ent(borrador.vida_util ?? ""),
      dias_minimo: ent(borrador.dias_minimo ?? "") ?? 0,
      origen: null, foraneo: null,
      tipo: (borrador.tipo ?? "PRODUCTO") as "PRODUCTO" | "ENVASE",
      activo: true,
    };

    setGuardando(true);
    const { error } = await supabase.from("fefo_materiales").insert(fila);
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }

    setMateriales((xs) => [...xs, fila as Material].sort((a, b) => a.codigo - b.codigo));
    setEditando(null);
    avisar.bien(`${codigo} agregado.`);
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
    const { error } = await supabase.from("fefo_ubicaciones")
      .update(parche).eq("clave", u.clave);
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }

    setUbicaciones((xs) => xs.map((x) => (x.clave === u.clave ? { ...x, ...parche } : x)));
    setEditando(null);
    avisar.bien(`${u.clave} guardada.`);
    router.refresh();
  }

  async function nuevaUbicacion() {
    const clave = (borrador.clave ?? "").trim().toUpperCase();
    const calle = (borrador.calle ?? "").trim().toUpperCase();
    if (clave === "") { avisar.mal("Falta la clave: es lo que la identifica (A01_DER)."); return }
    if (calle === "") { avisar.mal("Falta la calle."); return }
    if (ubicaciones.some((u) => u.clave === clave)) {
      avisar.mal(`La ubicación ${clave} ya existe.`); return;
    }

    const fila: Ubicacion = {
      clave, calle,
      modulo: (borrador.modulo ?? "").trim(),
      lado: ((borrador.lado ?? "") || null) as "IZQ" | "DER" | null,
      familia: (borrador.familia ?? "").trim() || null,
      capacidad: ent(borrador.capacidad ?? ""),
      activa: true,
    };

    setGuardando(true);
    const { error } = await supabase.from("fefo_ubicaciones").insert(fila);
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }

    setUbicaciones((xs) => [...xs, fila].sort((a, b) => a.clave.localeCompare(b.clave)));
    setEditando(null);
    avisar.bien(`${clave} agregada.`);
    router.refresh();
  }

  /* ---------- QUITAR: lo decide la base ---------- */
  async function quitar(que: "material" | "ubicacion", clave: string | number, nombre: string) {
    const ok = await pedir({
      titulo: `¿Quitar «${nombre}» del maestro?`,
      dice: <>Si ya lo usó algún conteo no se borra: se <b>desactiva</b>. Deja de salir en
             las listas y lo contado antes se sigue leyendo con su descripción. Si nadie lo
             usó, se borra.</>,
      confirmar: "Quitarlo",
      peligro: true,
    });
    if (!ok) return;

    setGuardando(true);
    const { data, error } = que === "material"
      ? await supabase.rpc("fefo_quitar_material", { p_codigo: clave as number })
      : await supabase.rpc("fefo_quitar_ubicacion", { p_clave: clave as string });
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }

    avisar.bien(`${nombre} — ${data}`);
    /* Aquí SÍ se vuelve a consultar: la base decidió entre borrar y
       desactivar, y adivinar cuál de las dos hizo para pintarlo sería
       volver a tener dos versiones de la verdad. */
    router.refresh();
    if (que === "material") {
      setMateriales((xs) => String(data).toLowerCase().startsWith("borrado")
        ? xs.filter((x) => x.codigo !== clave)
        : xs.map((x) => (x.codigo === clave ? { ...x, activo: false } : x)));
    } else {
      setUbicaciones((xs) => String(data).toLowerCase().startsWith("borrada")
        ? xs.filter((x) => x.clave !== clave)
        : xs.map((x) => (x.clave === clave ? { ...x, activa: false } : x)));
    }
    setEditando(null);
  }

  const lista = pestania === "materiales" ? matFiltrados : ubiFiltradas;
  const total = pestania === "materiales" ? materiales.length : ubicaciones.length;
  const inactivos = pestania === "materiales"
    ? materiales.filter((m) => !m.activo).length
    : ubicaciones.filter((u) => !u.activa).length;
  const mostrados = lista.slice(0, TOPE);

  return (
    <>
      {dialogo}
      {avisos}

      <section className="fe-barra">
        <div className="fe-pes" role="tablist">
          {(["materiales", "ubicaciones"] as Pestania[]).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={pestania === p}
                    className={pestania === p ? "on" : ""}
                    onClick={() => { setPestania(p); setEditando(null); setBusca("") }}>
              {p === "materiales" ? "Materiales" : "Ubicaciones"}
              <em>{p === "materiales" ? materiales.length : ubicaciones.length}</em>
            </button>
          ))}
        </div>

        <label className="fe-busca">
          <span className="sr">Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
                 placeholder={pestania === "materiales"
                   ? "Código o descripción — 3128, aguila, lata…"
                   : "Clave o familia — A01, EST, RB F1000…"} />
        </label>

        {inactivos > 0 && (
          <label className="fe-check">
            <input type="checkbox" checked={verInactivos}
                   onChange={(e) => setVerInactivos(e.target.checked)} />
            <span>Ver los {inactivos} inactivos</span>
          </label>
        )}

        {esEditor && (
          <button type="button" className="btn"
                  onClick={() => abrir("nuevo", pestania === "materiales"
                    ? { tipo: "PRODUCTO" } : { lado: "" })}>
            Agregar
          </button>
        )}
      </section>

      {/* CUÁNTOS SE ESTÁN VIENDO, SIEMPRE. Sin esta línea, ver 60 de 494
          se lee como «el maestro tiene 60», que es una afirmación falsa
          sobre la que alguien puede decidir. */}
      <p className="fe-cuenta">
        {lista.length === total
          ? <>Los {total}.</>
          : <>{lista.length} de {total}.</>}
        {lista.length > TOPE && <> Se muestran los primeros {TOPE} — afina la búsqueda para
          llegar al resto.</>}
      </p>

      {editando === "nuevo" && (
        <section className="fe-editor nuevo">
          <h2>{pestania === "materiales" ? "Material nuevo" : "Ubicación nueva"}</h2>
          {pestania === "materiales" ? (
            <div className="fe-campos">
              <label><span>Código</span>
                <input inputMode="numeric" value={borrador.codigo ?? ""}
                       onChange={(e) => poner("codigo", e.target.value)} /></label>
              <label className="ancho"><span>Descripción</span>
                <input value={borrador.descripcion ?? ""}
                       onChange={(e) => poner("descripcion", e.target.value)} /></label>
              <label><span>Cajas por estiba</span>
                <input inputMode="numeric" value={borrador.cajas_por_estiba ?? ""}
                       onChange={(e) => poner("cajas_por_estiba", e.target.value)} /></label>
              <label><span>Unidades por caja</span>
                <input inputMode="numeric" value={borrador.unidades_por_caja ?? ""}
                       onChange={(e) => poner("unidades_por_caja", e.target.value)} /></label>
              <label><span>Vida útil (días)</span>
                <input inputMode="numeric" value={borrador.vida_util ?? ""}
                       onChange={(e) => poner("vida_util", e.target.value)} /></label>
              <label><span>Días mínimo para salir</span>
                <input inputMode="numeric" value={borrador.dias_minimo ?? ""}
                       onChange={(e) => poner("dias_minimo", e.target.value)} /></label>
              <label><span>Tipo</span>
                <select value={borrador.tipo ?? "PRODUCTO"}
                        onChange={(e) => poner("tipo", e.target.value)}>
                  <option value="PRODUCTO">Producto</option>
                  <option value="ENVASE">Envase</option>
                </select></label>
            </div>
          ) : (
            <div className="fe-campos">
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
                    onClick={pestania === "materiales" ? nuevoMaterial : nuevaUbicacion}>
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
          const abierto = editando === `m${m.codigo}`;
          return (
            <article key={m.codigo} className={"fe-fila" + (m.activo ? "" : " apagada")}>
              <div className="fe-cab">
                <b className="fe-cod">{m.codigo}</b>
                <span className="fe-desc">{m.descripcion}</span>
                <span className={"fe-tipo " + m.tipo.toLowerCase()}>{m.tipo}</span>
                {!m.activo && <span className="fe-off">inactivo</span>}
                {esEditor && !abierto && (
                  <button type="button" className="fe-mini"
                          onClick={() => abrir(`m${m.codigo}`, {
                            descripcion: m.descripcion,
                            unidades_por_caja: txt(m.unidades_por_caja),
                            cajas_por_estiba: txt(m.cajas_por_estiba),
                            vida_util: txt(m.vida_util),
                            dias_minimo: txt(m.dias_minimo),
                            familia: m.familia ?? "",
                            tipo: m.tipo,
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
                <div><dt>Cajas por estiba</dt>
                  <dd className={m.cajas_por_estiba == null ? "falta" : undefined}>
                    {m.cajas_por_estiba ?? "falta"}</dd></div>
                <div><dt>Vida útil</dt>
                  <dd>{m.vida_util ? `${m.vida_util} d` : "—"}</dd></div>
                <div><dt>Sale antes de</dt>
                  <dd>{m.dias_minimo ? `${m.dias_minimo} d` : "—"}</dd></div>
                <div><dt>Familia</dt><dd>{m.familia ?? "—"}</dd></div>
              </dl>

              {abierto && (
                <div className="fe-editor">
                  <div className="fe-campos">
                    <label className="ancho"><span>Descripción</span>
                      <input value={borrador.descripcion ?? ""}
                             onChange={(e) => poner("descripcion", e.target.value)} /></label>
                    <label><span>Cajas por estiba</span>
                      <input inputMode="numeric" value={borrador.cajas_por_estiba ?? ""}
                             onChange={(e) => poner("cajas_por_estiba", e.target.value)} /></label>
                    <label><span>Unidades por caja</span>
                      <input inputMode="numeric" value={borrador.unidades_por_caja ?? ""}
                             onChange={(e) => poner("unidades_por_caja", e.target.value)} /></label>
                    <label><span>Vida útil (días)</span>
                      <input inputMode="numeric" value={borrador.vida_util ?? ""}
                             onChange={(e) => poner("vida_util", e.target.value)} /></label>
                    <label><span>Días mínimo para salir</span>
                      <input inputMode="numeric" value={borrador.dias_minimo ?? ""}
                             onChange={(e) => poner("dias_minimo", e.target.value)} /></label>
                    <label><span>Familia</span>
                      <input value={borrador.familia ?? ""}
                             onChange={(e) => poner("familia", e.target.value)} /></label>
                    <label><span>Tipo</span>
                      <select value={borrador.tipo ?? m.tipo}
                              onChange={(e) => poner("tipo", e.target.value)}>
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
                    <button type="button" className="fe-quitar" disabled={guardando}
                            onClick={() => quitar("material", m.codigo, String(m.codigo))}>
                      Quitar del maestro
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}

        {pestania === "ubicaciones" && (mostrados as Ubicacion[]).map((u) => {
          const abierto = editando === `u${u.clave}`;
          return (
            <article key={u.clave} className={"fe-fila" + (u.activa ? "" : " apagada")}>
              <div className="fe-cab">
                <b className="fe-cod">{u.clave}</b>
                <span className="fe-desc">{u.familia ?? "sin familia"}</span>
                {!u.activa && <span className="fe-off">inactiva</span>}
                {esEditor && !abierto && (
                  <button type="button" className="fe-mini"
                          onClick={() => abrir(`u${u.clave}`, {
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
                    <button type="button" className="fe-quitar" disabled={guardando}
                            onClick={() => quitar("ubicacion", u.clave, u.clave)}>
                      Quitar del maestro
                    </button>
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
