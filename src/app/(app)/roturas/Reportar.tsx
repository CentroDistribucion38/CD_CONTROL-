"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePosicion, sellar, type Foto } from "@/lib/evidencia";
import { COLOR_VIDRIO } from "@/modulos/roturas/formato";
import type { Area, Causa, Material, Proceso } from "@/modulos/roturas/datos";

/**
 * REGISTRAR UNA ROTURA — dos pasos, en el orden en que pasan las cosas.
 *
 *   PASO 1  ¿QUÉ SE ROMPIÓ?      tipo, vidrio, material y cuántas
 *   PASO 2  ¿DE DÓNDE SALIÓ?     proceso, área, causa, foto y qué pasó
 *
 * EL EER NO PREGUNTA MATERIAL. «Si en EER no es material, ¿para qué
 * está?» Tenía razón: hay exactamente un material de EER por color, así
 * que escoger ámbar YA es escoger el material. El campo no aportaba una
 * decisión —aportaba un paso más y un desplegable que, si el maestro no
 * tenía ese color cargado, salía vacío y dejaba el registro trancado.
 * Ahora la pantalla manda el color y la base traduce.
 *
 * EL PROCESO VA ANTES QUE LA CAUSA, y la causa no se puede tocar hasta
 * que haya proceso: «que primero pongan a qué proceso corresponde y así
 * es que se habilitan las causas».
 *
 * EL ÁREA ES OTRA COSA QUE EL PROCESO. El proceso es la operación de la
 * que salió la rotura; el área es en qué parte de la bodega pasó. Se
 * parecen en los nombres porque la bodega está organizada por lo que se
 * hace en cada sitio, pero una rotura de Traspasos puede pasar en la
 * Plazoleta.
 *
 * DOS PASOS Y NO UNO. Quien registra está de pie al lado del vidrio, con
 * guantes y con el celular en una mano. Un formulario de catorce campos
 * en una sola pantalla se llena mal: se baja hasta el final, se toca
 * "enviar" y la mitad quedó en blanco.
 *
 * POR QUÉ "QUÉ" VA ANTES QUE "POR QUÉ". El material decide si hay que
 * preguntar botellas —el producto terminado se abre en dos y el EER
 * no—, así que preguntar la causa primero obligaría a volver atrás.
 *
 * EL GPS NO SE PIDE AL ABRIR. La primera versión lo pedía nada más
 * entrar, y lo primero que veía la persona era el cuadro del navegador
 * preguntando por su ubicación antes de haber hecho nada. Ahora se pide
 * cuando se va a tomar la foto, que es lo único que lo necesita: el
 * sello de la imagen. Quien registre una rotura sin foto no ve ese
 * cuadro nunca.
 */

export function Reportar({ materiales, procesos, areas, causas, cerrar }: {
  materiales: Material[];
  procesos: Proceso[];
  areas: Area[];
  causas: Causa[];
  cerrar: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [paso, setPaso] = useState(1);

  const [tipo, setTipo] = useState<"producto_terminado" | "eer">("producto_terminado");
  const [vidrio, setVidrio] = useState<"ambar" | "flint" | "green">("ambar");
  const [material, setMaterial] = useState("");
  const [unidades, setUnidades] = useState(1);
  /* LAS CONTAMINADAS SON OTRA COSA QUE LAS ROTAS, y por eso son otro
     contador. En la rota se pierde el líquido Y la botella; en la
     contaminada la botella queda entera y vuelve a la línea, y solo se
     da de baja el líquido. Sumarlas en un solo número obligaría después
     a adivinar cuánto vidrio salió de ahí. */
  const [contaminadas, setContaminadas] = useState(0);
  const [botellas, setBotellas] = useState<number | null>(null);
  const [tocoBotellas, setTocoBotellas] = useState(false);

  const [proceso, setProceso] = useState("");
  const [area, setArea] = useState("");
  const [causa, setCausa] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [foto, setFoto] = useState<Foto | null>(null);
  const [sellando, setSellando] = useState(false);
  const camara = useRef<HTMLInputElement>(null);

  const [mandando, setMandando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  const { ubi, direccion, pedir } = usePosicion();

  /* SOLO EL PRODUCTO TERMINADO TIENE LISTA DE MATERIALES. En EER el
     color ES el material —uno por color—, así que la lista no se pinta
     ni se filtra: el color que ya se escogió arriba lo dice todo. */
  const delTipo = materiales.filter((m) => m.tipo === "producto_terminado");
  const mat = materiales.find((m) => m.clave === material) ?? null;
  const cau = causas.find((c) => c.clave === causa) ?? null;
  const exigeFoto = !!cau?.exige_foto;

  /* Al pasar a EER se suelta el material: si quedara puesto, se
     mandaría un envase retornable con la clave de una cerveza. */
  useEffect(() => {
    if (tipo === "eer" && material) setMaterial("");
  }, [tipo, material]);

  /* Y AL CAMBIAR DE PROCESO SE SUELTA LA CAUSA. Hoy las causas son las
     mismas para todos los procesos, así que esto no cambia nada a la
     vista; el día que se amarren por proceso —que es a dónde va
     esto— dejar la causa puesta mandaría una que ese proceso no tiene. */
  useEffect(() => { setCausa("") }, [proceso]);

  /* TODAS LAS BOTELLAS COMO PROPUESTA, no como dato fijo. Cuando una
     estiba se cae, lo más probable es que se rompa todo lo que iba
     dentro; y si no, se corrige con dos toques. Proponer cero obligaría
     a teclear el número correcto SIEMPRE, y el que no lo teclee deja el
     vidrio de adentro fuera del conteo. */
  useEffect(() => {
    if (tipo !== "producto_terminado" || !mat?.botellas_x_empaque) { setBotellas(null); return }
    if (!tocoBotellas) setBotellas(unidades * mat.botellas_x_empaque);
  }, [tipo, mat, unidades, tocoBotellas]);

  async function abrirCamara() {
    /* Se pide el punto AQUÍ y no al abrir el asistente. Si la persona
       dice que no, la foto se toma igual y la banda sale sin
       coordenadas: la evidencia vale menos, pero el reporte no se
       pierde por un permiso. */
    pedir();
    camara.current?.click();
  }

  async function tomarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSellando(true);
    setMal(null);
    try {
      /* Se sella AQUÍ, en el teléfono, al tomarla. Entre tomar la foto y
         subirla pueden pasar veinte minutos sin señal en un pasillo, y
         la hora que quedaría escrita sería la de la subida. */
      const f = await sellar(archivo, {
        titulo: (procesos.find((p) => p.clave === proceso)?.nombre ?? "ROTURA").toUpperCase(),
        ubi, direccion, etiqueta: "ROTURA",
      });
      if (foto) URL.revokeObjectURL(foto.url);
      setFoto(f);
    } catch {
      setMal("No se pudo procesar esa foto. Vuelve a tomarla.");
    }
    setSellando(false);
  }

  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto.url); }, [foto]);

  const esPT = tipo === "producto_terminado";
  /* EN EER NO HAY MATERIAL QUE ESPERAR: con el color y las unidades ya
     se puede seguir. Antes se exigía `material` para los dos, y en EER
     eso era un desplegable que muchas veces salía vacío: el botón se
     quedaba apagado sin decir por qué. */
  const puedeSeguir = paso === 1
    ? (esPT ? !!material : true) && (unidades + (esPT ? contaminadas : 0)) > 0
    : !!proceso && !!area && !!causa && (!exigeFoto || !!foto);

  async function mandar() {
    setMandando(true);
    setMal(null);

    const { data, error } = await supabase.rpc("rotura_registrar", {
      /* En EER va el COLOR y no el material: la base traduce. Ver la
         nota de arriba. */
      p_material: esPT ? material : null,
      p_color: esPT ? null : vidrio,
      p_area: area,
      p_unidades: unidades,
      p_contaminadas: esPT ? contaminadas : null,
      p_botellas: esPT ? botellas : null,
      p_proceso: proceso,
      p_causa: causa,
      p_descripcion: descripcion.trim() || null,
      p_lat: ubi?.lat ?? null,
      p_lng: ubi?.lng ?? null,
      p_precision: ubi ? Math.round(ubi.precision) : null,
    });

    if (error) { setMandando(false); setMal(error.message); return }

    const fila = Array.isArray(data) ? data[0] : data;
    const id = fila?.id as string;

    /* La foto va DESPUÉS, porque su ruta lleva el id de la rotura. Si
       falla, la rotura YA existe y eso es lo correcto: perder el reporte
       porque no subió una imagen sería cambiar lo importante por lo
       accesorio. */
    let aviso = "";
    if (foto && id) {
      const ruta = `${id}/rotura.jpg`;
      const { error: eSubir } = await supabase.storage
        .from("roturas")
        .upload(ruta, foto.blob, { contentType: "image/jpeg", upsert: true });
      if (eSubir) {
        aviso = exigeFoto
          ? "La foto no subió, y esta causa la exige: ábrela desde la lista y agrégala, o ABI la va a devolver."
          : "La foto no subió; se puede agregar después.";
      } else {
        const { error: eFila } = await supabase.from("roturas_fotos").insert({
          rotura_id: id, ruta, ancho: foto.ancho, alto: foto.alto, bytes: foto.blob.size,
          tomada_en: ubi?.en ?? new Date().toISOString(),
          lat: ubi?.lat ?? null, lng: ubi?.lng ?? null,
          precision_m: ubi ? Math.round(ubi.precision) : null,
        });
        if (eFila) aviso = "La foto subió pero no quedó registrada: " + eFila.message;
      }
    }

    setMandando(false);
    setListo((fila?.codigo as string) ?? "");
    if (aviso) setMal(aviso);
    router.refresh();
  }

  const sello = [
    new Date().toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }),
    new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    procesos.find((p) => p.clave === proceso)?.nombre,
    ubi ? `precisión ${Math.round(ubi.precision)} m` : "sin ubicación",
  ].filter(Boolean).join(" · ");

  if (listo !== null) {
    return (
      <section className="rt-rep">
        <div className="cab">
          <h2>Quedó registrada</h2>
          <p>Ya está en la bandeja de ABI. Se puede registrar otra sin salir de aquí.</p>
        </div>
        <div className="cuerpo">
          <p className="guia">
            <b>{listo}</b> — {esPT ? mat?.nombre
                                   : `Envase retornable ${COLOR_VIDRIO[vidrio].toLowerCase()}`}.
            Pasa a la bandeja de ABI para el visto bueno.
          </p>
          {mal && <div className="negro"><span className="punto" /><span>{mal}</span></div>}
          <button type="button" className="otra" onClick={() => {
            /* Se vuelve al paso 1 con todo puesto menos la cuenta:
               cuando se cae una estiba no se rompe una sola caja, y
               volver a escoger el mismo material cinco veces es lo que
               hace que la quinta no se registre. */
            setListo(null); setMal(null); setPaso(1);
            setUnidades(1); setContaminadas(0); setTocoBotellas(false);
            if (foto) { URL.revokeObjectURL(foto.url); setFoto(null) }
          }}>
            Registrar otra
          </button>
        </div>
        <div className="pie">
          <button type="button" onClick={cerrar}>Ver lo registrado</button>
          <button type="button" className="si" onClick={cerrar}>Listo</button>
        </div>
      </section>
    );
  }

  return (
    /* UN PANEL, NO UNA VENTANA.

       «Separemos este registro de seleccionar la X: debe ser un panel
       como el módulo de registro de Traspasos.» La barra negra con el
       aspa era lenguaje de ventana —algo que se abrió encima y hay que
       cerrar—, y esto ya no es eso: es la pantalla. Así que lleva la
       misma cabecera que «Viaje nuevo» en Traspasos —título y una
       línea— y se sale por Cancelar, abajo, donde están las decisiones.
       Un aspa arriba y un Cancelar abajo eran además dos puertas para
       lo mismo, cada una en una punta. */
    <section className="rt-rep" aria-label="Registrar una rotura">
      <div className="cab">
        <h2>{paso === 1 ? "¿Qué se rompió?" : "¿De dónde salió?"}</h2>
        <p>
          {paso === 1
            ? "Paso 1 de 2 · Qué material y cuántas unidades. En sitio siempre se cuenta en unidades."
            : "Paso 2 de 2 · De qué proceso salió, en qué área pasó y por qué."}
        </p>
      </div>
      {/* Cuatro tramos que se llenan de a dos. Un tramo por paso, con dos
          pasos, deja la barra en la mitad todo el tiempo y no se siente
          que avance. */}
      <div className="pasos">
        {[1, 2, 3, 4].map((i) => <i key={i} className={paso * 2 >= i ? "on" : ""} />)}
      </div>

      {/* EL CUERPO, CON EL VOCABULARIO DE TRASPASOS: `cuerpo-f` es una
          columna de campos separados parejo, `linea-campos` pone dos
          campos al lado, `rot-campo` es el rotulito de arriba, `seg` es
          el segmentado de dos o tres opciones que se excluyen, `chips`
          la fila de opciones y `conteo` el contador con sus dos
          botones. Es el mismo formulario que ya se sabe llenar. */}
      <div className="cuerpo-f">
        {paso === 1 ? (
          <>
            <div className="linea-campos">
              <div>
                <span className="rot-campo">¿Qué se rompió?</span>
                <div className="seg">
                  {(["producto_terminado", "eer"] as const).map((t) => (
                    <button key={t} type="button" className={tipo === t ? "on" : ""}
                            onClick={() => { setTipo(t); setContaminadas(0); setTocoBotellas(false) }}>
                      {t === "eer" ? "EER · envase vacío" : "Producto terminado"}
                    </button>
                  ))}
                </div>
              </div>

              {/* EN EER, EL COLOR ES EL MATERIAL —uno por color—, así que
                  ocupa el sitio del desplegable en vez de sumarse a él.
                  En producto terminado no hay color: el vidrio va dentro
                  del líquido, y ahí sí se escoge el formato. */}
              {tipo === "eer" ? (
                <div>
                  <span className="rot-campo">Tipo de vidrio</span>
                  <div className="seg vidrio">
                    {(["ambar", "flint", "green"] as const).map((c) => (
                      <button key={c} type="button"
                              className={c + (vidrio === c ? " on" : "")}
                              onClick={() => setVidrio(c)}>
                        <i aria-hidden />{COLOR_VIDRIO[c]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <span className="rot-campo">Material</span>
                  <select id="rt-mat" className="campo-suelto" value={material}
                          onChange={(e) => { setMaterial(e.target.value); setTocoBotellas(false) }}>
                    <option value="">Escoge el material</option>
                    {delTipo.map((m) => (
                      <option key={m.clave} value={m.clave}>{m.nombre} · {m.clave}</option>
                    ))}
                  </select>
                  {delTipo.length === 0 && (
                    <p className="nota">
                      No hay materiales de producto terminado en el maestro. Se agregan en
                      Maestro, sin esperar un despliegue.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="linea-campos">
              <div>
                <span className="rot-campo">Unidades rotas</span>
                <div className="conteo">
                  <span className="cel-step grande">
                    <button type="button" onClick={() => setUnidades((n) => Math.max(0, n - 1))}
                            aria-label="una menos">−</button>
                    <input value={unidades} inputMode="numeric" aria-label="unidades rotas"
                           onChange={(e) =>
                             setUnidades(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))} />
                    <button type="button" onClick={() => setUnidades((n) => n + 1)}
                            aria-label="una más">+</button>
                  </span>
                  <span className="nota-conteo">
                    {esPT
                      ? "Se rompió la botella: se da de baja el líquido y el vidrio."
                      : "Los kilos son de la salida, no de aquí."}
                  </span>
                </div>
              </div>

              {/* EL SEGUNDO CONTADOR, solo en producto terminado. Un
                  envase retornable vacío no tiene líquido que contaminar. */}
              {esPT && (
                <div>
                  <span className="rot-campo">Unidades contaminadas</span>
                  <div className="conteo">
                    <span className="cel-step grande">
                      <button type="button" onClick={() => setContaminadas((n) => Math.max(0, n - 1))}
                              aria-label="una menos">−</button>
                      <input value={contaminadas} inputMode="numeric" aria-label="unidades contaminadas"
                             onChange={(e) =>
                               setContaminadas(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))} />
                      <button type="button" onClick={() => setContaminadas((n) => n + 1)}
                              aria-label="una más">+</button>
                    </span>
                    <span className="nota-conteo">
                      La botella quedó entera: se da de baja <b>solo el líquido</b> y el envase
                      vuelve a la línea. No cuenta como vidrio roto.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {esPT && unidades > 0 && mat?.botellas_x_empaque && (
              <div>
                <span className="rot-campo">
                  Botellas rotas adentro — caben {unidades * mat.botellas_x_empaque}
                </span>
                <div className="conteo">
                  <span className="cel-step grande">
                    <button type="button"
                            onClick={() => { setTocoBotellas(true); setBotellas((n) => Math.max(0, (n ?? 0) - 1)) }}
                            aria-label="una menos">−</button>
                    <input value={botellas ?? 0} inputMode="numeric" aria-label="botellas rotas"
                           onChange={(e) => {
                             setTocoBotellas(true);
                             setBotellas(Math.min(unidades * mat.botellas_x_empaque!,
                               Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0)));
                           }} />
                    <button type="button"
                            onClick={() => { setTocoBotellas(true);
                              setBotellas((n) => Math.min(unidades * mat.botellas_x_empaque!, (n ?? 0) + 1)) }}
                            aria-label="una más">+</button>
                  </span>
                  <span className="nota-conteo">
                    Se proponen todas: cuando una estiba se cae, lo normal es que se rompa todo lo
                    de adentro. Se corrige con dos toques.
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <span className="rot-campo">Proceso</span>
              <div className="chips">
                {procesos.map((p) => (
                  <button key={p.clave} type="button"
                          className={proceso === p.clave ? "on" : ""}
                          onClick={() => setProceso(p.clave)}>
                    {p.nombre}
                  </button>
                ))}
              </div>
            </div>

            {/* EL ÁREA, DEL MAESTRO. Desplegable y no chips: son trece y
                crecen; trece botones ocupan media pantalla del celular y
                empujan la causa fuera de la vista. */}
            <div className="linea-campos">
              <div>
                <span className="rot-campo">Área *</span>
                <select id="rt-area" className="campo-suelto" value={area}
                        onChange={(e) => setArea(e.target.value)}>
                  <option value="">¿En qué parte de la bodega?</option>
                  {areas.map((a) => (
                    <option key={a.clave} value={a.clave}>{a.nombre}</option>
                  ))}
                </select>
                {areas.length === 0 && (
                  <p className="nota">
                    No hay áreas en el maestro. Se agregan en Maestro, sin esperar un despliegue.
                  </p>
                )}
              </div>
            </div>

            {/* LA CAUSA SE HABILITA CON EL PROCESO, y va en dos grupos.

                Lo que separa a las causas —de qué lado caen— se dice UNA
                vez, en el rotulito de su grupo, y no repetido debajo de
                cada una. Así las opciones se quedan con el nombre y el
                punto de color: se leen de un golpe, que es para lo que
                existe una lista de causas. */}
            {!proceso ? (
              <div>
                <span className="rot-campo">Causa</span>
                <p className="nota espera">Escoge primero el proceso y aquí salen las causas.</p>
              </div>
            ) : (
              ([
                ["asumida", "Causa · asumidas por el OL"],
                ["no_asumida", "No asumidas · exigen foto"],
              ] as const).map(([grupo, titulo]) => {
                const suyas = causas.filter((c) => c.grupo === grupo);
                if (!suyas.length) return null;
                return (
                  <div key={grupo} className={"grupo-causa " + grupo}>
                    <span className="rot-campo"><i className="punto" aria-hidden />{titulo}</span>
                    <div className="chips causas">
                      {suyas.map((c) => (
                        <button key={c.clave} type="button"
                                className={(causa === c.clave ? "on" : "")
                                           + (grupo === "no_asumida" ? " roja" : "")}
                                onClick={() => setCausa(c.clave)}>
                          <i className="punto" aria-hidden /><span>{c.nombre}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}

            {exigeFoto && (
              <div className="exige">
                <b>Esta causa exige foto.</b> Es lo que sostiene que la rotura no es del OL. Sin
                evidencia, ABI la va a devolver.
              </div>
            )}

            <div className="linea-campos">
              <div>
                <span className="rot-campo">Foto de la novedad</span>
                <div className="foto">
                  <div className="lienzo">
                    {foto
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={foto.url} alt="La rotura" />
                      : <span>{sellando ? "SELLANDO…" : "SIN FOTO"}</span>}
                  </div>
                  <div className="sello">{sello}</div>
                </div>
                <input ref={camara} type="file" accept="image/*" capture="environment"
                       onChange={tomarFoto} hidden />
                <button type="button" className="otra" onClick={abrirCamara} disabled={sellando}>
                  {foto ? "Tomar otra foto" : "Tomar la foto"}
                </button>
              </div>

              <div>
                <span className="rot-campo">Qué pasó</span>
                <textarea id="rt-des" className="campo-suelto texto" rows={7} value={descripcion}
                          onChange={(e) => setDescripcion(e.target.value)}
                          placeholder="La transportadora de la T1 se atascó y tumbó la fila de envase." />
              </div>
            </div>

            {mal && <div className="negro"><span className="punto" /><span>{mal}</span></div>}
          </>
        )}
      </div>

      <div className="pie">
        <button type="button" onClick={() => (paso === 1 ? cerrar() : setPaso(1))}>
          {paso === 1 ? "Cancelar" : "Atrás"}
        </button>
        <button type="button" className="si" disabled={!puedeSeguir || mandando}
                onClick={() => (paso === 1 ? setPaso(2) : mandar())}>
          {paso === 1 ? "Siguiente"
            : mandando ? "Enviando…"
            /* EL BOTÓN DICE QUÉ FALTA. Un botón apagado sin explicación
               es la forma más cara de pedir un dato: la persona lo toca
               tres veces y llama a preguntar. */
            : !proceso ? "Falta el proceso"
            : !area ? "Falta el área"
            : !causa ? "Falta la causa"
            : exigeFoto && !foto ? "Falta la foto" : "Enviar a ABI"}
        </button>
      </div>
    </section>
  );
}
