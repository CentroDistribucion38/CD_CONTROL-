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

  /* ARRANCA EN EL PASO 0: «la primera pregunta que debe salir, antes de
     iniciar, es rotura reportada por OPM o encontrada». Va antes de todo
     porque cambia a quién se le carga lo que sigue, y preguntarlo al
     final sería preguntarlo cuando ya nadie lo va a cambiar. */
  const [paso, setPaso] = useState(0);
  const [origen, setOrigen] = useState<"opm" | "encontrada" | null>(null);
  const [pin, setPin] = useState("");
  /* QUIÉN ES ESE PIN, confirmado por la base. Se enseña el NOMBRE antes
     de dejar seguir: cuatro dígitos tecleados con guante se equivocan, y
     un número que nadie confirma acaba firmando lo que registró otro. */
  const [opm, setOpm] = useState<{ nombre: string; turno: string | null } | null>(null);
  const [pinMal, setPinMal] = useState(false);
  const [buscandoPin, setBuscandoPin] = useState(false);

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
  /* `tocoBotellas` se queda aunque el contador se fuera: lo sigue
     tocando el reacomodo del material, y quitarlo obligaba a repasar
     tres efectos por un booleano que no cuesta nada. `botellas` sí se
     fue: hoy siempre viajaría en null. */
  const [, setTocoBotellas] = useState(false);

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

  /* LOS DOS TIPOS TIENEN SU LISTA DE MATERIALES, y en EER además se
     filtra por el color que se acaba de escoger.

     ESTUVO SIN LISTA EN EER, con el argumento de que el color ES el
     material. Es cierto MIENTRAS haya uno solo por color: la base
     traduce color → material tomando el primero por orden. En cuanto el
     maestro tenga dos ámbar —330 y 750, por decir— esa traducción
     escoge uno de los dos EN SILENCIO, y el informe del mes reparte el
     vidrio en el formato equivocado sin que nadie pueda verlo.

     Con la lista a la vista: si hay uno solo, viene puesto y nadie
     tiene que tocar nada; si hay varios, hay que decir cuál. */
  const delTipo = materiales.filter((m) =>
    m.tipo === tipo && (tipo !== "eer" || m.color === vidrio));
  const mat = materiales.find((m) => m.clave === material) ?? null;
  const cau = causas.find((c) => c.clave === causa) ?? null;
  const exigeFoto = !!cau?.exige_foto;

  /* AL CAMBIAR DE TIPO O DE COLOR, EL MATERIAL SE REACOMODA SOLO.
     Si quedara el de antes se mandaría un envase retornable con la
     clave de una cerveza, o un ámbar marcado como flint — y las dos
     cosas se ven igual de bien en la pantalla.

     Y SI SOLO HAY UNO POSIBLE, VIENE PUESTO. Es el caso normal en EER:
     un desplegable de un solo renglón que hay que abrir para escoger lo
     único que se podía escoger es un toque cobrado por nada. */
  useEffect(() => {
    const posibles = materiales.filter((m) =>
      m.tipo === tipo && (tipo !== "eer" || m.color === vidrio));
    setMaterial((antes) => {
      if (antes && posibles.some((m) => m.clave === antes)) return antes;
      return posibles.length === 1 ? posibles[0].clave : "";
    });
    setTocoBotellas(false);
  }, [tipo, vidrio, materiales]);

  /* Y AL CAMBIAR DE PROCESO SE SUELTA LA CAUSA. Hoy las causas son las
     mismas para todos los procesos, así que esto no cambia nada a la
     vista; el día que se amarren por proceso —que es a dónde va
     esto— dejar la causa puesta mandaría una que ese proceso no tiene. */
  useEffect(() => { setCausa("") }, [proceso]);

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

  /* EL MISMO CAMPO EN DOS SITIOS, escrito una vez. En producto terminado
     va en la primera línea, al lado de «¿Qué se rompió?»; en EER ese
     sitio lo ocupa el color y el material baja a su propia línea.
     Copiarlo dos veces es cómo se termina con dos campos que se parecen
     y se comportan distinto. */
  const campoMaterial = (
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
          {esPT
            ? <>No hay materiales de producto terminado en el maestro. Se agregan en
                Maestro, sin esperar un despliegue.</>
            : <>No hay envase retornable <b>{COLOR_VIDRIO[vidrio].toLowerCase()}</b> en el
                maestro. Se agrega en Maestro, sin esperar un despliegue.</>}
        </p>
      )}
    </div>
  );
  /* EL MATERIAL SE EXIGE EN LOS DOS, Y AHORA SÍ SE PUEDE.
     Un día no se exigió en EER porque el desplegable salía vacío y el
     botón se quedaba apagado sin decir por qué. La causa no era la
     regla: era que la lista no estaba filtrada por color. Con la lista
     filtrada —y puesta sola cuando solo hay una— exigirlo no traba a
     nadie, y evita que la base tenga que adivinar cuál de dos ámbar era.

     SALVO QUE NO HAYA NINGUNO EN EL MAESTRO. Ahí sí se deja seguir: la
     base traduce por color como siempre, y el mensaje de abajo dice qué
     falta agregar. Trabar el registro de una rotura que ya ocurrió por
     un maestro incompleto es perder el dato para siempre. */
  /* EL PASO 0 EXIGE EL NOMBRE, NO EL PIN. Dejar seguir con cuatro
     dígitos tecleados y sin confirmar sería dejar pasar un PIN
     equivocado hasta el final, donde ya no se puede arreglar sin
     volver a registrar la rotura entera. */
  const puedeSeguir = paso === 0
    ? origen === "encontrada" || (origen === "opm" && !!opm)
    : paso === 1
    ? (!!material || delTipo.length === 0) && (unidades + (esPT ? contaminadas : 0)) > 0
    : !!proceso && !!area && !!causa && (!exigeFoto || !!foto);

  /* SE BUSCA AL COMPLETAR LOS CUATRO DÍGITOS, no con un botón: un botón
     más para algo que se sabe cuándo está listo es un toque de más con
     guante. */
  useEffect(() => {
    setOpm(null); setPinMal(false);
    const limpio = pin.replace(/\D/g, "");
    if (limpio.length < 4) return;
    let vivo = true;
    setBuscandoPin(true);
    (async () => {
      const { data } = await supabase.rpc("operario_por_pin", { p_pin: limpio });
      if (!vivo) return;
      const o = Array.isArray(data) ? data[0] : data;
      setBuscandoPin(false);
      if (o?.nombre) setOpm({ nombre: o.nombre, turno: o.turno ?? null });
      else setPinMal(true);
    })();
    return () => { vivo = false };
  }, [pin, supabase]);

  async function mandar() {
    setMandando(true);
    setMal(null);

    const { data, error } = await supabase.rpc("rotura_registrar", {
      /* VAN LOS DOS EN EER: el material escogido Y el color. La función
         prefiere el material cuando llega —«quien ya lo sabe no tiene
         por qué dejar de decirlo»— y cae al color solo si el maestro no
         tiene ninguno de ese color, que es el único caso en que se deja
         seguir sin escoger. Mandar solo el color dejaba a la base
         eligiendo entre dos ámbar en silencio. */
      p_material: material || null,
      p_color: esPT ? null : vidrio,
      p_area: area,
      p_unidades: unidades,
      p_contaminadas: esPT ? contaminadas : null,
      /* SIEMPRE NULL: el contador de botellas de adentro se quitó del
         registro. La columna sigue en la base con lo que ya tenga. */
      p_botellas: null,
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

    /* EL ORIGEN, EN SU PROPIA LLAMADA. `rotura_registrar` tiene doce
       argumentos y ciento quince líneas de reglas; en PostgreSQL
       agregarle uno obliga a reescribirla entera, y aquí ya se han
       perdido reglas así. SI ESTO FALLA LA ROTURA YA EXISTE, que es lo
       correcto —ocurrió—, pero se dice: queda marcada «sin origen» y hay
       que ir a completarla. */
    let avisoOrigen = "";
    if (id && origen) {
      const { error: eOrig } = await supabase.rpc("rotura_marcar_origen", {
        p_id: id, p_origen: origen, p_pin: origen === "opm" ? pin.replace(/\D/g, "") : null,
      });
      if (eOrig) {
        avisoOrigen = "La rotura quedó registrada, pero sin decir de dónde salió: "
          + "ábrela desde la lista y márcala. " + eOrig.message;
      }
    }

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
    /* LOS DOS AVISOS, NO UNO. Si falla el origen Y la foto, enseñar solo
       el último deja el otro problema sin nadie que lo sepa —y el del
       origen es justamente el que no se ve después en la pantalla. */
    const todo = [avisoOrigen, aviso].filter(Boolean).join(" ");
    if (todo) setMal(todo);
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
            <b>{listo}</b> — {mat?.nombre
                              ?? `Envase retornable ${COLOR_VIDRIO[vidrio].toLowerCase()}`}.
            Pasa a la bandeja de ABI para el visto bueno.
          </p>
          {mal && <div className="negro"><span className="punto" /><span>{mal}</span></div>}
          <button type="button" className="otra" onClick={() => {
            /* Se vuelve al paso 1 con todo puesto menos la cuenta:
               cuando se cae una estiba no se rompe una sola caja, y
               volver a escoger el mismo material cinco veces es lo que
               hace que la quinta no se registre.

               EL ORIGEN Y EL OPM TAMBIÉN SE QUEDAN —por eso vuelve al 1
               y no al 0—: es el mismo operario en el mismo momento, y
               volver a teclear su PIN por cada caja sería el toque que
               hace que la quinta no se registre, igual que el material. */
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
        <h2>
          {paso === 0 ? "¿Quién la reportó?"
            : paso === 1 ? "¿Qué se rompió?"
            : "¿De dónde salió?"}
        </h2>
        <p>
          {paso === 0
            ? "Paso 1 de 3 · Si la reportó un operario o si alguien se la encontró ya rota."
            : paso === 1
            ? "Paso 2 de 3 · Qué material y cuántas unidades. En sitio siempre se cuenta en unidades."
            : "Paso 3 de 3 · De qué proceso salió, en qué área pasó y por qué."}
        </p>
      </div>
      {/* Tres tramos, uno por paso. Antes eran cuatro llenándose de a dos
          porque los pasos eran dos y la barra se quedaba en la mitad todo
          el tiempo; con tres pasos ya avanza sola. */}
      <div className="pasos">
        {[0, 1, 2].map((i) => <i key={i} className={paso >= i ? "on" : ""} />)}
      </div>

      {/* EL CUERPO, CON EL VOCABULARIO DE TRASPASOS: `cuerpo-f` es una
          columna de campos separados parejo, `linea-campos` pone dos
          campos al lado, `rot-campo` es el rotulito de arriba, `seg` es
          el segmentado de dos o tres opciones que se excluyen, `chips`
          la fila de opciones y `conteo` el contador con sus dos
          botones. Es el mismo formulario que ya se sabe llenar. */}
      <div className="cuerpo-f">
        {paso === 0 ? (
          <>
            <div>
              <span className="rot-campo">¿Cómo apareció esta rotura?</span>
              <div className="seg rp-origen">
                <button type="button" className={origen === "opm" ? "on" : ""}
                        onClick={() => setOrigen("opm")}>
                  La reportó un OPM
                </button>
                <button type="button" className={origen === "encontrada" ? "on" : ""}
                        /* AL CAMBIAR A «ENCONTRADA» SE BORRA EL PIN, y no se
                           deja escrito «por si vuelve»: un PIN guardado
                           debajo de una encontrada es alguien puesto en un
                           reporte que no hizo. La base lo frena también
                           —función y CHECK—, pero que la base rechace no es
                           lo mismo que que la pantalla funcione. */
                        onClick={() => { setOrigen("encontrada"); setPin("") }}>
                  Me la encontré
                </button>
              </div>
              <p className="rp-dice">
                {origen === "encontrada"
                  ? "Nadie la reportó: alguien la encontró ya rota. Se registra igual, y no lleva operario."
                  : origen === "opm"
                  ? "Un operario la vio y la reportó. Su PIN trae el nombre, el turno y la hora."
                  : "Son dos cosas distintas y hay que poder separarlas: un mes con muchas encontradas dice algo que ninguna otra cifra dice."}
              </p>
            </div>

            {origen === "opm" && (
              <div className="rp-pin">
                <span className="rot-campo">PIN del operario</span>
                {/* `inputMode` numérico para que el teléfono abra el teclado
                    de números, pero `type="text"`: con `type="number"` el
                    navegador se come los ceros de adelante y «0412» entra
                    como «412». */}
                <input type="text" inputMode="numeric" autoComplete="off"
                       maxLength={8} value={pin} placeholder="••••"
                       aria-label="PIN del operario que reportó"
                       onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} />
                {/* QUIÉN ES, ANTES DE SEGUIR. Cuatro dígitos tecleados con
                    guante se equivocan; un número que nadie confirma acaba
                    firmando lo que registró otro. */}
                {opm ? (
                  <div className="rp-quien">
                    <b>{opm.nombre}</b>
                    <span>{opm.turno ? `Turno ${opm.turno}` : "Sin turno en el maestro"}</span>
                  </div>
                ) : buscandoPin ? (
                  <div className="rp-esp">Buscando…</div>
                ) : pinMal ? (
                  <div className="rp-mal">
                    Ese PIN no es de ningún operario activo. Se revisa en Roturas → Operarios.
                  </div>
                ) : (
                  <div className="rp-esp">Cuatro dígitos. El nombre sale solo.</div>
                )}
              </div>
            )}
          </>
        ) : paso === 1 ? (
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

              {/* EN EER, EL COLOR OCUPA EL SEGUNDO SITIO DE LA LÍNEA: es
                  lo primero que se ve de un envase vacío y es lo que
                  acota la lista de materiales que sale debajo.
                  En producto terminado no hay color que escoger —el
                  vidrio va dentro del líquido— así que ahí el segundo
                  sitio lo ocupa el material, como siempre. La línea
                  siempre lleva dos columnas: dejarla con una sola en un
                  tipo y dos en el otro hace que la pantalla salte al
                  cambiar de pestaña. */}
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
              ) : campoMaterial}
            </div>

            {/* Y EN EER EL MATERIAL VA EN SU PROPIA LÍNEA, debajo del
                color y filtrado por él. Viene puesto cuando solo hay uno
                de ese color —que es el caso normal— así que casi nunca
                hay que tocarlo; está para el día que el maestro tenga
                dos ámbar y la base, sin esto, tenga que adivinar cuál. */}
            {tipo === "eer" && <div className="linea-campos una">{campoMaterial}</div>}

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

            {/* AQUÍ ESTABA «BOTELLAS ROTAS ADENTRO — CABEN N», Y SE FUE.
                Proponía todas las botellas del empaque y pedía
                corregirlas a mano. En la práctica nadie las contaba: el
                número propuesto se quedaba tal cual, así que no medía
                nada — solo alargaba el registro con un contador que
                siempre decía lo mismo.

                LA COLUMNA NO SE BORRA DE LA BASE: `botellas` se queda
                con lo que ya tenga, que es el registro de lo que se
                anotó en su momento. Deja de pedirse, no de existir; y
                `p_botellas` viaja en null, que es lo que la función ya
                acepta. */}
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
        <button type="button" onClick={() => (paso === 0 ? cerrar() : setPaso(paso - 1))}>
          {paso === 0 ? "Cancelar" : "Atrás"}
        </button>
        <button type="button" className="si" disabled={!puedeSeguir || mandando}
                onClick={() => (paso === 2 ? mandar() : setPaso(paso + 1))}>
          {paso === 0
            ? (!origen ? "Falta decir quién la reportó"
              : origen === "opm" && !opm ? "Falta el PIN del operario" : "Siguiente")
            : paso === 1 ? "Siguiente"
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
