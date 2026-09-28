"use client";

import { useMemo, useState } from "react";
import { BuscarEnLista } from "@/components/BuscarEnLista";
import { useAvisos } from "@/components/Aviso";
import type { Material, Ubicacion } from "@/modulos/inventario/fefo";
import { fechaCorta, limiteDespacho, rotulosPdf, sumarDias,
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
  /* SE TECLEA EL VENCIMIENTO, NO LA PRODUCCIÓN. Es lo que está impreso
     en la caja y lo que quien recibe tiene delante; la producción se
     saca restándole la vida útil del maestro. Antes era al revés y
     obligaba a hacer la cuenta de cabeza para teclear una fecha que la
     caja no trae. */
  vence: "", placa: "", origen: "", color: "",
  /* CÓMO ESTÁ ARMADO EL ARRUME: cuántas estibas de ancho, de alto y de
     largo. No se puede deducir del número de estibas —doce estibas
     pueden ir 12×1×1, 3×2×2 o 4×1×3— y en el papel sirve para saber si
     el arrume está completo sin desarmarlo. */
  ancho: "1", alto: "1", largo: "1",
  /* DE QUÉ LÍNEA SALIÓ Y A QUÉ HORA. Es lo que permite devolverse a la
     planta cuando un lote sale malo: sin la línea, el reclamo es «algo
     de ese día». */
  linea: "", hora: "",
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
function folioProvisional(sku: string, producido: string, linea: string, i: number) {
  /* EL FORMATO ES EL DE LA TARJETA: código, fecha de producción, línea
     y el número de la estiba. `16210-20260923-L42-003`. */
  const ymd = (producido || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const L = linea.trim() ? `-L${linea.trim()}` : "";
  return `${sku}-${ymd}${L}-${String(i + 1).padStart(3, "0")}`;
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

/* EL MATERIAL SE BUSCA DENTRO DEL TIPO QUE SE ESTÁ RECIBIENDO, y este
   renglón es el candado de verdad de toda la pantalla: si el SKU
   guardado es del otro tipo, sencillamente no se encuentra, `mat` queda
   en nulo y no hay nada que imprimir. Buscarlo en `materiales` —el
   maestro entero— dejaría imprimir un rótulo de producto con el código
   de un envase en letra de siete centímetros. */
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

  /* CUÁNDO VENCE: lo que está tecleado, que es lo que dice la caja.
     Ya no se calcula —y esa es la diferencia— porque calcularlo obligaba
     a teclear la producción, que en el muelle no siempre se sabe. */
  const vence = tipo === "producto" ? (f.vence || null) : null;
  /* CUÁNDO SE PRODUJO: el vencimiento menos la vida útil del maestro.
     Se calcula HACIA ATRÁS y no se teclea. Si al material le falta la
     vida útil se queda en null y el rótulo lo dice con un «—»: poner
     una fecha de producción a ojo en el papel de la estiba sería
     inventar trazabilidad, que es peor que no tenerla. */
  const producido = tipo === "producto" && mat?.vida_util
    ? sumarDias(vence, -mat.vida_util) : null;
  /* HASTA CUÁNDO SE PUEDE DESPACHAR: el vencimiento menos los días que
     el maestro exige que le queden al salir. Sale del maestro y no se
     teclea — es una resta, y una resta tecleada es una resta que algún
     día va a estar mal. */
  const limite = tipo === "producto" ? limiteDespacho(vence, mat?.dias_minimo ?? null) : null;
  /* TODO EL ARRUME: lo de una estiba por cuántas estibas son. */
  const arrume = cantidad * estibas;

  /* EL PATRÓN DE ESTIBA, TAL COMO LO TRAE EL MAESTRO. Los tres números
     van juntos o no van: dos de tres no dicen cómo se arma nada, y
     completar el que falta sería inventarlo. */
  const patron = mat?.pat_largo && mat?.pat_ancho && mat?.pat_nivel
    ? { largo: mat.pat_largo, ancho: mat.pat_ancho, nivel: mat.pat_nivel } : null;
  const cajasPatron = patron ? patron.largo * patron.ancho * patron.nivel : null;
  /* CUANDO EL PATRÓN Y EL FACTOR DE ESTIBA NO SE PONEN DE ACUERDO hay
     que decirlo AQUÍ, no en el papel: son dos datos del mismo maestro
     que dicen cuántas cajas lleva una estiba, y si pelean, uno de los
     dos está mal y la tarjeta se imprimiría con los dos encima. */
  const pelean = cajasPatron != null && mat?.cajas_por_estiba != null
    && cajasPatron !== mat.cajas_por_estiba;

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
      const num = (v: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null };
      const rotulos: Rotulo[] = Array.from({ length: estibas }, (_, i) => ({
        folio: folioProvisional(mat.sku, producido ?? "", f.linea, i),
        tipo,
        sku: mat.sku,
        nombre: mat.nombre,
        cantidad,
        unidad: f.unidad,
        arrume,
        ancho: num(f.ancho), alto: num(f.alto), largo: num(f.largo),
        patron,
        unidadesEstiba: mat.unidades_por_estiba ?? null,
        ubicacion: ubi?.clave ?? null,
        numero: i + 1,
        total: estibas,
        producido: tipo === "producto" ? producido : null,
        vence: tipo === "producto" ? vence : null,
        limite: tipo === "producto" ? limite : null,
        linea: tipo === "producto" ? (f.linea.trim() || null) : null,
        hora: tipo === "producto" ? (f.hora || null) : null,
        color: tipo === "envase" ? (f.color || null) : null,
        origen: tipo === "envase" ? (f.origen.trim() || null) : null,
        placa: f.placa.trim().toUpperCase() || null,
        recibido: new Date().toISOString().slice(0, 10),
      }));

      const pdf = await rotulosPdf(rotulos, {
        /* DE DÓNDE CUELGA EL QR: el dominio desde el que se abrió la
           pantalla. Escribirlo a mano aquí haría que las tarjetas
           impresas desde una prueba apunten a producción, o al revés. */
        base: typeof window !== "undefined" ? window.location.origin : null,
      });
      /* SE ABRE PARA IMPRIMIR, no se descarga: lo que se quiere es
         mandarlo a la impresora, y un archivo en Descargas es un paso
         más y una carpeta que se llena de rótulos viejos. */
      pdf.autoPrint();
      const url = pdf.output("bloburl");
      window.open(url, "_blank");
      avisar.bien(estibas === 1
        ? "Tarjeta lista. Se abrió para imprimir."
        : `${estibas} tarjetas listas, numeradas de la 1 a la ${estibas}.`);
    } catch (e) {
      avisar.mal("No se pudo armar la tarjeta: " + ((e as Error).message ?? e));
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
                    /* CAMBIAR DE TIPO LIMPIA EL CAMPO. Lo que impide de
                       verdad imprimir un rótulo cruzado NO es esto: es
                       que `mat` se busca dentro de `delTipo`, así que un
                       SKU del otro tipo simplemente no se encuentra y no
                       hay nada que imprimir. Lo comprobé quitando esta
                       línea y el arnés siguió verde, que es como se ve
                       que una defensa no era la que sostenía nada.
                       Se queda porque deja el campo coherente con lo
                       que se está recibiendo —si no, dice el nombre de
                       un material que el desplegable ya no ofrece—, pero
                       el candado está en la búsqueda. */
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
              {/* LA ÚNICA FECHA QUE SE TECLEA. Es la que está impresa en
                  la caja y la que quien recibe tiene delante; todo lo
                  demás de la tarjeta lo trae el maestro con el código.
                  La producción y el límite de despacho salen de restar,
                  y una resta tecleada es una resta que algún día va a
                  estar mal. */}
              <label className="rc-c">
                <span>Vence el</span>
                <input type="date" value={f.vence}
                       onChange={(e) => setF({ ...f, vence: e.target.value })} />
                <em>
                  {!f.vence ? "Es lo único que hay que teclear: lo demás lo trae el código."
                    : producido
                      ? `Producido el ${fechaCorta(producido)} · ${mat?.vida_util} días de vida útil.`
                      : "A este material le falta la vida útil en el maestro: la tarjeta va a salir sin fecha de producción."}
                </em>
              </label>
              {/* LA LÍNEA Y LA HORA, que es lo que la tarjeta pide en
                  lugar del lote: es lo que permite devolverse a la
                  planta cuando un lote sale malo. Sin la línea, el
                  reclamo es «algo de ese día». */}
              <label className="rc-c">
                <span>Línea <i className="rc-opt">opcional</i></span>
                <input value={f.linea} maxLength={6} inputMode="numeric" placeholder="42"
                       onChange={(e) => setF({ ...f, linea: e.target.value })} />
                <em>Entra en el folio: {mat?.sku ?? "código"}-
                  {(producido ?? "aaaammdd").replace(/-/g, "")}
                  {f.linea.trim() ? `-L${f.linea.trim()}` : ""}-001</em>
              </label>
              <label className="rc-c">
                <span>Hora <i className="rc-opt">opcional</i></span>
                <input type="time" value={f.hora}
                       onChange={(e) => setF({ ...f, hora: e.target.value })} />
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

          {/* ============ EL PATRÓN DE ESTIBA, DEL MAESTRO ============
              NO SE TECLEA: llega con el código y se enseña para poder
              mirarlo contra la estiba que está ahí delante. Va ANTES de
              «cómo va armado el arrume» a propósito —primero cómo se
              arma UNA estiba, después cómo llegaron TODAS— que es el
              orden en que se mira una carga. */}
          {tipo === "producto" && (
            <>
              <h2>Cómo va armada cada estiba <i className="rc-opt">lo trae el maestro</i></h2>
              <div className="rc-patron">
                {patron ? (
                  <>
                    <div className="rc-pat-nums">
                      {([["Largo", patron.largo], ["Ancho", patron.ancho], ["Niveles", patron.nivel]] as const)
                        .map(([k, v], j) => (
                          <span className="rc-pat-n" key={k}>
                            <em>{k}</em><b>{v}</b>
                            {j < 2 && <i aria-hidden>×</i>}
                          </span>
                        ))}
                    </div>
                    <div className="rc-pat-res">
                      <b>{cajasPatron!.toLocaleString("es-CO")} cajas</b>
                      <em>por estiba completa
                        {mat?.unidades_por_estiba
                          ? ` · ${mat.unidades_por_estiba.toLocaleString("es-CO")} unidades` : ""}</em>
                    </div>
                  </>
                ) : (
                  <p className="rc-pat-falta">
                    {mat
                      ? "El maestro no trae el patrón de este material. La tarjeta lo va a decir; para arreglarlo, Inventario → Maestro."
                      : "Escribe el código y aquí sale cómo se arma la estiba."}
                  </p>
                )}
              </div>
              {/* DOS DATOS DEL MISMO MAESTRO QUE DICEN LO MISMO Y NO
                  COINCIDEN: uno de los dos está mal, y hay que verlo
                  antes de pegar el papel, no después. */}
              {pelean && (
                <p className="rc-falta">
                  El patrón da {cajasPatron!.toLocaleString("es-CO")} cajas por estiba y el maestro
                  dice {mat!.cajas_por_estiba!.toLocaleString("es-CO")}. Uno de los dos está mal:
                  revísalo en Inventario → Maestro antes de imprimir.
                </p>
              )}
            </>
          )}

          {/* CÓMO ESTÁ ARMADO EL ARRUME. Doce estibas pueden ir 12×1×1,
              3×2×2 o 4×1×3: el número de estibas no lo dice. Esto es
              CUÁNTAS ESTIBAS, no cuántas cajas: es lo que cambia en cada
              camión, y por eso es lo único de aquí que se teclea. */}
          <h2>Cómo llegó armado el arrume <i className="rc-opt">en estibas</i></h2>
          <div className="rc-dim">
            {([["ancho", "Ancho"], ["alto", "Alto"], ["largo", "Largo"]] as const).map(([k, t]) => (
              <label className="rc-c" key={k}>
                <span>{t}</span>
                <input value={f[k]} inputMode="numeric"
                       onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              </label>
            ))}
          </div>

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
          {/* ES UN RETRATO DE LA TARJETA, no la tarjeta: los mismos
              bloques en el mismo orden y con los mismos pesos, para que
              lo que se ve aquí y lo que sale del papel se reconozcan
              como lo mismo. Sirve para notar la fecha mal tecleada
              ANTES de gastar doce hojas. */}
          <div className="rc-vista">
            <div className="rc-v-cab">
              {tipo === "producto" ? "TARJETA DE ARRUME" : "ARRUME DE ENVASE"}
              <b>1 / {estibas}</b>
            </div>
            <div className="rc-v-nom">{mat?.nombre?.toUpperCase() ?? "Escoge el material"}</div>
            <div className="rc-v-sku">{mat?.sku ?? "—"}</div>
            <div className="rc-v-fila">
              <div>
                <span>{f.unidad} en esta estiba</span>
                <b>{cantidad > 0 ? cantidad.toLocaleString("es-CO") : "—"}</b>
              </div>
              <div className="der">
                <span>total del arrume</span>
                <b>{arrume > 0 ? arrume.toLocaleString("es-CO") : "—"}</b>
              </div>
            </div>
            {tipo === "producto" && (
              <div className={"rc-v-vence" + (vence ? "" : " falta")}>
                <span>FECHA DE VENCIMIENTO</span>
                <b>{fechaCorta(vence) ?? "sin fecha: no se puede ordenar por FEFO"}</b>
              </div>
            )}
            {tipo === "producto" && (
              <div className="rc-v-fila">
                <div><span>lím. despacho</span><b>{fechaCorta(limite) ?? "—"}</b></div>
                <div className="der">
                  <span>línea · hora</span>
                  <b>{f.linea.trim() ? `${f.linea.trim()}${f.hora ? ` · ${f.hora}` : ""}` : "—"}</b>
                </div>
              </div>
            )}
            {tipo === "envase" && (
              <div className="rc-v-fila">
                <div><span>color</span><b>{f.color || "—"}</b></div>
                <div className="der"><span>viene de</span><b>{f.origen || "—"}</b></div>
              </div>
            )}
            <div className="rc-v-fila">
              <div><span>ubicación</span><b>{ubi?.clave ?? "sin asignar"}</b></div>
              <div className="der">
                <span>armado</span>
                <b>{[f.ancho, f.alto, f.largo].every((x) => Number(x) > 0)
                  ? `${f.ancho}×${f.alto}×${f.largo}` : "—"}</b>
              </div>
            </div>
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
            <p className="rc-falta">Recepción y rotulado requiere rol de supervisor.</p>
          )}
        </aside>
      </div>
    </>
  );
}
