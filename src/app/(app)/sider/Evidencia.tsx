"use client";

/**
 * EL OJITO — la evidencia de un viaje, sin salir de la Fuente principal.
 *
 * La tabla dice "3/3 fotos". Eso responde si están, no si sirven. Quien
 * revisa necesita ABRIRLAS: que se lea la placa, que el costado sea de
 * ese vehículo, que la hora cuadre con la ruta. Por eso el ojo abre las
 * fotos y, al lado, exactamente lo que se llenó en el formulario — que
 * es la otra mitad del informe: qué dijo, dónde estaba y con cuánta
 * precisión.
 *
 * Las fotos no se traen hasta que alguien abre el ojo. Traerlas con la
 * tabla serían cientos de imágenes firmadas para mirar una.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Viaje } from "@/modulos/sider/comun";
import { createClient } from "@/lib/supabase/client";
import { RANURAS, usePosicion, sellar, type Ranura } from "@/modulos/sider/evidencia";

type Foto = {
  ranura: "costado_izq" | "costado_der" | "placa" | "observacion";
  ruta: string; url: string | null;
  bytes: number | null; ancho: number | null; alto: number | null; subida_en: string;
};
type Punta = {
  id: string; punta: "salida" | "llegada";
  lat: number; lng: number; precision_m: number | null;
  ubicado_en: string | null; direccion: string | null; nota: string | null;
  hecha_por: string | null; hecha_en: string; fotos: Foto[];
};

const NOMBRE: Record<string, string> = {
  costado_izq: "Costado izquierdo",
  costado_der: "Costado derecho",
  placa: "Placa",
  observacion: "Observación",
};

const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }) : "—";

const pesa = (b: number | null) => (b == null ? "" : `${nf.format(b / 1024)} KB`);

export function OjoEvidencia({ viaje, nombres, esEditor = false }: {
  viaje: Viaje;
  nombres: Record<string, string>;
  /** Un editor puede COMPLETAR una foto que falte, desde el hueco mismo. */
  esEditor?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const total = viaje.fotos_salida + viaje.fotos_llegada;
  return (
    <>
      <button
        type="button"
        className={"ev-ojo" + (total === 0 ? " vacio" : "")}
        title={total ? `Ver la evidencia de ${viaje.placa}` : "Este viaje no tiene fotos"}
        aria-label={`Ver la evidencia de ${viaje.placa}`}
        onClick={() => setAbierto(true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"
                fill="none" stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
        </svg>
        <i>{total}</i>
      </button>
      {abierto && (
        <Hoja viaje={viaje} nombres={nombres} esEditor={esEditor}
              cerrar={() => setAbierto(false)} />
      )}
    </>
  );
}

function Hoja({ viaje, nombres, esEditor, cerrar }: {
  viaje: Viaje;
  nombres: Record<string, string>;
  esEditor: boolean;
  cerrar: () => void;
}) {
  const router = useRouter();
  const [puntas, setPuntas] = useState<Punta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grande, setGrande] = useState<Foto | null>(null);

  const traer = useCallback(() => {
    return fetch(`/api/sider/evidencia/${viaje.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => setPuntas(j.puntas as Punta[]))
      .catch(() => setError("No se pudo leer la evidencia de este viaje."));
  }, [viaje.id]);

  useEffect(() => { traer() }, [traer]);

  /* ---------- COMPLETAR UNA FOTO QUE FALTA ----------
     Por qué existe: la salida sube las fotos DESPUÉS de crear el viaje.
     Si el dato se cae en el patio —que es donde siempre se cae— el viaje
     nace con 0 de 3 y, como la llegada exige las tres de la salida, ese
     vehículo no se puede cerrar NUNCA. El mensaje de error decía "búscalo
     en la Fuente principal y vuelve a intentar" y no había dónde
     intentar. Esto es ese "dónde".

     LO QUE NO SE HACE, Y ES LO IMPORTANTE: la foto NO se sella con la
     hora ni con las coordenadas de la certificación original. Eso sería
     fabricar una prueba —diría que la tomaron el martes en Galapa cuando
     la tomaron hoy aquí—. Se sella con la hora y el sitio de AHORA y con
     la palabra AÑADIDA DESPUÉS quemada en la banda. Vale menos como
     prueba, y así debe ser: se tomó después. */
  const supabase = useMemo(() => createClient(), []);
  const pos = usePosicion();
  const [completando, setCompletando] = useState<string | null>(null);
  const [malFoto, setMalFoto] = useState<string | null>(null);
  const entradas = useRef<Record<string, HTMLInputElement | null>>({});

  async function completar(p: Punta, ranura: Ranura, archivo: File) {
    const llave = `${p.id}:${ranura}`;
    setMalFoto(null);
    setCompletando(llave);
    try {
      const foto = await sellar(archivo, {
        placa: viaje.placa,
        ubi: pos.ubi,
        direccion: pos.direccion.trim(),
        etiqueta: `${p.punta.toUpperCase()} · ${NOMBRE[ranura]} · AÑADIDA DESPUÉS`,
      });

      const ruta = `${viaje.id}/${p.punta}/${ranura}.jpg`;
      const { error: eSubir } = await supabase.storage
        .from("sider")
        .upload(ruta, foto.blob, { contentType: "image/jpeg", upsert: true });
      if (eSubir) throw new Error(eSubir.message);

      const { error: eFila } = await supabase.from("sider_fotos").insert({
        certificacion_id: p.id, ranura, ruta,
        ancho: foto.ancho, alto: foto.alto, bytes: foto.blob.size,
      });
      /* El archivo ya está arriba; si la fila no entra, la foto existe y
         nadie la ve. Se dice con esas palabras en vez de "error". */
      if (eFila) throw new Error(`la imagen subió pero no quedó registrada: ${eFila.message}`);

      URL.revokeObjectURL(foto.url);
      await traer();
      router.refresh();
    } catch (e) {
      setMalFoto(
        `No se pudo completar ${NOMBRE[ranura].toLowerCase()}: ` +
        `${e instanceof Error ? e.message : "error desconocido"}`
      );
    } finally {
      setCompletando(null);
    }
  }

  /* Escape cierra: es lo que hace todo el mundo sin pensarlo. */
  const teclas = useCallback((e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (grande) setGrande(null); else cerrar();
  }, [grande, cerrar]);
  useEffect(() => {
    window.addEventListener("keydown", teclas);
    return () => window.removeEventListener("keydown", teclas);
  }, [teclas]);

  /* Con la hoja abierta el fondo no se desplaza. Sin esto, rodar el dedo
     sobre la foto mueve la tabla de atrás y al cerrar uno aparece en otro
     sitio de la lista, sin saber por qué. Se guarda el valor que había en
     vez de asumir que era "", que es como se rompe el estilo de alguien
     más que también lo esté tocando. */
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = antes; };
  }, []);

  return (
    <div className="ev-fondo" onClick={cerrar} role="dialog" aria-modal="true">
      <div className="ev-hoja" onClick={(e) => e.stopPropagation()}>
        <header>
          {/* El logo del archivo, no dibujado con código. Es el mismo
              /marca/logo-b.png que usan la barra y el login, así que el
              día que se cambie el archivo cambia en todas partes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ev-logo" src="/marca/logo-b.png" alt="Bavaria" />
          <div className="ev-quien">
            <div className="rot">EVIDENCIA DEL VIAJE</div>
            <h2>{viaje.placa}</h2>
            <p>
              {viaje.cd_origen} → {viaje.cd_destino} · {viaje.descripcion} ·{" "}
              {nf2.format(viaje.estibas)} estibas
              {viaje.hl != null && <> · {nf2.format(viaje.hl)} HL</>}
            </p>
          </div>
          <button type="button" className="ev-cerrar" onClick={cerrar} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="ev-cuerpo">
          {/* ---------- Lo que se llenó ---------- */}
          <section className="ev-forms">
            <div className="ev-rot">LO QUE SE LLENÓ EN EL FORMULARIO</div>
            <dl>
              <div><dt>Placa</dt><dd className="fuerte">{viaje.placa}</dd></div>
              <div><dt>CD origen</dt><dd>{viaje.cd_origen}<em>{viaje.planta}</em></dd></div>
              <div><dt>Material</dt><dd>{viaje.descripcion}<em>{viaje.sku}</em></dd></div>
              <div><dt>Estibas</dt><dd>{nf2.format(viaje.estibas)}<em>{nf2.format(viaje.sider)} sider</em></dd></div>
              <div><dt>Cajas</dt><dd>{viaje.cajas == null ? "—" : nf.format(viaje.cajas)}</dd></div>
              <div><dt>Unidades</dt><dd>{viaje.unidades == null ? "—" : nf.format(viaje.unidades)}</dd></div>
              <div><dt>HL</dt><dd>{viaje.hl == null ? "—" : nf2.format(viaje.hl)}</dd></div>
              <div>
                <dt>Estado</dt>
                <dd>
                  <span className={"sello " + (viaje.estado === "recibido" ? "recibido"
                                    : viaje.estado === "anulado" ? "anulado" : "transito")}>
                    <i />{viaje.estado === "en_transito" ? "en tránsito" : viaje.estado}
                  </span>
                </dd>
              </div>
              <div className="ancho">
                <dt>Quién lo certificó</dt>
                <dd>
                  {viaje.creado_por ? nombres[viaje.creado_por] ?? "—" : "—"}
                  <em>{fecha(viaje.creado_en)}</em>
                </dd>
              </div>
              {viaje.observacion && (
                <div className="ancho">
                  <dt>Observación</dt><dd className="suave">{viaje.observacion}</dd>
                </div>
              )}
              {viaje.faltan_factores && (
                <div className="ancho">
                  <dt>Ojo</dt>
                  <dd className="suave">
                    A este material le faltan factores en el maestro, así que cajas,
                    unidades y HL no se pueden calcular. La evidencia vale igual.
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* ---------- Completar lo que falte ----------
              Una sola barra para toda la hoja, no una por hueco: el GPS
              se pide UNA vez y sirve para las tres fotos. Solo sale si de
              verdad falta alguna; si está completo, esto no existe. */}
          {esEditor && puntas?.some(
            (p) => p.fotos.filter((f) => f.ranura !== "observacion").length < 3
          ) && (
            <div className={"ev-completar" + (pos.ubi ? " listo" : "")}>
              {pos.ubi ? (
                <p>
                  <b>Puedes completar las fotos que faltan.</b> Cada una se sella con la
                  hora y el sitio de AHORA y con la palabra <b>AÑADIDA DESPUÉS</b>: se
                  tomó tarde y la foto lo dice. Toca el hueco que quieras llenar.
                </p>
              ) : (
                <>
                  <p>
                    A este viaje le faltan fotos y por eso no se puede cerrar. Para
                    completarlas hace falta tu ubicación — es lo que prueba dónde se
                    tomó la que vas a añadir.
                  </p>
                  <button type="button" className="btn" onClick={pos.pedir}
                          disabled={pos.buscando}>
                    {pos.buscando ? "Buscando el GPS…" : "Activar mi ubicación"}
                  </button>
                </>
              )}
            </div>
          )}
          {pos.errUbi && <div className="aviso mal">{pos.errUbi}</div>}
          {malFoto && <div className="aviso mal">{malFoto}</div>}

          {/* ---------- Las dos puntas ---------- */}
          {error && <div className="aviso mal">{error}</div>}
          {!error && puntas == null && (
            <div className="ev-cargando">Buscando las fotos…</div>
          )}
          {puntas?.length === 0 && (
            <div className="ev-cargando">
              Este viaje no tiene ninguna certificación guardada.
            </div>
          )}
          {puntas?.map((p) => (
            <section key={p.id} className="ev-punta">
              <div className="ev-rot">
                {p.punta === "salida" ? "SALIDA DEL CD ORIGEN" : "LLEGADA A BARRANQUILLA"}
                <em>{p.fotos.length} de 3 fotos</em>
              </div>
              <div className="ev-donde">
                <div>
                  <b>{p.direccion || "Sin dirección resuelta"}</b>
                  <span>
                    {Number(p.lat).toFixed(6)}, {Number(p.lng).toFixed(6)}
                    {p.precision_m != null && <> · ±{nf.format(Number(p.precision_m))} m</>}
                  </span>
                </div>
                <div className="ev-cuando">
                  <b>{fecha(p.ubicado_en ?? p.hecha_en)}</b>
                  <span>{p.hecha_por ? nombres[p.hecha_por] ?? "—" : "—"}</span>
                </div>
                <a
                  className="ev-mapa"
                  href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`}
                  target="_blank" rel="noreferrer"
                >
                  Ver en el mapa
                </a>
              </div>
              {p.nota && <p className="ev-nota">{p.nota}</p>}
              <div className="ev-fotos">
                {p.fotos.map((f) => (
                  <figure key={f.ruta} className={f.ranura === "observacion" ? "obs" : undefined}>
                    {f.url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={f.url} alt={NOMBRE[f.ranura]} loading="lazy"
                           onClick={() => setGrande(f)} />
                    ) : (
                      <div className="ev-rota">No se pudo abrir</div>
                    )}
                    <figcaption>
                      {NOMBRE[f.ranura]}
                      <em>{f.ancho && f.alto ? `${f.ancho}×${f.alto}` : ""} {pesa(f.bytes)}</em>
                    </figcaption>
                  </figure>
                ))}
                {/* Los huecos se cuentan sobre las TRES OBLIGATORIAS, no
                    sobre el total. Contando el total, una punta con dos
                    fotos y una observación daba 3 y no mostraba ningún
                    "Falta": el hueco desaparecía justo cuando había un
                    problema anotado.
                    Y ahora cada hueco sabe CUÁL falta —no es "una de tres"
                    genérica— para poder tomarla ahí mismo. */}
                {RANURAS.filter((r) => !p.fotos.some((f) => f.ranura === r.id)).map((r) => {
                  const llave = `${p.id}:${r.id}`;
                  const ocupado = completando === llave;
                  return (
                    <figure key={llave} className={"falta" + (esEditor ? " tomable" : "")}>
                      {esEditor ? (
                        <>
                          <input
                            ref={(el) => { entradas.current[llave] = el }}
                            type="file" accept="image/*" capture="environment" hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) completar(p, r.id, f);
                              e.target.value = "";
                            }}
                          />
                          <button type="button" className="ev-rota ev-tomar"
                                  disabled={ocupado || !pos.ubi}
                                  title={pos.ubi ? `Tomar ${r.t.toLowerCase()} ahora`
                                                 : "Primero activa tu ubicación"}
                                  onClick={() => entradas.current[llave]?.click()}>
                            <span aria-hidden="true">+</span>
                            {ocupado ? "Subiendo…" : "Falta · tomarla"}
                          </button>
                        </>
                      ) : (
                        <div className="ev-rota">Falta</div>
                      )}
                      <figcaption>{r.t}</figcaption>
                    </figure>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* La foto en grande. La evidencia se revisa mirándola de cerca:
          en una miniatura de 200 px no se lee una placa. */}
      {grande?.url && (
        <div className="ev-lupa" onClick={(e) => { e.stopPropagation(); setGrande(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={grande.url} alt={NOMBRE[grande.ranura]} />
          <span>{NOMBRE[grande.ranura]} · tocar para cerrar</span>
        </div>
      )}
    </div>
  );
}
