"use client";

/**
 * INFORMES GENERADOS — la lista y la vista previa.
 *
 * A LA IZQUIERDA LA LISTA, A LA DERECHA EL PDF. Tocar «Ver» lo pone en
 * el panel sin salir de la pantalla: se pasa de un día a otro mirando el
 * papel, que es para lo que se viene aquí. Al entrar ya se ve el más
 * nuevo.
 *
 * EN EL CELULAR NO HAY PANEL: un PDF dentro de un recuadro de 360 px no
 * se lee, y varios teléfonos ni lo pintan. Ahí «Ver» lo abre en su
 * pestaña, que es donde el teléfono sabe mostrarlo.
 *
 * DESCARGAR LO GUARDA CON NOMBRE DE PERSONA —rotura-linea-2026-09-21-1530.pdf—
 * y no con el nombre interno del archivo, que es la hora en UTC.
 */
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { HojaGuardada } from "@/modulos/rotlinea/datos";
import { resumirHojas } from "@/modulos/rotlinea/historial";
import { armarRelacion, dibujarRelacion, nombreRelacion } from "@/modulos/rotlinea/relacion";
import { TarjetaHoja, nombreDescarga, dia, hora } from "../FilaHoja";
import { comoDataUrl, leerPaleta } from "../../HojaFirma";

const MAX = 60;

export function Informes({ hojas, dias, puedeAnular, desde, hasta }: {
  hojas: HojaGuardada[];
  dias: { fecha: string; und: number; kg: number }[];
  puedeAnular: boolean;
  desde: string;
  hasta: string;
}) {
  const r = useMemo(() => resumirHojas(hojas, dias, { conLinea: false }), [hojas, dias]);
  const lista = r.ordenadas.slice(0, MAX);
  const primera = lista.find((h) => h.anulada_en == null && h.url) ?? lista.find((h) => h.url) ?? null;
  const [elegidaId, setElegidaId] = useState<string | null>(primera?.id ?? null);
  const elegida = lista.find((h) => h.id === elegidaId) ?? null;
  const [aviso, setAviso] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const rel = useMemo(() => armarRelacion(dias, hojas, desde, hasta), [dias, hojas, desde, hasta]);
  const [armando, setArmando] = useState(false);

  /* LA RELACIÓN DEL PERÍODO: un solo PDF con todos los días que tuvieron
     rotura, con hoja o sin ella. Se arma aquí mismo con lo que ya está en
     la pantalla —no hay que pedirle nada más a la base— y con jsPDF, que
     se carga al tocar. Los logos tal cual; los colores, del tema. */
  async function descargarRelacion() {
    setArmando(true);
    setAviso(null);
    try {
      const [{ jsPDF }, palabra, sello] = await Promise.all([
        import("jspdf"),
        comoDataUrl("/marca/logo-bavaria.png"),
        comoDataUrl("/marca/logo-b.png"),
      ]);
      const doc = dibujarRelacion(jsPDF, rel, {
        generado: new Date(),
        marca: { palabra: palabra ?? undefined, sello: sello ?? undefined },
        paleta: leerPaleta(raiz.current),
      });
      doc.save(nombreRelacion(desde, hasta));
    } catch {
      setAviso("No se pudo armar la relación. Revisa la conexión y vuelve a intentar.");
    } finally {
      setArmando(false);
    }
  }

  function ver(h: HojaGuardada) {
    if (!h.url) return;
    /* En pantalla chica no hay panel: se abre donde el teléfono sabe. */
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) {
      window.open(h.url, "_blank", "noopener");
      return;
    }
    setElegidaId(h.id);
  }

  async function descargar(h: HojaGuardada) {
    if (!h.url) return;
    setAviso(null);
    try {
      const resp = await fetch(h.url);
      if (!resp.ok) throw new Error(String(resp.status));
      const blob = await resp.blob();
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(blob);
      enlace.download = nombreDescarga(h);
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);
    } catch {
      /* El enlace vence en una hora: si la pantalla lleva abierta más de
         eso, se dice qué hacer en vez de fallar en silencio. */
      setAviso("No se pudo descargar: el enlace del PDF vence en una hora. Recarga la página y vuelve a intentar.");
    }
  }

  const pend = r.sinHoja.length;

  return (
    <div className="rl-informes" ref={raiz}>
      <section className="rl-cabeza rl-inf-cabeza">
        <div>
          <p className="rl-ojo">QUIEBRA · ROTURA DE LÍNEA · INFORMES</p>
          <h1>Informes generados</h1>
          <p className="rl-sub">
            {r.total === 0 && r.anuladas === 0
              ? "Todavía no se ha generado ninguna hoja del día en este período."
              : <><b>{r.total}</b> {r.total === 1 ? "hoja" : "hojas"} de {r.dias} {r.dias === 1 ? "día" : "días"}
                  {pend > 0 && <> · <em>{pend} {pend === 1 ? "día" : "días"} sin hoja</em></>}
                  {r.cambio.size > 0 && <> · <em>{r.cambio.size} {r.cambio.size === 1 ? "cambió" : "cambiaron"} después</em></>}
                  {r.anuladas > 0 && <> · {r.anuladas} {r.anuladas === 1 ? "anulada" : "anuladas"}</>}.
                  {" "}Toca <b>Ver</b> para mirarla aquí, o descárgala.</>}
          </p>
        </div>
        {/* LA RELACIÓN, AL LADO DEL TÍTULO: es del período entero, no de
            una hoja. Se desactiva si en el período no hubo rotura. */}
        <div className="rl-inf-rel">
          <button type="button" className="rl-hoja-si" onClick={descargarRelacion}
                  disabled={armando || rel.filas.length === 0}>
            {armando ? "Armando…" : "Descargar relación (PDF)"}
          </button>
          <p>{rel.filas.length === 0
            ? "Sin rotura en este período."
            : <>{rel.filas.length} {rel.filas.length === 1 ? "día" : "días"} con rotura, del {dia(desde)} al {dia(hasta)}. Cambia las fechas arriba.</>}</p>
        </div>
      </section>

      {pend > 0 && (
        <section className="rl-tarj ojo rl-inf-pend">
          <p>Días con rotura y sin hoja — tócalo para generarla:</p>
          <div className="rl-lista-firma">
            {r.sinHoja.slice(0, 10).map((d) => (
              <Link key={d.fecha} className="rl-chip-firma" href={`/quiebra/rotura?d=${d.fecha}&hoja=1`}>
                <b>{dia(d.fecha)}</b>
                <span>Generar la hoja</span>
                <i>{d.und.toLocaleString("es-CO")} und</i>
              </Link>
            ))}
            {pend > 10 && <span className="rl-mas-firma">y {pend - 10} más</span>}
          </div>
        </section>
      )}

      {aviso && <p className="rl-hojas-error rl-inf-aviso" role="alert">{aviso}</p>}

      {lista.length === 0 ? null : (
        <div className="rl-inf-marco">
          <div className="rl-inf-lista">
            {lista.map((h) => (
              <TarjetaHoja key={h.id} h={h} vieja={!r.esUltima(h) && h.anulada_en == null}
                           cambio={r.cambio.has(h.id)} puedeAnular={puedeAnular}
                           elegida={h.id === elegidaId}
                           ver={() => ver(h)} descargar={() => descargar(h)} />
            ))}
            {r.ordenadas.length > MAX && (
              <p className="rl-hojas-vacio">Se ven las {MAX} más recientes de {r.ordenadas.length}. Acorta el período para ver las demás.</p>
            )}
          </div>

          <aside className="rl-inf-vista" aria-label="Vista previa">
            {elegida?.url ? (
              <>
                <header>
                  <p><b>{dia(elegida.fecha)}</b> · generada a las {hora(elegida.generado_en)}
                    {elegida.anulada_en && <em> · ANULADA</em>}</p>
                  <div>
                    <button type="button" className="rl-inf-btn" onClick={() => descargar(elegida)}>Descargar</button>
                    <a className="rl-inf-btn" href={elegida.url} target="_blank" rel="noopener noreferrer">Abrir en pestaña</a>
                  </div>
                </header>
                <iframe key={elegida.id} src={elegida.url} title={`Hoja del día ${elegida.fecha}`} />
              </>
            ) : (
              <p className="rl-hojas-vacio">Toca <b>Ver</b> en una hoja para mirarla aquí.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
