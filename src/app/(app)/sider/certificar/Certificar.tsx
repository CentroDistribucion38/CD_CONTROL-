"use client";

/**
 * CERTIFICAR — un paso por pantalla, no un formulario con 16 campos.
 *
 * Quien llena esto está parado al lado de un vehículo, con el teléfono en
 * una mano. Un formulario largo obliga a buscar dónde quedó uno; una
 * secuencia de pasos con un botón grande, no.
 *
 * De las 16 columnas de la hoja solo se piden CINCO. Las once restantes
 * se van calculando y se ven abajo en el tiquete mientras se avanza: al
 * llegar al último paso ya se sabe cuántas cajas, unidades y HL se están
 * certificando, en vez de enterarse después en un Excel.
 *
 * LA UBICACIÓN VA PRIMERO, no al final. Si se pidiera al final, alguien
 * podría llenar todo y certificar desde su casa. Y se guarda la PRECISIÓN
 * en metros: una ubicación con dos kilómetros de error no es evidencia de
 * nada, y sin el número nadie puede saber que no lo era.
 *
 * LA SALIDA SE HACE EN DOS TIEMPOS. Aquí se certifica en el patio —uno o
 * VARIOS materiales, con las estibas de cada uno—, y al terminar las fotos
 * se toca «Guardar»: se crea una FICHA PENDIENTE. El camión todavía no va
 * en tránsito: el facturador escribe el número de factura y le da salida
 * en «Dar salida», y ahí nacen los viajes, uno por material.
 *
 * LAS FOTOS SE SELLAN en el navegador antes de subirlas: placa, fecha,
 * hora y coordenadas quemadas en la esquina. Así la foto sigue probando
 * algo aunque salga del sistema por WhatsApp.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Origen, Sku, Ficha } from "@/modulos/sider/datos";
/* La ubicación, el sellado de las fotos y sus mensajes viven en un solo
   sitio: la llegada pide exactamente lo mismo que la salida. */
import {
  RANURAS, type Ranura, type Foto,
  usePosicion, TarjetaUbicacion, CampoDireccion, Ranurita,
  sellar, subirFotosFicha, traducirFicha,
} from "@/modulos/sider/evidencia";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const num = (s: string) => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

type Linea = { sku: string; estibas: string };

export function Certificar({ origenes, skus, estibasPorSider, esEditor, fichas = [] }: {
  origenes: Origen[];
  skus: Sku[];
  estibasPorSider: number;
  esEditor: boolean;
  /** Mis fichas que esperan su factura. */
  fichas?: Ficha[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [paso, setPaso] = useState(0);
  const pos = usePosicion();
  const { ubi, direccion } = pos;

  const [planta, setPlanta] = useState("");
  /* UNO O VARIOS MATERIALES: cada uno con SUS estibas. El orden es el
     de escogerlos. */
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [placa, setPlaca] = useState("");
  /* Lote y observación son del camión y opcionales: a veces el papel llega
     después. La FACTURA ya no se pide aquí: la escribe el facturador al
     darle salida, y es lo que confirma el viaje. */
  const [lote, setLote] = useState("");
  const [nota, setNota] = useState("");
  const [fotos, setFotos] = useState<Partial<Record<Ranura, Foto>>>({});

  const [enviando, setEnviando] = useState(false);
  const [avance, setAvance] = useState("");
  const [descartando, setDescartando] = useState<string | null>(null);
  const [seguro, setSeguro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  const skuDe = (sku: string) => skus.find((k) => k.sku === sku);
  const estOk = (l: Linea) => { const n = num(l.estibas); return !!n && n > 0 };

  const alternar = (sku: string) =>
    setLineas((ls) => ls.some((l) => l.sku === sku)
      ? ls.filter((l) => l.sku !== sku)
      : [...ls, { sku, estibas: "" }]);
  const ponerEstibas = (sku: string, v: string) =>
    setLineas((ls) => ls.map((l) => (l.sku === sku ? { ...l, estibas: v } : l)));

  /* Las once derivadas, calculadas mientras se avanza. Son las mismas
     fórmulas de la hoja; la vista de la base las vuelve a calcular al
     leer, así que esto es solo para poder verlas antes de guardar.
     Una por material y el total del camión: si a un material le faltan
     factores, esa cifra del total dice cuál falta en vez de callar. */
  const derDe = (l: Linea) => {
    const mat = skuDe(l.sku);
    const nEst = num(l.estibas);
    if (!mat || !nEst || nEst <= 0) return null;
    const cajas = mat.cajas_x_estiba == null ? null : Number(mat.cajas_x_estiba) * nEst;
    const unidades = cajas == null || mat.unidades_x_caja == null
      ? null : Number(mat.unidades_x_caja) * cajas;
    const hl = unidades == null || mat.hl_x_unidad == null
      ? null : Number(mat.hl_x_unidad) * unidades;
    return { estibas: nEst, sider: nEst / estibasPorSider, cajas, unidades, hl };
  };
  const total = useMemo(() => {
    const ds = lineas.map((l) => derDe(l));
    const campo = (f: "estibas" | "sider" | "cajas" | "unidades" | "hl") => {
      const con = ds.filter((d) => d && d[f] != null);
      if (con.length === 0) return { v: null as number | null, falta: [] as number[] };
      const falta = ds.map((d, i) => (d && d[f] != null ? 0 : i + 1)).filter(Boolean);
      return { v: con.reduce((a, d) => a + (d![f] as number), 0), falta };
    };
    return { estibas: campo("estibas"), sider: campo("sider"), cajas: campo("cajas"),
             unidades: campo("unidades"), hl: campo("hl") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, skus, estibasPorSider]);
  const sinFactores = lineas.map((l) => skuDe(l.sku))
    .filter((m): m is Sku => !!m && (m.cajas_x_estiba == null || m.unidades_x_caja == null || m.hl_x_unidad == null));

  /* ---------------- Fotos ---------------- */
  async function tomar(ranura: Ranura, archivo: File) {
    try {
      const foto = await sellar(archivo, {
        titulo: placa.trim().toUpperCase() || "SIN PLACA",
        ubi,
        direccion: direccion.trim(),
        etiqueta: RANURAS.find((r) => r.id === ranura)!.t,
      });
      setFotos((f) => {
        if (f[ranura]) URL.revokeObjectURL(f[ranura]!.url);
        return { ...f, [ranura]: foto };
      });
    } catch {
      setAviso({ mal: true, texto: "No se pudo procesar esa foto. Vuelve a tomarla." });
    }
  }

  const faltanFotos = RANURAS.filter((r) => !fotos[r.id]);

  /* ---------------- Guardar la ficha ---------------- */
  const listoMateriales = lineas.length > 0 && lineas.every(estOk);

  async function guardar() {
    if (!ubi || !planta || !listoMateriales || !placa.trim() || faltanFotos.length) return;
    setEnviando(true);
    setAviso(null);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cli = supabase as any;

    setAvance("Guardando la ficha…");
    const { data, error } = await cli.rpc("sider_ficha_guardar", {
      p_placa: placa.trim().toUpperCase(),
      p_planta: planta,
      p_lat: ubi.lat,
      p_lng: ubi.lng,
      p_precision_m: Math.round(ubi.precision),
      p_ubicado_en: ubi.en,
      p_direccion: direccion.trim() || null,
      p_nota: nota.trim() || null,
      p_lote: lote.trim().toUpperCase() || null,
      p_lineas: lineas.map((l) => ({ sku: l.sku, estibas: num(l.estibas) })),
    });

    if (error) {
      setAviso({ mal: true, texto: traducirFicha(error.message) });
      setEnviando(false);
      setAvance("");
      return;
    }

    const fichaId: string = Array.isArray(data) ? data[0] : data;
    const mal = await subirFotosFicha(cli, { fichaId, fotos, avance: setAvance });
    if (mal) {
      setAviso({
        mal: true,
        texto:
          `La ficha de ${placa.toUpperCase()} quedó guardada, pero ${mal}. ` +
          `Descártala en «Mis fichas pendientes» y vuelve a hacerla: sin las tres fotos no se le puede dar salida.`,
      });
      setEnviando(false);
      setAvance("");
      router.refresh();
      return;
    }

    setAvance("");
    setEnviando(false);
    setAviso(null);
    setPaso(6);
    router.refresh();
  }

  async function descartar(f: Ficha) {
    setDescartando(f.id);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { error } = await (supabase as any).rpc("sider_ficha_descartar", { p_ficha: f.id });
    setDescartando(null);
    setSeguro(null);
    if (error) { setAviso({ mal: true, texto: traducirFicha(error.message) }); return }
    setAviso({ mal: false, texto: `La ficha de ${f.placa} se descartó.` });
    router.refresh();
  }

  function otro() {
    for (const f of Object.values(fotos)) if (f) URL.revokeObjectURL(f.url);
    setFotos({});
    setLineas([]);
    setPlaca("");
    setLote("");
    setNota("");
    setAviso(null);
    setPaso(1);
  }

  if (!esEditor) {
    return (
      <section className="tarjeta">
        <div className="cab">
          <div>
            <h2>Solo lectura</h2>
            <p>Certificar requiere rol de supervisor o administrador. Pídeselo a un administrador.</p>
          </div>
        </div>
      </section>
    );
  }

  /* ---------------- Los pasos ---------------- */
  const pasos = [
    { t: "Ubicación", ok: !!ubi },
    { t: "Origen", ok: !!planta },
    { t: "Material", ok: listoMateriales },
    { t: "Carga", ok: listoMateriales && !!placa.trim() },
    { t: "Fotos", ok: faltanFotos.length === 0 },
    { t: "Guardar", ok: false },
  ];
  const listo = pasos.slice(0, 5).every((p) => p.ok);

  /**
   * A UN PASO SOLO SE LLEGA SI LOS ANTERIORES ESTÁN LISTOS.
   *
   * Los números de arriba eran botones sin condición: se podía tocar
   * "2 Origen" y saltarse la ubicación. Guardar nunca fue posible sin
   * ella —certificar() se devuelve sin ubi y la función de la base la
   * exige—, pero dejar avanzar y frenar al final es la peor forma de
   * pedir algo: la persona llena cinco pantallas para enterarse en la
   * sexta de que tenía que empezar por el GPS.
   *
   * Y la ubicación no es un campo más: es LO QUE PRUEBA que quien
   * certificó estaba parado al lado del vehículo. Sin ella la
   * certificación no es evidencia de nada, así que es requisito duro,
   * no una recomendación.
   */
  const alcanzable = (i: number) => i === 0 || pasos.slice(0, i).every((p) => p.ok);
  const porque = (i: number) => {
    if (alcanzable(i)) return undefined;
    const primero = pasos.slice(0, i).findIndex((p) => !p.ok);
    return primero === 0
      ? "Primero activa tu ubicación: sin ella la certificación no prueba nada."
      : `Primero completa el paso ${primero + 1}: ${pasos[primero].t}.`;
  };

  return (
    <>
      {/* ---------- El camino ---------- */}
      <ol className="ct-pasos">
        {pasos.map((p, i) => {
          const puede = alcanzable(i);
          const razon = porque(i);
          return (
            <li
              key={p.t}
              className={(i === paso ? "aqui " : "") + (p.ok ? "listo " : "") + (puede ? "" : "trancado")}
            >
              <button
                type="button"
                onClick={() => setPaso(i)}
                disabled={enviando || !puede}
                title={razon}
                aria-label={razon ? `${p.t} — ${razon}` : p.t}
              >
                <i>{p.ok ? "✓" : i + 1}</i>
                <span>{p.t}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Que se DIGA por qué está trancado. Un botón gris sin explicación
          se lee como una app rota, no como un requisito. */}
      {!ubi && (
        <p className="ct-tranca">
          <b>La ubicación es obligatoria.</b> Los demás pasos se abren cuando la
          actives: es lo que prueba que estabas al lado del vehículo.
        </p>
      )}

      {/* Sin la clase "ct": en globals.css es una utilidad de RÓTULO
          —10px, mayúscula, letra separada, gris— y aquí se había puesto
          queriendo decir "certificar". Colisión de nombres: la heredaba
          TODO el contenido de la tarjeta, así que cada párrafo de esta
          pantalla salía gritando en mayúscula y en gris claro. Por eso
          el aviso de "faltan las fotos de la salida" era ilegible. Las
          clases ct-* de abajo son otras y no se tocan. */}
      <section className="tarjeta">
        {/* ================= 0 · Ubicación ================= */}
        {paso === 0 && (
          <div className="ct-paso">
            <h2>¿Dónde estás?</h2>
            <p className="ct-dice">
              Va primero a propósito. Si se pidiera al final, se podría llenar todo y
              certificar desde cualquier parte. Un toque y sigue.
            </p>

            {!ubi && (
              <button type="button" className="ct-grande" onClick={pos.pedir} disabled={pos.buscando}>
                {pos.buscando ? "Buscando el GPS…" : "Activar mi ubicación"}
              </button>
            )}

            {pos.errUbi && <div className="aviso mal ct-suelto">{pos.errUbi}</div>}

            {ubi && (
              <>
                <TarjetaUbicacion ubi={ubi} />
                <CampoDireccion
                  direccion={direccion}
                  setDireccion={pos.setDireccion}
                  buscandoDir={pos.buscandoDir}
                />
                <div className="ct-botones">
                  <button type="button" className="btn" onClick={() => setPaso(1)}>Seguir</button>
                  <button type="button" className="btn plano" onClick={pos.pedir} disabled={pos.buscando}>
                    Volver a tomarla
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ================= 1 · Origen ================= */}
        {paso === 1 && (
          <div className="ct-paso">
            <h2>¿De qué CD viene?</h2>
            <p className="ct-dice">
              Esta lista sale del maestro, no del código: lo que se agregue o corrija allá
              aparece aquí.
            </p>
            <div className="ct-opciones">
              {origenes.filter((o) => o.activo).map((o) => (
                <button key={o.planta} type="button"
                        className={"ct-op" + (planta === o.planta ? " on" : "")}
                        onClick={() => { setPlanta(o.planta); setPaso(2); }}>
                  <b>{o.cd_origen}</b>
                  <span>{o.planta}</span>
                </button>
              ))}
            </div>
            {!origenes.some((o) => o.activo) && (
              <div className="aviso mal ct-suelto">
                No hay orígenes activos en el maestro. Agrégalos en Maestro.
              </div>
            )}
          </div>
        )}

        {/* ================= 2 · Material ================= */}
        {paso === 2 && (
          <div className="ct-paso">
            <h2>¿Qué trae?</h2>
            <p className="ct-dice">
              Toca <b>uno o varios</b> materiales: al tocar cada uno se abre su casilla de
              estibas. Los que tienen el aviso naranja no tienen factores cargados: de
              ellos no se pueden calcular cajas, unidades ni HL.
            </p>
            <div className="ct-opciones">
              {skus.filter((s) => s.activo).map((s) => {
                const falta = s.cajas_x_estiba == null || s.unidades_x_caja == null || s.hl_x_unidad == null;
                const l = lineas.find((x) => x.sku === s.sku);
                return (
                  <div key={s.sku} className={"ct-item" + (l ? " on" : "")}>
                    <button type="button" aria-pressed={!!l}
                            className={"ct-op" + (l ? " on" : "") + (falta ? " falta" : "")}
                            onClick={() => alternar(s.sku)}>
                      <b>{s.descripcion}</b>
                      <span>
                        {s.sku}
                        {falta ? " · sin factores" : ` · ${nf2.format(Number(s.cajas_x_estiba))} cajas/estiba`}
                      </span>
                      {l && <i className="ct-marca" aria-hidden="true">✓</i>}
                    </button>
                    {l && (
                      <label className={"ct-est" + (estOk(l) ? "" : " falta")}>
                        <span>Estibas</span>
                        <input inputMode="decimal" value={l.estibas} placeholder="0" autoFocus
                               aria-label={`Estibas de ${s.descripcion}`}
                               onChange={(e) => ponerEstibas(s.sku, e.target.value)} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="ct-botones">
              <button type="button" className="btn" disabled={!listoMateriales}
                      onClick={() => setPaso(3)}>
                {lineas.length === 0
                  ? "Escoge al menos un material"
                  : !listoMateriales
                    ? "Faltan las estibas de " + (lineas.filter((l) => !estOk(l)).length === 1 ? "un material" : `${lineas.filter((l) => !estOk(l)).length} materiales`)
                    : `Seguir con ${lineas.length} material${lineas.length > 1 ? "es" : ""}`}
              </button>
            </div>
          </div>
        )}

        {/* ================= 3 · Carga ================= */}
        {paso === 3 && (
          <div className="ct-paso">
            <h2>Placa y carga</h2>
            <p className="ct-dice">
              Aquí ya está lo que escogiste, con sus cifras calculadas. Solo falta la placa.
            </p>
            <ul className="ct-cargas">
              {lineas.map((l) => {
                const m = skuDe(l.sku);
                const d = derDe(l);
                return (
                  <li key={l.sku}>
                    <div className="ct-c-nom">
                      <b>{m?.descripcion ?? l.sku}</b>
                      <em>{l.sku}</em>
                    </div>
                    <div className="ct-c-est"><b>{d ? nf2.format(d.estibas) : "—"}</b><span>estibas</span></div>
                    <div className="ct-c-cif">
                      {d?.cajas == null
                        ? <span className="sin">Sin factores en el maestro</span>
                        : <span><b>{nf.format(d.cajas)}</b> cajas · <b>{d.unidades != null ? nf.format(d.unidades) : "—"}</b> unidades · <b>{d.hl != null ? nf2.format(d.hl) : "—"}</b> HL</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="btn plano ct-cambiar" onClick={() => setPaso(2)}>
              Cambiar materiales o estibas
            </button>
            <div className="ct-campos">
              <label>
                <span>Placa</span>
                <input value={placa} placeholder="JYN141" autoCapitalize="characters" autoFocus
                       onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
              </label>
              <label>
                <span>Lote (opcional)</span>
                <input value={lote} placeholder="L2609A" autoCapitalize="characters"
                       onChange={(e) => setLote(e.target.value.toUpperCase())} />
              </label>
              <label className="ancho">
                <span>Observación (opcional)</span>
                <input value={nota} placeholder="Algo que haya que dejar dicho de este camión"
                       onChange={(e) => setNota(e.target.value)} />
              </label>
            </div>
            <p className="ct-dice ct-nofactura">
              La factura no se pide aquí: la escribe el facturador cuando le dé salida.
            </p>
            <div className="ct-botones">
              <button type="button" className="btn" disabled={!listoMateriales || !placa.trim()}
                      onClick={() => setPaso(4)}>Seguir a las fotos</button>
            </div>
          </div>
        )}

        {/* ================= 4 · Fotos ================= */}
        {paso === 4 && (
          <div className="ct-paso">
            <h2>Tres fotos</h2>
            <p className="ct-dice">
              Cada una queda sellada con la placa, la fecha, la hora y las coordenadas
              quemadas en la esquina — así sigue probando algo aunque salga del sistema.
            </p>
            <div className="ct-fotos">
              {RANURAS.map((r) => (
                <Ranurita key={r.id} r={r} foto={fotos[r.id]} tomar={tomar} />
              ))}
            </div>
            <div className="ct-botones">
              <button type="button" className="btn" disabled={faltanFotos.length > 0}
                      onClick={() => setPaso(5)}>
                {faltanFotos.length
                  ? `Faltan ${faltanFotos.length} foto${faltanFotos.length > 1 ? "s" : ""}`
                  : "Seguir a guardar"}
              </button>
            </div>
          </div>
        )}

        {/* ================= 5 · Guardar ================= */}
        {paso === 5 && (
          <div className="ct-paso">
            <h2>Revisa y guarda</h2>
            <p className="ct-dice">
              Esto es lo que va a quedar en la ficha. <b>El camión todavía no sale:</b> el
              facturador le pone el número de factura y le da salida.
            </p>
            <dl className="ct-revision">
              <div><dt>Placa</dt><dd className="fuerte">{placa.toUpperCase()}</dd></div>
              <div><dt>CD origen</dt><dd>{origenes.find((o) => o.planta === planta)?.cd_origen ?? "—"}</dd></div>
              <div className="ancho"><dt>Materiales</dt><dd>
                {lineas.map((l) => (
                  <span key={l.sku} className="ct-r-mat">
                    {skuDe(l.sku)?.descripcion ?? l.sku}
                    <em>{l.sku} · {num(l.estibas) ? nf2.format(num(l.estibas)!) : "—"} estibas</em>
                  </span>
                ))}
              </dd></div>
              <div className="ancho"><dt>Dónde</dt><dd>
                {direccion || (ubi ? `${ubi.lat.toFixed(5)}, ${ubi.lng.toFixed(5)}` : "—")}
                <em>
                  {ubi ? `${ubi.lat.toFixed(5)}, ${ubi.lng.toFixed(5)} · ±${Math.round(ubi.precision)} m` : "—"}
                </em>
              </dd></div>
              <div className="fotos"><dt>Fotos</dt><dd>
                {RANURAS.length - faltanFotos.length} de {RANURAS.length}
                {!!faltanFotos.length && <em>Faltan: {faltanFotos.map((r) => r.t.toLowerCase()).join(", ")}</em>}
              </dd></div>
            </dl>
            <div className="ct-botones">
              <button type="button" className="btn" onClick={guardar} disabled={!listo || enviando}>
                {enviando ? avance || "Guardando…" : "Guardar la ficha"}
              </button>
              <button type="button" className="btn plano" onClick={() => setPaso(4)} disabled={enviando}>
                Volver
              </button>
            </div>
          </div>
        )}

        {/* ================= Listo ================= */}
        {paso === 6 && (
          <div className="ct-paso ct-listo">
            <h2>Ficha guardada</h2>
            <p className="ct-dice">
              {placa.toUpperCase()} quedó como <b>pendiente</b>: falta que el facturador
              escriba el número de factura y le dé salida en <b>Dar salida</b>. Solo
              entonces pasa a En tránsito.
            </p>
            {/* El "+" grande y no un botón más de la fila: en el patio los
                vehículos llegan seguidos, así que lo normal después de
                terminar uno es empezar otro, no irse. Lleva el signo Y el
                texto: un "+" solo obliga a adivinar qué suma.
                otro() no vuelve al paso 0 —la ubicación ya está tomada y
                es la misma— sino al 1: el siguiente empieza escogiendo
                origen, que es lo primero que de verdad cambia. */}
            <button type="button" className="ct-otro" onClick={otro}>
              <span aria-hidden="true">+</span>
              <b>Certificar otro vehículo</b>
              <em>La ubicación ya está tomada, empiezas por el origen</em>
            </button>
            <div className="ct-botones">
              <Link href="/sider/salida" className="btn plano">Ir a Dar salida</Link>
              <Link href="/sider/transito" className="btn plano">Ver lo que va en camino</Link>
            </div>
          </div>
        )}

        {aviso && <div className={"aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
      </section>

      {/* ---------- El tiquete que se va armando ---------- */}
      {paso > 0 && paso < 6 && (
        <section className="ct-tiquete">
          <div className="rot">
            {lineas.length > 1 ? `LO QUE VA A QUEDAR · ${lineas.length} MATERIALES` : "LO QUE VA A QUEDAR"}
          </div>
          <div className="cifras-t">
            {([["estibas", total.estibas, nf2], ["sider", total.sider, nf2], ["cajas", total.cajas, nf],
               ["unidades", total.unidades, nf], ["HL", total.hl, nf2]] as const).map(([rot, c, f]) => (
              <div key={rot}>
                <b>{c.v == null ? "—" : f.format(c.v)}</b>
                <span>{rot}</span>
                {c.v != null && c.falta.length > 0 && <i>falta mat. {c.falta.join(", ")}</i>}
              </div>
            ))}
          </div>
          {sinFactores.length > 0 && (
            <p className="ojo">
              A <b>{sinFactores.map((m) => m.descripcion).join(", ")}</b> le{sinFactores.length > 1 ? "s" : ""} faltan
              factores en el maestro, así que de {sinFactores.length > 1 ? "esos materiales" : "ese material"} no
              se pueden calcular cajas, unidades ni HL. Se puede guardar igual — la evidencia es
              lo importante — y las cifras salen cuando se completen.
            </p>
          )}
        </section>
      )}

      {/* ---------- Mis fichas pendientes ---------- */}
      {fichas.length > 0 && (
        <section className="tarjeta ct-fichas" aria-label="Mis fichas pendientes">
          <h2>Mis fichas pendientes <em>{fichas.length}</em></h2>
          <p className="ct-dice">
            Esperan al facturador: cuando escriba el número de factura y les dé salida,
            pasan a En tránsito.
          </p>
          <ul>
            {fichas.map((f) => (
              <li key={f.id}>
                <div className="ct-f-cab">
                  <b className="ct-f-placa">{f.placa}</b>
                  <span>{origenes.find((o) => o.planta === f.planta)?.cd_origen ?? f.planta}</span>
                  <span className={"ct-f-fotos" + (f.fotos < 3 ? " mal" : "")}>{f.fotos}/3 fotos</span>
                </div>
                <ul className="ct-f-mats">
                  {f.lineas.map((l) => (
                    <li key={l.sku}>
                      {skuDe(l.sku)?.descripcion ?? l.sku}
                      <em>{nf2.format(l.estibas)} estibas</em>
                    </li>
                  ))}
                </ul>
                {f.fotos < 3 && (
                  <p className="ct-f-mal">Le faltan fotos: descártala y vuelve a hacerla, porque sin las tres no se le puede dar salida.</p>
                )}
                <div className="ct-f-pie">
                  <span>Espera factura</span>
                  {seguro === f.id ? (
                    <>
                      <button type="button" className="btn mal" disabled={descartando === f.id}
                              onClick={() => descartar(f)}>
                        {descartando === f.id ? "Descartando…" : "Sí, descartar"}
                      </button>
                      <button type="button" className="btn plano" onClick={() => setSeguro(null)}>No</button>
                    </>
                  ) : (
                    <button type="button" className="btn plano" onClick={() => setSeguro(f.id)}>Descartar</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
