"use client";

/**
 * EL MAESTRO — orígenes y materiales.
 *
 * Esto existe para que los datos NO estén quemados. El SQL los siembra
 * una vez con lo que traía el Excel y de ahí en adelante manda esta
 * pantalla: se agrega, se edita y se quita. El SQL usa `on conflict do
 * nothing` justo por eso — volver a correrlo no pisa lo que se corrigió
 * aquí.
 *
 * Y es de donde salen las listas desplegables del formulario de
 * certificar: la lista de CD origen es esta tabla, no una constante en
 * el código. Cambiar un origen aquí lo cambia en el formulario.
 *
 * QUITAR NO ES BORRAR. Un origen o un material que ya usó un viaje no se
 * puede borrar sin llevarse el histórico por delante, así que en ese
 * caso se DESACTIVA: deja de salir en las listas y los viajes viejos
 * siguen leyéndose. Lo decide la base, no la pantalla, y devuelve el
 * motivo para poder decirlo.
 */

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Origen, Sku } from "@/modulos/sider/datos";

const CLASES = ["EER", "Cajas", "Estibas", "Cilindro"];

const txt = (v: number | null | undefined) => (v == null ? "" : String(v));
const num = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

type FilaOrigen = Origen & { nueva?: boolean };
type FilaSku = Sku & { nueva?: boolean };

export function Maestro({
  origenes: origIni,
  skus: skusIni,
  estibasPorSider,
  esEditor,
}: {
  origenes: Origen[];
  skus: Sku[];
  estibasPorSider: number;
  esEditor: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [origenes, setOrigenes] = useState<FilaOrigen[]>(origIni);
  const [skus, setSkus] = useState<FilaSku[]>(skusIni);
  const [estibas, setEstibas] = useState(String(estibasPorSider));
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  /* Se compara contra lo que llegó del servidor para saber qué cambió y
     mandar solo eso: mandar las 37 filas cada vez sería pedirle a la base
     que reescriba lo que nadie tocó. */
  const sucio =
    JSON.stringify(origenes) !== JSON.stringify(origIni) ||
    JSON.stringify(skus) !== JSON.stringify(skusIni) ||
    estibas !== String(estibasPorSider);

  const editarOrigen = (i: number, parche: Partial<FilaOrigen>) =>
    setOrigenes((xs) => xs.map((x, k) => (k === i ? { ...x, ...parche } : x)));
  const editarSku = (i: number, parche: Partial<FilaSku>) =>
    setSkus((xs) => xs.map((x, k) => (k === i ? { ...x, ...parche } : x)));

  const agregarOrigen = () =>
    setOrigenes((xs) => [...xs, { planta: "", cd_origen: "", activo: true, orden: null, nueva: true }]);
  const agregarSku = () =>
    setSkus((xs) => [...xs, {
      sku: "", descripcion: "", clase: "EER",
      cajas_x_estiba: null, unidades_x_caja: null, hl_x_unidad: null,
      activo: true, nueva: true,
    }]);

  /** Quitar: la base decide si borra o desactiva, y dice por qué. */
  async function quitar(tipo: "origen" | "sku", clave: string, nueva?: boolean, i?: number) {
    if (nueva) {
      if (tipo === "origen") setOrigenes((xs) => xs.filter((_, k) => k !== i));
      else setSkus((xs) => xs.filter((_, k) => k !== i));
      return;
    }
    if (!confirm(`¿Quitar "${clave}" del maestro?`)) return;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cli = supabase as any;
    const { data, error } =
      tipo === "origen"
        ? await cli.rpc("sider_quitar_origen", { p_planta: clave })
        : await cli.rpc("sider_quitar_sku", { p_sku: clave });
    if (error) { setAviso({ mal: true, texto: traducir(error.message) }); return; }
    setAviso({ mal: false, texto: `${clave}: ${data}` });
    // Se recarga para que la pantalla muestre lo que realmente quedó.
    location.reload();
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cli = supabase as any;

    const orig = origenes
      .filter((o) => o.planta.trim() !== "")
      .map((o) => ({
        planta: o.planta.trim(),
        cd_origen: o.cd_origen.trim() || o.planta.trim(),
        activo: o.activo,
        orden: o.orden,
      }));
    const mats = skus
      .filter((s) => s.sku.trim() !== "")
      .map((s) => ({
        sku: s.sku.trim(),
        descripcion: s.descripcion.trim() || s.sku.trim(),
        clase: s.clase,
        cajas_x_estiba: s.cajas_x_estiba,
        unidades_x_caja: s.unidades_x_caja,
        hl_x_unidad: s.hl_x_unidad,
        activo: s.activo,
      }));

    const vEstibas = num(estibas);
    if (vEstibas == null || vEstibas <= 0) {
      setAviso({ mal: true, texto: "Las estibas por sider tienen que ser un número mayor que cero." });
      setGuardando(false);
      return;
    }

    const r1 = await cli.from("sider_origenes").upsert(orig, { onConflict: "planta" });
    const r2 = await cli.from("sider_skus").upsert(mats, { onConflict: "sku" });
    const r3 = await cli.from("sider_parametros")
      .upsert([{ clave: "estibas_por_sider", valor: vEstibas }], { onConflict: "clave" });

    const err = r1.error || r2.error || r3.error;
    if (err) {
      setAviso({ mal: true, texto: traducir(err.message) });
      setGuardando(false);
      return;
    }
    setAviso({ mal: false, texto: "Maestro guardado." });
    setGuardando(false);
    location.reload();
  }

  const activos = (xs: { activo: boolean }[]) => xs.filter((x) => x.activo).length;
  const sinFactores = skus.filter(
    (s) => s.activo && (s.cajas_x_estiba == null || s.unidades_x_caja == null || s.hl_x_unidad == null)
  );

  return (
    <>
      {/* Un aviso, no el tema de la pantalla. Antes usaba .sin-tablas —el
          panel gordo de "falta crear el módulo en Supabase"— y se llevaba
          media pantalla para decir algo que se lee en tres segundos. Los
          nombres siguen ahí, porque saber CUÁLES es la mitad del aviso;
          lo que se fue es el tamaño. */}
      {!!sinFactores.length && (
        <section className="m-faltan">
          <p>
            <b>{sinFactores.length} material{sinFactores.length > 1 ? "es" : ""} sin factores</b>
            {" — "}sin cajas por estiba, unidades por caja o HL por unidad no se pueden
            calcular cajas, unidades ni HL. Están en null a propósito: poner un 1 sería
            inventarse el dato. Complétalos si viajan, desactívalos si no.
          </p>
          <p className="cuales">{sinFactores.map((s) => s.descripcion).join(" · ")}</p>
        </section>
      )}

      <div className="m-rejilla">
        {/* ====================== Orígenes ====================== */}
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>CD de origen</h2>
              <p>
                Esta es la lista desplegable del formulario. En el Excel había un{" "}
                <code>Monteria&nbsp;</code> con un espacio al final y quien lo escribiera sin
                él rompía el <code>VLOOKUP</code> en silencio; eligiéndolo de aquí eso no
                puede pasar.
              </p>
            </div>
          </div>

          <div className="m-fila origen cab">
            <span>Planta</span><span>CD origen</span><span />
          </div>
          {origenes.map((o, i) => (
            <div key={o.planta + i} className={"m-fila origen" + (o.activo ? "" : " apagada")}>
              <input type="text" value={o.planta} disabled={!esEditor || !o.nueva}
                     placeholder="Turbaco"
                     onChange={(e) => editarOrigen(i, { planta: e.target.value })}
                     aria-label="Planta" />
              <input type="text" value={o.cd_origen} disabled={!esEditor}
                     placeholder="CD Turbaco"
                     className={o.cd_origen !== origIni[i]?.cd_origen ? "tocada" : ""}
                     onChange={(e) => editarOrigen(i, { cd_origen: e.target.value })}
                     aria-label="CD origen" />
              {esEditor && (
                <button type="button" className="m-quitar" title={o.activo ? "Quitar" : "Desactivado"}
                        onClick={() => quitar("origen", o.planta, o.nueva, i)}
                        aria-label={`Quitar ${o.planta}`}>
                  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              )}
            </div>
          ))}
          {esEditor && (
            <div className="acciones">
              <button type="button" className="btn plano" onClick={agregarOrigen}>+ Agregar origen</button>
              <span className="estado">{activos(origenes)} activos de {origenes.length}</span>
            </div>
          )}
        </section>

        {/* ====================== Materiales ====================== */}
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>Materiales y factores</h2>
              <p>
                De aquí salen las tres cuentas: cajas = <b>cajas/estiba</b> × estibas,
                unidades = <b>unidades/caja</b> × cajas, HL = <b>HL/unidad</b> × unidades.
                En el Excel estos factores vivían triplicados en tres hojas; aquí hay una
                sola copia.
              </p>
            </div>
          </div>

          <div className="m-fila sku cab">
            <span>SKU</span><span>Descripción</span>
            <span>Cajas/est.</span><span>Unid/caja</span><span>HL/unid</span><span />
          </div>
          {skus.map((s, i) => (
            <div key={s.sku + i} className={"m-fila sku" + (s.activo ? "" : " apagada")}>
              <input type="text" value={s.sku} disabled={!esEditor || !s.nueva}
                     placeholder="3500162"
                     onChange={(e) => editarSku(i, { sku: e.target.value })}
                     aria-label="SKU" />
              <input type="text" value={s.descripcion} disabled={!esEditor}
                     placeholder="Envase Marron 330R" className="ancho"
                     onChange={(e) => editarSku(i, { descripcion: e.target.value })}
                     aria-label="Descripción" />
              <input type="text" inputMode="decimal" className="num"
                     value={txt(s.cajas_x_estiba)} disabled={!esEditor} placeholder="45"
                     onChange={(e) => editarSku(i, { cajas_x_estiba: num(e.target.value) })}
                     aria-label="Cajas por estiba" />
              <input type="text" inputMode="decimal" className="num"
                     value={txt(s.unidades_x_caja)} disabled={!esEditor} placeholder="30"
                     onChange={(e) => editarSku(i, { unidades_x_caja: num(e.target.value) })}
                     aria-label="Unidades por caja" />
              <input type="text" inputMode="decimal" className="num"
                     value={txt(s.hl_x_unidad)} disabled={!esEditor} placeholder="0,0033"
                     onChange={(e) => editarSku(i, { hl_x_unidad: num(e.target.value) })}
                     aria-label="HL por unidad" />
              {esEditor && (
                <button type="button" className="m-quitar" title={s.activo ? "Quitar" : "Desactivado"}
                        onClick={() => quitar("sku", s.sku, s.nueva, i)}
                        aria-label={`Quitar ${s.descripcion}`}>
                  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              )}
            </div>
          ))}
          {esEditor && (
            <div className="acciones">
              <button type="button" className="btn plano" onClick={agregarSku}>+ Agregar material</button>
              <span className="estado">{activos(skus)} activos de {skus.length}</span>
            </div>
          )}
        </section>
      </div>

      {/* ====================== Parámetro ====================== */}
      <section className="tarjeta">
        <div className="cab">
          <div>
            <h2>Estibas por sider</h2>
            <p>
              Con cuántas estibas se cuenta un sider completo. Es lo que divide en{" "}
              <code>Cantidad Sider = estibas ÷ este número</code>. En el Excel era un 36
              escrito a mano dentro de la fórmula, donde nadie lo iba a encontrar el día
              que cambiara el equipo.
            </p>
          </div>
        </div>
        <div className="m-fila origen">
          <input type="text" inputMode="decimal" className="num" value={estibas}
                 disabled={!esEditor} onChange={(e) => setEstibas(e.target.value)}
                 aria-label="Estibas por sider" />
          <span className="estado" style={{ marginLeft: 0, alignSelf: "center" }}>
            40 estibas = {num(estibas) ? (40 / num(estibas)!).toFixed(4).replace(".", ",") : "—"} sider
          </span>
        </div>
      </section>

      {esEditor ? (
        <section className="tarjeta">
          <div className="acciones">
            <button type="button" className="btn" disabled={!sucio || guardando} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar el maestro"}
            </button>
            <button type="button" className="btn plano" disabled={!sucio || guardando}
                    onClick={() => { setOrigenes(origIni); setSkus(skusIni); setEstibas(String(estibasPorSider)); }}>
              Deshacer
            </button>
            <span className={"estado" + (sucio ? " sucio" : "")}>
              {sucio ? "Hay cambios sin guardar" : "Todo guardado"}
            </span>
          </div>
          {aviso && <div className={"aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
        </section>
      ) : (
        <section className="tarjeta">
          <div className="acciones">
            <span className="estado" style={{ marginLeft: 0 }}>
              Solo lectura. Tocar el maestro requiere rol de supervisor.
            </span>
          </div>
        </section>
      )}
    </>
  );
}

/** El error crudo de PostgREST no le dice nada a quien está editando. */
function traducir(m: string): string {
  const t = m.toLowerCase();
  if (t.includes("does not exist") || t.includes("schema cache") || t.includes("function")) {
    return "Falta crear el módulo en Supabase: ejecuta supabase/modulos/sider.sql en el SQL Editor.";
  }
  if (t.includes("row-level security") || t.includes("permission") || t.includes("supervisor")) {
    return "Tu usuario no tiene permiso para tocar el maestro. Se necesita rol de supervisor o administrador.";
  }
  if (t.includes("duplicate key") || t.includes("already exists")) {
    return "Hay una planta o un SKU repetido: cada uno solo puede estar una vez.";
  }
  if (t.includes("foreign key")) {
    return "Ese registro ya lo usan viajes existentes, así que no se puede borrar. Desactívalo.";
  }
  return m;
}
