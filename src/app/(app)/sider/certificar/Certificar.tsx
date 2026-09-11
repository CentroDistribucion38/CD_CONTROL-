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
 * LAS FOTOS SE SELLAN en el navegador antes de subirlas: placa, fecha,
 * hora y coordenadas quemadas en la esquina. Así la foto sigue probando
 * algo aunque salga del sistema por WhatsApp.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Origen, Sku } from "@/modulos/sider/datos";
/* La ubicación, el sellado de las fotos y sus mensajes viven en un solo
   sitio: la llegada pide exactamente lo mismo que la salida. */
import {
  RANURAS, type Ranura, type Foto,
  usePosicion, TarjetaUbicacion, CampoDireccion, Ranurita,
  sellar, subirFotos, traducir,
} from "@/modulos/sider/evidencia";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const num = (s: string) => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function Certificar({ origenes, skus, estibasPorSider, esEditor }: {
  origenes: Origen[];
  skus: Sku[];
  estibasPorSider: number;
  esEditor: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [paso, setPaso] = useState(0);
  const pos = usePosicion();
  const { ubi, direccion } = pos;

  const [planta, setPlanta] = useState("");
  const [sku, setSku] = useState("");
  const [estibas, setEstibas] = useState("");
  const [placa, setPlaca] = useState("");
  /* EL PAPEL DEL VIAJE. Se piden aquí y no solo cuando hay una novedad:
     así TODO viaje queda documentado, no únicamente los que salen con
     problema, y el día que alguien pregunte "¿qué lote vino en ese
     camión?" hay respuesta aunque nunca se haya reportado nada.
     Opcionales: a veces el papel llega después del camión, y trabar la
     certificación por eso dejaría el viaje sin fotos ni ubicación, que
     es mucho peor que dejarlo sin factura. */
  const [factura, setFactura] = useState("");
  const [lote, setLote] = useState("");
  const [nota, setNota] = useState("");
  const [fotos, setFotos] = useState<Partial<Record<Ranura, Foto>>>({});

  const [enviando, setEnviando] = useState(false);
  const [avance, setAvance] = useState("");
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  const mat = skus.find((s) => s.sku === sku);
  const nEst = num(estibas);

  /* Las once derivadas, calculadas mientras se avanza. Son las mismas
     fórmulas de la hoja; la vista de la base las vuelve a calcular al
     leer, así que esto es solo para poder verlas antes de guardar. */
  const der = useMemo(() => {
    if (!mat || !nEst || nEst <= 0) return null;
    const cajas = mat.cajas_x_estiba == null ? null : Number(mat.cajas_x_estiba) * nEst;
    const unidades = cajas == null || mat.unidades_x_caja == null
      ? null : Number(mat.unidades_x_caja) * cajas;
    const hl = unidades == null || mat.hl_x_unidad == null
      ? null : Number(mat.hl_x_unidad) * unidades;
    return { sider: nEst / estibasPorSider, cajas, unidades, hl };
  }, [mat, nEst, estibasPorSider]);

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

  /* ---------------- Guardar ---------------- */
  async function certificar() {
    if (!ubi || !planta || !sku || !nEst || !placa.trim() || faltanFotos.length) return;
    setEnviando(true);
    setAviso(null);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cli = supabase as any;

    setAvance("Registrando el viaje…");
    const { data, error } = await cli.rpc("sider_certificar_salida", {
      p_placa: placa.trim().toUpperCase(),
      p_planta: planta,
      p_sku: sku,
      p_estibas: nEst,
      p_lat: ubi.lat,
      p_lng: ubi.lng,
      p_precision_m: Math.round(ubi.precision),
      p_ubicado_en: ubi.en,
      p_nota: nota.trim() || null,
      p_direccion: direccion.trim() || null,
      p_factura: factura.trim().toUpperCase() || null,
      p_lote: lote.trim().toUpperCase() || null,
    });

    if (error) {
      setAviso({ mal: true, texto: traducir(error.message) });
      setEnviando(false);
      setAvance("");
      return;
    }

    const fila = Array.isArray(data) ? data[0] : data;
    const viajeId: string = fila?.viaje_id;
    const certId: string = fila?.certificacion_id;

    const mal = await subirFotos(cli, {
      viajeId, certId, punta: "salida", fotos, avance: setAvance,
    });
    if (mal) {
      setAviso({
        mal: true,
        texto:
          `El viaje quedó registrado, pero ${mal}. Búscalo en la Fuente principal ` +
          `por la placa ${placa.toUpperCase()} y vuelve a intentar.`,
      });
      setEnviando(false);
      setAvance("");
      router.refresh();
      return;
    }

    setAvance("");
    setEnviando(false);
    setAviso({
      mal: false,
      texto: `Listo. ${placa.toUpperCase()} quedó certificado y va en tránsito hacia Barranquilla.`,
    });
    setPaso(RANURAS.length + 4);
    router.refresh();
  }

  function otro() {
    for (const f of Object.values(fotos)) if (f) URL.revokeObjectURL(f.url);
    setFotos({});
    setEstibas("");
    setPlaca("");
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
    { t: "Material", ok: !!sku },
    { t: "Carga", ok: !!nEst && !!placa.trim() },
    { t: "Fotos", ok: faltanFotos.length === 0 },
    { t: "Confirmar", ok: false },
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
              Los que tienen el aviso naranja no tienen factores cargados: de ellos no se
              pueden calcular cajas, unidades ni HL.
            </p>
            <div className="ct-opciones">
              {skus.filter((s) => s.activo).map((s) => {
                const falta = s.cajas_x_estiba == null || s.unidades_x_caja == null || s.hl_x_unidad == null;
                return (
                  <button key={s.sku} type="button"
                          className={"ct-op" + (sku === s.sku ? " on" : "") + (falta ? " falta" : "")}
                          onClick={() => { setSku(s.sku); setPaso(3); }}>
                    <b>{s.descripcion}</b>
                    <span>
                      {s.sku}
                      {falta ? " · sin factores" : ` · ${nf2.format(Number(s.cajas_x_estiba))} cajas/estiba`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= 3 · Carga ================= */}
        {paso === 3 && (
          <div className="ct-paso">
            <h2>Estibas y placa</h2>
            <p className="ct-dice">Lo único que hay que teclear. Todo lo demás ya se calculó.</p>
            <div className="ct-campos">
              <label>
                <span>No. de estibas</span>
                <input inputMode="decimal" value={estibas} placeholder="40" autoFocus
                       onChange={(e) => setEstibas(e.target.value)} />
              </label>
              <label>
                <span>Placa</span>
                <input value={placa} placeholder="JYN141" autoCapitalize="characters"
                       onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
              </label>
              <label>
                <span>Factura (opcional)</span>
                <input value={factura} placeholder="FE-4471" autoCapitalize="characters"
                       onChange={(e) => setFactura(e.target.value.toUpperCase())} />
              </label>
              <label>
                <span>Lote (opcional)</span>
                <input value={lote} placeholder="L2609A" autoCapitalize="characters"
                       onChange={(e) => setLote(e.target.value.toUpperCase())} />
              </label>
              <label className="ancho">
                <span>Observación (opcional)</span>
                <input value={nota} placeholder="Algo que haya que dejar dicho de este viaje"
                       onChange={(e) => setNota(e.target.value)} />
              </label>
            </div>
            <div className="ct-botones">
              <button type="button" className="btn" disabled={!nEst || !placa.trim()}
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
                  : "Seguir a confirmar"}
              </button>
            </div>
          </div>
        )}

        {/* ================= 5 · Confirmar ================= */}
        {paso === 5 && (
          <div className="ct-paso">
            <h2>Revisa y certifica</h2>
            <p className="ct-dice">
              Esto es exactamente la fila que va a quedar. Después de certificar, el
              vehículo sale en tránsito hacia Barranquilla.
            </p>
            <dl className="ct-revision">
              <div><dt>Placa</dt><dd className="fuerte">{placa.toUpperCase()}</dd></div>
              <div><dt>CD origen</dt><dd>{origenes.find((o) => o.planta === planta)?.cd_origen ?? "—"}</dd></div>
              <div><dt>Material</dt><dd>{mat?.descripcion ?? "—"}<em>{sku}</em></dd></div>
              <div><dt>Estibas</dt><dd>{nEst ? nf2.format(nEst) : "—"}</dd></div>
              <div className="ancho"><dt>Dónde</dt><dd>
                {direccion || (ubi ? `${ubi.lat.toFixed(5)}, ${ubi.lng.toFixed(5)}` : "—")}
                <em>
                  {ubi ? `${ubi.lat.toFixed(5)}, ${ubi.lng.toFixed(5)} · ±${Math.round(ubi.precision)} m` : "—"}
                </em>
              </dd></div>
              <div className="ancho"><dt>Fotos</dt><dd>
                {RANURAS.length - faltanFotos.length} de {RANURAS.length}
                {!!faltanFotos.length && <em>Faltan: {faltanFotos.map((r) => r.t.toLowerCase()).join(", ")}</em>}
              </dd></div>
            </dl>
            <div className="ct-botones">
              <button type="button" className="btn" onClick={certificar} disabled={!listo || enviando}>
                {enviando ? avance || "Certificando…" : "Certificar la salida"}
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
            <h2>Certificado</h2>
            <p className="ct-dice">
              {placa.toUpperCase()} va en tránsito. Cuando llegue a Barranquilla se
              certifica la otra punta desde <b>En tránsito</b>.
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
              <Link href="/sider" className="btn plano">Ver la fuente principal</Link>
              <Link href="/sider/transito" className="btn plano">Ver lo que va en camino</Link>
            </div>
          </div>
        )}

        {aviso && <div className={"aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
      </section>

      {/* ---------- El tiquete que se va armando ---------- */}
      {paso > 0 && paso < 6 && (
        <section className="ct-tiquete">
          <div className="rot">LO QUE VA A QUEDAR</div>
          <div className="cifras-t">
            <div><b>{nEst ? nf2.format(nEst) : "—"}</b><span>estibas</span></div>
            <div><b>{der ? nf2.format(der.sider) : "—"}</b><span>sider</span></div>
            <div><b>{der?.cajas != null ? nf.format(der.cajas) : "—"}</b><span>cajas</span></div>
            <div><b>{der?.unidades != null ? nf.format(der.unidades) : "—"}</b><span>unidades</span></div>
            <div><b>{der?.hl != null ? nf2.format(der.hl) : "—"}</b><span>HL</span></div>
          </div>
          {mat && der && der.cajas == null && (
            <p className="ojo">
              A <b>{mat.descripcion}</b> le faltan factores en el maestro, así que de este
              viaje no se pueden calcular cajas, unidades ni HL. Se puede certificar igual
              — la evidencia es lo importante — y las cifras salen cuando se completen.
            </p>
          )}
        </section>
      )}
    </>
  );
}
