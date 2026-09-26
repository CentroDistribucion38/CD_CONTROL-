"use client";

import { useMemo, useState } from "react";
import { BuscarEnLista } from "@/components/BuscarEnLista";
import { useAvisos } from "@/components/Aviso";
import type { Material, Ubicacion } from "@/modulos/inventario/fefo";
import { calcularVence, fechaCorta, rotulosPdf,
         type Rotulo, type TipoRecibo } from "@/modulos/inventario/rotulo";

/**
 * RECIBIR — lo que entra al CD, y el rótulo que se le pega.
 *
 * ---------------------------------------------------------------------
 * LA PRIMERA PREGUNTA ES QUÉ ENTRA
 * ---------------------------------------------------------------------
 * Producto terminado y envase retornable se reciben distinto y llevan
 * rótulos distintos: el producto vence y el envase no. Preguntarlo
 * primero, y cambiar el formulario detrás, evita la alternativa —un
 * formulario con todos los campos de los dos y la mitad siempre en
 * blanco—, que es la que hace que la gente teclee cualquier cosa con tal
 * de pasar de pantalla.
 *
 * ---------------------------------------------------------------------
 * UNA ESTIBA, UN PAPEL
 * ---------------------------------------------------------------------
 * Se recibe por estibas, no por «un bulto de cajas»: el rótulo se pega
 * en UNA estiba y tiene que decir cuál de cuántas es. Doce papeles
 * iguales en la mano no se pueden repartir entre doce estibas sin
 * equivocarse.
 *
 * ---------------------------------------------------------------------
 * POR AHORA SE DIGITA
 * ---------------------------------------------------------------------
 * Los datos se escriben a mano. Cuando llegue la información de verdad
 * —de un vehículo ya certificado en T1/T2, o de un Excel— esta pantalla
 * los recibe puestos y lo demás no cambia: el rótulo ya sabe pintarse
 * con lo que le den. Por eso el generador vive aparte, en
 * `modulos/inventario/rotulo.ts`, y no dentro de este formulario.
 */

/** Lo que hace falta para poder sacar un rótulo que sirva. */
const VACIO = {
  material: "", estibas: "1", cantidad: "", unidad: "cajas" as "cajas" | "unidades",
  calle: "", modulo: "", lado: "", ubicacion_id: "",
  producido: "", lote: "", placa: "", origen: "", color: "",
};

const COLORES = [["ambar", "Ámbar"], ["flint", "Flint"], ["green", "Green"]] as const;

/* EL FOLIO SE ARMA AQUÍ Y AHORA porque todavía no hay tabla que lo
   genere. Lleva la fecha y una cola corta al azar: dos recibos del
   mismo material el mismo día tienen que dar folios distintos, o el QR
   de los dos abriría la misma estiba.

   CUANDO ESTO SE GUARDE EN LA BASE, el folio lo da la base y esta
   función se va. Queda escrito para que nadie la deje viva creyendo que
   es la definitiva: un identificador inventado en el navegador no
   sirve para algo que después hay que poder buscar. */
function folioProvisional(sku: string, i: number) {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
  const cola = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${ymd}-${sku}-${cola}-${String(i + 1).padStart(2, "0")}`;
}

export function Recibir({ materiales, ubicaciones, quien, puedeRecibir }: {
  materiales: Material[];
  ubicaciones: Ubicacion[];
  quien: string;
  puedeRecibir: boolean;
}) {
  const [tipo, setTipo] = useState<TipoRecibo>("producto");
  const [f, setF] = useState(VACIO);
  const [sacando, setSacando] = useState(false);
  const [avisar, avisos] = useAvisos();

  /* LOS MATERIALES DEL TIPO QUE SE ESTÁ RECIBIENDO. El maestro tiene
     494 y mezclarlos obliga a leer la palabra «ENVASE» en cada renglón
     para saber cuál es cuál. */
  const delTipo = useMemo(
    () => materiales.filter((m) => m.activo
      && (tipo === "producto" ? m.tipo_material === "PRODUCTO" : m.tipo_material === "ENVASE")),
    [materiales, tipo]);

  const mat = delTipo.find((m) => m.sku === f.material) ?? null;

  /* LA UBICACIÓN SON TRES COSAS Y SE ESCOGEN EN CASCADA: calle →
     módulo → lado. Es el mismo orden en que está pintada la bodega en
     el piso, y el mismo que ya usa Averías. */
  const calles = useMemo(
    () => [...new Set(ubicaciones.map((u) => u.calle))].sort(), [ubicaciones]);
  const modulos = useMemo(
    () => [...new Set(ubicaciones.filter((u) => u.calle === f.calle).map((u) => u.modulo))].sort(),
    [ubicaciones, f.calle]);
  const lados = useMemo(
    () => ubicaciones.filter((u) => u.calle === f.calle && u.modulo === f.modulo),
    [ubicaciones, f.calle, f.modulo]);
  const ubi = ubicaciones.find((u) => u.id === f.ubicacion_id) ?? null;

  const estibas = Math.max(1, Math.min(60, Number(f.estibas) || 0));
  const cantidad = Number(String(f.cantidad).replace(/\./g, "").replace(",", ".")) || 0;

  /* CUÁNDO VENCE, del maestro y no a ojo. Si al material le falta la
     vida útil, o no se puso la fecha de producción, se queda en null y
     el rótulo lo dice: calcularlo a la brava e imprimirlo sería poner
     en la estiba una fecha que nadie va a volver a cuestionar. */
  const vence = tipo === "producto"
    ? calcularVence(f.producido || null, mat?.vida_util ?? null) : null;

  /* LO QUE FALTA PARA PODER IMPRIMIR, dicho por su nombre. Un botón
     apagado sin explicación se lee como que la pantalla está rota. */
  const falta: string[] = [];
  if (!mat) falta.push(tipo === "producto" ? "el producto" : "el envase");
  if (cantidad <= 0) falta.push("cuántas " + f.unidad + " trae cada estiba");
  if (!f.ubicacion_id) falta.push("la ubicación");

  async function sacar() {
    if (!mat || falta.length) return;
    setSacando(true);
    try {
      const rotulos: Rotulo[] = Array.from({ length: estibas }, (_, i) => ({
        folio: folioProvisional(mat.sku, i),
        tipo,
        sku: mat.sku,
        nombre: mat.nombre,
        cantidad,
        unidad: f.unidad,
        ubicacion: ubi?.clave ?? null,
        numero: i + 1,
        total: estibas,
        producido: tipo === "producto" ? (f.producido || null) : null,
        vence: tipo === "producto" ? vence : null,
        lote: tipo === "producto" ? (f.lote.trim() || null) : null,
        color: tipo === "envase" ? (f.color || null) : null,
        origen: tipo === "envase" ? (f.origen.trim() || null) : null,
        placa: f.placa.trim().toUpperCase() || null,
        recibido_por: quien,
        recibido_en: new Date().toLocaleString("es-CO",
          { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      }));

      const pdf = await rotulosPdf(rotulos, {
        /* DE DÓNDE CUELGA EL QR: el dominio desde el que se abrió la
           pantalla. Escribirlo a mano aquí haría que los rótulos
           impresos desde una prueba apunten a producción, o al revés. */
        base: typeof window !== "undefined" ? window.location.origin : null,
        dentro: document.querySelector(".fe"),
      });
      /* SE ABRE PARA IMPRIMIR, no se descarga: lo que se quiere es
         mandarlo a la impresora, y un archivo en Descargas es un paso
         más y una carpeta que se llena de rótulos viejos. */
      pdf.autoPrint();
      const url = pdf.output("bloburl");
      window.open(url, "_blank");
      avisar.bien(estibas === 1
        ? "Rótulo listo. Se abrió para imprimir."
        : `${estibas} rótulos listos, numerados del 1 al ${estibas}.`);
    } catch (e) {
      avisar.mal("No se pudo armar el rótulo: " + ((e as Error).message ?? e));
    } finally {
      setSacando(false);
    }
  }

  return (
    <>
      {avisos}

      {/* ---------- QUÉ ENTRA ---------- */}
      <div className="rc-tipo" role="group" aria-label="Qué se recibe">
        {([["producto", "Producto terminado"], ["envase", "EER · envase retornable"]] as const)
          .map(([k, t]) => (
            <button key={k} type="button" className={tipo === k ? "on" : ""}
                    aria-pressed={tipo === k}
                    /* CAMBIAR DE TIPO LIMPIA EL MATERIAL, y no es celo:
                       un SKU de envase escogido y después el tipo en
                       «producto» dejaría un rótulo de producto con un
                       código de envase impreso en letra de siete
                       centímetros. */
                    onClick={() => { setTipo(k); setF({ ...f, material: "" }) }}>
              {t}
            </button>
          ))}
      </div>

      <div className="rc-cuerpo">
        <section className="rc-forma">
          <h2>Qué llegó</h2>

          <label className="rc-c ancho">
            <span>{tipo === "producto" ? "Producto" : "Envase"}</span>
            <BuscarEnLista id="rc-mat" valor={f.material}
              opciones={delTipo.map((m) => ({
                clave: m.sku, nombre: m.nombre, codigo: m.sku,
                /* LOS QUE SE RECIBEN CASI SIEMPRE SALEN DE ENTRADA. Es
                   la misma marca que ya usa Quiebra en sitio, y el
                   maestro tiene 494: abrirlo entero es bajar treinta
                   pantallazos de pie. Los demás salen al escribir. */
                corta: m.en_sitio,
              }))}
              cambiar={(c) => setF({ ...f, material: c })}
              rotulo={`Escribe el nombre o el código — ${delTipo.length} en el maestro`}
              cuenta="en el maestro"
              vacio={`No hay ${tipo === "producto" ? "productos" : "envases"} activos en el maestro de inventario.`} />
          </label>

          <label className="rc-c">
            <span>Estibas</span>
            <input value={f.estibas} inputMode="numeric"
                   onChange={(e) => setF({ ...f, estibas: e.target.value })} />
            <em>Sale un rótulo por estiba, numerado.</em>
          </label>

          <label className="rc-c">
            <span>Por estiba</span>
            <input value={f.cantidad} inputMode="numeric" placeholder="1.080"
                   onChange={(e) => setF({ ...f, cantidad: e.target.value })} />
            {/* LO QUE DICE EL MAESTRO, COMO AYUDA Y NO COMO VALOR
                PUESTO. Ponerlo solo haría que nadie lo mirara, y el día
                que la estiba venga incompleta el rótulo mentiría. */}
            <em>
              {mat?.cajas_por_estiba
                ? `El maestro dice ${mat.cajas_por_estiba} cajas por estiba.`
                : "Cuántas trae cada una."}
            </em>
          </label>

          <label className="rc-c">
            <span>Se cuenta en</span>
            <select value={f.unidad}
                    onChange={(e) => setF({ ...f, unidad: e.target.value as "cajas" | "unidades" })}>
              <option value="cajas">Cajas</option>
              <option value="unidades">Unidades</option>
            </select>
          </label>

          {tipo === "producto" ? (
            <>
              <label className="rc-c">
                <span>Producido el</span>
                <input type="date" value={f.producido}
                       onChange={(e) => setF({ ...f, producido: e.target.value })} />
                {/* EL VENCIMIENTO SE CALCULA Y SE ENSEÑA ANTES DE
                    IMPRIMIR: es el dato que manda en el FEFO, y verlo
                    aquí es la única oportunidad de notar que la fecha de
                    producción se tecleó mal. */}
                <em>
                  {!f.producido ? "Sin esto el rótulo sale sin vencimiento."
                    : vence ? `Vence el ${fechaCorta(vence)} · ${mat?.vida_util} días de vida útil.`
                    : "A este material le falta la vida útil en el maestro: el rótulo va a salir sin vencimiento."}
                </em>
              </label>
              <label className="rc-c">
                <span>Lote <i className="rc-opt">opcional</i></span>
                <input value={f.lote} maxLength={30}
                       onChange={(e) => setF({ ...f, lote: e.target.value })} />
              </label>
            </>
          ) : (
            <>
              <label className="rc-c">
                <span>Color del vidrio</span>
                <select value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })}>
                  <option value="">Escoge…</option>
                  {COLORES.map(([k, t]) => <option key={k} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="rc-c">
                <span>Viene de <i className="rc-opt">opcional</i></span>
                <input value={f.origen} maxLength={40} placeholder="CD Unión Apartado"
                       onChange={(e) => setF({ ...f, origen: e.target.value })} />
              </label>
            </>
          )}

          <label className="rc-c">
            <span>Placa <i className="rc-opt">opcional</i></span>
            <input value={f.placa} maxLength={10}
                   onChange={(e) => setF({ ...f, placa: e.target.value.toUpperCase() })} />
          </label>

          <h2>Dónde queda</h2>
          <label className="rc-c">
            <span>Calle</span>
            <select value={f.calle}
                    onChange={(e) => setF({ ...f, calle: e.target.value,
                                            modulo: "", lado: "", ubicacion_id: "" })}>
              <option value="">Escoge…</option>
              {calles.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="rc-c">
            <span>Módulo</span>
            {/* APAGADO HASTA QUE HAYA CALLE: un desplegable vacío y
                encendido se toca tres veces antes de que alguien
                entienda que falta lo de la izquierda. */}
            <select value={f.modulo} disabled={!f.calle}
                    onChange={(e) => {
                      const mod = e.target.value;
                      const ls = ubicaciones.filter((u) => u.calle === f.calle && u.modulo === mod);
                      /* SI EL MÓDULO NO TIENE LADOS, se escoge solo:
                         pedir «escoge el lado» donde no hay lados es
                         pedir algo que no existe. */
                      const solo = ls.length === 1 ? ls[0] : null;
                      setF({ ...f, modulo: mod, lado: solo?.lado ?? "", ubicacion_id: solo?.id ?? "" });
                    }}>
              <option value="">{f.calle ? "Escoge…" : "Primero la calle"}</option>
              {modulos.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="rc-c">
            <span>Lado</span>
            <select value={f.ubicacion_id} disabled={!f.modulo}
                    onChange={(e) => {
                      const u = ubicaciones.find((x) => x.id === e.target.value);
                      setF({ ...f, ubicacion_id: e.target.value, lado: u?.lado ?? "" });
                    }}>
              <option value="">{f.modulo ? "Escoge…" : "Primero el módulo"}</option>
              {lados.map((u) => (
                <option key={u.id} value={u.id}>{u.lado ?? u.clave}</option>
              ))}
            </select>
          </label>
        </section>

        {/* ---------- LO QUE VA A SALIR IMPRESO ---------- */}
        <aside className="rc-lado">
          <h2>Lo que se va a imprimir</h2>
          <div className="rc-vista">
            <div className="rc-v-cab">
              {tipo === "producto" ? "PRODUCTO TERMINADO" : "ENVASE RETORNABLE"}
              <b>1/{estibas}</b>
            </div>
            <div className="rc-v-sku">{mat?.sku ?? "—"}</div>
            <div className="rc-v-nom">{mat?.nombre?.toUpperCase() ?? "Escoge el material"}</div>
            <div className="rc-v-fila">
              <div>
                <span>{f.unidad}</span>
                <b>{cantidad > 0 ? cantidad.toLocaleString("es-CO") : "—"}</b>
              </div>
              <div className="der">
                <span>ubicación</span>
                <b>{ubi?.clave ?? "sin asignar"}</b>
              </div>
            </div>
            {tipo === "producto" && (
              <div className={"rc-v-vence" + (vence ? "" : " falta")}>
                <span>VENCE</span>
                <b>{fechaCorta(vence) ?? "sin fecha"}</b>
              </div>
            )}
            {tipo === "envase" && (
              <div className="rc-v-fila">
                <div><span>color</span><b>{f.color || "—"}</b></div>
                <div className="der"><span>viene de</span><b>{f.origen || "—"}</b></div>
              </div>
            )}
          </div>

          {/* SE DICE QUÉ FALTA, POR SU NOMBRE. Es la misma regla que en
              anular un viaje: un botón apagado que no explica nada se
              lee como que la aplicación está rota. */}
          {falta.length > 0 && (
            <p className="rc-falta">
              Falta {falta.length === 1 ? falta[0]
                : falta.slice(0, -1).join(", ") + " y " + falta[falta.length - 1]}.
            </p>
          )}

          <button type="button" className="btn grande rc-sacar"
                  disabled={!puedeRecibir || sacando || falta.length > 0}
                  onClick={sacar}>
            {sacando ? "Armando…"
              : estibas === 1 ? "Imprimir el rótulo" : `Imprimir los ${estibas} rótulos`}
          </button>
          {!puedeRecibir && (
            <p className="rc-falta">Recibir y rotular requiere rol de supervisor.</p>
          )}
        </aside>
      </div>
    </>
  );
}
