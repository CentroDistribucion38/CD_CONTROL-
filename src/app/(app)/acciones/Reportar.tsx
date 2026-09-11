"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePosicion, sellar, type Foto } from "@/lib/evidencia";
import { encolar, esDeRed } from "@/modulos/acciones/cola";
import type { Motivo, Zona } from "@/modulos/acciones/datos";

/**
 * REPORTAR UNA ACCIÓN — cuatro pasos, en el orden en que pasan las cosas.
 *
 *   1. DÓNDE   el QR del pasillo, o el GPS, o la lista, o a mano
 *   2. QUÉ     el motivo de la lista y el título
 *   3. LA FOTO tomada con la cámara y sellada aquí mismo
 *   4. CUÁNDO  la prioridad, que es la que pone el plazo
 *
 * POR QUÉ "DÓNDE" VA PRIMERO Y NO ÚLTIMO.
 * Quien reporta está parado en el sitio. Si el lugar se pregunta al
 * final, ya caminó, y escribe de memoria: "por el pasillo tres, creo".
 * Preguntado de primero, se resuelve con la cámara en dos segundos y
 * queda exacto — y el lugar exacto es lo que después permite decir
 * "esto ya pasó tres veces AQUÍ", que es la regla que sostiene el
 * módulo entero.
 *
 * LOS CUATRO CAMINOS PARA EL LUGAR, en orden de qué tan seguro es:
 *   QR      exacto, y llena área y proceso solos
 *   GPS     ubica y propone la zona más cercana; la persona confirma
 *   lista   sin señal ni QR, se escoge
 *   a mano  último recurso, nunca se traba
 * El reporte JAMÁS se bloquea por no saber dónde está: se bloquea si no
 * se dice dónde, que es distinto.
 */

type Props = {
  zonas: Zona[];
  motivos: Motivo[];
  plazos: Record<string, { horas: number; etiqueta: string }>;
  cerrar: () => void;
};

type Modo = "detectando" | "confirmar" | "lista" | "qr" | "mano";

const PRIORIDADES = [
  { id: "alta", t: "Alta" },
  { id: "media", t: "Media" },
  { id: "baja", t: "Baja" },
] as const;

/** Metros entre dos puntos. Suficiente para "a 18 m" dentro de una bodega. */
function metros(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la = (aLat * Math.PI) / 180;
  const lb = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function Reportar({ zonas, motivos, plazos, cerrar }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [paso, setPaso] = useState(1);
  const [modo, setModo] = useState<Modo>("detectando");
  const [zona, setZona] = useState<Zona | null>(null);
  const [aMano, setAMano] = useState("");
  const [busca, setBusca] = useState("");

  const [motivo, setMotivo] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [foto, setFoto] = useState<Foto | null>(null);
  const [sellando, setSellando] = useState(false);
  const camara = useRef<HTMLInputElement>(null);

  const [prioridad, setPrioridad] = useState<"alta" | "media" | "baja">("media");
  const [tocoPrioridad, setTocoPrioridad] = useState(false);

  const [mandando, setMandando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [listo, setListo] = useState<{ codigo: string; vence: string } | null>(null);
  /* Se guardó sin red y va a salir sola. Es un final distinto del de
     "quedó reportada" y por eso es otro estado: prometerle a alguien un
     código que todavía no existe sería mentirle. */
  const [enCola, setEnCola] = useState(false);
  const [sinRed, setSinRed] = useState(false);

  /* Se mira al abrir y cada vez que el navegador avisa. No es adorno:
     es lo que permite decir ANTES de tomar la foto que el envío va a
     quedar en cola, en vez de decirlo al final cuando ya no hay vuelta. */
  useEffect(() => {
    const mirar = () => setSinRed(typeof navigator !== "undefined" && !navigator.onLine);
    mirar();
    window.addEventListener("online", mirar);
    window.addEventListener("offline", mirar);
    return () => {
      window.removeEventListener("online", mirar);
      window.removeEventListener("offline", mirar);
    };
  }, []);

  const { ubi, buscando, errUbi, direccion, pedir } = usePosicion();

  /* Se pide el GPS al abrir, sin que nadie lo toque: quien abrió esto
     está en el sitio AHORA, y cada toque de más es un toque con guantes. */
  useEffect(() => { pedir(); }, [pedir]);

  /* Zonas ordenadas por distancia, cuando hay punto y la zona tiene
     coordenadas. Sin GPS o sin coordenadas, la lista queda como viene
     del maestro: no se inventa una cercanía que no se sabe. */
  const conDistancia = zonas
    .filter((z) => z.activo)
    .map((z) => ({
      z,
      d: ubi && z.lat != null && z.lng != null
        ? metros(ubi.lat, ubi.lng, Number(z.lat), Number(z.lng))
        : null,
    }))
    .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));

  const cerca = conDistancia.filter((x) => x.d != null);

  /* En cuanto llega el punto, si hay una zona cerca se propone. Si no
     hay ninguna con coordenadas —que es lo normal hasta que alguien las
     cargue— se pasa derecho a la lista en vez de dejar una pantalla
     "detectando" que no va a terminar nunca. */
  useEffect(() => {
    if (modo !== "detectando") return;
    if (ubi && cerca.length) { setZona(cerca[0].z); setModo("confirmar"); }
    else if (ubi || errUbi) setModo("lista");
  }, [ubi, errUbi, modo, cerca]);

  const enLista = conDistancia
    .map((x) => x.z)
    .filter((z) => {
      const q = busca.trim().toLowerCase();
      if (!q) return true;
      return (z.nombre + " " + z.codigo + " " + (z.proceso ?? "")).toLowerCase().includes(q);
    });

  /* El QR. Se lee con BarcodeDetector, que traen Chrome y el navegador
     de Android; donde no está, el botón no promete lo que no puede
     cumplir y manda a la lista. */
  const [qrVivo, setQrVivo] = useState(false);
  const [qrMal, setQrMal] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);

  const apagarQr = useCallback(() => {
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
    setQrVivo(false);
  }, []);

  const prenderQr = useCallback(async () => {
    setQrMal(null);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const Det = (window as any).BarcodeDetector;
    if (!Det) {
      setQrMal("Este teléfono no puede leer el QR desde el navegador. Escoge la zona de la lista.");
      setModo("lista");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      flujo.current = s;
      setQrVivo(true);
      if (video.current) { video.current.srcObject = s; await video.current.play(); }
      const det = new Det({ formats: ["qr_code"] });
      const mirar = async () => {
        if (!flujo.current || !video.current) return;
        try {
          const cods = await det.detect(video.current);
          if (cods?.length) {
            const leido = String(cods[0].rawValue ?? "").trim().toUpperCase();
            const z = zonas.find((x) => x.codigo.toUpperCase() === leido && x.activo);
            if (z) { setZona(z); apagarQr(); setModo("confirmar"); return; }
            setQrMal(`Ese código (${leido}) no está en el maestro de zonas.`);
          }
        } catch { /* un cuadro que no se pudo leer no es un error */ }
        if (flujo.current) requestAnimationFrame(mirar);
      };
      requestAnimationFrame(mirar);
    } catch {
      setQrMal("No se pudo abrir la cámara. Escoge la zona de la lista.");
      setModo("lista");
    }
  }, [zonas, apagarQr]);

  useEffect(() => () => { apagarQr(); }, [apagarQr]);
  useEffect(() => { if (modo === "qr") prenderQr(); else apagarQr(); }, [modo, prenderQr, apagarQr]);

  /* La foto se sella AQUÍ, en el teléfono, al tomarla. Entre tomar y
     subir pueden pasar veinte minutos sin señal, y la hora que quedaría
     escrita sería la de la subida. */
  async function tomarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSellando(true);
    setMal(null);
    try {
      const f = await sellar(archivo, {
        titulo: (zona?.codigo ?? (aMano.trim() || "SIN ZONA")).toUpperCase(),
        ubi,
        direccion,
        etiqueta: "HALLAZGO",
      });
      if (foto) URL.revokeObjectURL(foto.url);
      setFoto(f);
    } catch {
      setMal("No se pudo procesar esa foto. Vuelve a tomarla.");
    }
    setSellando(false);
  }

  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto.url); }, [foto]);

  /* Al escoger motivo, si es crítico se propone prioridad alta. Se puede
     bajar, pero hay que hacerlo a propósito: un extintor vencido no
     debería depender de que a alguien se le ocurra que es grave.
     Solo se propone mientras nadie haya tocado la prioridad a mano. */
  function escogerMotivo(clave: string) {
    setMotivo(clave);
    const m = motivos.find((x) => x.clave === clave);
    if (m && !tocoPrioridad) setPrioridad(m.critico ? "alta" : "media");
    if (m && !titulo.trim()) setTitulo(m.nombre);
  }

  const hayLugar = !!zona || aMano.trim().length > 2;
  const puedeSeguir =
    paso === 1 ? hayLugar :
    paso === 2 ? !!motivo && titulo.trim().length > 2 :
    paso === 3 ? true :
    true;

  async function mandar() {
    setMandando(true);
    setMal(null);

    const rpc = {
      p_titulo: titulo.trim(),
      p_motivo: motivo,
      p_prioridad: prioridad,
      p_zona: zona?.codigo ?? null,
      p_ubicacion: aMano.trim() || null,
      p_descripcion: descripcion.trim() || null,
      p_lat: ubi?.lat ?? null,
      p_lng: ubi?.lng ?? null,
      p_precision: ubi ? Math.round(ubi.precision) : null,
    };

    /* SIN RED NI SE INTENTA. Se guarda y se avisa. Intentarlo primero
       solo gasta veinte segundos de espera para llegar al mismo sitio,
       y en un pasillo sin señal esos veinte segundos son los que hacen
       que la próxima vez nadie reporte. */
    if (sinRed) {
      try {
        await encolar({
          rpc, foto: foto?.blob, ancho: foto?.ancho, alto: foto?.alto,
          intentado_en: new Date().toISOString(), titulo: titulo.trim(),
        });
        setMandando(false);
        setEnCola(true);
        return;
      } catch {
        setMandando(false);
        setMal("No hay señal y este teléfono no pudo guardar el reporte para después. Sal a donde haya señal sin cerrar esta pantalla.");
        return;
      }
    }

    const { data, error } = await supabase.rpc("accion_reportar", rpc);

    if (error) {
      /* Dos errores distintos que se veían iguales:
         SIN RED    la petición no llegó a ningún lado. Se guarda y sale
                    sola después.
         RECHAZO    la base contestó que no —reincidencia, permiso, fecha
                    futura—. Encolarlo lo haría reintentar para siempre
                    fallando igual, y mientras tanto la persona creería
                    que quedó reportado. Se muestra con sus palabras, que
                    ya explican qué hacer. */
      if (esDeRed(error)) {
        try {
          await encolar({
            rpc, foto: foto?.blob, ancho: foto?.ancho, alto: foto?.alto,
            intentado_en: new Date().toISOString(), titulo: titulo.trim(),
          });
          setMandando(false);
          setEnCola(true);
          return;
        } catch { /* si tampoco se pudo guardar, cae al mensaje de abajo */ }
      }
      setMandando(false);
      setMal(error.message);
      return;
    }

    const fila = Array.isArray(data) ? data[0] : data;
    const id = fila?.id as string;

    /* La foto va DESPUÉS, porque su ruta lleva el id de la acción. Si
       falla, la acción YA existe y eso es lo correcto: perder el reporte
       porque no subió una imagen sería cambiar lo importante por lo
       accesorio. Se dice que faltó la foto y se sigue. */
    let avisoFoto = "";
    if (foto && id) {
      const ruta = `${id}/hallazgo.jpg`;
      const { error: eSubir } = await supabase.storage
        .from("acciones")
        .upload(ruta, foto.blob, { contentType: "image/jpeg", upsert: true });
      if (eSubir) {
        avisoFoto = " La foto no subió; se puede agregar después desde la acción.";
      } else {
        const { error: eFila } = await supabase.from("acciones_fotos").insert({
          accion_id: id, ranura: "hallazgo", ruta,
          ancho: foto.ancho, alto: foto.alto, bytes: foto.blob.size,
          tomada_en: ubi?.en ?? new Date().toISOString(),
          lat: ubi?.lat ?? null, lng: ubi?.lng ?? null,
          precision_m: ubi ? Math.round(ubi.precision) : null,
        });
        /* El archivo YA está arriba. Si la fila no entra, la foto existe
           y nadie la ve: se dice con esas palabras, porque la salida es
           distinta —volver a intentar, no volver a tomarla—. */
        if (eFila) avisoFoto = " La foto subió pero no quedó registrada: " + eFila.message;
      }
    }

    setMandando(false);
    setListo({ codigo: fila?.codigo ?? "", vence: fila?.vence_en ?? "" });
    if (avisoFoto) setMal(avisoFoto.trim());
    router.refresh();
  }

  const fmt = (s: string) =>
    s ? new Date(s).toLocaleString("es-CO", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    }) : "";

  /* ------------------------------------------------------------------ */
  if (enCola) {
    return (
      <div className="ac-rep">
        <div className="barra">
          <span className="t">REPORTAR</span>
          <button type="button" onClick={cerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="cuerpo">
          <h2>Guardado en el teléfono</h2>
          <p className="guia">
            No hay señal en este punto. El reporte quedó guardado con su foto y{" "}
            <b>se envía solo</b> cuando vuelva la red — no hay que volver a escribirlo ni
            acordarse de nada.
          </p>
          <div className="negro">
            <span className="punto" />
            <span>
              La foto ya está sellada con la hora y el sitio de AHORA, así que cuando salga va a
              seguir diciendo lo de este momento. <b>El plazo no:</b> las 48 horas las cuenta la
              base cuando reciba el reporte, no desde ya.
            </span>
          </div>
        </div>
        <div className="pie">
          <button type="button" onClick={cerrar}>Cerrar</button>
          <button type="button" className="si" onClick={() => {
            setEnCola(false); setPaso(1); setModo("detectando"); setZona(null); setAMano("");
            setMotivo(""); setTitulo(""); setDescripcion("");
            if (foto) URL.revokeObjectURL(foto.url);
            setFoto(null); setMal(null); setTocoPrioridad(false); pedir();
          }}>Reportar otra</button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  if (listo) {
    return (
      <div className="ac-rep">
        <div className="barra">
          <span className="t">REPORTAR</span>
          <button type="button" onClick={cerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="cuerpo">
          <h2>Quedó reportada</h2>
          <p className="guia">
            Es la <b>{listo.codigo}</b>. Vence el <b>{fmt(listo.vence)}</b> — el plazo lo puso la
            prioridad, no una persona, y por eso el indicador de cumplimiento no se puede negociar.
          </p>
          {mal && <div className="negro"><span className="punto" />{mal}</div>}
          <div className="aviso" style={{ marginTop: 14 }}>
            Todavía no tiene responsable. Se asigna desde <b>Todas</b>, mirando primero cuánto
            tiene encima cada quien.
          </div>
        </div>
        <div className="pie">
          <button type="button" onClick={cerrar}>Cerrar</button>
          <button type="button" className="si" onClick={() => {
            setListo(null); setPaso(1); setModo("detectando"); setZona(null); setAMano("");
            setMotivo(""); setTitulo(""); setDescripcion("");
            if (foto) URL.revokeObjectURL(foto.url);
            setFoto(null); setMal(null); setTocoPrioridad(false); pedir();
          }}>Reportar otra</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ac-rep">
      <div className="barra">
        <span className="t">REPORTAR</span>
        <button type="button" onClick={cerrar} aria-label="Cerrar">✕</button>
      </div>
      <div className="pasos">
        {[1, 2, 3, 4].map((n) => <i key={n} className={n <= paso ? "on" : ""} />)}
      </div>

      <div className="cuerpo">
        {/* ---------------- PASO 1 · DÓNDE ---------------- */}
        {paso === 1 && (
          <>
            {modo === "qr" ? (
              <>
                <h2>Escanea el QR del pasillo</h2>
                <p className="guia">
                  Cada pasillo, muelle y zona tiene su código pegado. Al escanearlo, el área, el
                  proceso y la ubicación se llenan solos.
                </p>
                <div className="foto">
                  <div className="lienzo">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video ref={video} playsInline muted
                           style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {!qrVivo && "ABRIENDO LA CÁMARA…"}
                  </div>
                </div>
                {qrMal && <div className="negro"><span className="punto" />{qrMal}</div>}
                <button type="button" className="otra" onClick={() => setModo("lista")}>
                  No encuentro el código, escoger de la lista
                </button>
              </>
            ) : modo === "confirmar" && zona ? (
              <>
                <h2>¿Dónde estás?</h2>
                <p className="guia">
                  Se detectó con el GPS del teléfono. Confirma o escoge otra zona de la lista.
                </p>
                <div className="zona">
                  <div className="rot">
                    UBICACIÓN DETECTADA{ubi ? ` · PRECISIÓN ${Math.round(ubi.precision)} M` : ""}
                  </div>
                  <h3>{zona.nombre}{zona.proceso ? ` · ${zona.proceso}` : ""}</h3>
                  <p>
                    {zona.codigo}
                    {ubi ? ` · ${ubi.lat.toFixed(4)}, ${ubi.lng.toFixed(4)}` : ""}
                  </p>
                  <div className="dos">
                    <button type="button" className="si" onClick={() => setPaso(2)}>Sí, es aquí</button>
                    <button type="button" onClick={() => setModo("lista")}>Es otra</button>
                  </div>
                </div>
                {cerca.length > 1 && (
                  <div className="lista">
                    <div className="grupo">OTRAS ZONAS CERCA</div>
                    {cerca.slice(1, 4).map(({ z, d }) => (
                      <button key={z.codigo} type="button"
                              onClick={() => { setZona(z); setPaso(2); }}>
                        <span className="d">a {d} m</span>
                        <div className="n">{z.nombre}{z.proceso ? ` · ${z.proceso}` : ""}</div>
                        <div className="c">{z.codigo}</div>
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" className="otra" onClick={() => setModo("qr")}>
                  Escanear QR del pasillo · atajo
                </button>
              </>
            ) : modo === "mano" ? (
              <>
                <h2>Escríbelo</h2>
                <p className="guia">
                  Ninguna zona del maestro aplica. Di dónde es con la precisión que usarías por
                  radio: alguien va a ir a buscarlo con esto.
                </p>
                <div className="campo">
                  <label>La ubicación</label>
                  <input value={aMano} onChange={(e) => setAMano(e.target.value)}
                         placeholder="Detrás de la oficina de despacho, junto al tablero eléctrico" />
                </div>
                <button type="button" className="otra" onClick={() => setModo("lista")}>
                  Volver a la lista de zonas
                </button>
              </>
            ) : (
              <>
                <h2>{ubi ? "Escoge la zona" : "¿Dónde estás?"}</h2>
                <p className="guia">
                  {buscando ? "Buscando la ubicación con el GPS…"
                    : errUbi ? errUbi
                    : "Sin GPS en este punto de la bodega. Busca o escoge de la lista."}
                </p>
                <div className="buscar">
                  <span aria-hidden>⌕</span>
                  <input value={busca} onChange={(e) => setBusca(e.target.value)}
                         placeholder="Buscar zona, pasillo o muelle" />
                </div>
                <div className="lista">
                  {enLista.length === 0 && (
                    <div className="grupo">NADA COINCIDE CON “{busca.trim()}”</div>
                  )}
                  {enLista.map((z) => (
                    <button key={z.codigo} type="button"
                            className={zona?.codigo === z.codigo ? "on" : ""}
                            onClick={() => { setZona(z); setPaso(2); }}>
                      <div className="n">{z.nombre}{z.proceso ? ` · ${z.proceso}` : ""}</div>
                      <div className="c">{z.codigo}</div>
                    </button>
                  ))}
                </div>
                <button type="button" className="otra" onClick={() => setModo("qr")}>
                  Escanear QR del pasillo · atajo
                </button>
                <button type="button" className="otra" onClick={() => setModo("mano")}>
                  Ninguna aplica · escribir la ubicación
                </button>
              </>
            )}
          </>
        )}

        {/* ---------------- PASO 2 · QUÉ ---------------- */}
        {paso === 2 && (
          <>
            <h2>¿Qué encontraste?</h2>
            <p className="guia">
              El motivo sale de una lista cerrada: es lo que después permite contar que esto ya
              pasó tres veces en el mismo sitio. El detalle va libre abajo.
            </p>
            <div className="campo">
              <label>Motivo</label>
              <select value={motivo} onChange={(e) => escogerMotivo(e.target.value)}>
                <option value="">Escoge el motivo…</option>
                {motivos.map((m) => (
                  <option key={m.clave} value={m.clave}>
                    {m.nombre}{m.critico ? " · crítico" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>Título</label>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
                     placeholder="Estibas mal apiladas en picking 3" />
            </div>
            <div className="campo">
              <label>Detalle (opcional)</label>
              <textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                        placeholder="Tres estibas a cuatro alturas contra el rack, la de arriba inclinada." />
            </div>
          </>
        )}

        {/* ---------------- PASO 3 · LA FOTO ---------------- */}
        {paso === 3 && (
          <>
            <h2>La foto del hallazgo</h2>
            <p className="guia">
              Se toma con la cámara, no se escoge de la galería: una foto de hace tres semanas no
              prueba lo de hoy. La hora y las coordenadas quedan quemadas en la imagen.
            </p>
            <div className="foto">
              <div className="lienzo">
                {foto ? <img src={foto.url} alt="Hallazgo" />
                      : sellando ? "SELLANDO…" : "FOTO DEL HALLAZGO"}
              </div>
              <div className="sello">
                <div>
                  {new Date().toLocaleString("es-CO", {
                    day: "2-digit", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                  {ubi ? ` · ${ubi.lat.toFixed(4)}, ${ubi.lng.toFixed(4)} · precisión ${Math.round(ubi.precision)} m`
                       : " · sin ubicación"}
                </div>
                <div><b>Cámara, no galería.</b> La foto se sella al tomarla.</div>
              </div>
            </div>
            <input ref={camara} type="file" accept="image/*" capture="environment"
                   onChange={tomarFoto} hidden />
            <button type="button" className="otra" onClick={() => camara.current?.click()}
                    disabled={sellando}>
              {foto ? "Tomar otra" : "Abrir la cámara"}
            </button>
            {!foto && (
              <div className="aviso" style={{ marginTop: 12 }}>
                Se puede reportar sin foto, y a veces toca. Pero una acción sin foto es la palabra
                de alguien contra la de otro cuando llegue la hora de verificar.
              </div>
            )}
          </>
        )}

        {/* ---------------- PASO 4 · LA PRIORIDAD ---------------- */}
        {paso === 4 && (
          <>
            <h2>¿Qué tan urgente?</h2>
            <p className="guia">
              Lo único que se escoge aquí es la prioridad. El plazo sale de ella.
            </p>

            {zona && (
              <div className="zona">
                <div className="rot">
                  {modo === "qr" ? "QR LEÍDO" : "ZONA"} · {zona.codigo}
                </div>
                <h3>{zona.nombre}{zona.proceso ? ` · ${zona.proceso}` : ""}</h3>
                <p>
                  {motivos.find((m) => m.clave === motivo)?.nombre}
                  {ubi ? ` · ${ubi.lat.toFixed(4)}, ${ubi.lng.toFixed(4)} · precisión ${Math.round(ubi.precision)} m` : ""}
                </p>
              </div>
            )}

            <div className="prio">
              {PRIORIDADES.map((p) => (
                <button key={p.id} type="button"
                        className={(prioridad === p.id ? "on " : "") + p.id}
                        onClick={() => { setPrioridad(p.id); setTocoPrioridad(true); }}>
                  <div className="p">{p.t}</div>
                  <div className="h">{plazos[p.id]?.etiqueta ?? ""}</div>
                </button>
              ))}
            </div>

            <div className="aviso">
              El plazo lo pone la prioridad, no la persona: vence el{" "}
              <b>{fmt(new Date(Date.now() + (plazos[prioridad]?.horas ?? 168) * 3600_000).toISOString())}</b>.
              Así el indicador de cumplimiento no se puede negociar.
            </div>

            {sinRed && (
              <div className="negro" style={{ marginTop: 12 }}>
                <span className="punto" />
                <span>
                  Sin señal en este punto. <b>Se envía sola</b> cuando vuelva la red.
                </span>
              </div>
            )}

            {mal && (
              <div className="negro" style={{ marginTop: 12 }}>
                <span className="punto" />
                <span>{mal}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="pie">
        <button type="button" onClick={() => (paso === 1 ? cerrar() : setPaso(paso - 1))}>
          {paso === 1 ? "Cancelar" : "Atrás"}
        </button>
        {paso < 4 ? (
          <button type="button" className="si" disabled={!puedeSeguir}
                  onClick={() => setPaso(paso + 1)}>
            Continuar
          </button>
        ) : (
          <button type="button" className="si" disabled={mandando || !puedeSeguir} onClick={mandar}>
            {mandando ? "Reportando…" : "Reportar"}
          </button>
        )}
      </div>
    </div>
  );
}
