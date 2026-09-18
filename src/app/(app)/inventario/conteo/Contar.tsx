"use client";

/**
 * LA PLANTILLA DE CONTEO — se usa de pie, frente a un módulo, con una
 * sola mano.
 *
 * EL RENGLÓN VA EN EL ORDEN DE LA HOJA, y no en el que salga más cómodo
 * de programar. En «FEFO 002.xlsx» la fila es:
 *
 *   CAL · MOD · D/I → CÓDIGO → DESCRIPCIÓN → D/M/A → ESTIBAS · CAJAS ·
 *   ROT → AVER · PNC · ESTA
 *
 * Es el orden en que se mira una estiba: primero dónde estoy, luego qué
 * es, luego cuándo vence, luego cuánto hay, y de último lo raro. Cambiar
 * ese orden obliga a quien lleva años llenando la hoja a buscar cada
 * campo, que es la forma más segura de que prefiera el papel.
 *
 * Y AHORA ESOS CUATRO MOMENTOS SE VEN. Los once campos iban seguidos, en
 * filas de tres, sin nada que dijera dónde acaba uno y empieza el otro:
 * de lejos era una rejilla de once casillas iguales. Se agrupan en
 * DÓNDE · QUÉ · CUÁNTO · CÓMO ESTÁ, que es el mismo orden de siempre con
 * las costuras a la vista. No se movió ni un campo.
 *
 * LA DESCRIPCIÓN SALE SOLA. En el Excel es un VLOOKUP que solo se veía
 * al final —cuando decía «VALIDAR CODIGO» y ya nadie estaba frente a esa
 * estiba—. Aquí aparece mientras se teclea el código.
 *
 * Y SE ESCOGE, NO SE TECLEA, que es lo que arregla el problema de
 * verdad: 38 de las 152 filas de la hoja —un cuarto— apuntan a una
 * ubicación que no existe. No porque falte el módulo: «A29», «C08»,
 * «E01» existen, pero como A29_DER y A29_IZQ, y la fila se dejó SIN
 * LADO. Un cuarto del conteo no podía decir de qué lado del pasillo
 * estaba.
 *
 * EL CONTEO ES UN BORRADOR HASTA QUE SE ENVÍA. Cada renglón se guarda al
 * momento —una señal que se cae no puede borrar la mañana— pero el
 * recorrido queda abierto: se revisa abajo, se corrige lo que haga falta,
 * y al final se ENVÍA con fecha, hora y nombre. Hasta entonces no está
 * firmado por nadie.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Buscador } from "@/components/Buscador";
import { useConfirmar } from "@/components/Confirmar";
import { useAvisos } from "@/components/Aviso";
import type { Material, Ubicacion, Renglon } from "@/modulos/inventario/fefo";

type Conteo = { id: string; codigo: string; estado: string; iniciado_en: string | null };

const ent = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const DIA = 86_400_000;

/* Lo que se teclea de un renglón, todo junto. Va en un solo objeto para
   que corregir sea CARGARLO y no reconstruirlo campo por campo: con doce
   estados sueltos, abrir una fila para corregirla era doce asignaciones
   y olvidar una dejaba el dato de la fila anterior. */

/* DOS FORMAS DE CONTAR, NO TRES. «Saldo» era una tercera opción del
   desplegable y eso lo ponía en el mismo plano que las otras dos, como
   si fuera otra manera de contar un módulo. No lo es: el saldo es lo que
   sobra de la última estiba, y SIEMPRE viene con estibas al lado. Doce
   estibas completas más ocho cajas sueltas es UN renglón —548 cajas—, y
   como tercera opción del desplegable había que partirlo en dos. */
type Modo = "estibas" | "cajas";

type Borrador = {
  calle: string;
  /* EL MÓDULO YA NO ES LA UBICACIÓN: es el módulo pelado —«A01»— y el
     lado va aparte. La ubicación sale de juntar los dos. En la lista
     salía «A01_DER», que obligaba a escoger el lado dos veces: una
     dentro del nombre del módulo y otra en el campo de al lado. */
  base: string;
  lado: string;
  codigo: string;
  /* LA FECHA ES LA DE VENCIMIENTO, que es la que se anota en la hoja y
     la que trae impresa el cartón. De ella salen las dos cifras que
     deciden el FEFO —días para salir y días para vencer—, y son las que
     se enseñan aquí mismo, frente a la estiba.

     AQUÍ HUBO UN `fecha: "vence" | "fabrica"` y fue un error mío. Le
     quité el interruptor a la pantalla pero le dejé el estado adentro
     «por si acaso», y el borrador que se guarda en el teléfono trajo esa
     marca de vuelta después de actualizar: el formulario abría en un
     modo y NO HABÍA CÓMO SALIR, porque el único control que lo cambiaba
     ya no existía. Un campo de estado sin control que lo mueva es una
     trampa, aunque hoy parezca inofensivo. */
  dia: string; mes: string; anio: string;
  /* LAS TRES CIFRAS VIVEN APARTE y no en una sola casilla con tres
     nombres. Las tenía compartiendo `cuantas`, y con eso pasar de
     estibas a cajas conservaba el número: 56 estibas se convertían en
     56 cajas sin que nada cambiara en pantalla. */
  modo: Modo; estibas: string; saldo: string; cajas: string;
  rot: boolean | null;
  averia: boolean; pnc: boolean; estado: string; nota: string;
};
const VACIO: Borrador = {
  calle: "", base: "", lado: "", codigo: "", dia: "", mes: "", anio: "",
  modo: "estibas", estibas: "", saldo: "", cajas: "", rot: null,
  averia: false, pnc: false, estado: "", nota: "",
};

/* La clave con la que se agrupan las ubicaciones de un mismo módulo.
   Va calle + módulo y NO la clave, porque la clave ya trae el lado
   pegado: A01_DER y A01_IZQ son el mismo módulo por dos lados. */
const claveBase = (u: { calle: string; modulo: string }) => `${u.calle}|${u.modulo}`;

/* LAS LETRAS PRIMERO Y LOS NOMBRES DESPUÉS.
   Ordenado a secas queda A, ALAR, B, BAHIA, C, CARPA… y encontrar la
   calle C obliga a leer la lista entera. Las calles de una letra son las
   del almacén de verdad y son las que se caminan todos los días; ALAR,
   BAHIA, CARPA y JAULA_PNC son sitios con nombre y se buscan de vez en
   cuando. Van al final. */
const ordenCalle = (a: string, b: string) => {
  const suelta = (x: string) => (x.length === 1 ? 0 : 1);
  return suelta(a) - suelta(b) || a.localeCompare(b, "es", { numeric: true });
};

/* EL LADO, CON SU NOMBRE ENTERO. En la clave va «IZQ» y «DER» porque una
   clave se escribe corta; en un botón que se toca sin mirar, «IZQ» y
   «DER» se distinguen por una letra y están uno al lado del otro. El que
   no tiene lado —EST07, JAULA_PNC— lo dice con todas sus palabras, en
   vez de dejar un botón vacío que parece un fallo. */
const nombreLado = (l: string) =>
  l === "" ? "Este módulo no tiene lados" : l === "IZQ" ? "Izquierdo" : "Derecho";

/* DOS CIFRAS Y SOLO DÍGITOS. Es lo que hace que el salto de casilla sea
   fiable: sin esto, pegar «2027» en el año dejaba cuatro caracteres
   dentro y la casilla nunca «se llenaba». */
const dosDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 2);

export function Contar({
  bodegaId, conteoInicial, renglonesIniciales, materiales, ubicaciones, estados,
}: {
  bodegaId: string;
  conteoInicial: Conteo | null;
  renglonesIniciales: Renglon[];
  materiales: Material[];
  ubicaciones: Ubicacion[];
  estados: string[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [pedir, dialogo] = useConfirmar();
  const [avisar, avisos] = useAvisos();

  const [conteo, setConteo] = useState(conteoInicial);
  const [renglones, setRenglones] = useState(renglonesIniciales);
  const [guardando, setGuardando] = useState(false);
  /* Qué renglón se está corrigiendo. Null = se está anotando uno nuevo. */
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null);
  /* DOS PESTAÑAS Y NO UNA PÁGINA LARGA. Contar y revisar son dos
     momentos distintos: contando se mira UN renglón —el que se está
     anotando— y revisando se miran los ciento cincuenta. Apilados, cada
     vez que se anotaba algo la lista de abajo empujaba el formulario y
     había que buscarlo otra vez. */
  const [pestania, setPestania] = useState<"anotar" | "borrador">("anotar");
  /* EL BORRADOR SE FILTRA. Ciento cincuenta renglones en una jornada, y
     buscar el 3128 que se anotó hace dos horas rodando la lista es como
     se termina corrigiendo el renglón equivocado. */
  const [fCodigo, setFCodigo] = useState("");
  const [fCalle, setFCalle] = useState("");
  const [fModulo, setFModulo] = useState("");
  const [b, setB] = useState<Borrador>(VACIO);
  const campoCodigo = useRef<HTMLInputElement>(null);
  /* LAS TRES CASILLAS DE LA FECHA SE CONOCEN ENTRE ELLAS: es lo que
     permite que el cursor pase solo de DD a MM y de MM a AA. */
  const campoDia = useRef<HTMLInputElement>(null);
  const campoMes = useRef<HTMLInputElement>(null);
  const campoAnio = useRef<HTMLInputElement>(null);

  /* ---------- EL RENGLÓN A MEDIO ESCRIBIR NO SE PIERDE ----------
     Lo anotado está a salvo desde el momento en que se toca «Anotar»:
     cada renglón se guarda en la base al instante, con su nombre. Lo que
     NO estaba a salvo era lo que se tiene tecleado y todavía no se ha
     anotado — y en una bodega eso se pierde por cualquier cosa: la señal
     se cae a mitad de un pasillo, el celular se bloquea, alguien recarga
     sin querer.

     Se guarda en el NAVEGADOR y no en la base, a propósito: es de esta
     persona y de este teléfono, nadie más tiene que verlo, y guardarlo
     en la base significaría una escritura por cada tecla.

     LA LLAVE LLEVA EL ID DEL CONTEO. Sin eso, quien cierra un recorrido
     y abre otro se encontraría el renglón a medias del anterior — y ese
     renglón ya no tiene sentido, porque el conteo al que pertenecía está
     enviado. */
  const llave = conteo ? `fefo.renglon.${conteo.id}` : null;

  useEffect(() => {
    if (!llave) return;
    try {
      const crudo = localStorage.getItem(llave);
      /* SOLO LAS CLAVES QUE EL FORMULARIO TIENE HOY. Un `...guardado` a
         secas mete de vuelta lo que el borrador traía de una versión
         anterior de la pantalla, y así fue como un `fecha: "vence"`
         guardado antes de un cambio dejó el formulario en un modo que
         ya no tenía cómo cambiarse. Lo guardado es de ayer; el
         formulario es de hoy, y manda el formulario. */
      if (crudo) {
        const g = JSON.parse(crudo) as Record<string, unknown>;
        const limpio = { ...VACIO };
        for (const k of Object.keys(VACIO) as (keyof Borrador)[]) {
          if (k in g) (limpio[k] as unknown) = g[k];
        }
        setB(limpio);
      }
    } catch {
      /* Sin localStorage —modo privado, almacenamiento lleno, permisos—
         la pantalla funciona igual: se pierde el renglón a medias, que
         es exactamente lo que pasaba antes. Nunca puede impedir contar. */
    }
  }, [llave]);

  useEffect(() => {
    if (!llave) return;
    try {
      /* VACÍO SE BORRA, no se guarda. Un objeto vacío en el almacén
         haría que la próxima vez se restaurara «nada» encima de nada,
         que es inofensivo pero deja basura por cada conteo cerrado. */
      const hayAlgo = Object.entries(b).some(([k, v]) =>
        v !== VACIO[k as keyof Borrador] && v !== "" && v !== null && v !== false);
      if (hayAlgo) localStorage.setItem(llave, JSON.stringify(b));
      else localStorage.removeItem(llave);
    } catch { /* ver arriba */ }
  }, [b, llave]);

  const pon = <K extends keyof Borrador>(k: K, v: Borrador[K]) =>
    setB((x) => ({ ...x, [k]: v }));

  /* ---------- LA FECHA SE TECLEA DE CORRIDO ----------

     SEIS DÍGITOS Y NINGÚN TOQUE ENTRE MEDIAS. Eran tres casillas sueltas
     y había que tocar cada una: dos dígitos, tocar, dos dígitos, tocar,
     dos dígitos. Son 152 estibas al día, así que son 304 toques que
     sobran — y cada uno es una ocasión de tocar la casilla de al lado y
     escribir el mes donde va el día.

     EL SALTO SE HACE CON DOS DÍGITOS DENTRO, no con dos teclas pulsadas:
     corregir el día borrando y volviendo a escribir tiene que saltar
     igual, y pegar «11» desde otro sitio también.

     Y SE PUEDE VOLVER. Llegar al mes, ver que el día quedó mal y no
     poder devolverse sin levantar la mano al teléfono sería cambiar un
     estorbo por otro: el retroceso sobre una casilla vacía devuelve el
     cursor a la anterior, con lo escrito seleccionado para reemplazarlo
     de una. */
  function tecleaFecha(k: "dia" | "mes" | "anio", v: string,
                       siguiente?: RefObject<HTMLInputElement | null>) {
    const limpio = dosDigitos(v);
    pon(k, limpio);
    if (limpio.length !== 2) return;
    if (siguiente?.current) {
      siguiente.current.focus();
      siguiente.current.select();
      return;
    }
    /* Y AL ACABAR EL AÑO SE CIERRA EL TECLADO.
       No hay casilla siguiente, así que el cursor se quedaba en el año
       con el teclado abierto tapando media pantalla — justo cuando lo
       que hay que mirar es el total y los días para salir, que están
       debajo. Soltar el foco es lo único que cierra el teclado del
       celular; no hay forma de pedírselo directamente.

       SE HACE AQUÍ Y NO CON UN `blur()` DENTRO DEL onChange DEL AÑO:
       puesto allí sería una regla más que recordar en el JSX, y el
       siguiente que agregue una casilla de fecha no se enteraría. Aquí
       es lo que significa «no hay siguiente»: el año es la última. */
    document.activeElement instanceof HTMLElement && document.activeElement.blur();
  }

  function atrasFecha(e: KeyboardEvent<HTMLInputElement>, valor: string,
                      anterior?: RefObject<HTMLInputElement | null>) {
    if (e.key !== "Backspace" || valor !== "" || !anterior?.current) return;
    e.preventDefault();
    anterior.current.focus();
    anterior.current.select();
  }

  /* ---------- LAS LISTAS, SIN RECORTAR ----------
     Las calles y los módulos salen del maestro de ubicaciones, no de una
     lista escrita aquí: el día que abran una calle nueva se agrega en el
     maestro y aparece sola.

     Y EL MÓDULO YA NO ESTÁ BLOQUEADO hasta escoger calle. Estaba, y era
     un estorbo: quien vuelve al mismo módulo cada mañana tiene que pasar
     por la calle aunque ya sepa a dónde va. Sin calle escogida la lista
     trae TODAS las ubicaciones; con calle, las de esa calle. Escoger el
     módulo pone su calle solo. */
  const calles = useMemo(
    () => [...new Set(ubicaciones.filter((u) => u.activa).map((u) => u.calle))].sort(ordenCalle),
    [ubicaciones]);

  /* LOS MÓDULOS SIN EL LADO PEGADO. A01_DER y A01_IZQ son un solo
     módulo, y salían como dos renglones de la lista: 428 opciones para
     214 sitios. La familia se toma del primero —las dos caras de un
     módulo guardan lo mismo— y sirve para reconocerlo de un vistazo. */
  const modulos = useMemo(() => {
    const m = new Map<string, { base: string; calle: string; modulo: string; familia: string | null }>();
    for (const u of ubicaciones) {
      if (!u.activa) continue;
      if (b.calle !== "" && u.calle !== b.calle) continue;
      const k = claveBase(u);
      if (!m.has(k)) m.set(k, { base: k, calle: u.calle, modulo: u.modulo, familia: u.familia });
    }
    return [...m.values()].sort((x, y) =>
      ordenCalle(x.calle, y.calle) ||
      x.modulo.localeCompare(y.modulo, "es", { numeric: true }));
  }, [ubicaciones, b.calle]);

  /* LOS LADOS QUE ESE MÓDULO TIENE DE VERDAD, no los tres siempre.
     Puede tener IZQ y DER, puede tener uno solo, y puede no tener
     ninguno —EST07, JAULA_PNC—. Ofrecer «izquierdo» en un módulo que no
     lo tiene es ofrecer una ubicación que no existe, que es exactamente
     lo que dejó 38 de 152 filas de la hoja sin poder ubicar. */
  const lados = useMemo(
    () => ubicaciones
      .filter((u) => u.activa && claveBase(u) === b.base)
      .map((u) => u.lado ?? "")
      .filter((v, i, xs) => xs.indexOf(v) === i)
      .sort(),
    [ubicaciones, b.base]);

  /* La ubicación sale de módulo + lado. Con un solo lado posible no hace
     falta escogerlo: se toma ese. */
  const ubicacion = useMemo(() => {
    if (!b.base) return null;
    const delModulo = ubicaciones.filter((u) => u.activa && claveBase(u) === b.base);
    if (delModulo.length === 1) return delModulo[0];
    return delModulo.find((u) => (u.lado ?? "") === b.lado) ?? null;
  }, [ubicaciones, b.base, b.lado]);

  /* El material se reconoce MIENTRAS SE TECLEA. */
  const material = useMemo(
    () => materiales.find((m) => m.activo && m.sku === b.codigo.trim()) ?? null,
    [materiales, b.codigo]);
  const esEnvase = material?.tipo_material === "ENVASE";

  /* ---------- LAS DOS CIFRAS DEL FEFO, MIENTRAS SE TECLEA ----------

     Son las columnas T y U de la hoja, con sus mismas fórmulas:

       DÍAS PARA VENCER = vencimiento − hoy
       DÍAS PARA SALIR  = eso mismo − el mínimo T1 del maestro

     «Días para salir» es la que manda: no es cuándo vence, es cuándo
     TIENE QUE HABER SALIDO para llegarle al cliente con vida útil
     suficiente. En negativo ya se pasó, aunque falten meses para vencer.

     ESTO SOLO ENSEÑA. Lo que decide —el tablero, las alertas, el
     informe— lo calcula `v_conteo_fefo` con estas mismas fórmulas. Se
     repiten aquí para que la respuesta salga sin ir al servidor, con la
     estiba delante; el día que cambie el criterio, la vista es la que
     manda y esta cuenta se corrige con ella. */
  const dias = useMemo(() => {
    if (!material) return null;
    const d = ent(b.dia), m = ent(b.mes);
    const a = b.anio.trim() === "" ? null : Number(b.anio.trim());
    if (d == null || m == null || a == null) return null;
    const f = new Date(2000 + a, m - 1, d);
    if (f.getMonth() !== m - 1 || f.getDate() !== d) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const vencer = Math.round((f.getTime() - hoy.getTime()) / DIA);
    return { vence: f, vencer, salir: vencer - material.dias_minimo, minimo: material.dias_minimo };
  }, [b.dia, b.mes, b.anio, material]);

  /* ---------- EL TOTAL, ARMADO A LA VISTA ----------

     12 × 45 + 8 = 548. La cuenta se enseña ENTERA y no solo el
     resultado, porque el resultado solo no se puede comprobar: 548 es un
     número que hay que creerse, y «12 × 45 + 8» se mira contra la estiba
     y se ve si el factor que usó es el que corresponde a ese material.

     Es la misma suma que hace la base al guardar. Aquí no decide nada:
     lo que se manda son las tres cifras por separado. */
  const cuenta = useMemo(() => {
    if (b.modo === "cajas") {
      const c = ent(b.cajas);
      return c == null ? null : { formula: `${nf.format(c)}`, total: c };
    }
    const e = ent(b.estibas), s = ent(b.saldo);
    if (e == null && s == null) return null;
    const f = material?.cajas_por_estiba ?? null;
    if (e != null && f == null) return { formula: null, total: null };
    const total = (e ?? 0) * (f ?? 0) + (s ?? 0);
    const partes = [e != null ? `${e} × ${f}` : null, s != null ? nf.format(s) : null]
      .filter(Boolean).join(" + ");
    return { formula: partes, total };
  }, [b.modo, b.estibas, b.saldo, b.cajas, material]);

  /**
   * ANOTAR DEJA EL RENGLÓN ENTERO EN BLANCO. Calle, módulo, lado,
   * código, fecha, cantidad, ¿rota? y las marcas: todo.
   *
   * Dejé el sitio puesto dos veces —primero con la fecha, después sin
   * ella— pensando que se camina módulo por módulo y volver a escoger
   * los tres campos era la mitad de las pulsaciones de la jornada. Y
   * Cristian lo devolvió las dos veces, que es lo que vale: él es el que
   * lo camina.
   *
   * La razón de fondo es la misma que la de la fecha: un campo que quedó
   * lleno del renglón anterior NO SE VE como un campo por llenar, se ve
   * como uno ya contestado. Un renglón anotado en el módulo equivocado
   * no da error, no avisa, y aparece cuadrando el mes.
   *
   * Si alguna vez pesa más teclear que equivocarse, volver a dejar el
   * sitio es una línea — pero tiene que ser una decisión, no un descuido
   * mío.
   */
  function limpiar() {
    setCorrigiendo(null);
    setB(VACIO);
    /* Y se borra el guardado: el renglón ya quedó en la base, así que
       restaurarlo mañana sería ofrecer volver a anotar algo que ya está
       anotado. */
    try { if (llave) localStorage.removeItem(llave) } catch { /* da igual */ }
    campoCodigo.current?.focus();
  }

  async function abrir() {
    setGuardando(true);
    const { data, error } = await supabase.rpc("conteo_fefo_abrir", { p_bodega: bodegaId });
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }
    setConteo({ id: data as string, codigo: "…", estado: "en_proceso", iniciado_en: null });
    router.refresh();
  }

  async function releer(id: string) {
    const { data } = await supabase.from("v_conteo_fefo").select("*")
      .eq("conteo_id", id).order("contado_en", { ascending: false }).limit(2000);
    setRenglones((data ?? []) as Renglon[]);
  }

  function revisar(): string | null {
    if (!b.base) return "Escoge el módulo.";
    if (!ubicacion) return "Falta decir de qué lado del módulo.";
    if (!material) return `El código «${b.codigo}» no está en el maestro.`;
    if (b.modo === "cajas") {
      if (ent(b.cajas) == null) return "¿Cuántas cajas?";
    } else if (ent(b.estibas) == null && ent(b.saldo) == null) {
      return "¿Cuántas estibas? Si solo quedan sueltas, anótalas en el saldo.";
    }
    /* DE «CÓMO ESTÁ» EN ADELANTE NO SE VALIDA NADA. Rotación, avería,
       PNC, estado del envase y observación: si no se marca, no pasa
       nada. Aquí estaba «Falta decir si rota» y frenaba el renglón por
       una pregunta que ahora se contesta sola — no marcarla ES decir
       que no. Un aviso que para el renglón por algo que no cambia la
       cifra es un aviso que la gente aprende a esquivar. */
    if (!esEnvase && (ent(b.dia) == null || ent(b.mes) == null || b.anio.trim() === ""))
      return "Falta la fecha de vencimiento.";

    /* LA FECHA SE REVISA AQUÍ Y CON NOMBRE PROPIO.
       Escribir 20 en el mes —un dedazo de una tecla— llegaba a Postgres,
       que reventaba con «date/time field value out of range», y la app
       lo traducía a «Ese valor no es válido para este campo». Quien lo
       lee está mirando ONCE campos y ninguno dice cuál. Se pierden dos
       minutos por dedazo, con la estiba delante.

       Y se comprueba que la fecha EXISTA, no solo que los rangos
       cuadren: el 31 de febrero pasa un `mes <= 12` y sigue sin ser un
       día. */
    if (!esEnvase || b.anio.trim() !== "") {
      const d = ent(b.dia), m = ent(b.mes);
      const a = b.anio.trim() === "" ? null : Number(b.anio.trim());
      if (d != null && (d < 1 || d > 31)) return `El día del vencimiento dice ${d}. Va de 1 a 31.`;
      if (m != null && (m < 1 || m > 12)) return `El mes del vencimiento dice ${m}. Va de 1 a 12.`;
      if (a != null && (a < 0 || a > 99)) return `El año va de dos cifras: 27, no ${a}.`;
      if (d != null && m != null && a != null) {
        const f = new Date(2000 + a, m - 1, d);
        if (f.getMonth() !== m - 1 || f.getDate() !== d)
          return `El ${d}/${m}/${a} no existe. Revisa el día.`;
      }
    }
    return null;
  }

  const argumentos = () => ({
    p_sku: material!.sku,
    p_ubicacion: ubicacion!.id,
    /* NO MARCAR ES DECIR QUE NO, y eso se decide AQUÍ y se manda
       resuelto. La base sigue rechazando el nulo —«Falta decir si
       rota»— y así queda como red de seguridad: si algún día otra
       pantalla deja de contestarlo, se entera en vez de guardar una
       columna en blanco que nadie sabe leer. */
    p_rotacion: b.rot === true,
    /* LAS ESTIBAS Y EL SALDO VIAJAN JUNTOS; las cajas, solas. Son las
       dos formas de contar un módulo, y mezclarlas dejaría el renglón
       sin decir cómo se contó — eso lo rechaza también la base. */
    p_estibas: b.modo === "estibas" ? ent(b.estibas) : null,
    p_saldo: b.modo === "estibas" ? ent(b.saldo) : null,
    p_cajas: b.modo === "cajas" ? ent(b.cajas) : null,
    /* SE MANDA EL VENCIMIENTO, que es lo que se lee en el cartón y lo que
       lleva años anotándose en la hoja. Los días para salir y para vencer
       los calcula la vista con el mínimo T1 del maestro: una sola
       fórmula, en un solo sitio. */
    p_venc_dia: ent(b.dia),
    p_venc_mes: ent(b.mes),
    p_venc_anio: b.anio.trim() !== "" ? Number(b.anio.trim()) : null,
    p_fab_dia: null,
    p_fab_mes: null,
    p_fab_anio: null,
    p_averia: b.averia, p_pnc: b.pnc,
    p_estado: b.estado || null,
    p_nota: b.nota.trim() || null,
  });

  async function anotar() {
    if (!conteo) return;
    const mal = revisar();
    if (mal) { avisar.mal(mal); return }

    setGuardando(true);
    const { error } = corrigiendo
      ? await supabase.rpc("conteo_fefo_editar", { p_linea: corrigiendo, ...argumentos() })
      : await supabase.rpc("conteo_fefo_agregar", { p_conteo: conteo.id, ...argumentos() });
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }

    /* Se vuelve a leer la vista en vez de armar el renglón aquí: las seis
       cuentas las hace la base, y calcularlas otra vez en la pantalla es
       tener dos versiones de la verdad esperando a discrepar. */
    await releer(conteo.id);
    avisar.bien(corrigiendo
      ? `${material!.sku} corregido.`
      : `${material!.sku} · ${cuenta?.total != null ? nf.format(cuenta.total) + " cajas" : "anotado"}.`);
    /* LA ALERTA DE FECHA CORTA, EN EL MOMENTO. Quien acaba de anotar
       sigue parado frente a esa estiba: es el único instante en que
       puede mirarla otra vez, comprobar la fecha impresa y sacarla si
       hace falta. Dicho media hora después, en el tablero, ya hay que
       volver a caminar hasta allá.

       EL NÚMERO LO TRAE LA VISTA, no se calcula aquí: es el mismo
       «días para salir» con el que después decide el tablero, así que
       la alerta y el informe no pueden contradecirse. */
    const nuevo = (await supabase.from("v_conteo_fefo")
      .select("dias_para_salir, codigo").eq("conteo_id", conteo.id)
      .order("contado_en", { ascending: false }).limit(1).maybeSingle()).data;
    const d = nuevo?.dias_para_salir as number | null | undefined;
    if (d != null && d < 0)
      avisar.mal(`${nuevo!.codigo}: YA SE PASÓ de su fecha de salida por ${-d} día${-d === 1 ? "" : "s"}. Sácalo.`);
    else if (d != null && d <= 7)
      avisar.info(`${nuevo!.codigo}: sale en ${d} día${d === 1 ? "" : "s"}. Hay que programarlo.`);

    /* Corregir DEVUELVE al borrador: se vino de ahí a arreglar una fila y
       ahí es donde se comprueba que quedó bien. Anotar se queda en el
       formulario, que es donde va el siguiente renglón. */
    if (corrigiendo) setPestania("borrador");
    limpiar();
  }

  /* Cargar un renglón guardado de vuelta en el formulario, tal como
     quedó. Es lo que hace que «corregir» no sea «borrar y volver a
     teclear los doce campos». */
  function corregir(r: Renglon) {
    const u = ubicaciones.find((x) => x.id === r.ubicacion_id);
    /* Corregir pasa al formulario con el renglón cargado: es donde se
       corrige, y dejar a alguien en la lista con el formulario lleno
       detrás es como se termina escribiendo encima de otro renglón. */
    setPestania("anotar");
    setCorrigiendo(r.id);
    setB({
      calle: u?.calle ?? "",
      base: u ? claveBase(u) : "",
      lado: u?.lado ?? "",
      codigo: r.codigo,
      /* LOS TRES PEDAZOS COMO SE TECLEARON, no la fecha armada: quien
         vuelve a mirar la estiba lee el mismo número que leyó la primera
         vez, en las mismas tres casillas.

         Y SI EL RENGLÓN NO LA TIENE, quedan vacías. Pasa con los
         envases, que no traen fecha impresa. */
      dia: String(r.venc_dia ?? ""),
      mes: String(r.venc_mes ?? ""),
      anio: String(r.venc_anio ?? ""),
      /* SE CONTÓ POR CAJAS O SE CONTÓ POR ESTIBAS. Un renglón con saldo
         se contó por estibas —el saldo es lo que sobró de la última— así
         que solo `cajas` distingue las dos formas. */
      modo: r.cajas != null ? "cajas" : "estibas",
      estibas: String(r.estibas ?? ""),
      saldo: String(r.saldo ?? ""),
      cajas: String(r.cajas ?? ""),
      rot: r.rotacion, averia: r.averia, pnc: r.pnc,
      estado: r.estado_envase ?? "", nota: r.nota ?? "",
    });
    campoCodigo.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function borrar(r: Renglon) {
    const ok = await pedir({
      titulo: "¿Borrar este renglón?",
      dice: <>{r.codigo} · {r.material} — {nf.format(Number(r.total_cajas))} cajas en {r.ubicacion}.</>,
      confirmar: "Borrarlo", peligro: true,
    });
    if (!ok) return;
    setGuardando(true);
    const { error } = await supabase.rpc("conteo_fefo_borrar", { p_linea: r.id });
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }
    setRenglones((xs) => xs.filter((x) => x.id !== r.id));
    if (corrigiendo === r.id) limpiar();
    avisar.bien("Renglón borrado.");
  }

  async function enviar() {
    if (!conteo) return;
    const ok = await pedir({
      titulo: "¿Enviar el conteo?",
      dice: <>Van <b>{renglones.length}</b> renglones en{" "}
             <b>{new Set(renglones.map((r) => r.ubicacion)).size}</b> módulos. Queda firmado
             con tu nombre, la fecha y la hora, y <b>ya no se puede corregir</b>.</>,
      confirmar: "Enviarlo",
    });
    if (!ok) return;

    setGuardando(true);
    const { error } = await supabase.rpc("conteo_fefo_enviar",
      { p_conteo: conteo.id, p_nota: null });
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien("Conteo enviado.");
    setConteo(null); setRenglones([]); limpiar();
    router.refresh();
  }

  /* LAS LISTAS DE LOS FILTROS SALEN DE LO ANOTADO, no del maestro:
     ofrecer la calle J cuando no se ha contado nada en J es ofrecer un
     filtro que devuelve la lista vacía y hace dudar de si se perdió algo. */
  const callesB = [...new Set(renglones.map((r) => r.calle).filter(Boolean))].sort() as string[];
  const modulosB = [...new Set(renglones
    .filter((r) => fCalle === "" || r.calle === fCalle)
    .map((r) => r.ubicacion).filter(Boolean))].sort() as string[];

  const vistos = renglones.filter((r) => {
    const q = fCodigo.trim().toLowerCase();
    if (q && !`${r.codigo} ${r.material}`.toLowerCase().includes(q)) return false;
    if (fCalle && r.calle !== fCalle) return false;
    if (fModulo && r.ubicacion !== fModulo) return false;
    return true;
  });
  const filtrando = fCodigo.trim() !== "" || fCalle !== "" || fModulo !== "";

  /* LO QUE YA SE PASÓ DE SALIDA, de lo anotado en este recorrido. El
     número lo trae la vista —no se recalcula aquí— y es el mismo con el
     que después decide el tablero. */
  const cortos = renglones.filter((r) => r.dias_para_salir != null && r.dias_para_salir < 0);
  const semana = renglones.filter((r) =>
    r.dias_para_salir != null && r.dias_para_salir >= 0 && r.dias_para_salir <= 7);

  const deAqui = renglones.filter((r) => r.ubicacion === ubicacion?.clave);
  const cajasAqui = deAqui.reduce((a, r) => a + Number(r.total_cajas), 0);
  const cajasTotal = renglones.reduce((a, r) => a + Number(r.total_cajas), 0);
  const modulosHechos = new Set(renglones.map((r) => r.ubicacion)).size;

  if (!conteo) {
    return (
      <>
        {avisos}
        <section className="fe-arranque">
          <h2>Empezar un recorrido</h2>
          <p>
            Se abre uno a tu nombre y queda como <b>borrador</b>: si sales a almorzar y
            vuelves, sigues en el mismo. Cada renglón se guarda al momento —una señal que se
            cae no borra lo que anotaste— y al final lo revisas y lo envías firmado.
          </p>
          <button type="button" className="btn grande" disabled={guardando} onClick={abrir}>
            {guardando ? "Abriendo…" : "Empezar a contar"}
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      {dialogo}
      {avisos}

      {/* LAS DOS PESTAÑAS. El borrador lleva su cuenta al lado: es lo que
          dice si vale la pena ir a mirarlo, y contando de pie no se
          puede estar cambiando de pantalla para averiguarlo. */}
      <div className="fe-pes fe-pes-conteo" role="tablist">
        <button type="button" role="tab" aria-selected={pestania === "anotar"}
                className={pestania === "anotar" ? "on" : ""}
                onClick={() => setPestania("anotar")}>
          Anotar
        </button>
        <button type="button" role="tab" aria-selected={pestania === "borrador"}
                className={pestania === "borrador" ? "on" : ""}
                onClick={() => setPestania("borrador")}>
          El borrador<em>{renglones.length}</em>
        </button>
      </div>

      <section className={"fe-anotar" + (corrigiendo ? " corrigiendo" : "")}
               hidden={pestania !== "anotar"}>
        <div className="fe-anotar-cab">
          <p className="fe-paso">
            {corrigiendo ? "Corrigiendo un renglón" : "Anotar lo que hay"}
          </p>
          {corrigiendo && (
            <button type="button" className="fe-mini" onClick={() => limpiar()}>
              Dejarlo como estaba
            </button>
          )}
        </div>

        {/* ================= 1 · DÓNDE — CAL · MOD · D/I =================
            LOS TRES SE TECLEAN. Eran desplegables del navegador, y con
            428 ubicaciones el desplegable solo deja saltar por la
            primera letra: llegar a E06 era pulsar «E» y rodar. Ahora se
            escribe «e06» y queda una. */}
        <div className="fe-bloque">
          <p className="fe-bloque-cab">Dónde</p>
          {/* DOS COLUMNAS Y NO TRES: el lado se bajó a su propio renglón
              para que quepa como dos botones. */}
          <div className="fe-tres dos">
            <label><span>Calle</span>
              <Buscador
                valor={b.calle}
                marcador="Todas"
                /* SIN TECLADO. Son doce calles de una letra: la lista
                   entera cabe en la pantalla y escribir no ahorra ni un
                   toque. El teclado del celular, en cambio, tapa media
                   pantalla y deja la lista debajo. */
                teclado="ninguno"
                opciones={[{ valor: "", texto: "Todas" },
                           ...calles.map((c) => ({ valor: c, texto: c }))]}
                onEscoge={(nueva) => {
                  /* Cambiar de calle borra el módulo solo si el que había
                     no es de la calle nueva: si lo es, no hay por qué
                     hacerle escoger otra vez lo que ya estaba bien. */
                  const sigue = b.base.startsWith(nueva + "|");
                  setB((x) => ({ ...x, calle: nueva,
                                 base: nueva === "" || sigue ? x.base : "",
                                 lado: nueva === "" || sigue ? x.lado : "" }));
                }} /></label>

            <label><span>Módulo</span>
              <Buscador
                valor={b.base}
                marcador="Escribe o escoge…"
                sinOpciones="Esa calle no tiene módulos activos."
                /* TECLADO NUMÉRICO, Y POR ESO EL NÚMERO VA SOLO.

                   Salía «A01_DER · RB F1000»: el lado pegado al nombre
                   —que hacía escogerlo dos veces— y la familia detrás.
                   Los dos se fueron, y ahora también la letra de la
                   calle: quien está parado frente al módulo ya escogió
                   la calle arriba, así que repetirla dentro del número
                   obliga a un teclado de letras para llegar a «A01».
                   Escribiendo «01» sirve el numérico, que tiene las
                   teclas al doble de tamaño y se acierta con guante.

                   LA CALLE NO SE PIERDE: cuando no hay ninguna escogida
                   —la lista trae las 428— va como pista al lado, que es
                   lo único que distingue el 01 de A del 01 de B. Con
                   calle escogida no hay nada que distinguir y no se
                   pinta: sobra.

                   LA FAMILIA TAMPOCO ESTÁ. «RB F1000» repetido en
                   doscientas filas solo alarga el renglón; sigue en el
                   maestro, que es donde se consulta. */
                teclado="numerico"
                opciones={modulos.map((m) => ({
                  valor: m.base,
                  texto: m.modulo,
                  pista: b.calle === "" ? `Calle ${m.calle}` : null,
                }))}
                onEscoge={(base) => {
                  const u = ubicaciones.find((x) => x.activa && claveBase(x) === base);
                  const posibles = ubicaciones.filter((x) => x.activa && claveBase(x) === base);
                  /* Escoger el módulo pone su calle sola, y si solo tiene
                     un lado lo pone también: preguntar «¿izquierdo o
                     derecho?» donde no hay más que uno es un toque de más
                     por renglón.

                     LA FECHA YA NO SE BORRA AL CAMBIAR DE MÓDULO. La
                     borraba —para que no se colara la del módulo
                     anterior— y eso hacía perder lo tecleado a quien
                     estaba a medio renglón y se dio cuenta de que había
                     escogido mal el módulo. Son dos momentos distintos:
                     después de ANOTAR se limpia todo, porque el renglón
                     ya quedó guardado; mientras se ESCRIBE no se pierde
                     nada, porque nada está guardado todavía. */
                  setB((x) => ({ ...x, base,
                                 calle: u?.calle ?? x.calle,
                                 lado: posibles.length === 1 ? (posibles[0].lado ?? "") : "" }));
                }} /></label>

          </div>

          {/* EL LADO SE TOCA, NO SE DESPLIEGA.

              Era un `<select>` y en un celular eso abre la rueda del
              sistema: un toque para abrirla, uno para escoger y a veces
              uno más para confirmar. Son tres toques por renglón —152 al
              día— para una pregunta de DOS respuestas, y de pie, con
              guante, la rueda es además el control más fácil de fallar
              de todos.

              VA EN SU PROPIO RENGLÓN Y ANCHO COMPLETO. Metido de tercero
              al lado de calle y módulo, los dos botones quedaban de 60 px
              y había que apuntar; así miden la mitad de la pantalla cada
              uno y se tocan sin mirar.

              Y SOLO SALEN LOS LADOS QUE ESE MÓDULO TIENE DE VERDAD.
              Puede tener los dos, uno, o ninguno —EST07, JAULA_PNC—.
              Ofrecer «izquierdo» donde no existe es ofrecer una
              ubicación que no está, que es lo que dejó 38 de las 152
              filas de la hoja sin poder ubicar. Con un solo lado no se
              pregunta nada: se enseña, para confirmar. */}
          <div className="fe-lado-campo">
            <span className="fe-lado-rot" id="fe-rot-lado">Lado</span>
            {!b.base ? (
              <output className="fe-lado">Escoge primero el módulo</output>
            ) : lados.length === 1 ? (
              <output className="fe-lado">{nombreLado(lados[0])}</output>
            ) : (
              <div className="fe-segmento" role="group" aria-labelledby="fe-rot-lado">
                {lados.map((l) => (
                  <button key={l} type="button" className={b.lado === l ? "on" : ""}
                          aria-pressed={b.lado === l}
                          onClick={() => pon("lado", l)}>{nombreLado(l)}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ============ 2 · QUÉ — CÓDIGO · DESCRIPCIÓN · D/M/A ============ */}
        <div className="fe-bloque">
          <p className="fe-bloque-cab">Qué</p>

          {/* MITAD Y MITAD, y del mismo tamaño. La descripción iba debajo
              en letra chica, como una nota al pie, y es LA CONFIRMACIÓN de
              que se tecleó el código correcto: 3128 y 3182 existen los
              dos. Lo que confirma un dato no puede ser más pequeño que el
              dato.

              EL MARCADOR NO PUEDE SER UN CÓDIGO DE VERDAD. Decía «3128»,
              que es la Águila 330, y en gris claro dentro de un campo
              grande se lee como un campo YA LLENO — sobre todo después
              de anotar, que es justo cuando el campo acaba de vaciarse. */}
          <div className="fe-cod-dos">
            <label><span>Código</span>
              <input ref={campoCodigo} inputMode="numeric" value={b.codigo}
                     placeholder="Teclea el código"
                     onChange={(e) => pon("codigo", e.target.value)} /></label>
            <label><span>Descripción</span>
              <output className={"fe-desc-campo" + (b.codigo && !material ? " mal" : "")}>
                {!b.codigo ? <i>Teclea el código y te digo qué es.</i>
                  : material ? material.nombre
                  : <i>Ese código no está en el maestro.</i>}
              </output></label>
          </div>
          {material && (
            <p className="fe-eco">
              {material.cajas_por_estiba != null
                ? <><b>{material.cajas_por_estiba}</b> cajas por estiba</>
                : <><b className="ojo">sin factor estibado</b> — las estibas darían cero</>}
              {esEnvase && <> · envase</>}
            </p>
          )}

          {/* ---------- LA FECHA ----------
              SE ANOTA EL VENCIMIENTO, que es lo que trae impreso el
              cartón y lo que lleva años poniéndose en la hoja. De ahí
              salen las dos cifras que deciden el FEFO, y salen AQUÍ,
              frente a la estiba: «sale en 249 días» es lo que dice si
              esta estiba se queda o se programa.

              EL CURSOR PASA SOLO de DD a MM y de MM a AA. Eran tres
              toques por fecha y 152 fechas al día: 304 toques que no
              hacían falta, cada uno con su ocasión de caer en la casilla
              de al lado.

              LOS 32 ENVASES NO TRAEN FECHA y no la necesitan: el
              retornable no la lleva impresa, y para ellos la fecha
              entera es opcional. */}
          <div className={"fe-fecha" + (esEnvase ? " opcional" : "")}>
            <div className="fe-que-fecha">
              <span className="fe-etiq-fecha">Vence</span>
              {esEnvase && <em className="fe-opcional">el envase no trae fecha</em>}
            </div>
            <div className="fe-dma">
              <input ref={campoDia} inputMode="numeric" maxLength={2} placeholder="DD"
                     aria-label="Día del vencimiento" value={b.dia}
                     onChange={(e) => tecleaFecha("dia", e.target.value, campoMes)} />
              <input ref={campoMes} inputMode="numeric" maxLength={2} placeholder="MM"
                     aria-label="Mes del vencimiento" value={b.mes}
                     onChange={(e) => tecleaFecha("mes", e.target.value, campoAnio)}
                     onKeyDown={(e) => atrasFecha(e, b.mes, campoDia)} />
              <input ref={campoAnio} inputMode="numeric" maxLength={2} placeholder="AA"
                     aria-label="Año del vencimiento" value={b.anio}
                     onChange={(e) => tecleaFecha("anio", e.target.value)}
                     onKeyDown={(e) => atrasFecha(e, b.anio, campoMes)} />
            </div>

            {/* «DÍAS PARA SALIR» VA PRIMERO Y GRANDE. No es cuándo vence:
                es cuándo tiene que haber SALIDO para llegarle al cliente
                con vida útil suficiente. En negativo ya se pasó, aunque
                falten meses para el vencimiento — y es justo el caso en
                que hay que hacer algo con la estiba que se tiene
                delante. */}
            <div className={"fe-dias" + (dias == null ? " esperando"
                            : dias.salir < 0 ? " mal" : dias.salir <= 7 ? " ojo" : "")}>
              {dias ? (
                <>
                  <span className="fe-dias-par">
                    <b>{dias.salir < 0 ? `se pasó por ${-dias.salir}` : dias.salir}</b>
                    <em>{dias.salir < 0 ? "días de su fecha de salida" : "días para salir"}</em>
                  </span>
                  <span className="fe-dias-par suave">
                    <b>{dias.vencer}</b><em>días para vencer</em>
                  </span>
                </>
              ) : (
                <span className="fe-dias-nada">
                  {material
                    ? "Teclea el vencimiento y te digo cuántos días le quedan para salir."
                    : "Primero el código; después la fecha."}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ============ 3 · CUÁNTO — ESTIBAS · SALDO · CAJAS ============
            DOS FORMAS DE CONTAR UN MÓDULO, no tres cifras sueltas: o se
            cuentan estibas —completas más lo que sobre suelto— o se
            cuentan cajas. En la hoja son dos columnas y en 151 de 152
            filas una va vacía; la única que traía las dos es un dedazo.

            Y LAS ESTIBAS VAN CON SU SALDO EN EL MISMO RENGLÓN. Doce
            completas y ocho sueltas son 548 cajas de un mismo material
            en un mismo sitio: partirlo en dos renglones obliga a
            acordarse de que van juntos. */}
        <div className="fe-bloque">
          <p className="fe-bloque-cab">Cuánto</p>

          <div className="fe-segmento" role="group" aria-label="Cómo se cuenta">
            <button type="button" className={b.modo === "estibas" ? "on" : ""}
                    onClick={() => pon("modo", "estibas")}>Estibas</button>
            <button type="button" className={b.modo === "cajas" ? "on" : ""}
                    onClick={() => pon("modo", "cajas")}>Cajas</button>
          </div>

          {b.modo === "estibas" ? (
            <div className="fe-dos">
              <label><span>Estibas completas</span>
                <input inputMode="numeric" value={b.estibas}
                       onChange={(e) => pon("estibas", e.target.value)} /></label>
              <label><span>Saldo · cajas sueltas</span>
                <input inputMode="numeric" value={b.saldo}
                       onChange={(e) => pon("saldo", e.target.value)} /></label>
            </div>
          ) : (
            <div className="fe-dos una">
              <label><span>Cajas</span>
                <input inputMode="numeric" value={b.cajas}
                       onChange={(e) => pon("cajas", e.target.value)} /></label>
            </div>
          )}

          {/* EL ESTADO DEL ENVASE VA AQUÍ, debajo de las cantidades y no
              al final con lo raro. Es lo que dice QUÉ se contó —envase
              bueno, sucio, roto— y separa la estiba dentro del mismo
              módulo igual que la avería; puesto al final, quien anotaba
              ya había dado el renglón por terminado en el total. */}
          <label className="fe-estado"><span>Estado del envase</span>
            <select value={b.estado} onChange={(e) => pon("estado", e.target.value)}>
              <option value="">—</option>
              {estados.map((e) => <option key={e} value={e}>{e}</option>)}
            </select></label>

          {/* EL TOTAL, ARMADO A LA VISTA. Se enseña la cuenta entera
              —12 × 45 + 8— y no solo el 548: el resultado solo hay que
              creérselo, la cuenta se mira contra la estiba. */}
          <p className={"fe-total" + (cuenta?.total == null ? " esperando" : "")}>
            {cuenta == null
              ? <>Anota cuántas y te digo el total en cajas.</>
              : cuenta.total == null
                ? <><b className="ojo">Sin factor estibado</b> — este material no dice cuántas
                    cajas lleva una estiba, así que las estibas darían cero. Cuéntalo por cajas
                    o avísale a quien lleva el maestro.</>
                : <><span className="fe-formula">{cuenta.formula}</span>
                    <b>{nf.format(cuenta.total)}</b> cajas</>}
          </p>
        </div>

        {/* ========= 4 · CÓMO ESTÁ — ROT · AVER · PNC · ESTA =========
            Lo raro va de último y sin abultar: avería salió en 2 filas de
            152, PNC en 1 y el estado del envase en 10. Darles el peso del
            código sería cobrarle a los 150 renglones normales el costo de
            los tres raros.

            «¿ROTA?» ES OTRA COSA Y POR ESO VA APARTE: es rotación —si esa
            estiba se mueve o está quieta—, no si está rota. Se contesta
            en las 152 filas de la hoja: 94 sí y 58 no. */}
        <div className="fe-bloque">
          <p className="fe-bloque-cab">Cómo está</p>

          {/* UN SOLO BOTÓN, Y NO «SÍ / NO».

              No marcarlo ES decir que no, así que el «No» solo servía
              para obligar a contestar dos veces la misma cosa: una para
              decir que no y otra para que el formulario dejara anotar.
              Y con eso se fue también el aviso que frenaba el renglón.

              LO QUE SE PIERDE, DICHO: ya no se distingue «contestó que
              no» de «no contestó». Se acepta porque las dos llevan al
              mismo sitio —la estiba no rota— y porque lo que estaba
              costando era el toque de más, 152 veces al día. */}
          <div className="fe-rota">
            <span>¿Rota?</span>
            <div className="fe-si-no una">
              <button type="button" className={b.rot ? "on" : ""}
                      aria-pressed={!!b.rot}
                      onClick={() => pon("rot", !b.rot)}>Sí, rota</button>
            </div>
          </div>

          {/* AVERÍA Y PNC, DOS CUADROS DEL MISMO TAMAÑO. Eran dos
              casillas sueltas en una fila con el estado del envase, y en
              el celular quedaban de un tamaño cada una: la de PNC medía
              lo que mide la palabra. Ahora son dos cuadros iguales que
              se tocan sin apuntar, como el lado y el modo de contar. */}
          <div className="fe-marcas dos">
            <button type="button" className={"fe-marca" + (b.averia ? " on" : "")}
                    aria-pressed={b.averia}
                    onClick={() => pon("averia", !b.averia)}>Avería</button>
            <button type="button" className={"fe-marca" + (b.pnc ? " on" : "")}
                    aria-pressed={b.pnc}
                    onClick={() => pon("pnc", !b.pnc)}>PNC</button>
          </div>

          {/* LA OBSERVACIÓN SE GUARDABA Y NO SE PODÍA ESCRIBIR. El
              renglón la manda desde el primer día —`p_nota`— pero el
              formulario no tenía dónde teclearla: iba siempre vacía. */}
          <label className="fe-nota"><span>Observación</span>
            <input value={b.nota} placeholder="Opcional — lo que haya que decir de esta estiba"
                   onChange={(e) => pon("nota", e.target.value)} /></label>
        </div>

        {(b.averia || b.pnc || b.estado) && (
          /* Las tres marcas separan la estiba dentro del mismo módulo: en
             el Excel es la columna «UBICACIÓN COMBINADA» y es la que
             sirve para agrupar. Se muestra armada para que quien anota
             vea qué va a quedar. */
          <p className="fe-combinada">
            Va a quedar como <b>{[ubicacion?.clave ?? "…",
              b.averia ? "AVERIA" : "", b.pnc ? "PNC" : "", b.estado].filter(Boolean).join(" ")}</b>
            {" "}— separada de lo bueno del mismo módulo.
          </p>
        )}

        {/* ---------- LA BARRA QUE NO SE VA ----------
            «Anotar renglón» iba al final del formulario, y con cuatro
            bloques el final está fuera de la pantalla: cada estiba
            costaría bajar a buscarlo. Pegada abajo está siempre a un
            dedo, sin importar por dónde vaya el formulario.

            Y LLEVA LA CUENTA DEL BORRADOR AL LADO. Es la única cifra que
            se mira sin dejar de contar —cuántos van— y tenerla ahí
            ahorra cambiar de pestaña para averiguarlo. */}
        <div className="fe-barra-fija">
          <p className="fe-fija-cuenta">
            <b>{renglones.length}</b> en el borrador
          </p>
          <button type="button" className="btn grande" disabled={guardando} onClick={anotar}>
            {guardando ? "Guardando…" : corrigiendo ? "Guardar la corrección" : "Anotar renglón"}
          </button>
        </div>
      </section>

      {/* ---------- EL BORRADOR ---------- */}
      <section className="fe-recorrido" hidden={pestania !== "borrador"}>
        <div className="fe-rec-cab">
          <div>
            <h2>El borrador</h2>
            <p className="fe-rec-dice">
              Todo esto está guardado pero <b>todavía no se ha enviado</b>. Revísalo, corrige
              lo que haga falta, y mándalo cuando termines.
            </p>
          </div>
          <span>
            {renglones.length} renglón{renglones.length === 1 ? "" : "es"} ·{" "}
            {modulosHechos} módulo{modulosHechos === 1 ? "" : "s"} ·{" "}
            {nf.format(cajasTotal)} cajas
          </span>

          {/* ENVIAR, TAMBIÉN AQUÍ ARRIBA.
              Con ciento cincuenta renglones el botón de abajo queda a
              siete pantallazos de scroll, y el que ya revisó y solo
              quiere mandar tiene que recorrer toda la lista otra vez
              para llegar a él.

              SIGUEN SIENDO DOS Y ESO ESTÁ BIEN: son dos momentos
              distintos. Arriba es «ya revisé, mándalo»; abajo es «acabo
              de leer el último renglón y ya estoy ahí». Un solo botón
              obliga a rodar en una de las dos direcciones.

              Y los dos llaman a la MISMA función, con la misma
              confirmación: si fueran dos caminos distintos, uno de los
              dos acabaría saltándose el aviso. */}
          {renglones.length > 0 && (
            <button type="button" className="btn fe-mandar-ya" disabled={guardando}
                    onClick={enviar}>
              {guardando ? "Enviando…" : "Enviar el conteo"}
            </button>
          )}
        </div>

        {(cortos.length > 0 || semana.length > 0) && (
          <div className={"fe-alerta" + (cortos.length > 0 ? " mal" : "")}>
            {cortos.length > 0 && (
              <p>
                <b>{cortos.length} renglón{cortos.length > 1 ? "es" : ""} ya se pasó de su
                fecha de salida</b> — {cortos.slice(0, 6).map((r) => r.codigo).join(" · ")}
                {cortos.length > 6 && ` y ${cortos.length - 6} más`}. No es que esté vencido:
                es que ya no alcanza a llegar al cliente con vida útil suficiente.
              </p>
            )}
            {semana.length > 0 && (
              <p className="suave">
                Y {semana.length} sale{semana.length > 1 ? "n" : ""} esta semana —{" "}
                {semana.slice(0, 6).map((r) => r.codigo).join(" · ")}
                {semana.length > 6 && ` y ${semana.length - 6} más`}.
              </p>
            )}
          </div>
        )}

        {renglones.length > 0 && (
          <div className="fe-filtros">
            <label className="ancho">
              <span className="sr">Buscar por código o descripción</span>
              <input value={fCodigo} onChange={(e) => setFCodigo(e.target.value)}
                     placeholder="Código o descripción — 3128, aguila…" />
            </label>
            <label>
              <span className="sr">Calle</span>
              <select value={fCalle} onChange={(e) => { setFCalle(e.target.value); setFModulo("") }}>
                <option value="">Todas las calles</option>
                {callesB.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              <span className="sr">Módulo</span>
              <select value={fModulo} onChange={(e) => setFModulo(e.target.value)}>
                <option value="">Todos los módulos</option>
                {modulosB.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            {filtrando && (
              <button type="button" className="btn plano"
                      onClick={() => { setFCodigo(""); setFCalle(""); setFModulo("") }}>
                Quitar filtros
              </button>
            )}
          </div>
        )}

        {/* CUÁNTOS SE ESTÁN VIENDO, SIEMPRE QUE HAYA FILTRO. Sin esta
            línea, ver 3 de 150 se lee como «el borrador tiene 3», y
            sobre eso alguien envía el conteo creyendo que va completo. */}
        {filtrando && (
          <p className="fe-cuenta-filtro">
            {vistos.length} de {renglones.length} renglones. <b>Enviar manda los
            {" "}{renglones.length}</b>, no solo los que se ven.
          </p>
        )}

        {ubicacion && deAqui.length > 0 && !filtrando && (
          <p className="fe-aqui">
            En <b>{ubicacion.clave}</b> llevas {deAqui.length} renglón{deAqui.length > 1 ? "es" : ""}{" "}
            ({nf.format(cajasAqui)} cajas)
          </p>
        )}

        {renglones.length === 0 ? (
          <p className="fe-vacio">Todavía no has anotado nada. Escoge el módulo y arranca.</p>
        ) : (
          <>
            <div className="fe-lista">
              {vistos.length === 0 && (
                <p className="fe-vacio">Ningún renglón coincide con el filtro.</p>
              )}
              {vistos.map((r) => (
                <article key={r.id}
                         className={"fe-fila"
                           + (r.dias_para_salir != null && r.dias_para_salir < 0 ? " urgente" : "")
                           + (corrigiendo === r.id ? " tocando" : "")}>
                  <div className="fe-cab">
                    <b className="fe-cod">{r.codigo}</b>
                    <span className="fe-desc">{r.material}</span>
                    <span className="fe-ubi">{r.ubicacion_combinada ?? r.ubicacion}</span>
                    <button type="button" className="fe-mini" disabled={guardando}
                            onClick={() => corregir(r)}>Corregir</button>
                    <button type="button" className="fe-quitar chico" disabled={guardando}
                            onClick={() => borrar(r)}>Borrar</button>
                  </div>
                  <dl className="fe-cifras">
                    <div><dt>Total cajas</dt><dd>{nf.format(Number(r.total_cajas))}</dd></div>
                    {/* CÓMO SE CONTÓ, y no solo cuántas: «56» no dice si
                        son estibas o cajas, y con el saldo al lado la
                        diferencia entre 12 estibas y 12 cajas es de dos
                        órdenes de magnitud. */}
                    <div><dt>{r.cajas != null ? "Cajas" : r.saldo != null ? "Estibas + saldo" : "Estibas"}</dt>
                      <dd>{r.cajas != null ? r.cajas
                           : r.saldo != null ? `${r.estibas ?? 0} + ${r.saldo}`
                           : r.estibas}</dd></div>
                    <div><dt>Vence</dt>
                      <dd>{r.vencimiento
                        ? new Date(r.vencimiento + "T00:00:00").toLocaleDateString("es-CO")
                        : "—"}</dd></div>
                    {/* «DÍAS PARA SALIR» ES LA CIFRA DEL FEFO. No es cuándo
                        vence: es cuándo TIENE QUE HABER SALIDO para llegar
                        con vida útil suficiente. En negativo ya se pasó. */}
                    <div><dt>Días para salir</dt>
                      <dd className={r.dias_para_salir != null && r.dias_para_salir < 0 ? "falta" : undefined}>
                        {r.dias_para_salir ?? "—"}</dd></div>
                  </dl>
                </article>
              ))}
            </div>

            <div className="fe-enviar">
              <p>
                Al enviarlo queda firmado con tu nombre, la fecha y la hora, y{" "}
                <b>deja de poderse corregir</b>.
              </p>
              <button type="button" className="btn grande" disabled={guardando}
                      onClick={enviar}>
                {guardando ? "Enviando…" : `Enviar el conteo · ${renglones.length} renglones`}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
