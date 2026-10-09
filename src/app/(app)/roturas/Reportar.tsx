"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePosicion, sellar, type Foto } from "@/lib/evidencia";
import { BuscarEnLista } from "@/components/BuscarEnLista";
import { AreaSelect, areaSugerida } from "./AreaSelect";
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

/**
 * LO QUE SE ROMPE COMO VIDRIO, Y LO QUE NO.
 *
 * «En quiebra en sitio, que en materiales, en producto, no salga ni PET
 *  ni lata.»
 *
 * SE MIRA LA FAMILIA DEL MAESTRO DE INVENTARIO, que es donde está el
 * dato: `Lata`, `Pet`, `Ret`, `Tw`, `Barril`. Adivinarlo por el nombre
 * —buscar «Lta» o «Pet» en el texto— habría dejado fuera cualquier
 * producto que alguien escriba distinto mañana, y dentro los que lleven
 * esas letras por casualidad.
 *
 * LO QUE NO TIENE FAMILIA SE QUEDA. Un producto al que nadie le puso la
 * familia en el maestro no se esconde: esconder algo por un dato que
 * falta es cómo alguien se queda sin poder registrar una rotura que sí
 * pasó, y sin saber por qué.
 *
 * EL BARRIL SE QUEDA TAMBIÉN, a propósito: no se pidió quitarlo, y
 * quitarlo «de paso» sería decidir por él.
 */
/* LOS TRES VIDRIOS, PINTADOS. Son los mismos valores que usa el CSS de
   los botones del tipo de vidrio (.seg.vidrio button.<color> i): están
   aquí porque el desplegable los necesita como estilo en línea, y
   repetirlos en dos sitios con dos valores distintos haría que el mismo
   envase se viera de un color en el botón y de otro en la lista. */
const VIDRIO_PINTA: Record<string, string> = {
  ambar: "#C08A16", flint: "#E7EAE6", green: "#2F6B43",
};

const FUERA_DE_SITIO = new Set(["lata", "pet"]);
const esVidrio = (m: { familia: string | null }) =>
  !FUERA_DE_SITIO.has((m.familia ?? "").trim().toLowerCase());

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
  /* EL COLOR ES UN FILTRO, NO UNA PUERTA, y nace en «todos».
     Antes nacía en ámbar y la lista de envases se filtraba por él sin
     salida: si ningún envase del maestro tenía color puesto —o si el
     que se rompió era flint y el interruptor decía ámbar— el
     desplegable salía VACÍO y la pantalla decía «no hay envase
     retornable ámbar en el maestro». Quien lee eso concluye que el
     envase no está dado de alta, cuando lo que pasa es que está detrás
     de otro botón. Pasó dos veces seguidas, con ámbar y con green.

     Ahora los trece salen de entrada y el color solo acorta. */
  const [vidrio, setVidrio] = useState<"todos" | "ambar" | "flint" | "green">("todos");
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
  /* EL FILTRO POR COLOR SOLO SE APLICA SI ALGUIEN LLENÓ EL COLOR.
     Los 32 envases del maestro de inventario nacen sin `color_vidrio`
     —el SQL no lo puede adivinar—, así que filtrar por color dejaba el
     desplegable de EER COMPLETAMENTE VACÍO y el registro trabado, sin
     una palabra que dijera por qué. Trabar el registro de una rotura
     que YA ocurrió por un maestro incompleto es perder el dato para
     siempre.

     Así que: si hay envases con color, se filtra; si NINGUNO lo tiene,
     se ofrecen todos y la pantalla dice qué falta llenar y dónde. */
  /* CUÁNTOS PRODUCTOS HAY EN TOTAL, antes de quitar lata y PET: es lo
     que deja distinguir «el maestro está vacío» de «están todos, pero
     ninguno se rompe como vidrio». Son dos cosas distintas y se
     arreglan en sitios distintos. */
  const ptTotal = materiales.filter((m) => m.tipo === "producto_terminado").length;
  const eer = materiales.filter((m) => m.tipo === "eer");
  const hayColores = eer.some((m) => !!m.color);
  /* SI EL COLOR ESCOGIDO NO TIENE NINGUNO, SE OFRECEN TODOS. Un
     desplegable vacío no dice «escogiste el color que no era»: dice «no
     existe», y manda a dar de alta algo que ya está. Acotar está bien;
     acotar hasta cero no acota, traba. */
  /* LO QUE SE CUENTA EN LOS BOTONES ES LO QUE EL DESPLEGABLE VA A
     ENSEÑAR, y no todo lo que hay en el maestro. El botón decía
     «Todos (33)» —los 33 envases de Inventario— cuando al abrirlo salen
     los 13 marcados «sale en sitio»: un número que no es el de la lista
     que va a aparecer manda a buscar un problema que no existe.

     Si no hay ninguno marcado se cuentan todos, que es exactamente lo
     que el desplegable hace en ese caso. */
  const marcados = eer.filter((m) => m.en_sitio);
  const ofrecidos = marcados.length > 0 && marcados.length < eer.length ? marcados : eer;
  const cuantos = (c: "todos" | "ambar" | "flint" | "green") =>
    c === "todos" ? ofrecidos.length : ofrecidos.filter((m) => m.color === c).length;
  const porColor = vidrio === "todos" ? eer : eer.filter((m) => m.color === vidrio);
  const delTipo = tipo !== "eer"
    ? materiales.filter((m) => m.tipo === tipo && esVidrio(m))
    : (hayColores && porColor.length > 0) ? porColor : eer;
  const mat = materiales.find((m) => m.clave === material) ?? null;
  const cau = causas.find((c) => c.clave === causa) ?? null;
  const exigeFoto = !!cau?.exige_foto;
  const procNombre = procesos.find((p) => p.clave === proceso)?.nombre;
  const areaNombre = areas.find((a) => a.clave === area)?.nombre;

  /* AL CAMBIAR DE TIPO O DE COLOR, EL MATERIAL SE REACOMODA SOLO.
     Si quedara el de antes se mandaría un envase retornable con la
     clave de una cerveza, o un ámbar marcado como flint — y las dos
     cosas se ven igual de bien en la pantalla.

     Y SI SOLO HAY UNO POSIBLE, VIENE PUESTO. Es el caso normal en EER:
     un desplegable de un solo renglón que hay que abrir para escoger lo
     único que se podía escoger es un toque cobrado por nada. */
  useEffect(() => {
    /* LA MISMA LISTA QUE EL DESPLEGABLE, Y AHORA LITERALMENTE LA MISMA.
       Aquí había una copia del filtro, con el aviso escrito de que dos
       sitios filtrando lo mismo por su cuenta es cómo se cuela lo que se
       quería bloquear. Se coló: al volver el color un filtro que no
       vacía, la copia se quedó con la regla vieja y podía dejar puesto
       un material que el desplegable ya no ofrecía. Un comentario que
       avisa de un riesgo no lo evita; usar la misma variable, sí. */
    const posibles = delTipo;
    setMaterial((antes) => {
      if (antes && posibles.some((m) => m.clave === antes)) return antes;
      return posibles.length === 1 ? posibles[0].clave : "";
    });
    setTocoBotellas(false);
    /* `delTipo` se recalcula en cada pintado, así que NO va en las
       dependencias: metiéndola, el efecto se dispararía solo para
       siempre. Lo que de verdad la cambia es lo que sí está en la
       lista. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {/* SE BUSCA ESCRIBIENDO, y no es un capricho: el desplegable pasó
          de siete materiales a 494, y un `<select>` nativo con 494 es
          una lista de treinta pantallazos donde solo se puede saltar
          tecleando el PRINCIPIO del nombre. Quien busca «355» no
          encuentra nada. */}
      <BuscarEnLista id="rt-mat" valor={material}
        /* EL MISMO COMPONENTE QUE AVERÍAS. Era de aquí y se sacó a
           `components/` cuando Averías necesitó exactamente esto:
           copiarlo habría dado dos cajas de búsqueda que se
           desincronizan. `clave` es lo que se guarda, `codigo` es lo
           que está pegado en la estiba y por lo que también se busca. */
        /* `corta` ES LO QUE DECIDE QUÉ SALE DE ENTRADA. Se marca en
           Inventario → Maestro con la casilla «sale en sitio»: el
           maestro tiene 494 materiales y en sitio se rompen unos
           cincuenta. Los demás siguen saliendo al escribir. */
        /* LA LISTA CORTA VALE PARA LOS DOS, y esto ESTUVO MAL una
           versión: se aplicaba solo a producto.

           EL RAZONAMIENTO DE ENTONCES ERA que en EER la lista ya queda
           corta sola, porque el color del vidrio la deja en uno o dos,
           y que marcar además escondería el segundo ámbar —el maestro
           tiene un 330 y un 750—, que es justo el caso por el que EER
           tiene desplegable.

           SE CAYÓ CONTRA LOS DATOS DE VERDAD, en dos puntos:

           · El color NO filtra. Ningún envase del maestro tiene
             `color_vidrio` puesto, así que la pantalla —bien— ofrece
             los 32 en vez de dejar el registro trabado. Treinta y dos
             que incluyen estibas de madera y cilindros de CO2: eso no
             es «una lista que ya es corta», es la lista entera.

           · Y el segundo ámbar no se pierde, porque los marcados son
             los que él marcó: el 330, el 750, el Club Col 330, el
             1000, el 250 y el 850 son SEIS marrones, todos marcados.
             La marca no escoge entre dos del mismo color; los trae a
             los dos.

           SIGUE SIENDO SEGURO SI NADIE ESTÁ MARCADO: el buscador solo
           acorta cuando hay marcados Y son menos que el total, así que
           un color sin ninguno marcado sigue ofreciendo todos los de
           ese color en vez de quedar vacío. */
        /* EL COLOR VA EN EL NOMBRE DE CADA UNO. Desde que la lista sale
           entera, «Envase Marron 330R» y «Envase Flint 330R» se leen
           seguidos y el color deja de estar en el botón de arriba: tiene
           que estar en la fila que se escoge. Al que le falte, lo dice
           — es lo que hay que ir a llenar al maestro. */
        opciones={delTipo.map((m) => ({
          clave: m.clave,
          nombre: m.nombre
            + (m.tipo === "eer" ? ` · ${m.color ? COLOR_VIDRIO[m.color] : "sin color"}` : ""),
          codigo: m.clave,
          corta: m.en_sitio,
          /* EL CUADRITO VA CON EL MISMO COLOR QUE EL BOTÓN DE ARRIBA: es
             el mismo dato y verlo distinto en dos sitios hace dudar del
             que se está mirando. Al que le falta el color no lleva
             cuadrito — y el «sin color» del nombre dice por qué. */
          color: m.tipo === "eer" && m.color ? VIDRIO_PINTA[m.color] : null,
        }))}
        rotulo="Escribe para buscar el material"
        /* AL ESCOGER EL MATERIAL, EL COLOR SE PONE SOLO.
           «Si escojo un material, ejemplo 3501539, debe ponerse en modo
           automático el color ámbar.»

           Escribir el código es la vía rápida: quien está de pie al lado
           del vidrio lo teclea y no anda escogiendo color primero. Pero
           el botón de arriba se quedaba en «Todos» y la pantalla acababa
           enseñando un envase ámbar con el filtro sin marcar — el mismo
           dato dicho en dos sitios y solo uno puesto, que es como se
           empieza a dudar de los dos.

           NO ES UN FILTRO QUE SE APRIETA, ES UNO QUE SE PONE AL DÍA: el
           material escogido SIEMPRE está en la lista del color que se
           acaba de marcar —es su color—, así que el efecto de abajo lo
           deja donde está y no hay vuelta. Y si al envase le falta el
           color en el maestro no se toca nada: inventarle uno lo
           mandaría a la columna equivocada del análisis. */
        cambiar={(c) => {
          setMaterial(c);
          setTocoBotellas(false);
          if (tipo === "eer") {
            const esc = materiales.find((m) => m.clave === c);
            if (esc?.color) setVidrio(esc.color);
          }
        }}
        /* EL MENSAJE DICE LA VERDAD: «no hay materiales en el maestro»
           sería mentira cuando sí los hay y lo que pasa es que todos
           son lata o PET. Mandar a alguien a buscar al maestro algo
           que ya está ahí es media hora perdida. */
        vacio={esPT
          ? (ptTotal > 0
              ? `Los ${ptTotal} productos del maestro son lata o PET, y aquí no se ofrecen: en sitio se registra lo que se rompe como vidrio.`
              : "No hay materiales de producto terminado en el maestro de inventario.")
          : "No hay envases retornables en el maestro de inventario."} />

      {/* NINGÚN ENVASE TIENE COLOR: se ofrecen todos y se dice. Antes
          esto dejaba el desplegable vacío y el registro trabado. */}
      {tipo === "eer" && !hayColores && eer.length > 0 && (
        <p className="nota">
          <b>Ningún envase tiene el color del vidrio puesto</b>, así que aquí salen los{" "}
          {eer.length} sin filtrar. Mientras siga así, el análisis de salida por color no
          cuadra. Se llena en <b>Inventario → Maestro</b>.
        </p>
      )}
      {delTipo.length === 0 && (
        <p className="nota">
          {esPT
            ? (ptTotal > 0
                ? <>Los <b>{ptTotal}</b> productos del maestro son <b>lata o PET</b>, y en sitio
                    no se ofrecen: aquí se registra lo que se rompe como vidrio.</>
                : <>No hay materiales de producto terminado en el maestro. Se agregan en
                    Inventario → Maestro, sin esperar un despliegue.</>)
            : <>No hay <b>envases retornables</b> en el maestro de inventario. Se agregan en
                Inventario → Maestro.</>}
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
      /* EL COLOR QUE VIAJA ES EL DEL MATERIAL, NO EL DEL BOTÓN. El
         botón ahora solo acorta la lista y puede decir «todos», así que
         mandarlo sería mandar una palabra que no es un color. Y aunque
         dijera uno, sería el del filtro y no el del envase que se
         escogió: escoger «ámbar» y luego un flint de la lista habría
         guardado la rotura con el color equivocado. El material ya trae
         el suyo del maestro, que es el único que es verdad.

         Se sigue mandando por si el material viniera sin color: la
         función lo usa solo cuando no hay material, y ahí un null es lo
         correcto —hace que diga qué falta en vez de escoger uno. */
      p_color: esPT ? null : (mat?.color ?? null),
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
          ? "La foto no subió, y esta causa la exige: ábrela desde la lista y agrégala, o el OL la va a devolver."
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
          <p>{origen === "encontrada"
            ? "Pasó directo a cobro. Se puede registrar otra sin salir de aquí."
            : "Ya está en la bandeja del OL. Se puede registrar otra sin salir de aquí."}</p>
        </div>
        <div className="cuerpo">
          <p className="guia">
            <b>{listo}</b> — {mat?.nombre
                              ?? `Envase retornable ${COLOR_VIDRIO[vidrio].toLowerCase()}`}.
            {origen === "encontrada"
              ? "Va directo a cobro, en el Tablero: las encontradas no pasan por visto bueno y no se objetan."
              : "Pasa a la bandeja del OL para el visto bueno."}
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
                  <span className="rot-campo">Tipo de vidrio <i className="rot-opt">para acortar la lista</i></span>
                  <div className="seg vidrio">
                    {/* «TODOS» VA PRIMERO Y ES EL DE ENTRADA. El color
                        acorta trece a seis, que está bien; lo que no
                        puede es esconderlos. Con los tres colores a
                        secas, escoger el que no era dejaba la lista en
                        cero y la pantalla decía «no hay envase
                        retornable green en el maestro» — que se lee como
                        «no está dado de alta». */}
                    {(["todos", "ambar", "flint", "green"] as const).map((c) => (
                      <button key={c} type="button"
                              className={c + (vidrio === c ? " on" : "")}
                              onClick={() => setVidrio(c)}>
                        {c !== "todos" && <i aria-hidden />}
                        {c === "todos" ? `Todos (${cuantos("todos")})`
                          : `${COLOR_VIDRIO[c]} (${cuantos(c)})`}
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
                <span className="rot-campo">Cajas rotas</span>
                <div className="conteo">
                  <span className="cel-step grande">
                    <button type="button" onClick={() => setUnidades((n) => Math.max(0, n - 1))}
                            aria-label="una menos">−</button>
                    <input value={unidades} inputMode="numeric" aria-label="cajas rotas"
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
                  <span className="rot-campo">Cajas contaminadas</span>
                  <div className="conteo">
                    <span className="cel-step grande">
                      <button type="button" onClick={() => setContaminadas((n) => Math.max(0, n - 1))}
                              aria-label="una menos">−</button>
                      <input value={contaminadas} inputMode="numeric" aria-label="cajas contaminadas"
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
            {/* EL PASO 3 SIGUE LA MAQUETA: cuatro bloques separados por una
                raya —proceso, área, causa y evidencia— y el resumen en el
                pie. Cada bloque dice arriba qué es y, a la derecha, la
                pregunta que contesta. */}
            <div className="rp3-f">
              <div className="rp3-lb"><b>Proceso</b></div>
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

            {/* EL ÁREA, DEL MAESTRO, con buscador y la sugerida por el
                proceso. Ver AreaSelect.tsx. */}
            <div className="rp3-f">
              <div className="rp3-lb"><b>Área <span className="req">*</span></b><span>¿En qué parte de la bodega?</span></div>
              <AreaSelect id="rt-area" areas={areas} valor={area} cambiar={setArea}
                          sugerida={areaSugerida(areas, procNombre)} proceso={procNombre} />
              {areas.length === 0 && (
                <p className="nota">
                  No hay áreas en el maestro. Se agregan en Maestro, sin esperar un despliegue.
                </p>
              )}
            </div>

            {/* LA CAUSA SE HABILITA CON EL PROCESO, y va en dos grupos.
                Lo que separa a las causas —de qué lado caen— se dice UNA
                vez, en el rótulo de su grupo; las opciones se quedan con
                el nombre y, si exigen foto, con su cámara. Es una sola
                elección entre todas: un grupo de radios por lado, pero
                una sola `causa`. */}
            <div className="rp3-f">
              <div className="rp3-lb"><b>Causa</b><span>¿Por qué se rompió?</span></div>
              {!proceso ? (
                <p className="nota espera">Escoge primero el proceso y aquí salen las causas.</p>
              ) : (
                ([
                  ["asumida", "Asumidas por el OL", "las paga el operador"],
                  ["no_asumida", "No asumidas", "exigen foto"],
                ] as const).map(([grupo, titulo, sub]) => {
                  const suyas = causas.filter((c) => c.grupo === grupo);
                  if (!suyas.length) return null;
                  return (
                    <div key={grupo} className={"rp3-grupo " + grupo}>
                      <div className="rp3-cgl"><i className="d" aria-hidden />{titulo}<small>· {sub}</small></div>
                      <div className="rp3-rl" role="radiogroup" aria-label={titulo}>
                        {suyas.map((c) => (
                          <button key={c.clave} type="button" role="radio" aria-checked={causa === c.clave}
                                  className={"rp3-ro" + (causa === c.clave ? " on" : "")
                                             + (grupo === "no_asumida" ? " na roja" : "")}
                                  onClick={() => setCausa(c.clave)}>
                            <span className="rd" aria-hidden />
                            <span className="nom">{c.nombre}</span>
                            {c.exige_foto && (
                              <span className="cam">
                                <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                                Foto
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="rp3-f">
              <div className="rp3-lb">
                <b>Evidencia</b>
                <span className={exigeFoto ? "req" : ""}>
                  {exigeFoto ? "Obligatoria: esta causa exige foto. Sin ella, el OL la devuelve"
                             : "Foto opcional para esta causa"}
                </span>
              </div>
              <div className="rp3-ev">
                <button type="button" className={"rp3-up" + (foto ? " con" : "")}
                        onClick={abrirCamara} disabled={sellando}
                        aria-label={foto ? "Tomar otra foto" : "Tomar la foto"}>
                  {foto
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={foto.url} alt="La rotura" />
                    : <span className="ci" aria-hidden>
                        <svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                      </span>}
                  <span className="tx">
                    {sellando ? "Sellando…" : foto ? "Tomar otra foto" : "Tomar foto"}
                    <small>{foto ? "con sello de fecha y lugar" : "con la cámara"}</small>
                  </span>
                </button>
                <input ref={camara} type="file" accept="image/*" capture="environment"
                       onChange={tomarFoto} hidden />
                <textarea id="rt-des" className="rp3-texto" rows={5} value={descripcion}
                          onChange={(e) => setDescripcion(e.target.value)}
                          aria-label="Qué pasó"
                          placeholder="Qué pasó. Ej.: la transportadora de la T1 se atascó y tumbó la fila de envase." />
              </div>
              <div className="rp3-meta">{sello}</div>
            </div>

            {mal && <div className="negro"><span className="punto" /><span>{mal}</span></div>}
          </>
        )}
      </div>

      <div className={"pie" + (paso === 2 ? " con-res" : "")}>
        {paso === 2 && (
          /* EL RESUMEN DE LO ESCOGIDO, a la izquierda de los botones: antes
             de mandar se lee de un golpe «T1 · Bahías T1 · la paga el OL»
             sin volver a subir por el formulario. */
          <span className="res" role="status">
            {[procNombre, areaNombre].filter(Boolean).join(" · ") || "Falta escoger"}
            {cau && <> · <b className={cau.grupo === "asumida" ? "si" : "no"}>
              {cau.grupo === "asumida" ? "la paga el OL" : "no la paga el OL"}</b></>}
          </span>
        )}
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
            : exigeFoto && !foto ? "Falta la foto"
            : origen === "encontrada" ? "Registrar y mandar a cobro" : "Enviar al OL"}
        </button>
      </div>
    </section>
  );
}
