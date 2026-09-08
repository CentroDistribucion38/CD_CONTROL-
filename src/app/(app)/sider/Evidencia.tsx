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

import { useCallback, useEffect, useState } from "react";
import type { Viaje } from "@/modulos/sider/comun";

type Foto = {
  ranura: "costado_izq" | "costado_der" | "placa";
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
};

const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }) : "—";

const pesa = (b: number | null) => (b == null ? "" : `${nf.format(b / 1024)} KB`);

export function OjoEvidencia({ viaje, nombres }: {
  viaje: Viaje;
  nombres: Record<string, string>;
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
        <Hoja viaje={viaje} nombres={nombres} cerrar={() => setAbierto(false)} />
      )}
    </>
  );
}

function Hoja({ viaje, nombres, cerrar }: {
  viaje: Viaje;
  nombres: Record<string, string>;
  cerrar: () => void;
}) {
  const [puntas, setPuntas] = useState<Punta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grande, setGrande] = useState<Foto | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/sider/evidencia/${viaje.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (vivo) setPuntas(j.puntas as Punta[]); })
      .catch(() => { if (vivo) setError("No se pudo leer la evidencia de este viaje."); });
    return () => { vivo = false; };
  }, [viaje.id]);

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
          <div>
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
                  <figure key={f.ruta}>
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
                {Array.from({ length: 3 - p.fotos.length }).map((_, i) => (
                  <figure key={`falta${i}`} className="falta">
                    <div className="ev-rota">Falta</div>
                    <figcaption>—</figcaption>
                  </figure>
                ))}
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
