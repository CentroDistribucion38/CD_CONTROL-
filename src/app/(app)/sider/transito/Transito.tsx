"use client";

/**
 * EN TRÁNSITO — la otra punta del viaje.
 *
 * Dos usos en una sola pantalla, y por eso no es una tabla:
 *
 *   · Quien NO certifica (el que recibe en el patio, el de turno) abre
 *     esto para saber qué viene: qué placa, de dónde, qué trae y hace
 *     cuánto salió. Eso lo ve todo el mundo.
 *   · Quien SÍ certifica toca el vehículo que acaba de llegar y cierra
 *     la llegada: ubicación y tres fotos, igual que en la salida.
 *
 * El que llega no escoge origen ni material ni estibas: eso ya lo dijo
 * la salida. Solo aporta la evidencia de que llegó, y dónde.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Viaje } from "@/modulos/sider/comun";
import {
  RANURAS, RANURA_OBS, type Ranura, type RanuraCualquiera, type Foto,
  usePosicion, TarjetaUbicacion, CampoDireccion, Ranurita, CajaObservacion,
  sellar, subirFotos, traducir,
} from "@/modulos/sider/evidencia";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

const hora = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      }) : "—";

/** "3 h 40 min": el intervalo de Postgres llega como texto. */
export function enCamino(iv: string | null): string {
  if (!iv) return "—";
  const m = iv.match(/(?:(\d+) days? )?(\d+):(\d+):/);
  if (!m) return iv;
  const d = Number(m[1] ?? 0), h = Number(m[2]), mi = Number(m[3]);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${mi} min`;
  return `${mi} min`;
}

/** Horas en el camino, para saber cuál lleva demasiado. */
function horasEnCamino(iv: string | null): number {
  if (!iv) return 0;
  const m = iv.match(/(?:(\d+) days? )?(\d+):(\d+):/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 24 + Number(m[2]) + Number(m[3]) / 60;
}

/* Un viaje que lleva más de esto sin llegar no está "en camino": está
   trabado, o alguien olvidó cerrarlo. Se marca para que se vea, no para
   bloquear nada. */
const HORAS_LARGAS = 24;

export function Transito({ viajes, nombres, esEditor, trabados, sinEvidencia, cabeza }: {
  viajes: Viaje[];
  nombres: Record<string, string>;
  esEditor: boolean;
  trabados: number;
  sinEvidencia: number;
  /** La cabeza de la página. La dibuja el servidor, la esconde el cliente. */
  cabeza: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  /** El viaje abierto para certificar la llegada. */
  const [abierto, setAbierto] = useState<Viaje | null>(null);
  const [f, setF] = useState({ placa: "", origen: "", desde: "", hasta: "" });
  /* En el celular los filtros arrancan PLEGADOS. Desplegados miden 207px
     de los 640 de la pantalla y, con la cabeza y las alertas, no queda
     sitio ni para media tarjeta: quien abre esta pantalla en el patio
     quiere ver qué viene, no cuatro campos vacíos.
     En escritorio no se pliegan nunca —ahí sobra el sitio— y este
     estado no los toca: eso lo decide el CSS, que es quien sabe de qué
     tamaño es la pantalla. */
  const [verFiltros, setVerFiltros] = useState(false);

  /* Los orígenes que DE VERDAD tienen algo en camino. Ofrecer los 16 del
     maestro cuando solo cinco tienen vehículos hace buscar en una lista
     donde la mayoría de opciones no devuelve nada. */
  const listaOrigenes = useMemo(
    () => [...new Set(viajes.map((v) => v.cd_origen))].sort((a, b) => a.localeCompare(b, "es")),
    [viajes]
  );

  const filtrados = useMemo(() => {
    const p = f.placa.trim().toUpperCase();
    return viajes.filter((v) => {
      if (p && !v.placa.toUpperCase().includes(p)) return false;
      if (f.origen && v.cd_origen !== f.origen) return false;
      /* La fecha que se filtra es la de SALIDA, no la de creación: es la
         que le importa a quien pregunta "¿qué salió el martes y todavía
         no llega?". Se compara en texto YYYY-MM-DD contra la fecha local
         del vehículo; comparar objetos Date arrastraría la hora y el
         día completo "hasta" se quedaría por fuera. */
      if (f.desde || f.hasta) {
        if (!v.salida_en) return false;
        const d = new Date(v.salida_en);
        const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (f.desde && dia < f.desde) return false;
        if (f.hasta && dia > f.hasta) return false;
      }
      return true;
    });
  }, [viajes, f]);

  const hayFiltro = !!f.placa.trim() || !!f.origen || !!f.desde || !!f.hasta;

  /* AGRUPADAS POR CD ORIGEN, que era el problema: veinte tarjetas
     sueltas en una rejilla no dejan ver que doce vienen de Galapa.
     Los grupos van ordenados por el vehículo que lleva MÁS tiempo en
     camino, no por nombre: el que está por llegar —o el que se trabó—
     es el que hay que atender, y ese tiene que quedar arriba. */
  const grupos = useMemo(() => {
    const m = new Map<string, Viaje[]>();
    for (const v of filtrados) {
      const g = m.get(v.cd_origen);
      if (g) g.push(v); else m.set(v.cd_origen, [v]);
    }
    return [...m.entries()]
      .map(([cd, vs]) => ({
        cd,
        viajes: vs,
        horas: Math.max(...vs.map((v) => horasEnCamino(v.en_camino))),
        hl: vs.reduce((s, v) => s + Number(v.hl ?? 0), 0),
      }))
      .sort((a, b) => b.horas - a.horas);
  }, [filtrados]);

  /* Certificando no se dibuja la cabeza: la pantalla es de un vehículo,
     no del tablero, y el título del paso ya dice de cuál. */
  if (abierto) {
    return (
      <Llegada
        viaje={abierto}
        supabase={supabase}
        cerrar={() => setAbierto(null)}
        listo={() => { setAbierto(null); router.refresh(); }}
      />
    );
  }

  return (
    <>
      {cabeza}

      {(trabados > 0 || sinEvidencia > 0) && (
        <section className="tr-alertas">
          {trabados > 0 && (
            <p>
              <b>{trabados}</b> {trabados === 1 ? "vehículo lleva" : "vehículos llevan"} más
              de 24 horas sin llegar. O están trabados, o alguien no cerró la llegada.
            </p>
          )}
          {sinEvidencia > 0 && (
            <p>
              <b>{sinEvidencia}</b> {sinEvidencia === 1 ? "salió" : "salieron"} sin las tres
              fotos. Esos no se pueden cerrar hasta completarlas.
            </p>
          )}
        </section>
      )}

      {/* EN EL CELULAR ruedan JUNTOS los filtros y la lista, dentro de
          .tr-cuerpo. En escritorio no: allá los filtros se quedan
          quietos y rueda solo la lista, que es lo cómodo con cien
          vehículos. En un celular no cabe nada quieto —cabeza, alertas
          y filtros abiertos suman 488px de los 640— y fijar los filtros
          dejaba la lista en sesenta pixeles. */}
      <div className="tr-cuerpo">
      {viajes.length > 1 && (
        <button type="button" className="tr-abrir" aria-expanded={verFiltros}
                onClick={() => setVerFiltros((v) => !v)}>
          {hayFiltro ? `Filtrando · ${filtrados.length} de ${viajes.length}` : "Filtrar"}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      )}

      {viajes.length > 1 && (
        <div className={"tr-filtros" + (verFiltros ? "" : " plegado")}>
          <label className="tr-placa">
            <span>Placa</span>
            <input value={f.placa} placeholder="Parte de la placa"
                   onChange={(e) => setF({ ...f, placa: e.target.value })} />
          </label>
          <label>
            <span>CD origen</span>
            <select value={f.origen} onChange={(e) => setF({ ...f, origen: e.target.value })}>
              <option value="">Todos los orígenes</option>
              {listaOrigenes.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          {/* Fecha de SALIDA. Con input type=date, que abre el calendario
              del propio sistema: en el celular sale el selector nativo,
              que se toca mejor con guantes que cualquier rejilla que
              dibujemos nosotros, y no hay que mantenerla. */}
          <label>
            <span>Salió desde</span>
            <input type="date" value={f.desde} max={f.hasta || undefined}
                   onChange={(e) => setF({ ...f, desde: e.target.value })} />
          </label>
          <label>
            <span>Hasta</span>
            <input type="date" value={f.hasta} min={f.desde || undefined}
                   onChange={(e) => setF({ ...f, hasta: e.target.value })} />
          </label>
          <button type="button" className="btn plano" disabled={!hayFiltro}
                  onClick={() => setF({ placa: "", origen: "", desde: "", hasta: "" })}>
            Limpiar
          </button>
          {hayFiltro && (
            <span className="tr-cuenta">{filtrados.length} de {viajes.length}</span>
          )}
        </div>
      )}

      {/* UNA sola caja que rueda, con los grupos adentro. Si rodara cada
          grupo por su lado saldrían tres barras de desplazamiento en la
          misma pantalla y ninguna diría cuánto falta por ver. */}
      <div className="tr-grupos">
      {grupos.map((g) => (
        <section key={g.cd} className="tr-grupo">
          <h2 className="tr-grupo-cab">
            <b>{g.cd}</b>
            <span>
              {g.viajes.length} {g.viajes.length === 1 ? "vehículo" : "vehículos"}
              {g.hl > 0 && <> · {nf.format(g.hl)} HL</>}
            </span>
            {g.horas > HORAS_LARGAS && <em className="tr-tarde">el más viejo lleva {Math.floor(g.horas)} h</em>}
          </h2>
          <div className="tr-rejilla">
        {g.viajes.map((v) => {
          const largo = horasEnCamino(v.en_camino) > HORAS_LARGAS;
          const faltanFotos = v.fotos_salida < 3;
          return (
            <article key={v.id} className={"tr-vh" + (largo ? " largo" : "")}>
              <header>
                <b className="placa">{v.placa}</b>
                <span className={"sello " + (largo ? "falta" : "transito")}>
                  <i />{enCamino(v.en_camino)}
                </span>
              </header>

              <div className="tr-ruta">
                <b>{v.cd_origen}</b>
                <svg viewBox="0 0 24 8" aria-hidden="true">
                  <path d="M0 4h20M16 1l4 3-4 3" fill="none" stroke="currentColor"
                        strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <b>{v.cd_destino}</b>
              </div>

              <p className="tr-mat">
                {v.descripcion}
                <em>{v.sku}{v.tipo_envase ? ` · ${v.tipo_envase}` : ""}</em>
              </p>

              <dl className="tr-cifras">
                <div><dt>Estibas</dt><dd>{nf2.format(v.estibas)}</dd></div>
                <div><dt>Sider</dt><dd>{nf2.format(v.sider)}</dd></div>
                <div><dt>Cajas</dt><dd>{v.cajas == null ? "—" : nf.format(v.cajas)}</dd></div>
                <div><dt>HL</dt><dd>{v.hl == null ? "—" : nf2.format(v.hl)}</dd></div>
              </dl>

              <footer>
                <div className="tr-salio">
                  Salió {hora(v.salida_en)}
                  <em>
                    {v.creado_por ? nombres[v.creado_por] ?? "—" : "—"}
                    {" · "}
                    <b className={faltanFotos ? "mal" : undefined}>{v.fotos_salida}/3 fotos</b>
                    {v.salida_direccion ? ` · ${v.salida_direccion}` : ""}
                  </em>
                </div>
                {esEditor && (
                  <button type="button" className="btn" onClick={() => setAbierto(v)}>
                    Certificar llegada
                  </button>
                )}
              </footer>

              {faltanFotos && (
                <p className="tr-ojo">
                  A la salida le faltan fotos. La llegada no se puede cerrar hasta que
                  estén las tres: si se pudiera, la evidencia sería opcional en la
                  práctica.
                </p>
              )}
            </article>
          );
        })}
          </div>
        </section>
      ))}
      </div>

      {!filtrados.length && (
        <div className="tr-vacio">
          {viajes.length ? (
            <>Ningún vehículo coincide con el filtro.{" "}
              <button type="button" className="tr-enlace"
                      onClick={() => setF({ placa: "", origen: "", desde: "", hasta: "" })}>
                Quitar el filtro
              </button></>
          ) : (
            "No hay vehículos en tránsito. Cuando alguien certifique una salida, aparece aquí."
          )}
        </div>
      )}
      </div>
    </>
  );
}

/* ==================== Certificar la llegada ====================
   Dos pasos, no seis: el viaje ya sabe qué trae. Lo único que falta es
   dónde llegó y la prueba de que llegó.

   Y son DOS PASOS y no una sola pantalla con dos columnas —que es como
   estaba— porque en el celular no cabía: medido, se salía 197 px en un
   390x844 y 254 en un 360x740. Se podía apretar el texto hasta que
   entrara, pero eso es dejar la letra ilegible para no admitir que son
   dos cosas distintas. El que recibe está de pie al lado del vehículo:
   primero dice dónde está, después toma las fotos.
   =============================================================== */
function Llegada({ viaje, supabase, cerrar, listo }: {
  viaje: Viaje;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  supabase: any;
  cerrar: () => void;
  listo: () => void;
}) {
  const pos = usePosicion();
  const [paso, setPaso] = useState(0);
  const [fotos, setFotos] = useState<Partial<Record<RanuraCualquiera, Foto>>>({});
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [avance, setAvance] = useState("");
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  const faltanFotos = RANURAS.filter((r) => !fotos[r.id]);
  const sinEvidenciaSalida = viaje.fotos_salida < 3;
  const puede = !!pos.ubi && faltanFotos.length === 0 && !sinEvidenciaSalida;

  async function tomar(ranura: Ranura, archivo: File) {
    try {
      const foto = await sellar(archivo, {
        placa: viaje.placa,
        ubi: pos.ubi,
        direccion: pos.direccion.trim(),
        etiqueta: `LLEGADA · ${RANURAS.find((r) => r.id === ranura)!.t}`,
      });
      setFotos((f) => {
        if (f[ranura]) URL.revokeObjectURL(f[ranura]!.url);
        return { ...f, [ranura]: foto };
      });
    } catch {
      setAviso({ mal: true, texto: "No se pudo procesar esa foto. Vuelve a tomarla." });
    }
  }

  /* La foto de la observación se sella igual que las otras —placa, hora,
     coordenadas quemadas en la esquina—, porque si no se sellara sería la
     única de las cuatro que no prueba dónde ni cuándo se tomó, y es
     justamente la que alguien va a discutir. */
  async function tomarObs(archivo: File) {
    try {
      const foto = await sellar(archivo, {
        placa: viaje.placa,
        ubi: pos.ubi,
        direccion: pos.direccion.trim(),
        etiqueta: `LLEGADA · OBSERVACIÓN`,
      });
      setFotos((f) => {
        if (f.observacion) URL.revokeObjectURL(f.observacion.url);
        return { ...f, observacion: foto };
      });
    } catch {
      setAviso({ mal: true, texto: "No se pudo procesar esa foto. Vuelve a tomarla." });
    }
  }

  function quitarObs() {
    setFotos((f) => {
      if (f.observacion) URL.revokeObjectURL(f.observacion.url);
      const { observacion: _, ...resto } = f;
      return resto;
    });
  }

  async function certificar() {
    if (!puede) return;
    setEnviando(true);
    setAviso(null);
    setAvance("Registrando la llegada…");

    const { data, error } = await supabase.rpc("sider_certificar_llegada", {
      p_viaje_id: viaje.id,
      p_lat: pos.ubi!.lat,
      p_lng: pos.ubi!.lng,
      p_precision_m: Math.round(pos.ubi!.precision),
      p_ubicado_en: pos.ubi!.en,
      p_nota: nota.trim() || null,
      p_direccion: pos.direccion.trim() || null,
    });

    if (error) {
      setAviso({ mal: true, texto: traducir(error.message) });
      setEnviando(false);
      setAvance("");
      return;
    }

    const mal = await subirFotos(supabase, {
      viajeId: viaje.id,
      certId: data as string,
      punta: "llegada",
      fotos,
      avance: setAvance,
    });

    setAvance("");
    setEnviando(false);
    if (mal) {
      setAviso({
        mal: true,
        texto:
          `${viaje.placa} quedó recibido, pero ${mal}. Búscalo en la Fuente principal ` +
          `y vuelve a intentar la foto.`,
      });
      return;
    }
    listo();
  }

  /* Soltar los blobs al cerrar. Esta pantalla nunca lo hizo —la de salida
     sí— y cada foto sellada son varios megas que se quedaban en memoria
     hasta recargar la página. Con la cuarta ranura se nota más, así que
     va aquí en vez de en una lista de pendientes.
     Sin dependencias: corre UNA vez al desmontar y lee el estado del
     momento a través de la referencia, no la copia del primer render. */
  const fotosRef = useRef(fotos);
  fotosRef.current = fotos;
  useEffect(() => () => {
    for (const f of Object.values(fotosRef.current)) if (f) URL.revokeObjectURL(f.url);
  }, []);

  const pasos = [
    { t: "Dónde", ok: !!pos.ubi },
    { t: "Fotos", ok: faltanFotos.length === 0 },
  ];

  /* La misma regla que en la salida: a un paso solo se llega si los
     anteriores están listos, y la ubicación es requisito duro porque es
     lo que prueba que quien certificó estaba ahí. */
  const alcanzable = (i: number) => i === 0 || pasos.slice(0, i).every((p) => p.ok);

  return (
    <>
      <ol className="ct-pasos tr-pasos">
        {pasos.map((p, i) => {
          const abierto = alcanzable(i);
          const razon = abierto
            ? undefined
            : "Primero activa tu ubicación: sin ella la certificación no prueba nada.";
          return (
            <li
              key={p.t}
              className={(i === paso ? "aqui " : "") + (p.ok ? "listo " : "") + (abierto ? "" : "trancado")}
            >
              <button
                type="button"
                onClick={() => setPaso(i)}
                disabled={enviando || !abierto}
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

      {!pos.ubi && (
        <p className="ct-tranca">
          <b>La ubicación es obligatoria.</b> Las fotos se abren cuando la actives:
          es lo que prueba que el vehículo llegó a donde dice.
        </p>
      )}

      <section className="tarjeta ct">
        <div className="ct-paso tr-llegada">
          <div className="tr-quien">
            <div>
              <h2>{paso === 0 ? `Llegó ${viaje.placa}` : `Tres fotos de ${viaje.placa}`}</h2>
              <p className="ct-dice">
                {paso === 0 ? (
                  <>
                    Desde <b>{viaje.cd_origen}</b> · {viaje.descripcion} ·{" "}
                    {nf2.format(viaje.estibas)} estibas · salió {hora(viaje.salida_en)}
                    {" — "}solo falta dónde llegó y la prueba de que llegó.
                  </>
                ) : (
                  <>
                    Cada una queda sellada con la placa, la fecha, la hora y las
                    coordenadas quemadas en la esquina. Si algo llegó mal, déjalo
                    dicho abajo y, si se puede, fotografíalo.
                  </>
                )}
              </p>
            </div>
            <button type="button" className="btn plano" onClick={cerrar} disabled={enviando}>
              ← Volver al tránsito
            </button>
          </div>

          {sinEvidenciaSalida && (
            <div className="aviso mal ct-suelto">
              A la salida de este viaje le faltan fotos ({viaje.fotos_salida} de 3), así
              que no se puede cerrar. Complétalas primero.
            </div>
          )}

          {/* ================= 0 · Dónde ================= */}
          {paso === 0 && (
            <>
              {!pos.ubi && (
                <button type="button" className="ct-grande" onClick={pos.pedir} disabled={pos.buscando}>
                  {pos.buscando ? "Buscando el GPS…" : "Activar mi ubicación"}
                </button>
              )}
              {pos.errUbi && <div className="aviso mal ct-suelto">{pos.errUbi}</div>}

              {pos.ubi && (
                <>
                  <div className="tr-dos">
                    <TarjetaUbicacion ubi={pos.ubi} />
                    {/* La observación ya NO vive aquí: se fue al paso de
                        las fotos, junto a la foto que la respalda. */}
                    <CampoDireccion
                      direccion={pos.direccion}
                      setDireccion={pos.setDireccion}
                      buscandoDir={pos.buscandoDir}
                    />
                  </div>
                  <div className="ct-botones">
                    <button type="button" className="btn" onClick={() => setPaso(1)}>
                      Seguir a las fotos
                    </button>
                    <button type="button" className="btn plano" onClick={pos.pedir} disabled={pos.buscando}>
                      Volver a tomarla
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ================= 1 · Fotos ================= */}
          {paso === 1 && (
            <>
              <div className="ct-fotos">
                {RANURAS.map((r) => (
                  <Ranurita key={r.id} r={r} foto={fotos[r.id]} tomar={tomar} />
                ))}
              </div>

              <CajaObservacion
                punta="llegada"
                nota={nota}
                setNota={setNota}
                foto={fotos[RANURA_OBS.id]}
                tomar={tomarObs}
                quitar={quitarObs}
              />

              <div className="ct-botones">
                <button type="button" className="btn" onClick={certificar} disabled={!puede || enviando}>
                  {enviando ? avance || "Certificando…"
                    : faltanFotos.length
                      ? `Faltan ${faltanFotos.length} foto${faltanFotos.length > 1 ? "s" : ""}`
                      : `Certificar la llegada de ${viaje.placa}`}
                </button>
                <button type="button" className="btn plano" onClick={() => setPaso(0)} disabled={enviando}>
                  Volver
                </button>
              </div>
            </>
          )}
        </div>

        {aviso && <div className={"aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
      </section>
    </>
  );
}
