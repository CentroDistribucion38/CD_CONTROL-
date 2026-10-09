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
import { usePosicion, sellar, type Foto } from "@/lib/evidencia";
import { useConfirmar } from "@/components/Confirmar";
import { useAvisos } from "@/components/Aviso";
import type { Material, Ubicacion, Renglon } from "@/modulos/inventario/fefo";
import { cifraDeTarjeta, soloElUltimo, type Cifra } from "@/modulos/inventario/ultimo-conteo";
import { hoyCo } from "@/modulos/inventario/tiempos";
import {
  AVISO_REPETIDO, esDuplicado, esFalloDeRed, guardarCola, leerCola, vaciarCola, yaEstaEnLaBase, type BorradorCola, type ItemCola, type Resultado,
} from "@/modulos/inventario/cola";
import { Ficha } from "./Ficha";
import { totalesDelConteo } from "@/modulos/inventario/totales-conteo";
import { MODULOS_DE_LA_HOJA, moduloConLados, modulosQueFaltan } from "@/modulos/inventario/modulos-hoja";

type Conteo = { id: string; codigo: string; estado: string; iniciado_en: string | null };

/* LO QUE SE CONTÓ LA ÚLTIMA VEZ EN ESTA POSICIÓN. Sale de
   `v_conteo_ultimo_por_ubicacion`: todos los renglones del ÚLTIMO
   conteo que tocó ese módulo, venga de ayer o de hace tres días. */
type Previo = {
  linea_id: string;
  producto_id?: string;
  /** Las cajas sueltas de «estibas + saldo» (la vista las trae aparte de `cajas`). */
  saldo?: number | null;
  /** El día de Bogotá en que se contó ESE renglón («aaaa-mm-dd»): lo contado hoy ya no falta. */
  linea_dia?: string;
  conteo_id: string;
  conteo_codigo: string | null;
  factor_estibado: number | null;
  codigo: string;
  material: string;
  contado_en: string;
  estibas: number | null;
  cajas: number | null;
  venc_dia: number | null;
  venc_mes: number | null;
  venc_anio: number | null;
  rotacion: boolean | null;
  averia: boolean;
  pnc: boolean;
  estado_envase: string | null;
  nota: string | null;
  total_cajas: number;
  /** FIFO del envase: desde qué día está en esta posición (la pone la base; nadie la escribe). */
  fecha_fifo?: string | null;
};

/* LOS CINCO ESTADOS DEL ENVASE, en el orden del proceso. Salen de la pregunta
   que va justo debajo de «Dónde» y ya no de «Datos adicionales». */
const ESTADOS_ENVASE = ["RETORNO", "LAVADO", "NUEVO", "BAJA", "EXTRASUCIO", "OTROS", "MAL ESTADO"] as const;
type MarcaModulo = { mezclado: boolean; sin_acceso: boolean; ruta: string | null };

/* LA CALCULADORA: las casillas de cantidad aceptan una cuenta —3×40+5, 12+8, (2+1)*40— además del número solo.
   Se evalúa a mano (suma, resta, multiplicación, división y paréntesis); no se usa eval. */
const OPERADOR = /[+\-−*/×÷xX()]/;
const calcular = (texto: string): number | null => {
  const t = texto.replace(/[×xX]/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/[\s,]/g, "");
  if (t === "" || !/^[0-9+\-*/().]+$/.test(t)) return null;
  let i = 0;
  const num = (): number | null => {
    if (t[i] === "(") { i++; const v = suma(); if (v == null || t[i] !== ")") return null; i++; return v }
    const ini = i;
    while (i < t.length && /[0-9.]/.test(t[i])) i++;
    if (i === ini) return null;
    const v = Number(t.slice(ini, i));
    return Number.isFinite(v) ? v : null;
  };
  const prod = (): number | null => {
    let v = num();
    while (v != null && (t[i] === "*" || t[i] === "/")) {
      const op = t[i++]; const w = num();
      if (w == null || (op === "/" && w === 0)) return null;
      v = op === "*" ? v * w : v / w;
    }
    return v;
  };
  const suma = (): number | null => {
    let v = prod();
    while (v != null && (t[i] === "+" || t[i] === "-")) {
      const op = t[i++]; const w = prod();
      if (w == null) return null;
      v = op === "+" ? v + w : v - w;
    }
    return v;
  };
  const r = suma();
  return r != null && i === t.length && Number.isFinite(r) ? r : null;
};
const ent = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  if (OPERADOR.test(t) && /[0-9]/.test(t) && !/^[xX]+$/.test(t)) {
    const r = calcular(t);
    return r != null && Number.isInteger(r) && r > 0 ? r : null;
  }
  const n = Number(t.replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
/** ¿Lo escrito es una cuenta (y no solo un número)? */
const esCuenta = (s: string) => OPERADOR.test(s.trim()) && /[0-9]/.test(s);
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
  /* PNC: ¿tiene rótulo? ¿tiene bloqueo mecánico? true = sí (cumple). null = sin contestar; solo aplica con PNC. */
  pncRotulo?: boolean | null; pncBloqueo?: boolean | null;
};
const VACIO: Borrador = {
  calle: "", base: "", lado: "", codigo: "", dia: "", mes: "", anio: "",
  modo: "estibas", estibas: "", saldo: "", cajas: "", rot: null,
  averia: false, pnc: false, estado: "", nota: "", pncRotulo: null, pncBloqueo: null,
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

/* DOS CIFRAS PARA ENSEÑAR, que no es lo mismo que las dos cifras que se
   teclean: `dosDigitos` recorta lo que entra y esto rellena lo que sale.
   El 5 de mayo se lee «05», no «5». */
const dd = (n: number | null) => n == null ? "··" : String(n).padStart(2, "0");

/* CUÁNTOS DÍAS HACE. Es lo que convierte una cifra en una alerta: «96
   estibas» no dice nada por sí solo; «96 estibas, hace 12 días» sí. */
function diasDesde(cuando: string | null): number | null {
  if (!cuando) return null;
  const f = new Date(cuando);
  if (Number.isNaN(f.getTime())) return null;
  const a = new Date(f.getFullYear(), f.getMonth(), f.getDate());
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((hoy.getTime() - a.getTime()) / DIA);
}

/* «30 estibas + 30 cajas», «50 estibas» o «120 cajas»: lo que hay, con las estibas completas primero. */
const textoCifra = (c: Cifra) => {
  const e = c.estibas ?? 0, x = c.cajas ?? 0;
  const est = `${nf.format(e)} estiba${e === 1 ? "" : "s"}`, caj = `${nf.format(x)} caja${x === 1 ? "" : "s"}`;
  return e > 0 && x > 0 ? `${est} + ${caj}` : e > 0 ? est : x > 0 || c.estibas == null ? caj : est;
};

const textoHace = (d: number) =>
  d <= 0 ? "hoy mismo" : d === 1 ? "ayer" : `hace ${d} días`;

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

  /* ---------- LA PRE-ANOTACIÓN ----------
     Lo que se contó la última vez en la posición escogida. No es
     historia: es el formulario ya lleno esperando un «sigue igual».
     Contar deja de ser escribir once campos y pasa a ser mirar la
     estiba y confirmar — o corregirle la cantidad, que es lo único que
     cambia casi siempre. */
  const [previo, setPrevio] = useState<Previo[]>([]);
  /* Se puede cerrar: el día que la posición cambió de material entero,
     las tarjetas estorban y hay que escribir de cero. */
  const [verPrevio, setVerPrevio] = useState(true);
  /* «DATOS ADICIONALES» PLEGADO. Estado del envase, rota, avería, PNC y
     observación salen en pocos renglones: van a un toque, y el renglón
     normal —dónde, qué, cuánto— cabe en la pantalla del celular sin
     rodar. Se abre solo al corregir un renglón que los traía. */
  const [mas, setMas] = useState(false);
  /* EL BORRADOR SE FILTRA. Ciento cincuenta renglones en una jornada, y
     buscar el 3128 que se anotó hace dos horas rodando la lista es como
     se termina corrigiendo el renglón equivocado. */
  const [fCodigo, setFCodigo] = useState("");
  const [fCalle, setFCalle] = useState("");
  const [fModulo, setFModulo] = useState("");
  const [b, setB] = useState<Borrador>(VACIO);

  /* ---------- LA FOTO DE UN RENGLÓN (evidencia) ----------
     Opcional y aparte del borrador: un Blob no cabe en el teléfono como
     texto, así que no se guarda con él. `fotoNueva` es la que se tomó para
     el renglón que se está anotando; `fotosDe` dice qué renglones YA
     tienen foto en la base (linea_id → ruta). Una por renglón: otra la
     reemplaza. */
  const { ubi: ubiFoto, direccion: dirFoto, pedir: pedirUbi } = usePosicion();
  const [fotoNueva, setFotoNueva] = useState<Foto | null>(null);
  const [sellando, setSellando] = useState(false);
  const [fotosDe, setFotosDe] = useState<Record<string, string>>({});
  const camaraNueva = useRef<HTMLInputElement>(null);
  /* ---------- ESTADO DEL MÓDULO: MEZCLADO · ACCESO ----------
     Son del MÓDULO dentro del recorrido y no de un renglón. `modulos` es lo
     que ya está en la base (ubicación → marca); `mod` es lo que se está
     contestando ahora; `fotoMod` es la evidencia que pide cualquiera de las
     dos respuestas. */
  const [marcasMod, setMarcasMod] = useState<Record<string, MarcaModulo>>({});
  const [modulosListos, setModulosListos] = useState(false);
  const [mod, setMod] = useState({ mezclado: false, sinAcceso: false });
  const [fotoMod, setFotoMod] = useState<Foto | null>(null);
  const camaraMod = useRef<HTMLInputElement>(null);
  const camaraFila = useRef<HTMLInputElement>(null);
  const filaDeFoto = useRef<string | null>(null);
  /* Las fotos de los renglones que quedaron PENDIENTES sin señal: viven en
     la memoria de la pantalla (no caben en el teléfono como texto), así
     que si se cierra la página antes de que vuelva la señal se pierden. */
  const fotosCola = useRef(new Map<string, Foto>());

  /* ---------- LA COLA SIN SEÑAL ----------
     Si la señal se cae con la pantalla abierta, cada renglón NUEVO que no
     se pueda mandar se guarda en el teléfono como «pendiente» y se sube
     solo cuando la señal vuelve (o con «Enviar ahora»). Lo ya anotado con
     señal no está aquí: ya está en la base, a salvo. Corregir un renglón
     que ya existe SÍ necesita señal. La lógica vive en
     modulos/inventario/cola.ts, para poder probarla sola. */
  const llaveCola = conteo ? `fefo.cola.${conteo.id}` : null;
  /* ARRANCA VACÍA Y SE LEE EN EL NAVEGADOR: el servidor no tiene el
     teléfono, y leerlo al renderizar haría que lo pintado en el servidor
     y lo del navegador no coincidieran. */
  const [cola, setCola] = useState<ItemCola<Borrador>[]>([]);
  const colaRef = useRef<ItemCola<Borrador>[]>([]);
  const [enLinea, setEnLinea] = useState(true);
  const [enviandoCola, setEnviandoCola] = useState(false);
  const colaOcupada = useRef(false);
  /* Lo pone `idDeLaPosicion` cuando lo que falló fue la RED y no la base. */
  const huboRed = useRef(false);
  const campoCalle = useRef<HTMLInputElement>(null);
  const campoCodigo = useRef<HTMLInputElement>(null);
  const grupoLado = useRef<HTMLDivElement>(null);
  /* LAS TRES CASILLAS DE LA FECHA SE CONOCEN ENTRE ELLAS: es lo que
     permite que el cursor pase solo de DD a MM y de MM a AA. */
  const campoDia = useRef<HTMLInputElement>(null);
  const campoMes = useRef<HTMLInputElement>(null);
  const campoAnio = useRef<HTMLInputElement>(null);
  /* LA CASILLA DE LA CANTIDAD, UNA SOLA REFERENCIA PARA LAS DOS.
     «Estibas completas» y «Cajas» no existen a la vez —son las dos
     formas de contar— así que solo una está montada en cada momento y
     la referencia apunta siempre a la que se ve. Con una referencia por
     casilla habría que preguntar en qué modo estamos cada vez que se
     salta, y ese `if` se olvida el día que aparezca un tercer modo. */
  const campoCantidad = useRef<HTMLInputElement>(null);
  const campoSaldo = useRef<HTMLInputElement>(null);
  /* LA CASILLA DE CANTIDAD EN LA QUE ESTÁ EL CURSOR: a ella van los signos de la calculadora. */
  const campoActivo = useRef<"estibas" | "saldo" | "cajas">("estibas");
  /* LA CALCULADORA SE VE: al tocar una cantidad sube un panel fijo al pie con el teclado completo (el del celular se
     suprime con `inputMode={escritorio ? "numeric" : "none"}`). `calcBajo` es lo que hay que subirlo si el navegador deja una barra o un teclado debajo. */
  const [calcAbierta, setCalcAbierta] = useState(false);
  const [calcBajo, setCalcBajo] = useState(0);
  /* EN EL COMPUTADOR NO HAY PANEL FLOTANTE: hay teclado de verdad, así que los números se escriben y la calculadora
     es solo la fila de signos bajo las casillas, siempre a la vista. */
  const [escritorio, setEscritorio] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px) and (hover: hover) and (pointer: fine)");
    const act = () => setEscritorio(mq.matches);
    act(); mq.addEventListener("change", act);
    return () => mq.removeEventListener("change", act);
  }, []);
  const [calcActiva, setCalcActiva] = useState<"estibas" | "saldo" | "cajas">("estibas");
  /* Sube de uno cada vez que hay que mandar el cursor a la cantidad.
     Es un contador y no un `true/false` porque hay que poder pedirlo
     dos veces seguidas: editar una tarjeta, arrepentirse, editar otra. */
  const [enfocarCantidad, setEnfocarCantidad] = useState(0);
  /* De dónde salió lo que está en el renglón: de una tarjeta que sigue
     igual, de una a la que solo le cambia la cantidad, o de teclearlo. */
  const [desdeTarjeta, setDesdeTarjeta] = useState<"igual" | "cantidad" | null>(null);
  const botonAnotar = useRef<HTMLButtonElement>(null);

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
    /* EL SALTO LO DISPARA LO QUE QUEDÓ DENTRO, NO LO QUE SE TECLEÓ. Con
       `v.length` el cursor se iba al mes con un solo dígito adentro: el
       lector de código de barras y el autocompletado del teléfono meten
       caracteres que `dosDigitos` bota, y lo tecleado medía dos cuando
       la casilla tenía uno. Se veía «Vence 2/09/27» y nadie entendía
       qué había pasado. */
    if (limpio.length !== 2) return;
    if (siguiente?.current) {
      siguiente.current.focus();
      siguiente.current.select();
      return;
    }
    /* SI NO HAY SIGUIENTE, SE SUELTA EL FOCO. Es la red: hoy el año sí
       tiene siguiente —la cantidad— pero si un día no la tuviera, dejar
       el cursor ahí con el teclado abierto taparía el total y los días
       para salir, que es lo que hay que mirar al terminar. Soltar el
       foco es lo único que cierra el teclado de un celular; no hay
       forma de pedírselo directamente. */
    document.activeElement instanceof HTMLElement && document.activeElement.blur();
  }

  /* EL SALTO CON ENTER, para las casillas cuyo largo NO se sabe.
     El día, el mes y el año saltan solos porque son dos dígitos y ahí
     se acaban. El código puede ser 3128 o 17740, y las estibas 8 o 112:
     saltar por el largo ahí sería adivinar y dejaría a medias la mitad
     de los renglones. Con Enter lo dice quien escribe, que es el único
     que sabe que ya terminó.

     OJO: el teclado numérico de iPhone no trae Enter. Por eso ESTE
     salto es el de conveniencia y el de la fecha es el que de verdad
     encadena el renglón — ese sí funciona en todos. */
  /** Resuelve la cuenta de una casilla: «3×40+5» queda en «125». Lo que no es una cuenta válida se deja como está. */
  function resolverCuenta(k: "estibas" | "saldo" | "cajas") {
    setB((x) => {
      const t = x[k];
      if (!esCuenta(t)) return x;
      const r = ent(t);
      return r == null ? x : { ...x, [k]: String(r) };
    });
  }
  /** Un signo de la calculadora, donde está el cursor de la casilla activa. */
  function signo(op: string) {
    const k = campoActivo.current;
    const el = k === "saldo" ? campoSaldo.current : campoCantidad.current;
    if (op === "=") { resolverCuenta(k); el?.focus(); return }
    const ini = el?.selectionStart ?? b[k].length, fin = el?.selectionEnd ?? ini;
    const nuevo = b[k].slice(0, ini) + op + b[k].slice(fin);
    pon(k, nuevo);
    setTimeout(() => { el?.focus(); el?.setSelectionRange(ini + op.length, ini + op.length) }, 0);
  }
  function borrarUno() {
    const k = campoActivo.current;
    const el = k === "saldo" ? campoSaldo.current : campoCantidad.current;
    const ini = el?.selectionStart ?? b[k].length, fin = el?.selectionEnd ?? ini;
    const desde = fin > ini ? ini : Math.max(0, ini - 1);
    pon(k, b[k].slice(0, desde) + b[k].slice(fin));
    setTimeout(() => { el?.focus(); el?.setSelectionRange(desde, desde) }, 0);
  }

  function abrirCalc(k: "estibas" | "saldo" | "cajas", el: HTMLInputElement) {
    campoActivo.current = k;
    setCalcActiva(k);
    setCalcAbierta(true);
    /* con el panel arriba, la casilla tiene que quedar a la vista y no detrás de él */
    setTimeout(() => el.scrollIntoView({ block: "center" }), 60);
  }
  /** Al salir de una cantidad: se resuelve la cuenta y, si el cursor no pasó a otra cantidad, la calculadora baja. */
  function soltarCalc(k: "estibas" | "saldo" | "cajas") {
    resolverCuenta(k);
    setTimeout(() => {
      if (!(document.activeElement as HTMLElement | null)?.closest?.(".fe-cuanto-campo")) setCalcAbierta(false);
    }, 0);
  }
  function listoCalc() {
    const k = campoActivo.current;
    resolverCuenta(k);
    setCalcAbierta(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
  useEffect(() => {
    if (!calcAbierta) { setCalcBajo(0); return }
    const vv = window.visualViewport;
    if (!vv) return;
    const medir = () => setCalcBajo(Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop))));
    medir();
    vv.addEventListener("resize", medir); vv.addEventListener("scroll", medir);
    return () => { vv.removeEventListener("resize", medir); vv.removeEventListener("scroll", medir) };
  }, [calcAbierta]);

  function saltaCon(e: KeyboardEvent<HTMLInputElement>,
                    destino?: RefObject<HTMLInputElement | null>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (destino?.current) { destino.current.focus(); destino.current.select(); return }
    /* Sin destino, Enter cierra el teclado: es el final de la cadena y
       lo que sigue es mirar el total. */
    e.currentTarget.blur();
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
    () => [...new Set([...ubicaciones.filter((u) => u.activa).map((u) => u.calle), ...Object.keys(MODULOS_DE_LA_HOJA)])].sort(ordenCalle),
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
    /* Y LOS QUE TRAE LA HOJA Y EL MAESTRO TODAVÍA NO (PASILLO, TANDEM, DEPA, PALE, H…): se
       ofrecen igual y la base los da de alta al anotar. Lo que ya estaba no cambia. */
    for (const f of modulosQueFaltan(ubicaciones.filter((u) => u.activa), b.calle)) {
      const k = claveBase(f);
      if (!m.has(k)) m.set(k, { base: k, calle: f.calle, modulo: f.modulo, familia: null });
    }
    return [...m.values()].sort((x, y) =>
      ordenCalle(x.calle, y.calle) ||
      x.modulo.localeCompare(y.modulo, "es", { numeric: true }));
  }, [ubicaciones, b.calle]);

  /* SIEMPRE IZQUIERDO Y DERECHO.

     Antes salían solo los lados que el maestro tenía cargados, y la
     bodega tiene módulos a medias: A01 existe como A01_IZQ y no como
     A01_DER, así que el lado derecho de ese pasillo no se podía contar.
     Quien está parado frente al módulo ve los dos lados; la pantalla
     tiene que ofrecerle los dos.

     EL LADO QUE NO ESTÉ EN EL MAESTRO SE DA DE ALTA AL ANOTAR —lo hace
     `conteo_ubicacion_asegurar`— heredando familia y capacidad del otro
     lado del mismo módulo. La pantalla no escribe en el maestro: pide.

     LA EXCEPCIÓN, Y ES DE VERDAD: un módulo cuyo maestro dice que NO
     tiene lados —EST07, JAULA_PNC— se respeta tal cual. Inventarle
     izquierdo y derecho crearía dos posiciones que en la bodega no
     existen, y el conteo de ese sitio quedaría partido en dos para
     siempre. */
  const lados = useMemo(() => {
    const delModulo = ubicaciones.filter((u) => u.activa && claveBase(u) === b.base);
    if (delModulo.length > 0 && delModulo.every((u) => (u.lado ?? "") === "")) return [""];
    /* Un módulo de la hoja que el maestro no tiene: un pasillo o un tándem no tienen lados. */
    if (delModulo.length === 0 && b.base && !moduloConLados(b.base.split("|")[1] ?? "")) return [""];
    return ["IZQ", "DER"];
  }, [ubicaciones, b.base]);

  /* LA UBICACIÓN SALE DE MÓDULO + LADO, Y PUEDE NO EXISTIR TODAVÍA.
     Desde que la pantalla ofrece siempre los dos lados, escoger el
     derecho de un módulo cargado a medias no encuentra fila — y eso ya
     no es un error: la fila se crea al anotar. Por eso aquí puede salir
     `null` sin que nada esté mal, y quien decide si falta algo es
     `revisar()`, que mira el LADO escogido y no la fila. */
  const ubicacion = useMemo(() => {
    if (!b.base) return null;
    const delModulo = ubicaciones.filter((u) => u.activa && claveBase(u) === b.base);
    if (delModulo.length === 1 && (delModulo[0].lado ?? "") === "") return delModulo[0];
    return delModulo.find((u) => (u.lado ?? "") === b.lado) ?? null;
  }, [ubicaciones, b.base, b.lado]);

  /* La clave que va a tener la posición escogida, exista o no. Es lo que
     se enseña en «va a quedar como» y lo que se manda a crear. */
  const claveEscogida = useMemo(() => {
    if (!b.base) return null;
    const [calle, modulo] = b.base.split("|");
    if (lados.length === 1 && lados[0] === "") return `${calle}${modulo}`;
    if (!b.lado) return null;
    return `${calle}${modulo}_${b.lado}`;
  }, [b.base, b.lado, lados]);

  /* El material se reconoce MIENTRAS SE TECLEA.

     VA COMO FUNCIÓN DE UN BORRADOR Y NO SOLO DEL QUE SE ESTÁ TECLEANDO
     porque confirmar una pre-anotación guarda un renglón que NUNCA pasó
     por las casillas: sale de la tarjeta y se va derecho a la base. Si
     el guardado leyera el material «el que se está tecleando», al
     confirmar leería el del renglón anterior. */
  const materialDe = (bb: Borrador) =>
    materiales.find((m) => m.activo && m.sku === bb.codigo.trim()) ?? null;
  /* «SI ESCRIBO EL CÓDIGO, ¿POR QUÉ NO SALTA A VENCE?» Salta solo cuando
     el código ya es uno del maestro y NINGÚN otro empieza igual: con
     «312» no salta porque puede ser 3128 o 3129; con «3128» sí.

     Y SIEMPRE A VENCE, TAMBIÉN EN ENVASE. Antes el envase se iba derecho
     a la cantidad «porque no trae fecha», y eso partía el renglón en dos
     caminos: con Enter el cursor caía en Vence y tecleando el código
     completo caía en Cajas. Quien cuenta no sabe cuál de los dos le va a
     tocar, así que teclea la cantidad encima de la fecha o la fecha
     encima de la cantidad. Un solo camino: código → vence → cantidad.
     El envase que de verdad no trae fecha se salta las tres casillas con
     Enter, que es un dedo, no un renglón perdido. */
  function saltarSiCompleto(v: string) {
    const c = v.trim();
    if (!c) return;
    const activos = materiales.filter((m) => m.activo);
    const exacto = activos.find((m) => m.sku === c);
    if (!exacto || activos.some((m) => m.sku !== c && m.sku.startsWith(c))) return;
    setTimeout(() => campoDia.current?.focus(), 0);
  }
  const material = useMemo(() => materialDe(b),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [materiales, b.codigo]);
  /* EL MODO SE ESCOGE SOLO: con factor de estiba se cuenta en estibas + saldo; sin factor —las estibas darían cero— se
     cuenta en cajas. Una tarjeta que venía en cajas conserva su modo mientras tenga cajas escritas. */
  const sinFactor = !!material && material.cajas_por_estiba == null;
  useEffect(() => {
    if (sinFactor && b.modo === "estibas") setB((x) => ({ ...x, modo: "cajas" }));
    else if (!sinFactor && b.modo === "cajas" && b.cajas.trim() === "") setB((x) => ({ ...x, modo: "estibas" }));
  }, [sinFactor, b.modo, b.cajas]);
  /* EL CILINDRO (CO2) TAMBIÉN PIDE ESTADO, pero no es RETORNO/LAVADO…: es LLENO o VACÍO. Sin fecha de vencimiento. */
  const esCilindro = /cilindro/i.test(material?.tipo_envase ?? "");
  const esEnvase = material?.tipo_material === "ENVASE" || esCilindro;
  const OPCIONES_ESTADO: readonly string[] = esCilindro ? ["LLENO", "VACÍO"] : ESTADOS_ENVASE;

  /* ---------- LA LISTA DEL CÓDIGO, FILTRADA MIENTRAS SE TECLEA ---------- */
  const [sugAbierta, setSugAbierta] = useState(false);
  const [sugActiva, setSugActiva] = useState(0);
  const sugerencias = useMemo(() => {
    const q = b.codigo.trim().toLowerCase();
    if (!q) return [];
    const act = materiales.filter((m) => m.activo);
    const empieza = act.filter((m) => m.sku.toLowerCase().startsWith(q));
    const resto = act.filter((m) => !m.sku.toLowerCase().startsWith(q)
      && (m.sku.toLowerCase().includes(q) || m.nombre.toLowerCase().includes(q)));
    return [...empieza, ...resto].slice(0, 8);
  }, [materiales, b.codigo]);
  /* Ya es el código entero y no hay otro que empiece igual: no hay nada que escoger. */
  const codigoCerrado = sugerencias.length === 1 && sugerencias[0].sku.toLowerCase() === b.codigo.trim().toLowerCase();
  const verSug = sugAbierta && sugerencias.length > 0 && !codigoCerrado;
  function escogerCodigo(sku: string) {
    pon("codigo", sku);
    setSugAbierta(false);
    setTimeout(() => campoDia.current?.focus(), 0);
  }

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
  const cuentaDe = (bb: Borrador, mat: Material | null) => {
    if (bb.modo === "cajas") {
      const c = ent(bb.cajas);
      return c == null ? null : { formula: `${nf.format(c)}`, total: c };
    }
    const e = ent(bb.estibas), s = ent(bb.saldo);
    if (e == null && s == null) return null;
    const f = mat?.cajas_por_estiba ?? null;
    if (e != null && f == null) return { formula: null, total: null };
    const total = (e ?? 0) * (f ?? 0) + (s ?? 0);
    const partes = [e != null ? `${e} × ${f}` : null, s != null ? nf.format(s) : null]
      .filter(Boolean).join(" + ");
    return { formula: partes, total };
  };
  const cuenta = useMemo(() => cuentaDe(b, material),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [b.modo, b.estibas, b.saldo, b.cajas, material]);

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
  /* SE PIDE AL ESCOGER LA POSICIÓN, no al abrir la pantalla. Traer las
     428 de una sería una consulta enorme para enseñar tres renglones.

     `vivo` corta la respuesta que llega tarde: escogiendo módulo tras
     módulo, la de A01 puede aterrizar DESPUÉS de la de A02 y dejar en
     pantalla la pre-anotación del módulo anterior — con la de al lado
     delante, eso es contar una estiba creyendo que es otra. */
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!ubicacion) { setPrevio([]); return }
      const { data } = await supabase.from("v_conteo_ultimo_por_ubicacion")
        .select("*").eq("ubicacion_id", ubicacion.id);
      if (vivo) { setPrevio(soloElUltimo((data ?? []) as Previo[])); setVerPrevio(true) }
    })();
    return () => { vivo = false };
  }, [supabase, ubicacion]);

  useEffect(() => {
    if (enfocarCantidad === 0) return;
    campoCantidad.current?.focus();
    campoCantidad.current?.select();
  }, [enfocarCantidad]);

  /* DE UNA PRE-ANOTACIÓN A UN RENGLÓN TECLEADO. Es el mismo objeto que
     se llena a mano, así que confirmar y escribir acaban en el mismo
     sitio: una sola forma de anotar, no dos que pueden discrepar. */
  const desdePrevio = (p: Previo): Borrador => ({
    ...b,
    codigo: p.codigo,
    dia: p.venc_dia == null ? "" : String(p.venc_dia).padStart(2, "0"),
    mes: p.venc_mes == null ? "" : String(p.venc_mes).padStart(2, "0"),
    anio: p.venc_anio == null ? "" : String(p.venc_anio).padStart(2, "0"),
    modo: p.cajas != null ? "cajas" : "estibas",
    estibas: p.estibas == null ? "" : String(p.estibas),
    /* EL SALDO VIAJA CON LA TARJETA: antes se perdía al confirmar «sigue igual». */
    saldo: p.saldo == null ? "" : String(p.saldo),
    cajas: p.cajas == null ? "" : String(p.cajas),
    rot: p.rotacion,
    averia: p.averia, pnc: p.pnc,
    estado: p.estado_envase ?? "",
    nota: p.nota ?? "",
  });

  /* YA CONTADO EN ESTE RECORRIDO. Una tarjeta que ya se anotó hoy tiene
     que decirlo: confirmarla otra vez sería un renglón repetido, y la
     base lo rechazaría con un mensaje que no habla de esto. */
  const yaHoy = (p: Previo) => renglones.some((r) =>
    r.ubicacion === claveEscogida && r.codigo === p.codigo &&
    (r.venc_dia ?? null) === p.venc_dia && (r.venc_mes ?? null) === p.venc_mes &&
    (r.venc_anio ?? null) === p.venc_anio);

  /* LO PENDIENTE DE LA UBICACIÓN. La pre-anotación trae el último renglón de cada material de ahí, venga del conteo que
     venga. Lo que YA se contó hoy no falta: se dice aparte («1 ya contado hoy») y las tarjetas son solo las que faltan
     —de cuatro, si se confirma uno, salen los tres—. Mañana vuelven a salir los cuatro. */
  const hoyDia = hoyCo();
  const diaDe = (p: Previo) => p.linea_dia
    ?? new Date(p.contado_en).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const hechoHoy = (p: Previo) => diaDe(p) >= hoyDia || yaHoy(p);
  const cifraPrevia = (p: Previo) => cifraDeTarjeta({ ...p, cajas: p.cajas ?? p.saldo ?? null });
  const pendientes = previo.filter((p) => !hechoHoy(p));
  const hechosHoy = previo.filter((p) => hechoHoy(p));
  const masReciente = previo.reduce<Previo | null>((m, p) => (!m || Date.parse(p.contado_en) > Date.parse(m.contado_en) ? p : m), null);

  /** «YA NO ESTÁ»: el material salió de la ubicación. Deja de salir como pendiente hasta que se vuelva a contar. */
  async function yaNoEsta(pv: Previo) {
    if (!conteo || !ubicacion || !pv.producto_id) return;
    const ok = await pedir({
      titulo: "¿Ya no está aquí?",
      dice: <>{pv.codigo} · {pv.material} salió de {claveEscogida}. Deja de aparecer como pendiente en esta ubicación hasta que se vuelva a contar.</>,
      confirmar: "Ya no está",
    });
    if (!ok) return;
    setGuardando(true);
    const { error } = await supabase.from("conteo_retirados").insert({
      conteo_id: conteo.id, ubicacion_id: ubicacion.id, producto_id: pv.producto_id,
      venc_dia: pv.venc_dia, venc_mes: pv.venc_mes, venc_anio: pv.venc_anio,
      estado_envase: pv.estado_envase, averia: pv.averia, pnc: pv.pnc,
    });
    setGuardando(false);
    if (error) {
      avisar.mal(/does not exist|schema cache|Could not find/i.test(error.message)
        ? "Falta correr el SQL 2026-10-conteo-pendientes-por-ubicacion.sql para poder marcar «ya no está»."
        : error.message);
      return;
    }
    setPrevio((x) => x.filter((p) => p.linea_id !== pv.linea_id));
    avisar.bien("Listo: ya no sale como pendiente aquí.");
  }

  /**
   * DESPUÉS DE ANOTAR SE VACÍA EL RENGLÓN Y SE QUEDA EL SITIO.
   *
   * Lo devolvió dos veces antes —dejar la calle y el módulo puestos— y
   * las dos veces tenía razón: un campo lleno del renglón anterior no se
   * ve como un campo por llenar, se ve como uno ya contestado, y un
   * renglón anotado en el módulo equivocado no da error, no avisa, y
   * aparece cuadrando el mes.
   *
   * Lo que cambió es que AHORA EL SITIO SE VE. Al escoger la posición
   * salen las tarjetas de lo que se contó ahí la última vez, con la
   * calle, el módulo y el lado escritos en grande encima. El sitio dejó
   * de ser tres campos que se arrastran en silencio y pasó a ser lo que
   * se está mirando; y el cursor vuelve a «Calle», que es lo que pidió,
   * así que cambiarlo es un toque y no hay que ir a buscarlo.
   *
   * `dejarSitio` es false en todo lo demás —«dejarlo como estaba»,
   * cerrar el recorrido, borrar el renglón que se estaba corrigiendo—
   * porque ahí no se sigue contando en el mismo módulo.
   */
  function limpiar(dejarSitio = false) {
    setCorrigiendo(null);
    setDesdeTarjeta(null);
    setMas(false);
    setFotoNueva((x) => { if (x) URL.revokeObjectURL(x.url); return null });
    /* «ME TOCA AGREGAR COMO ANTES DONDE UBICO EL PRODUCTO.» En un módulo caben varios códigos (y el mismo se puede
       volver a poner), así que después de anotar se queda TODA la ubicación —calle, módulo y lado— y el cursor va
       derecho al código. Para otro módulo se cambia la ubicación, no antes. */
    setB((x) => dejarSitio
      ? { ...VACIO, calle: x.calle, base: x.base, lado: x.lado }
      : VACIO);
    /* Y se borra el guardado: el renglón ya quedó en la base, así que
       restaurarlo mañana sería ofrecer volver a anotar algo que ya está
       anotado. */
    try { if (llave) localStorage.removeItem(llave) } catch { /* da igual */ }
    /* Con la ubicación puesta, el cursor va al CÓDIGO; si se limpió todo, vuelve a calle (el único campo que no
       levanta teclado, así no tapa las tarjetas de la pre-anotación que hay justo debajo). */
    if (dejarSitio && b.base) setTimeout(() => campoCodigo.current?.focus(), 0);
    else campoCalle.current?.focus();
  }

  /* LA UBICACIÓN DE QUIEN EMPIEZA. Se pide al tocar «Empezar a contar» —sin otro botón— y se manda UNA vez
     por conteo (2026-10-conteo-ubicacion-recorrido.sql). Si dice que no, o el celular no puede, también se
     anota por qué: el Tablero muestra «Sin ubicación». No frena el conteo: en la bodega la señal falla. */
  function posicionDeInicio(): Promise<{ estado: "ok" | "denegada" | "no_disponible" | "tiempo"; lat?: number; lng?: number; precision?: number }> {
    return new Promise((res) => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) { res({ estado: "no_disponible" }); return }
      navigator.geolocation.getCurrentPosition(
        (p) => res({ estado: "ok", lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
        (e) => res({ estado: e.code === e.PERMISSION_DENIED ? "denegada" : e.code === e.TIMEOUT ? "tiempo" : "no_disponible" }),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  }

  async function abrir() {
    setGuardando(true);
    const pos = posicionDeInicio(); /* arranca ya, en paralelo: no hace esperar al abrir */
    const { data, error } = await supabase.rpc("conteo_fefo_abrir", { p_bodega: bodegaId });
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }
    const id = data as string;
    setConteo({ id, codigo: "…", estado: "en_proceso", iniciado_en: null });
    void pos.then((u) => supabase.rpc("conteo_fefo_posicion", {
      p_conteo: id, p_lat: u.lat ?? null, p_lng: u.lng ?? null, p_precision: u.precision ?? null, p_estado: u.estado,
    }));
    router.refresh();
  }

  async function releer(id: string): Promise<Renglon[] | null> {
    const { data, error } = await supabase.from("v_conteo_fefo").select("*")
      .eq("conteo_id", id).order("contado_en", { ascending: false }).limit(2000);
    /* SIN SEÑAL NO SE PISA LO QUE HAY: una lectura que falla no puede
       dejar la lista en blanco. */
    if (error || !data) return null;
    setRenglones(data as Renglon[]);
    return data as Renglon[];
  }

  function revisar(bb: Borrador): string | null {
    const mat = materialDe(bb);
    const cil = /cilindro/i.test(mat?.tipo_envase ?? "");
    const env = mat?.tipo_material === "ENVASE" || cil;
    if (!bb.base) return "Escoge el módulo.";
    /* SE MIRA EL LADO ESCOGIDO Y NO LA FILA DEL MAESTRO. Desde que la
       pantalla ofrece siempre los dos, el derecho de un módulo cargado
       a medias no tiene fila todavía — y eso no es que falte contestar,
       es que hay que crearla. */
    if (!claveEscogida) return "Falta decir de qué lado del módulo.";
    if (mod.sinAcceso) return "Este módulo está marcado «sin acceso»: usa «Anotar módulo sin acceso».";
    if (mod.mezclado && !fotoMod && !marcaGuardada?.ruta) return "Módulo mezclado: falta la foto de evidencia.";
    if (!mat) return `El código «${bb.codigo}» no está en el maestro.`;
    if (env && bb.estado.trim() === "") return cil ? "Falta decir si el cilindro está lleno o vacío." : "Falta el estado del envase.";
    if (bb.modo === "cajas" ? (bb.cajas.trim() !== "" && ent(bb.cajas) == null) : ((bb.estibas.trim() !== "" && ent(bb.estibas) == null) || (bb.saldo.trim() !== "" && ent(bb.saldo) == null)))
      return "No entiendo la cuenta: revisa los números y los signos (+ − × ÷), y que el resultado sea un entero.";
    if (bb.averia && !fotoNueva && !(corrigiendo && fotosDe[corrigiendo])) return "Avería: falta la foto de evidencia.";
    if (bb.pnc && (bb.pncRotulo == null || bb.pncBloqueo == null)) return "PNC: falta contestar si tiene rótulo y si tiene bloqueo mecánico.";
    if (env && estadosUsados.has(bb.estado.trim().toUpperCase())) return `Ya contaste ${bb.codigo.trim()} como ${bb.estado.trim()} en ${claveEscogida}: escoge otro estado o corrige ese renglón.`;
    if (bb.modo === "cajas") {
      if (ent(bb.cajas) == null) return "¿Cuántas cajas?";
    } else if (ent(bb.estibas) == null && ent(bb.saldo) == null) {
      return "¿Cuántas estibas? Si solo quedan sueltas, anótalas en el saldo.";
    }
    /* DE «CÓMO ESTÁ» EN ADELANTE NO SE VALIDA NADA. Rotación, avería,
       PNC, estado del envase y observación: si no se marca, no pasa
       nada. Aquí estaba «Falta decir si rota» y frenaba el renglón por
       una pregunta que ahora se contesta sola — no marcarla ES decir
       que no. Un aviso que para el renglón por algo que no cambia la
       cifra es un aviso que la gente aprende a esquivar. */
    if (!env && (ent(bb.dia) == null || ent(bb.mes) == null || bb.anio.trim() === ""))
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
    if (!env || bb.anio.trim() !== "") {
      const d = ent(bb.dia), m = ent(bb.mes);
      const a = bb.anio.trim() === "" ? null : Number(bb.anio.trim());
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

  /* EL ID DE LA POSICIÓN, CREÁNDOLA SI EL MAESTRO NO LA TIENE.
     La pantalla no escribe en el maestro —quien cuenta no lo
     administra—: le pide a la base que se asegure de que esa posición
     exista y le devuelva su id. Si ya existía, devuelve la de siempre;
     nunca hay dos filas para el mismo sitio. */
  async function idDeLaPosicion(bb: Borrador): Promise<string | null> {
    if (ubicacion) return ubicacion.id;
    const [calle, modulo] = bb.base.split("|");
    const { data, error } = await supabase.rpc("conteo_ubicacion_asegurar", {
      p_bodega: bodegaId, p_calle: calle, p_modulo: modulo, p_lado: bb.lado || null,
    });
    if (error) {
      if (esFalloDeRed(error.message)) { huboRed.current = true; return null }
      avisar.mal(/does not exist|schema cache/i.test(error.message)
        ? "Falta correr supabase/migraciones/2026-09-conteo-preanotacion.sql en Supabase."
        : error.message);
      return null;
    }
    return data as string;
  }

  const argumentos = (bb: Borrador, mat: Material, idUbicacion: string) => ({
    p_sku: mat.sku,
    p_ubicacion: idUbicacion,
    /* NO MARCAR ES DECIR QUE NO, y eso se decide AQUÍ y se manda
       resuelto. La base sigue rechazando el nulo —«Falta decir si
       rota»— y así queda como red de seguridad: si algún día otra
       pantalla deja de contestarlo, se entera en vez de guardar una
       columna en blanco que nadie sabe leer. */
    p_rotacion: bb.rot === true,
    /* LAS ESTIBAS Y EL SALDO VIAJAN JUNTOS; las cajas, solas. Son las
       dos formas de contar un módulo, y mezclarlas dejaría el renglón
       sin decir cómo se contó — eso lo rechaza también la base. */
    p_estibas: bb.modo === "estibas" ? ent(bb.estibas) : null,
    p_saldo: bb.modo === "estibas" ? ent(bb.saldo) : null,
    p_cajas: bb.modo === "cajas" ? ent(bb.cajas) : null,
    /* SE MANDA EL VENCIMIENTO, que es lo que se lee en el cartón y lo que
       lleva años anotándose en la hoja. Los días para salir y para vencer
       los calcula la vista con el mínimo T1 del maestro: una sola
       fórmula, en un solo sitio. */
    p_venc_dia: ent(bb.dia),
    p_venc_mes: ent(bb.mes),
    p_venc_anio: bb.anio.trim() !== "" ? Number(bb.anio.trim()) : null,
    p_fab_dia: null,
    p_fab_mes: null,
    p_fab_anio: null,
    p_averia: bb.averia, p_pnc: bb.pnc,
    p_estado: bb.estado || null,
    p_nota: bb.nota.trim() || null,
  });

  /**
   * «OTRA VEZ LO MISMO EN EL MISMO SITIO»: SE SUMA, NO SE RECHAZA.
   *
   * Caso real: en A01 izquierda hay 30 estibas de 3500888 y, más allá, otras 25 del mismo material,
   * mismo estado y misma fecha. La base no deja DOS renglones iguales —esa llave única es lo que
   * evita contar dos veces lo mismo cuando se corta la señal y el teléfono reenvía—, y por eso antes
   * solo se rechazaba con «corrige el que ya está». Ahora se pregunta: «ya hay 30; con 25 quedan 55»,
   * y si quien cuenta dice que sí, se corrige ese renglón con la suma. La llave sigue intacta.
   * Solo se suma estibas con estibas (y saldo con saldo) o cajas con cajas: mezclar las dos formas
   * de contar no tiene una suma honesta, y eso se dice.
   */
  async function sumarAlQueYaEsta(bb: Borrador, mat: Material, idU: string, foto: Foto | null) {
    if (!conteo) return;
    const lista = (await releer(conteo.id)) ?? renglones;
    const anio = bb.anio.trim() !== "" ? Number(bb.anio.trim()) : null;
    const ex = lista.find((x) =>
      x.codigo === mat.sku && x.ubicacion_id === idU &&
      (x.estado_envase ?? "") === (bb.estado || "") &&
      (x.venc_dia ?? null) === ent(bb.dia) && (x.venc_mes ?? null) === ent(bb.mes) && (x.venc_anio ?? null) === anio &&
      !!x.averia === !!bb.averia && !!x.pnc === !!bb.pnc);
    if (!ex) { avisar.mal(AVISO_REPETIDO); return }

    const nuevoEst = bb.modo === "estibas" ? ent(bb.estibas) : null;
    const nuevoSal = bb.modo === "estibas" ? ent(bb.saldo) : null;
    const nuevoCaj = bb.modo === "cajas" ? ent(bb.cajas) : null;
    if (nuevoEst == null && nuevoSal == null && nuevoCaj == null) { avisar.mal(AVISO_REPETIDO); return }
    const dePuestas = (ex.cajas != null) && ex.estibas == null && ex.saldo == null;
    if ((bb.modo === "estibas" && dePuestas) || (bb.modo === "cajas" && !dePuestas)) {
      avisar.mal("El renglón que ya está se contó de otra forma (" + (dePuestas ? "en cajas" : "en estibas") +
        ") y este de la otra: no se pueden sumar. Corrige uno en «El borrador».");
      return;
    }
    const suma = (a: number | null, b: number | null) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));
    const sEst = suma(ex.estibas, nuevoEst), sSal = suma(ex.saldo, nuevoSal), sCaj = suma(ex.cajas, nuevoCaj);
    const dice = (e: number | null, sa: number | null, c: number | null) =>
      bb.modo === "cajas" ? `${nf.format(c ?? 0)} cajas` : `${nf.format(e ?? 0)} estibas${sa != null ? ` + saldo ${nf.format(sa)}` : ""}`;
    const ok = await pedir({
      titulo: "Ya hay uno igual: ¿sumarlo?",
      dice: (<>
        En <b>{ex.ubicacion_combinada ?? ex.ubicacion ?? "ese módulo"}</b> ya está anotado <b>{mat.sku}</b>
        {bb.estado ? <> ({bb.estado})</> : null} con <b>{dice(ex.estibas, ex.saldo, ex.cajas)}</b>.
        Con lo que acabas de poner (<b>{dice(nuevoEst, nuevoSal, nuevoCaj)}</b>) quedaría en <b>{dice(sEst, sSal, sCaj)}</b>.
      </>),
      confirmar: "Sumar", cancelar: "No sumar",
    });
    if (!ok) return;

    const unido: Borrador = {
      ...bb,
      estibas: sEst == null ? "" : String(sEst), saldo: sSal == null ? "" : String(sSal), cajas: sCaj == null ? "" : String(sCaj),
      rot: bb.rot ?? ex.rotacion ?? null,
      nota: [ex.nota, bb.nota.trim()].filter((t, i, a) => t && a.indexOf(t) === i).join(" · "),
    };
    setGuardando(true);
    const { error } = await supabase.rpc("conteo_fefo_editar", { p_linea: ex.id, ...argumentos(unido, mat, idU) });
    setGuardando(false);
    if (error) {
      avisar.mal(esFalloDeRed(error.message) ? "Sin señal: sumar a un renglón que ya está necesita conexión. Intenta de nuevo con señal." : error.message);
      return;
    }
    if (bb.pnc) {
      const malP = await guardarPoliticaPnc(ex.id, bb);
      if (malP) avisar.mal(`${mat.sku} quedó sumado, pero ${malP.charAt(0).toLowerCase()}${malP.slice(1)} Corrígelo en «El borrador».`);
    }
    if (foto) {
      const malF = await subirFoto(ex.id, foto);
      if (malF) avisar.mal(`${mat.sku} quedó sumado, pero ${malF.charAt(0).toLowerCase()}${malF.slice(1)} Agrégala desde «El borrador».`);
    }
    await releer(conteo.id);
    avisar.bien(`${mat.sku} · sumado: ahora ${dice(sEst, sSal, sCaj)}.`);
    limpiar(true);
  }

  /**
   * ANOTAR Y CONFIRMAR SON EL MISMO GUARDADO, con distinto borrador.
   *
   * Confirmar una pre-anotación no pasa por las casillas: la tarjeta se
   * vuelve un borrador y entra por aquí. Con dos caminos de guardado
   * —uno para lo tecleado y otro para lo confirmado— cualquier regla
   * que se toque en uno queda distinta en el otro, y el renglón
   * confirmado saldría del mismo módulo con otras cuentas.
   */
  const SIN_SENAL_CORREGIR =
    "Sin señal: corregir un renglón que ya está en la base necesita conexión. Espera a tener señal.";

  /* La ubicación de un borrador, como la resuelve el formulario. */
  const ubicacionDe = (bb: Borrador): Ubicacion | null => {
    if (!bb.base) return null;
    const delModulo = ubicaciones.filter((u) => u.activa && claveBase(u) === bb.base);
    if (delModulo.length === 1 && (delModulo[0].lado ?? "") === "") return delModulo[0];
    return delModulo.find((u) => (u.lado ?? "") === bb.lado) ?? null;
  };

  /* LAS FOTOS QUE YA TIENE EL RECORRIDO. Si la tabla todavía no existe
     (falta correr el SQL) la lectura falla y simplemente no hay fotos
     que mostrar: el conteo no depende de esto. */
  useEffect(() => {
    if (!conteo) return;
    let vivo = true;
    void (async () => {
      const { data, error } = await supabase.from("conteo_fotos").select("linea_id, ruta").eq("conteo_id", conteo.id);
      if (!vivo || error || !data) return;
      setFotosDe(Object.fromEntries((data as { linea_id: string; ruta: string }[]).map((f) => [f.linea_id, f.ruta])));
    })();
    return () => { vivo = false };
  }, [conteo?.id, supabase]);

  useEffect(() => () => { if (fotoNueva) URL.revokeObjectURL(fotoNueva.url) }, [fotoNueva]);

  /* LAS MARCAS DE MÓDULO DEL RECORRIDO. Si la tabla todavía no existe (falta
     correr el SQL) no hay marcas y el conteo sigue igual. */
  useEffect(() => {
    if (!conteo) return;
    let vivo = true;
    void (async () => {
      const { data, error } = await supabase.from("conteo_modulos").select("ubicacion_id, mezclado, sin_acceso, ruta").eq("conteo_id", conteo.id);
      if (!vivo) return;
      if (!error && data) setMarcasMod(Object.fromEntries((data as (MarcaModulo & { ubicacion_id: string })[]).map((m) => [m.ubicacion_id, { mezclado: m.mezclado, sin_acceso: m.sin_acceso, ruta: m.ruta }])));
      setModulosListos(true);
    })();
    return () => { vivo = false };
  }, [conteo?.id, supabase]);

  const marcaGuardada = ubicacion ? marcasMod[ubicacion.id] ?? null : null;
  /* Al cambiar de módulo, las dos preguntas arrancan con lo que ya se dijo de ESE módulo. */
  useEffect(() => {
    setMod({ mezclado: marcaGuardada?.mezclado ?? false, sinAcceso: marcaGuardada?.sin_acceso ?? false });
    setFotoMod((x) => { if (x) URL.revokeObjectURL(x.url); return null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveEscogida, ubicacion?.id, modulosListos]);
  useEffect(() => () => { if (fotoMod) URL.revokeObjectURL(fotoMod.url) }, [fotoMod]);

  async function tomarMod(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    const f = await sellarFoto(archivo, `${mod.sinAcceso ? "SIN ACCESO" : "MEZCLADO"} · ${claveEscogida ?? ""}`);
    if (f) setFotoMod((x) => { if (x) URL.revokeObjectURL(x.url); return f });
  }

  /** Guarda la marca del módulo (y su foto, si hay una nueva). Devuelve el problema, o null si quedó. */
  async function guardarModulo(bb: Borrador, flags: { mezclado: boolean; sinAcceso: boolean }, foto: Foto | null): Promise<string | null> {
    if (!conteo) return "No hay recorrido abierto.";
    if (!navigator.onLine) return "Sin señal: marcar un módulo mezclado o sin acceso necesita conexión para subir la foto.";
    huboRed.current = false;
    const idU = await idDeLaPosicion(bb);
    if (!idU) return huboRed.current ? "Sin señal: no se pudo ubicar el módulo. Vuelve a intentar." : "No se pudo ubicar el módulo.";
    let ruta = marcasMod[idU]?.ruta ?? null;
    let extra: Record<string, unknown> = {};
    if (foto) {
      ruta = `${conteo.id}/modulo-${idU}.jpg`;
      const { error: eS } = await supabase.storage.from("inventario").upload(ruta, foto.blob, { contentType: "image/jpeg", upsert: true });
      if (eS) return "La foto no subió: " + eS.message;
      extra = { ancho: foto.ancho, alto: foto.alto, bytes: foto.blob.size, tomada_en: foto.tomada,
        lat: ubiFoto?.lat ?? null, lng: ubiFoto?.lng ?? null, precision_m: ubiFoto ? Math.round(ubiFoto.precision) : null };
    }
    const { error } = await supabase.from("conteo_modulos").upsert(
      { conteo_id: conteo.id, ubicacion_id: idU, mezclado: flags.mezclado, sin_acceso: flags.sinAcceso, ruta, ...extra },
      { onConflict: "conteo_id,ubicacion_id" });
    if (error) return /does not exist|schema cache/i.test(error.message)
      ? "Falta correr supabase/migraciones/2026-10-conteo-modulo-estado.sql en Supabase." : error.message;
    setMarcasMod((m) => ({ ...m, [idU]: { mezclado: flags.mezclado, sin_acceso: flags.sinAcceso, ruta } }));
    return null;
  }

  /** «Sin acceso»: el módulo se anota SIN renglones, con su foto. */
  async function anotarSinAcceso() {
    if (!conteo) return;
    if (!b.base) { avisar.mal("Escoge el módulo."); return }
    if (!claveEscogida) { avisar.mal("Falta decir de qué lado del módulo."); return }
    if (!fotoMod && !marcaGuardada?.ruta) { avisar.mal("Sin acceso: falta la foto de evidencia."); return }
    setGuardando(true);
    const mal = await guardarModulo(b, { mezclado: mod.mezclado, sinAcceso: true }, fotoMod);
    setGuardando(false);
    if (mal) { avisar.mal(mal); return }
    avisar.bien(`${claveEscogida} anotado SIN ACCESO.`);
    limpiar();
  }

  /** Sella la foto en el teléfono, al tomarla: la hora que queda es la de
   *  tomarla, no la de subirla. */
  async function sellarFoto(archivo: File, titulo: string): Promise<Foto | null> {
    setSellando(true);
    try {
      return await sellar(archivo, { titulo: titulo.toUpperCase(), ubi: ubiFoto, direccion: dirFoto, etiqueta: "CONTEO" });
    } catch (e) {
      avisar.mal(e instanceof Error ? e.message : "No se pudo procesar esa foto. Vuelve a tomarla.");
      return null;
    } finally { setSellando(false) }
  }

  async function tomarNueva(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    const f = await sellarFoto(archivo, b.codigo ? `${b.codigo} · ${claveEscogida ?? ""}` : "CONTEO");
    if (f) { setFotoNueva((x) => { if (x) URL.revokeObjectURL(x.url); return f }); setMas(true) }
  }

  /** Sube la foto de un renglón que YA está en la base. Devuelve el texto del
   *  problema, o null si quedó. */
  async function subirFoto(lineaId: string, f: Foto): Promise<string | null> {
    if (!conteo) return "No hay recorrido abierto.";
    const ruta = `${conteo.id}/${lineaId}.jpg`;
    const { error: eSubir } = await supabase.storage.from("inventario")
      .upload(ruta, f.blob, { contentType: "image/jpeg", upsert: true });
    if (eSubir) return "La foto no subió: " + eSubir.message;
    const { error: eFila } = await supabase.from("conteo_fotos").upsert({
      linea_id: lineaId, conteo_id: conteo.id, ruta, ancho: f.ancho, alto: f.alto, bytes: f.blob.size,
      tomada_en: f.tomada, lat: ubiFoto?.lat ?? null, lng: ubiFoto?.lng ?? null,
      precision_m: ubiFoto ? Math.round(ubiFoto.precision) : null,
    }, { onConflict: "linea_id" });
    if (eFila) return "La foto subió pero no quedó registrada: " + eFila.message;
    setFotosDe((x) => ({ ...x, [lineaId]: ruta }));
    return null;
  }

  /** LAS DOS PREGUNTAS DEL PNC (rótulo y bloqueo mecánico), DESPUÉS DEL RENGLÓN y con su id. Sin PNC la base las deja vacías
      (sirve también para cuando se corrige un renglón y se le quita el PNC). Devuelve el aviso si algo falla. */
  async function guardarPoliticaPnc(lineaId: string | null, bb: Borrador): Promise<string | null> {
    if (!lineaId) return "No se encontró el renglón para guardar las respuestas del PNC.";
    const { error } = await supabase.rpc("conteo_fefo_pnc_politica", {
      p_linea: lineaId, p_rotulo: bb.pnc ? bb.pncRotulo ?? null : null, p_bloqueo: bb.pnc ? bb.pncBloqueo ?? null : null,
    });
    if (!error) return null;
    return /does not exist|schema cache/i.test(error.message)
      ? "Falta correr supabase/migraciones/2026-10-pnc-politica-bloqueo.sql en Supabase."
      : error.message;
  }

  /** El renglón recién anotado: el último de ese material en este recorrido. */
  async function ultimoRenglon(sku: string): Promise<string | null> {
    if (!conteo) return null;
    const { data } = await supabase.from("v_conteo_fefo").select("id")
      .eq("conteo_id", conteo.id).eq("codigo", sku)
      .order("contado_en", { ascending: false }).limit(1).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  }

  /** La foto de un renglón de «El borrador» (poner o cambiar). */
  async function fotoDeFila(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    const id = filaDeFoto.current;
    e.target.value = "";
    if (!archivo || !id) return;
    const r = renglones.find((x) => x.id === id);
    const f = await sellarFoto(archivo, r ? `${r.codigo} · ${r.ubicacion_combinada ?? r.ubicacion ?? ""}` : "CONTEO");
    if (!f) return;
    setGuardando(true);
    const mal = await subirFoto(id, f);
    setGuardando(false);
    URL.revokeObjectURL(f.url);
    if (mal) avisar.mal(mal); else avisar.bien("Foto guardada en el renglón.");
  }

  async function verFoto(lineaId: string) {
    const ruta = fotosDe[lineaId];
    if (!ruta) return;
    const { data, error } = await supabase.storage.from("inventario").createSignedUrl(ruta, 600);
    if (error || !data?.signedUrl) { avisar.mal("No se pudo abrir la foto."); return }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  function ponerCola(nueva: ItemCola<Borrador>[]) {
    colaRef.current = nueva;
    setCola(nueva);
    guardarCola(llaveCola, nueva);
  }

  /* El renglón queda pendiente en el teléfono y el formulario queda listo
     para el siguiente: contar no se detiene porque no haya señal. */
  function encolar(bb: Borrador, mat: Material, idU: string | null = null, foto: Foto | null = null) {
    const u = ubicacionDe(bb);
    const [calle, modulo] = bb.base.split("|");
    const it: ItemCola<Borrador> = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      t: Date.now(), bb, sku: mat.sku,
      lugar: u?.clave ?? `${calle}${modulo}${bb.lado ? "_" + bb.lado : ""}`,
      ubicacionId: idU ?? u?.id ?? null,
    };
    const nueva = [...colaRef.current, it];
    if (foto) fotosCola.current.set(it.id, { ...foto, url: URL.createObjectURL(foto.blob) });
    ponerCola(nueva);
    setGuardando(false);
    avisar.info(`${mat.sku} quedó pendiente en este teléfono (${nueva.length}).`
      + (foto ? " Su foto sube con él, pero no cierres la página hasta que se envíe: la foto no se guarda en el teléfono." : ""));
    limpiar(true);
  }

  /* MANDA LOS PENDIENTES, de a uno y en orden. Se corta con la primera
     señal caída sin perder lo que falta. */
  async function enviarCola(manual = false) {
    if (!conteo || colaOcupada.current) return;
    const pend = colaRef.current;
    if (pend.length === 0) return;
    if (!navigator.onLine) {
      if (manual) avisar.mal("Todavía no hay señal. Los renglones siguen guardados en este teléfono.");
      return;
    }
    colaOcupada.current = true; setEnviandoCola(true);
    try {
      const r = await vaciarCola(pend, async (it): Promise<Resultado> => {
        const mat = materiales.find((m) => m.sku === it.sku);
        if (!mat) return { error: "Ese material ya no está en el maestro." };
        let idU = it.ubicacionId ?? ubicacionDe(it.bb)?.id ?? null;
        if (!idU) {
          const [calle, modulo] = it.bb.base.split("|");
          const { data, error } = await supabase.rpc("conteo_ubicacion_asegurar", {
            p_bodega: bodegaId, p_calle: calle, p_modulo: modulo, p_lado: it.bb.lado || null,
          });
          if (error) return esFalloDeRed(error.message) ? { red: true } : { error: error.message };
          idU = data as string;
        }
        const { data: idCola, error } = await supabase.rpc("conteo_fefo_agregar", { p_conteo: conteo.id, ...argumentos(it.bb, mat, idU) });
        if (!error) {
          if (it.bb.pnc) {
            const malP = await guardarPoliticaPnc(typeof idCola === "string" ? idCola : await ultimoRenglon(mat.sku), it.bb);
            if (malP) avisar.mal(`${mat.sku}: ${malP} Corrígelo en «El borrador».`);
          }
          const f = fotosCola.current.get(it.id);
          if (f) {
            fotosCola.current.delete(it.id);
            const idL = await ultimoRenglon(mat.sku);
            const mal = idL ? await subirFoto(idL, f) : "No se encontró el renglón para ponerle la foto.";
            URL.revokeObjectURL(f.url);
            if (mal) avisar.mal(`${mat.sku}: ${mal} Agrégala desde «El borrador».`);
          }
          return { ok: true };
        }
        return esFalloDeRed(error.message) ? { red: true } : { error: error.message };
      });

      let quedan = r.quedan;
      const fresca = await releer(conteo.id);
      let yaEstaban = 0;
      /* UN «YA EXISTE UNO IGUAL» PUEDE SER EL MISMO RENGLÓN: la señal se
         cayó DESPUÉS de que llegó, antes de la respuesta. Si lo que hay en
         la base es lo mismo —material, módulo, estado del envase y cantidades—, el pendiente
         se quita solo. Si la cantidad es otra, se queda y se avisa. */
      if (fresca) {
        quedan = quedan.filter((it) => {
          if (!it.duplicado) return true;
          const igual = fresca.some((x) => yaEstaEnLaBase(x, it as ItemCola<BorradorCola>));
          if (igual) yaEstaban++;
          return !igual;
        }).map((it) => it.duplicado
          ? { ...it, error: "Ya hay un renglón igual en ese módulo (mismo estado del envase) con OTRA cantidad. Quita este, o corrige el otro en «El borrador»." }
          : it);
      }
      ponerCola(quedan);
      const subidos = r.enviados.length + yaEstaban;
      if (subidos > 0) avisar.bien(`${subidos} ${subidos === 1 ? "renglón pendiente enviado" : "renglones pendientes enviados"}.`);
      if (quedan.some((x) => x.error)) avisar.mal("Hay pendientes que la base no aceptó. Míralos arriba.");
      else if (quedan.length > 0 && manual) avisar.mal("Se cortó la señal. Quedan pendientes en este teléfono.");
    } finally {
      colaOcupada.current = false; setEnviandoCola(false);
    }
  }
  /* El evento «online» se registra UNA vez: apunta siempre a la última versión. */
  const enviarColaRef = useRef(enviarCola);
  enviarColaRef.current = enviarCola;

  useEffect(() => {
    const guardada = leerCola<Borrador>(llaveCola);
    colaRef.current = guardada;
    setCola(guardada);
    setEnLinea(navigator.onLine);
    const sube = () => { setEnLinea(true); void enviarColaRef.current() };
    const baja = () => setEnLinea(false);
    window.addEventListener("online", sube);
    window.addEventListener("offline", baja);
    /* Si se abrió con pendientes y hay señal, se suben de una vez. */
    if (navigator.onLine && colaRef.current.length > 0) void enviarColaRef.current();
    return () => { window.removeEventListener("online", sube); window.removeEventListener("offline", baja) };
  }, []);

  async function guardar(bb: Borrador) {
    if (!conteo) return;
    const mal = revisar(bb);
    if (mal) { avisar.mal(mal); return }
    const mat = materialDe(bb)!;
    const foto = fotoNueva;

    /* LA MARCA DEL MÓDULO VA PRIMERO: «mezclado» con su foto queda en la base antes que el renglón. */
    if (!corrigiendo) {
      const cambia = mod.mezclado !== (marcaGuardada?.mezclado ?? false) || !!marcaGuardada?.sin_acceso;
      if (cambia || (mod.mezclado && fotoMod)) {
        setGuardando(true);
        const malM = await guardarModulo(bb, { mezclado: mod.mezclado, sinAcceso: false }, fotoMod);
        setGuardando(false);
        if (malM) { avisar.mal(malM); return }
        setFotoMod(null);
      }
    }

    /* SIN SEÑAL, UN RENGLÓN NUEVO SE GUARDA EN EL TELÉFONO. Corregir uno
       que ya está en la base necesita la base: ahí sí se avisa. */
    if (!navigator.onLine) {
      if (corrigiendo) { avisar.mal(SIN_SENAL_CORREGIR); return }
      encolar(bb, mat, null, foto); return;
    }

    setGuardando(true);
    huboRed.current = false;
    const idU = await idDeLaPosicion(bb);
    if (!idU) {
      setGuardando(false);
      if (huboRed.current) {
        huboRed.current = false;
        if (corrigiendo) avisar.mal(SIN_SENAL_CORREGIR); else encolar(bb, mat, null, foto);
      }
      return;
    }
    const { data: idNuevo, error } = corrigiendo
      ? await supabase.rpc("conteo_fefo_editar", { p_linea: corrigiendo, ...argumentos(bb, mat, idU) })
      : await supabase.rpc("conteo_fefo_agregar", { p_conteo: conteo.id, ...argumentos(bb, mat, idU) });
    setGuardando(false);
    if (error) {
      if (esFalloDeRed(error.message)) {
        if (corrigiendo) avisar.mal(SIN_SENAL_CORREGIR); else encolar(bb, mat, idU, foto);
        return;
      }
      if (esDuplicado(error.message) && !corrigiendo) { await sumarAlQueYaEsta(bb, mat, idU, foto); return }
      avisar.mal(esDuplicado(error.message) ? AVISO_REPETIDO : error.message); return;
    }

    /* PNC: las dos respuestas viajan en su propia llamada, con el id del renglón recién guardado. */
    if (bb.pnc || corrigiendo) {
      const idP = corrigiendo ?? (typeof idNuevo === "string" ? idNuevo : await ultimoRenglon(mat.sku));
      const malP = await guardarPoliticaPnc(idP, bb);
      if (malP) avisar.mal(`${mat.sku} quedó anotado, pero ${malP.charAt(0).toLowerCase()}${malP.slice(1)} Corrígelo en «El borrador».`);
    }

    /* LA FOTO, DESPUÉS DEL RENGLÓN: su ruta lleva el id de la línea. Si
       falla, el renglón YA está en la base —que es lo importante— y se
       dice, para agregarla desde «El borrador». */
    if (foto) {
      const idL = corrigiendo ?? await ultimoRenglon(mat.sku);
      const malF = idL ? await subirFoto(idL, foto) : "No se encontró el renglón para ponerle la foto.";
      if (malF) avisar.mal(`${mat.sku} quedó anotado, pero ${malF.charAt(0).toLowerCase()}${malF.slice(1)} Agrégala desde «El borrador».`);
    }

    /* Se vuelve a leer la vista en vez de armar el renglón aquí: las seis
       cuentas las hace la base, y calcularlas otra vez en la pantalla es
       tener dos versiones de la verdad esperando a discrepar. */
    await releer(conteo.id);
    const cta = cuentaDe(bb, mat);
    avisar.bien(corrigiendo
      ? `${mat.sku} corregido.`
      : `${mat.sku} · ${cta?.total != null ? nf.format(cta.total) + " cajas" : "anotado"}.`);
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
    limpiar(!corrigiendo);
  }

  /* Lo que se tecleó. */
  const anotar = () => guardar(b);

  /* «SIGUE IGUAL»: la tarjeta entra derecho a la base, sin pasar por el
     formulario. Es el botón entero de la pre-anotación — si hubiera que
     confirmar y después anotar, serían dos toques para decir que nada
     cambió, que es lo mismo que teclearlo. */
  /* «SI SIGUE IGUAL NO DEBERÍA GUARDARSE: QUE SE REFLEJE, UNO LO VALIDA
     Y LE DA GUARDAR — NO EN AUTOMÁTICO.» La tarjeta llena el renglón
     entero —código, fecha, cantidad, marcas— y el cursor va a «Anotar»:
     el renglón se guarda cuando quien cuenta lo mira y lo confirma. */
  function sigueIgual(pv: Previo) {
    setCorrigiendo(null);
    setB(desdePrevio(pv));
    setDesdeTarjeta("igual");
    setTimeout(() => {
      botonAnotar.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      botonAnotar.current?.focus();
    }, 0);
  }
  /* «OTRO SKU»: se queda el sitio, se empieza el renglón de cero en el
     código y SE QUITAN LAS TARJETAS de lo que había antes —eso es lo que
     hacía «Aquí hay otra cosa», que sobraba como botón aparte: si aquí
     hay otro SKU, lo de la última vez ya no sirve de referencia. */
  function otroSku() {
    setCorrigiendo(null);
    setVerPrevio(false);
    setB((x) => ({ ...VACIO, calle: x.calle, base: x.base, lado: x.lado }));
    setDesdeTarjeta(null);
    setTimeout(() => campoCodigo.current?.focus(), 0);
  }

  /* «CAMBIÓ LA CANTIDAD»: la tarjeta baja a las casillas, llena, y
     quien cuenta corrige lo único que cambió. No guarda nada todavía;
     guarda «Anotar», como siempre. */
  function editarPrevio(pv: Previo) {
    setCorrigiendo(null);
    setB(desdePrevio(pv));
    setDesdeTarjeta("cantidad");
    /* EL FOCO VA DESPUÉS DE QUE LA PANTALLA SE REHAGA, y por eso pasa
       por un contador y no se llama aquí: la casilla de la cantidad es
       «Estibas» o «Cajas» según el modo que traiga la tarjeta, y en el
       instante de este clic la que está montada todavía es la del modo
       anterior. Enfocarla ahora sería enfocar la casilla que está a
       punto de desaparecer. */
    setEnfocarCantidad((n) => n + 1);
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
    setMas(!!(r.rotacion || r.averia || r.pnc || r.nota));
    /* LAS DOS RESPUESTAS DEL PNC viven en la tabla, no en la vista: se traen aparte y, si no están (renglón anterior a la
       pregunta, o falta el SQL), quedan sin contestar y se piden antes de guardar. */
    if (r.pnc) {
      void supabase.from("conteo_lineas").select("pnc_rotulo, pnc_bloqueo_mecanico").eq("id", r.id).maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          setB((x) => ({ ...x, pncRotulo: (data.pnc_rotulo as boolean | null) ?? null, pncBloqueo: (data.pnc_bloqueo_mecanico as boolean | null) ?? null }));
        });
    }
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
    /* La fila de la foto se fue sola con el renglón; el archivo se limpia
       aquí, sin que importe si falla. */
    const rutaF = fotosDe[r.id];
    if (rutaF) {
      void supabase.storage.from("inventario").remove([rutaF]);
      setFotosDe((x) => { const y = { ...x }; delete y[r.id]; return y });
    }
    if (corrigiendo === r.id) limpiar();
    avisar.bien("Renglón borrado.");
  }

  async function enviar() {
    if (!conteo) return;
    if (cola.length > 0) {
      avisar.mal(`Hay ${cola.length} ${cola.length === 1 ? "renglón" : "renglones"} sin enviar en este teléfono. Primero deben subirse: con señal, toca «Enviar ahora».`);
      return;
    }
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

  /* LO QUE YA LLEVAS EN ESTA POSICIÓN. Se compara contra la clave
     ESCOGIDA y no contra la fila del maestro: el lado que todavía no
     existe también es una posición, y quien está contándola quiere ver
     lo que lleva ahí. */
  const deAqui = renglones.filter((r) => r.ubicacion === claveEscogida);
  const cajasAqui = deAqui.reduce((a, r) => a + Number(r.total_cajas), 0);
  const cajasTotal = renglones.reduce((a, r) => a + Number(r.total_cajas), 0);
  const modulosHechos = new Set(renglones.map((r) => r.ubicacion)).size;
  /* LA FICHA DE TOTALES: todo el borrador (lo que va a enviar) y, si hay filtro, lo que se ve. */
  const fichaTodo = totalesDelConteo(renglones, materiales);
  const fichaVista = totalesDelConteo(vistos, materiales);

  /* LOS ESTADOS DEL ENVASE QUE YA SE CONTARON PARA ESTE CÓDIGO EN ESTE MÓDULO, dentro del mismo recorrido, no
     vuelven a salir: con otro código sí. Al corregir un renglón, el suyo no cuenta como usado. */
  /* EL MISMO CÓDIGO SE PUEDE VOLVER A PONER en el mismo módulo, con cualquier estado: lo que se anota se SUMA al renglón
     que ya había (lo hace la base, en conteo_fefo_agregar). Por eso ningún estado se oculta al anotar. Solo al CORREGIR un
     renglón sí cuenta la regla de siempre: no se puede dejar igual a otro que ya está. */
  const estadoAqui = useMemo(() => renglones.find((r) =>
    r.ubicacion === claveEscogida && r.codigo === b.codigo.trim() && b.estado !== ""
    && (r.estado_envase ?? "").toUpperCase() === b.estado.toUpperCase()), [renglones, claveEscogida, b.codigo, b.estado]);
  const estadosUsados = useMemo(() => new Set(
    !corrigiendo ? [] :
    renglones
      .filter((r) => r.ubicacion === claveEscogida && r.codigo === b.codigo.trim() && r.estado_envase && r.id !== corrigiendo)
      .map((r) => (r.estado_envase ?? "").toUpperCase())),
  [renglones, claveEscogida, b.codigo, corrigiendo]);
  /* Si el estado escogido ya se contó para este código aquí (o el material no es envase), se suelta. */
  useEffect(() => {
    if (b.estado && (estadosUsados.has(b.estado.toUpperCase()) || (material && !esEnvase))) setB((x) => ({ ...x, estado: "" }));
  }, [estadosUsados, b.estado, material, esEnvase]);

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
          <p className="fe-aviso-ubi">
            Al empezar se registra <b>dónde estás</b> (el celular te pide permiso). Queda anotado
            junto con la hora de cada renglón.
          </p>
          <button type="button" className="btn grande" disabled={guardando} onClick={abrir}>
            {guardando ? "Abriendo…" : "Empezar a contar"}
          </button>
        </section>
      </>
    );
  }

  /* ---------- EL FLUJO: CADA PASO SE ENCIENDE CUANDO EL ANTERIOR ESTÁ COMPLETO ----------
     Dónde (calle · módulo · lado) → ¿acceso? y ¿mezclado? (con su foto) → Qué (el código, ya reconocido) →
     Estado del envase (solo si es ENVASE) → Cuánto. Un paso apagado se ve pero no se toca. */
  const fotoModOk = !mod.mezclado || !!fotoMod || !!marcaGuardada?.ruta;
  const pasoQue = !!claveEscogida && fotoModOk;
  const pasoEstado = pasoQue && !!material;
  const estadoOk = !esEnvase || b.estado.trim() !== "";
  const pasoCuanto = pasoEstado && estadoOk;
  return (
    <>
      {dialogo}
      {avisos}

      {/* LAS DOS PESTAÑAS. El borrador lleva su cuenta al lado: es lo que
          dice si vale la pena ir a mirarlo, y contando de pie no se
          puede estar cambiando de pantalla para averiguarlo. */}
      {(!enLinea || cola.length > 0) && (
        <section className={"fe-cola" + (!enLinea ? " sin" : "")} role="status" aria-live="polite">
          <p>
            {!enLinea && <><b>Sin señal.</b> Lo que anotes queda guardado en este teléfono y se envía solo cuando vuelva. </>}
            {cola.length > 0 && <><b>{cola.length}</b> {cola.length === 1 ? "renglón" : "renglones"} sin enviar.</>}
          </p>
          {cola.length > 0 && enLinea && (
            <button type="button" className="fe-mini" disabled={enviandoCola} onClick={() => enviarCola(true)}>
              {enviandoCola ? "Enviando…" : "Enviar ahora"}
            </button>
          )}
          {cola.length > 0 && (
            <details open={cola.some((x) => x.error)}>
              <summary>Ver los pendientes</summary>
              <ul>
                {cola.map((it) => (
                  <li key={it.id}>
                    <span><b>{it.sku}</b> · {it.lugar}{it.error && <em> — {it.error}</em>}</span>
                    <button type="button" className="fe-mini" disabled={enviandoCola}
                            onClick={() => ponerCola(colaRef.current.filter((x) => x.id !== it.id))}>
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <div className="fe-pes fe-pes-conteo" role="tablist">
        <button type="button" role="tab" aria-selected={pestania === "anotar"}
                className={pestania === "anotar" ? "on" : ""}
                onClick={() => setPestania("anotar")}>
          Anotar
        </button>
        <button type="button" role="tab" aria-selected={pestania === "borrador"}
                className={pestania === "borrador" ? "on" : ""}
                onClick={() => setPestania("borrador")}>
          El borrador<em>{renglones.length}{cola.length > 0 ? ` +${cola.length}` : ""}</em>
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
          {/* CALLE · MÓDULO · LADO EN UNA FILA. En el celular calle y
              módulo van lado a lado y el lado baja a todo el ancho, para
              que sus dos botones midan media pantalla cada uno. */}
          <div className="fe-tres dos fe-donde3">
            <label><span>Calle</span>
              <Buscador
                /* AQUÍ VUELVE EL CURSOR DESPUÉS DE ANOTAR. Es el primer
                   campo del recorrido y el único sin teclado, así que
                   volver aquí no levanta nada que tape la pantalla. */
                campo={campoCalle}
                valor={b.calle}
                marcador="Todas"
                /* SIN TECLADO. Son doce calles de una letra: la lista
                   entera cabe en la pantalla y escribir no ahorra ni un
                   toque. El teclado del celular, en cambio, tapa media
                   pantalla y deja la lista debajo. */
                teclado="ninguno"
                /* Y ABRE EN LA CALLE QUE SIGUE. Se cuenta calle por
                   calle: al terminar la B lo que viene es la C, y
                   tenerla resaltada ahorra rodar la lista entera. */
                desdeElSiguiente
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
                /* Y ABRE EN EL MÓDULO QUE SIGUE. Es donde más se nota:
                   quien va por el 40 tenía que rodar cuarenta renglones
                   cada vez que abría la lista, y son cientos de
                   renglones al día. */
                desdeElSiguiente
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
                                 calle: u?.calle ?? base.split("|")[0] ?? x.calle,
                                 lado: posibles.length === 1 ? (posibles[0].lado ?? "") : "" }));
                }} /></label>

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
              <div className="fe-segmento" role="group" aria-labelledby="fe-rot-lado" ref={grupoLado}>
                {lados.map((l) => (
                  <button key={l} type="button" className={b.lado === l ? "on" : ""}
                          aria-pressed={b.lado === l}
                          onClick={() => { pon("lado", l); setTimeout(() => campoCodigo.current?.focus(), 0) }}>{nombreLado(l)}</button>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* ============ ESTADO DEL MÓDULO · 3 PREGUNTAS ============
            Justo después de escoger el sitio y ANTES del código: ¿mezclado?,
            ¿hay acceso? y el estado del envase. Mezclado y «sin acceso» piden
            foto de evidencia. Con «sin acceso» no hay nada que contar: el
            módulo se anota solo, con su foto. */}
        {claveEscogida && !corrigiendo && (
          <div className="fe-bloque fe-estmod">
            <p className="fe-bloque-cab">Estado del módulo</p>
            <div className="fe-estmod-fila">
              <div className="fe-acceso">
                <span id="fe-rot-acceso">¿Tienes acceso al módulo?</span>
                <div className="fe-si-no" role="group" aria-labelledby="fe-rot-acceso">
                  <button type="button" className={!mod.sinAcceso ? "on" : ""} aria-pressed={!mod.sinAcceso}
                          onClick={() => setMod((x) => ({ ...x, sinAcceso: false }))}>Sí</button>
                  <button type="button" className={mod.sinAcceso ? "on" : ""} aria-pressed={mod.sinAcceso}
                          onClick={() => setMod((x) => ({ ...x, sinAcceso: true }))}>No</button>
                </div>
              </div>
              <label className={"fe-mezclado" + (mod.mezclado ? " on" : "")}>
                <input type="checkbox" checked={mod.mezclado}
                       onChange={(e) => setMod((x) => ({ ...x, mezclado: e.target.checked }))} />
                <span><b>Módulo mezclado</b></span>
              </label>
            </div>
            {(mod.mezclado || mod.sinAcceso) && (
              <div className="fe-foto fe-foto-mod">
                <span id="fe-rot-fotomod">Foto de evidencia · obligatoria</span>
                <input ref={camaraMod} type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" hidden onChange={tomarMod} />
                <div className="fe-foto-fila" role="group" aria-labelledby="fe-rot-fotomod">
                  <button type="button" className={"fe-foto-btn" + (fotoMod ? " con" : "")} disabled={sellando}
                          onClick={() => { pedirUbi(); camaraMod.current?.click() }}>
                    {fotoMod
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={fotoMod.url} alt="La foto del módulo" />
                      : <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>}
                    <b>{sellando ? "Procesando…" : fotoMod ? "Tomar otra" : "Tomar foto"}</b>
                  </button>
                  <p>{fotoMod ? "La foto sube al anotar."
                    : marcaGuardada?.ruta ? "Este módulo ya tiene foto. Tomar otra la reemplaza."
                    : mod.sinAcceso ? "Sin acceso: foto de por qué no se pudo contar." : "Mezclado: foto de cómo está el módulo."}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {!mod.sinAcceso && (<>
        {/* ================= LA PRE-ANOTACIÓN D-1 =================

            «Yo cuento hoy el A01 con 96 estibas de A1000. Que mañana, al
            seleccionar el módulo, me aparezca la misma información
            preguardada con la info de hoy, por si sigue igual, y un
            botón de registrar por si cambia.»

            VA AQUÍ Y NO ARRIBA NI ABAJO. Sale DESPUÉS de escoger el
            sitio —antes no hay nada que enseñar— y ANTES del código,
            porque si la respuesta es «sigue igual» el renglón se acabó y
            las once casillas de abajo no se tocan. Puesta debajo del
            formulario habría que rodar hasta el final para descubrir que
            no hacía falta escribir nada.

            NO ES HISTORIAL. Un historial se consulta; esto se contesta.
            Por eso cada renglón trae sus dos botones y no un enlace a
            «ver lo anterior»: lo que se pide es una respuesta, y la
            respuesta casi siempre es la misma.

            Y NO SE AUTOLLENA EL FORMULARIO. Llenar las casillas solo
            dejaría un renglón completo sin que nadie haya mirado la
            estiba, a un toque de guardarse; y lo que se cuenta es lo que
            hay, no lo que había. Aquí hay que decir que sí. */}
        {claveEscogida && verPrevio && previo.length > 0 && !corrigiendo && (
          <div className="fe-bloque fe-previo">
            <div className="fe-previo-cab">
              {/* ROTULO PROPIO Y NO «fe-bloque-cab». Los otros cuatro
                  rótulos —Dónde, Qué, Cuánto, Cómo está— son los momentos
                  del renglón, y hay un arnés que comprueba que sean esos
                  cuatro y en ese orden. Este no es un momento del
                  renglón: es la pregunta que se hace antes de empezarlo. */}
              <p className="fe-previo-rot">
                La última vez en {claveEscogida}
                {hechosHoy.length === 0 && masReciente && diasDesde(masReciente.contado_en) != null && (
                  <em>{masReciente.conteo_codigo ? `${masReciente.conteo_codigo} · ` : ""}{textoHace(diasDesde(masReciente.contado_en)!)}</em>
                )}
              </p>
              {hechosHoy.length > 0 && pendientes.length > 0 && (
                <p className="fe-previo-faltan" role="status">
                  Faltan <b>{pendientes.length}</b> de {previo.length}: {hechosHoy.length === 1 ? "el otro ya se contó" : `los otros ${hechosHoy.length} ya se contaron`} hoy.
                </p>
              )}
            </div>

            {pendientes.length === 0 && (
              <p className="fe-previo-fin" role="status">
                Todo lo que había en {claveEscogida} ya se contó hoy. Si hay algo más, anótalo abajo.
              </p>
            )}

            {pendientes.map((pv) => {
              const hecho = yaHoy(pv);
              return (
                <div key={pv.linea_id} className={"fe-tarjeta" + (hecho ? " hecha" : "")}>
                  <p className="fe-tarjeta-que">
                    <b>{pv.codigo}</b> <span>{pv.material}</span>
                  </p>
                  <p className="fe-tarjeta-cifra">
                    {textoCifra(cifraPrevia(pv))}
                    {cifraPrevia(pv).total != null && (cifraPrevia(pv).estibas ?? 0) > 0 && (
                      <em>= {nf.format(cifraPrevia(pv).total!)} cajas</em>
                    )}
                    {pv.venc_dia != null && (
                      <em>vence {dd(pv.venc_dia)}/{dd(pv.venc_mes)}/{dd(pv.venc_anio)}</em>
                    )}
                    {/* LA FECHA DEL ENVASE SE MUESTRA, NO SE PIDE: es su recepción (sale como fabricación).
                        «Sigue igual» o «Cambió cantidad» la conservan; si es otro material, la base le
                        pone la de hoy. El vencimiento lo calcula la base con la vida útil. */}
                    {pv.fecha_fifo && (
                      <em>recepción {pv.fecha_fifo.slice(8, 10)}/{pv.fecha_fifo.slice(5, 7)}/{pv.fecha_fifo.slice(2, 4)}</em>
                    )}
                  </p>
                  {diasDesde(pv.contado_en) != null && diasDesde(pv.contado_en)! > 0 && (
                    <p className="fe-tarjeta-cuando">Contado {textoHace(diasDesde(pv.contado_en)!)}</p>
                  )}
                  {(pv.rotacion || pv.averia || pv.pnc || pv.estado_envase) && (
                    <p className="fe-tarjeta-marcas">
                      {pv.rotacion && <span>Rota</span>}
                      {pv.averia && <span>Avería</span>}
                      {pv.pnc && <span>PNC</span>}
                      {pv.estado_envase && <span>{pv.estado_envase}</span>}
                    </p>
                  )}
                  {/* YA CONTADO HOY SE DICE, NO SE ESCONDE. Escondida, la
                      tarjeta desaparecería al confirmarla y parecería que
                      se perdió; dicho así, se ve que quedó anotada. */}
                  {hecho ? (
                    <p className="fe-tarjeta-hecha">Ya lo contaste en este recorrido.</p>
                  ) : (
                    <div className="fe-tarjeta-pie tres">
                      <button type="button" className="fe-si" disabled={guardando}
                              onClick={() => sigueIgual(pv)}>
                        Sigue igual
                      </button>
                      <button type="button" className="fe-no" disabled={guardando}
                              onClick={() => editarPrevio(pv)}>
                        Cambió cantidad
                      </button>
                      <button type="button" className="fe-no" disabled={guardando}
                              onClick={otroSku}>
                        Otro SKU
                      </button>
                    </div>
                  )}
                  {!hecho && pv.producto_id && (
                    <button type="button" className="fe-ya-no-esta" disabled={guardando} onClick={() => void yaNoEsta(pv)}>
                      Ya no está aquí
                    </button>
                  )}
                </div>
              );
            })}

            {/* LO YA CONTADO HOY SE DICE: así se ve que nada se perdió. */}
            {hechosHoy.length > 0 && (
              <details className="fe-previo-hechos">
                <summary>{hechosHoy.length} ya contado{hechosHoy.length === 1 ? "" : "s"} hoy</summary>
                <ul>
                  {hechosHoy.map((pv) => (
                    <li key={pv.linea_id}>
                      <b>{pv.codigo}</b> {pv.material} · {textoCifra(cifraPrevia(pv))}
                      {pv.venc_dia != null && <> · vence {dd(pv.venc_dia)}/{dd(pv.venc_mes)}/{dd(pv.venc_anio)}</>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* ============ 2 · QUÉ — CÓDIGO · DESCRIPCIÓN · D/M/A ============ */}
        <div className={"fe-bloque" + (pasoQue ? "" : " fe-apagado")} inert={!pasoQue} aria-disabled={!pasoQue}>
          <p className="fe-bloque-cab">Qué</p>
          {!pasoQue && <p className="fe-paso-aviso">{!claveEscogida ? "Escoge el módulo y el lado para continuar." : "Falta la foto del módulo mezclado."}</p>}

          {/* MITAD Y MITAD, y del mismo tamaño. La descripción iba debajo
              en letra chica, como una nota al pie, y es LA CONFIRMACIÓN de
              que se tecleó el código correcto: 3128 y 3182 existen los
              dos. Lo que confirma un dato no puede ser más pequeño que el
              dato.

              EL MARCADOR NO PUEDE SER UN CÓDIGO DE VERDAD. Decía «3128»,
              que es la Águila 330, y en gris claro dentro de un campo
              grande se lee como un campo YA LLENO — sobre todo después
              de anotar, que es justo cuando el campo acaba de vaciarse. */}
          {/* CÓDIGO · DESCRIPCIÓN · VENCE EN UNA FILA. En el celular el
              código y el vencimiento van lado a lado —los dos se teclean
              con el numérico, uno detrás del otro— y la descripción baja
              a todo el ancho: es la confirmación de lo tecleado, se lee
              entera y en verde cuando el código existe. */}
          <div className="fe-cod-dos fe-que3">
            <label><span>Código</span>
              {/* LA LISTA SE FILTRA MIENTRAS SE TECLEA: por el principio del
                  código primero, y después por cualquier parte del código o
                  del nombre. Se escoge con un toque, con las flechas + Enter,
                  o se sigue tecleando el código entero (que salta solo a la
                  fecha cuando ya no hay otro que empiece igual). */}
              <div className="bs">
                <input ref={campoCodigo} inputMode="numeric" value={b.codigo}
                       placeholder="Teclea el código" autoComplete="off"
                       role="combobox" aria-expanded={verSug} aria-controls="fe-sug-codigo" aria-autocomplete="list"
                       onFocus={() => setSugAbierta(true)}
                       onBlur={() => setSugAbierta(false)}
                       onChange={(e) => { pon("codigo", e.target.value); setSugAbierta(true); setSugActiva(0); saltarSiCompleto(e.target.value) }}
                       onKeyDown={(e) => {
                         if (verSug && e.key === "ArrowDown") { e.preventDefault(); setSugActiva((i) => Math.min(i + 1, sugerencias.length - 1)); return }
                         if (verSug && e.key === "ArrowUp") { e.preventDefault(); setSugActiva((i) => Math.max(i - 1, 0)); return }
                         if (e.key === "Escape") { setSugAbierta(false); return }
                         if (verSug && e.key === "Enter" && sugerencias[sugActiva]) { e.preventDefault(); escogerCodigo(sugerencias[sugActiva].sku); return }
                         saltaCon(e, campoDia);
                       }} />
                {verSug && (
                  <ul className="bs-lista fe-sug" id="fe-sug-codigo" role="listbox" aria-label="Materiales que coinciden">
                    {sugerencias.map((m, i) => (
                      <li key={m.sku} role="option" aria-selected={i === sugActiva} className={i === sugActiva ? "on" : ""}
                          onMouseDown={(e) => { e.preventDefault(); escogerCodigo(m.sku) }}
                          onMouseEnter={() => setSugActiva(i)}>
                        <b>{m.sku}</b><em>{m.nombre}</em>
                      </li>
                    ))}
                  </ul>
                )}
              </div></label>
            <label className="fe-que-desc"><span>Descripción</span>
              <output className={"fe-desc-campo" + (b.codigo && !material ? " mal" : material ? " leido" : "")}>
                {!b.codigo ? <i>Teclea el código y te digo qué es.</i>
                  : material ? <span className="fe-desc-tx"><span className="fe-tic" aria-hidden>✓</span>{material.nombre}
                      {material.cajas_por_estiba != null && <em> · {material.cajas_por_estiba} cajas/estiba</em>}</span>
                  : <i>Ese código no está en el maestro.</i>}
              </output></label>
            <div className={"fe-fecha fe-que-vence" + (esEnvase ? " opcional" : "")}>
              <div className="fe-que-fecha">
                <span className="fe-etiq-fecha">Vence</span>
                {esEnvase && <em className="fe-opcional">sin fecha</em>}
              </div>
              <div className="fe-dma">
                <input ref={campoDia} inputMode="numeric" maxLength={2} placeholder="DD"
                       aria-label="Día del vencimiento" value={b.dia}
                       onChange={(e) => tecleaFecha("dia", e.target.value, campoMes)} />
                <input ref={campoMes} inputMode="numeric" maxLength={2} placeholder="MM"
                       aria-label="Mes del vencimiento" value={b.mes}
                       onChange={(e) => tecleaFecha("mes", e.target.value, campoAnio)}
                       onKeyDown={(e) => atrasFecha(e, b.mes, campoDia)} />
                {/* Y AL ACABAR EL AÑO, DERECHO A LA CANTIDAD: el renglón se
                    escribe de corrido desde el código hasta el número. */}
                <input ref={campoAnio} inputMode="numeric" maxLength={2} placeholder="AA"
                       aria-label="Año del vencimiento" value={b.anio}
                       onChange={(e) => tecleaFecha("anio", e.target.value, pasoCuanto ? campoCantidad : undefined)}
                       onKeyDown={(e) => atrasFecha(e, b.anio, campoMes)} />
              </div>
            </div>
          </div>
          {material && material.cajas_por_estiba == null && (
            <p className="fe-eco"><b className="ojo">sin factor estibado</b> — las estibas darían cero</p>
          )}

          {/* «DÍAS PARA SALIR», DEBAJO Y DE UN RENGLÓN. No es cuándo vence:
              es cuándo tiene que haber SALIDO para llegarle al cliente con
              vida útil suficiente. Solo sale cuando hay fecha. */}
          {dias && (
            <div className={"fe-dias" + (dias.salir < 0 ? " mal" : dias.salir <= 7 ? " ojo" : "")}>
              <span className="fe-dias-par">
                <b>{dias.salir < 0 ? `se pasó por ${-dias.salir}` : dias.salir}</b>
                <em>{dias.salir < 0 ? "días de su fecha de salida" : "días para salir"}</em>
              </span>
              <span className="fe-dias-par suave">
                <b>{dias.vencer}</b><em>días para vencer</em>
              </span>
            </div>
          )}
        </div>

        {/* ============ ESTADO DEL ENVASE — después de «Qué» y antes de «Cuánto» ============
            Va aquí porque depende del CÓDIGO: los estados que ya se contaron para este código en este módulo
            no vuelven a salir (con otro código sí), y solo se pide si lo que se cuenta es ENVASE. Mientras
            no se escoja, «Cuánto» sigue apagado. */}
        <div className={"fe-bloque fe-estenv" + (pasoEstado ? "" : " fe-apagado")} inert={!pasoEstado} aria-disabled={!pasoEstado}>
          <p className="fe-bloque-cab">Estado del envase</p>
          {pasoEstado && esEnvase && <p className="fe-obliga">Obligatorio: {esCilindro ? "escoge lleno o vacío" : "escoge uno"} para pasar a «Cuánto».</p>}
          {!pasoEstado ? (
            <p className="fe-paso-aviso">{!claveEscogida ? "Escoge el módulo para continuar." : !fotoModOk ? "Falta la foto del módulo mezclado." : "Escribe el código para continuar."}</p>
          ) : !esEnvase ? (
            <p className="fe-paso-aviso">No aplica: lo que cuentas es producto, no envase.</p>
          ) : (
            <>
              <div className="fe-estados" role="group" aria-label={esCilindro ? "Cilindro lleno o vacío" : "Estado del envase"}>
                {[...OPCIONES_ESTADO.filter((e) => !estadosUsados.has(e)), ...(b.estado && !OPCIONES_ESTADO.includes(b.estado) ? [b.estado] : [])].map((e) => (
                  <button key={e} type="button" className={b.estado === e ? "on" : ""} aria-pressed={b.estado === e}
                          onClick={() => { pon("estado", b.estado === e ? "" : e); if (b.estado !== e) setTimeout(() => campoCantidad.current?.focus(), 60) }}>{e}</button>
                ))}
              </div>
              {!corrigiendo && estadoAqui && (
                <p className="fe-paso-aviso">Este estado ya lo anotaste aquí para este código: lo nuevo se suma a las <b>{nf.format(Number(estadoAqui.total_cajas))} cajas</b> de {estadoAqui.estado_envase} que ya anotaste aquí.</p>
              )}
              {estadosUsados.size > 0 && (
                <p className="fe-paso-aviso">Ya contado aquí para este código: <b>{[...estadosUsados].join(", ")}</b>.
                  {estadosUsados.size >= OPCIONES_ESTADO.length ? esCilindro ? " Ya contaste lleno y vacío: para cambiar algo, corrige ese renglón." : " Ya no queda otro estado: para cambiar algo, corrige ese renglón." : ""}</p>
              )}
            </>
          )}
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
        <div className={"fe-bloque fe-cuanto-bloque" + (pasoCuanto ? "" : " fe-apagado")} inert={!pasoCuanto} aria-disabled={!pasoCuanto}>
          <p className="fe-bloque-cab">Cuánto</p>
          {!pasoCuanto && <p className="fe-paso-aviso">{!pasoEstado ? "Completa los pasos de arriba para continuar." : "Escoge el estado del envase para continuar."}</p>}

          {/* QUÉ CUENTAS · ESTIBAS · SALDO · TOTAL EN UNA FILA. En el
              celular: qué cuentas arriba, estibas y saldo lado a lado, y
              el total abajo, grande, en la franja oscura. */}
          <div className={"fe-cuanto4" + (b.modo === "cajas" ? " cajas" : "")}>
            {/* SIN SELECTOR «QUÉ CUENTAS»: se cuenta por estibas y saldo. Solo si el material no dice cuántas cajas lleva una
                estiba (o la tarjeta que se edita venía en cajas) el modo pasa solo a «Cajas» — ver el efecto de arriba. */}
            {b.modo === "estibas" ? (
              <>
                <label className="fe-cuanto-campo"><span>Estibas completas</span>
                  <input ref={campoCantidad} inputMode={escritorio ? "numeric" : "none"} value={b.estibas}
                         onFocus={(e) => abrirCalc("estibas", e.currentTarget)} onBlur={() => soltarCalc("estibas")}
                         onChange={(e) => pon("estibas", e.target.value)}
                         onKeyDown={(e) => saltaCon(e, campoSaldo)} /></label>
                <label className="fe-cuanto-campo"><span>Saldo · cajas</span>
                  <input ref={campoSaldo} inputMode={escritorio ? "numeric" : "none"} value={b.saldo}
                         onFocus={(e) => abrirCalc("saldo", e.currentTarget)} onBlur={() => soltarCalc("saldo")}
                         onChange={(e) => pon("saldo", e.target.value)}
                         onKeyDown={(e) => saltaCon(e)} /></label>
              </>
            ) : (
              <label className="fe-cuanto-campo ancho"><span>Cajas</span>
                <input ref={campoCantidad} inputMode={escritorio ? "numeric" : "none"} value={b.cajas}
                       onFocus={(e) => abrirCalc("cajas", e.currentTarget)} onBlur={() => soltarCalc("cajas")}
                       onChange={(e) => pon("cajas", e.target.value)}
                       onKeyDown={(e) => saltaCon(e)} /></label>
            )}
            <div className="fe-cuanto-total">
              <span className="fe-cuanto-rot">Total</span>
              <output className={"fe-total-caja" + (cuenta?.total == null ? " esperando" : "")}>
                <b>{cuenta?.total != null ? nf.format(cuenta.total) : "—"}</b><span>cajas</span>
              </output>
            </div>
          </div>
          {/* LA CALCULADORA: un panel fijo al pie que se abre al tocar Estibas, Saldo o Cajas (el teclado del celular
              no trae signos y se suprime). Los botones escriben donde está el cursor de la casilla activa; «=» deja el
              resultado en la casilla (también pasa solo al salir de ella) y «Listo» cierra el panel. Con el teclado de un
              computador también se puede escribir. */}
          {(calcAbierta || escritorio) && (
            <div className={"fe-calc fe-calc-fija" + (escritorio ? " en-linea" : "")} role="group" aria-label="Calculadora para las cantidades"
                 style={escritorio ? undefined : { bottom: calcBajo }}>
              <div className="fe-calc-cab">
                <span>{calcActiva === "estibas" ? "Estibas completas" : calcActiva === "saldo" ? "Saldo · cajas" : "Cajas"}</span>
                <p className="fe-calc-vista" aria-live="polite">
                  {b[calcActiva].trim() === "" ? <i>toca los números</i>
                    : esCuenta(b[calcActiva])
                      ? <>{b[calcActiva].trim()} = {ent(b[calcActiva]) != null ? <b>{nf.format(ent(b[calcActiva])!)}</b> : <b className="ojo">no entiendo la cuenta</b>}</>
                      : <b>{b[calcActiva].trim()}</b>}
                </p>
              </div>
              <div className="fe-calc-teclas">
                {["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", "+"].map((t) => (
                  <button key={t} type="button" className={/\d/.test(t) ? "num" : "op"}
                          aria-label={/\d/.test(t) ? `Número ${t}` : `Signo ${t}`}
                          onMouseDown={(e) => e.preventDefault()} onClick={() => signo(t)}>{t}</button>
                ))}
                <button type="button" aria-label="Borrar el último carácter" onMouseDown={(e) => e.preventDefault()} onClick={borrarUno}>⌫</button>
                <button type="button" className="igual" aria-label="Resolver la cuenta" onMouseDown={(e) => e.preventDefault()} onClick={() => signo("=")}>=</button>
                <button type="button" className="listo" aria-label="Cerrar la calculadora" onMouseDown={(e) => e.preventDefault()} onClick={listoCalc}>Listo</button>
              </div>
            </div>
          )}

          {/* LA CUENTA A LA VISTA: el resultado solo hay que creérselo, la
              cuenta —12 × 45 + 8— se mira contra la estiba. */}
          {cuenta && (
            <p className="fe-cuenta-linea">
              {cuenta.total == null
                ? <><b className="ojo">Sin factor estibado</b> — este material no dice cuántas cajas
                    lleva una estiba. Cuéntalo por cajas o avísale a quien lleva el maestro.</>
                : <>{cuenta.formula} = <b>{nf.format(cuenta.total)}</b> cajas</>}
            </p>
          )}
        </div>

        {/* ========= 4 · DATOS ADICIONALES — ESTADO · ROTA · MARCA · NOTA =========
            Lo raro va plegado: avería salió en 2 filas de 152, PNC en 1 y
            el estado del envase en 10. Cerrado, dice qué trae puesto —ROTA,
            AVERÍA…— para que nada quede escondido sin saberlo. */}
        <details className="fe-mas" open={mas}
                 onToggle={(e) => setMas((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>
            <span className="fe-mas-ico" aria-hidden>
              <svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="17" r="2" /></svg>
            </span>
            <span className="fe-mas-tx"><b>Datos adicionales</b>
              <span>Avería · PNC · observación · foto</span></span>
            <span className="fe-mas-marcas">
              {([b.averia && "AVERÍA", b.pnc && "PNC", fotoNueva && "FOTO"].filter(Boolean) as string[]).map((m) => <em key={m}>{m}</em>)}
            </span>
            <span className="fe-mas-fl" aria-hidden>▾</span>
          </summary>
          <div className="fe-mas-dentro">
            <div className="fe-mas-dos">
              {/* UNA SOLA PREGUNTA DE AVERÍA: «¿está averiada?». Sí marca AVERÍA solo y la foto pasa a ser
                  obligatoria; No la quita. La rotación (si la estiba se mueve) ya no se pregunta: se guarda «no». */}
              <div className="fe-rota">
                <span id="fe-rot-rota">¿Está averiada?</span>
                <div className="fe-si-no" role="group" aria-labelledby="fe-rot-rota">
                  <button type="button" className={!b.averia ? "on" : ""} aria-pressed={!b.averia}
                          onClick={() => setB((x) => ({ ...x, averia: false }))}>No</button>
                  <button type="button" className={b.averia ? "on" : ""} aria-pressed={b.averia}
                          onClick={() => setB((x) => ({ ...x, averia: true, pnc: false, pncRotulo: null, pncBloqueo: null }))}>Sí, avería</button>
                </div>
              </div>
              {/* PNC, APARTE Y OPCIONAL: sin tocar es «no». Excluye a la avería (en la hoja nunca van juntas). */}
              <div className="fe-marca-campo">
                <span id="fe-rot-marca">PNC <em>(opcional)</em></span>
                <div className="fe-marcas uno" role="group" aria-labelledby="fe-rot-marca">
                  <button type="button" className={"fe-marca" + (b.pnc ? " on" : "")}
                          aria-pressed={b.pnc}
                          onClick={() => setB((x) => ({ ...x, averia: false, pnc: !x.pnc, pncRotulo: null, pncBloqueo: null }))}>PNC</button>
                </div>
              </div>
            </div>
            {/* PNC → DOS PREGUNTAS PARA VER SI CUMPLE LA POLÍTICA DE BLOQUEO: rótulo y bloqueo mecánico. Obligatorias; nada viene marcado. */}
            {b.pnc && (
              <div className="fe-pnc-pol" role="group" aria-label="Política de bloqueo del PNC">
                <p className="fe-pnc-cab">Política de bloqueo <em className="fe-obliga">· obligatorio</em></p>
                {([["rotulo", "¿Tiene rótulo?", b.pncRotulo ?? null], ["bloqueo", "¿Tiene bloqueo mecánico?", b.pncBloqueo ?? null]] as const).map(([k, txt, v]) => (
                  <div className="fe-rota" key={k}>
                    <span id={`fe-pnc-${k}`}>{txt}</span>
                    <div className="fe-si-no" role="group" aria-labelledby={`fe-pnc-${k}`}>
                      <button type="button" className={v === false ? "on" : ""} aria-pressed={v === false}
                              onClick={() => setB((x) => ({ ...x, [k === "rotulo" ? "pncRotulo" : "pncBloqueo"]: false }))}>No</button>
                      <button type="button" className={v === true ? "on" : ""} aria-pressed={v === true}
                              onClick={() => setB((x) => ({ ...x, [k === "rotulo" ? "pncRotulo" : "pncBloqueo"]: true }))}>Sí</button>
                    </div>
                  </div>
                ))}
                {b.pncRotulo != null && b.pncBloqueo != null && (
                  <p className={"fe-pnc-veredicto " + (b.pncRotulo && b.pncBloqueo ? "cumple" : "falta")}>
                    {b.pncRotulo && b.pncBloqueo
                      ? "Cumple la política de bloqueo."
                      : `No cumple la política de bloqueo: falta ${[!b.pncRotulo && "el rótulo", !b.pncBloqueo && "el bloqueo mecánico"].filter(Boolean).join(" y ")}.`}
                  </p>
                )}
              </div>
            )}
            <label className="fe-nota"><span>Observación</span>
              <input value={b.nota} placeholder="Opcional — lo que haya que decir de esta estiba"
                     onChange={(e) => pon("nota", e.target.value)} /></label>
            {/* LA CAMARITA: evidencia de un mixeo, de una avería, de lo que
                sea. Opcional; una por renglón; no cambia ninguna cuenta. */}
            <div className="fe-foto">
              <span id="fe-rot-foto">Evidencia{b.averia && <em className="fe-obliga"> · obligatoria</em>}</span>
              <input ref={camaraNueva} type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" hidden onChange={tomarNueva} />
              <div className="fe-foto-fila" role="group" aria-labelledby="fe-rot-foto">
                <button type="button" className={"fe-foto-btn" + (fotoNueva ? " con" : "")} disabled={sellando}
                        aria-label={fotoNueva ? "Tomar otra foto" : "Tomar foto"}
                        onClick={() => { pedirUbi(); camaraNueva.current?.click() }}>
                  {fotoNueva
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={fotoNueva.url} alt="La foto de este renglón" />
                    : <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>}
                  <b>{sellando ? "Procesando…" : fotoNueva ? "Tomar otra" : "Tomar foto"}</b>
                </button>
                <p>
                  {fotoNueva
                    ? <>La foto va con este renglón. <button type="button" className="fe-foto-quitar"
                        onClick={() => setFotoNueva((x) => { if (x) URL.revokeObjectURL(x.url); return null })}>Quitarla</button></>
                    : corrigiendo && fotosDe[corrigiendo]
                      ? "Este renglón ya tiene foto. Tomar otra la reemplaza."
                      : b.averia ? "Avería: foto de la estiba rota. Sin ella no se anota."
                      : "Opcional: un mixeo, lo que haga falta para tener soporte."}
                </p>
              </div>
            </div>
            {(b.averia || b.pnc || b.estado) && (
              /* Las marcas separan la estiba dentro del mismo módulo: en el
                 Excel es la columna «UBICACIÓN COMBINADA». */
              <p className="fe-combinada">
                Va a quedar como <b>{[claveEscogida ?? "…",
                  b.averia ? "AVERIA" : "", b.pnc ? "PNC" : "", b.estado].filter(Boolean).join(" ")}</b>
                {" "}— separada de lo bueno del mismo módulo.
              </p>
            )}
          </div>
        </details>
        </>)}

        {/* ---------- LA BARRA QUE NO SE VA ----------
            «Anotar renglón» iba al final del formulario, y con cuatro
            bloques el final está fuera de la pantalla: cada estiba
            costaría bajar a buscarlo. Pegada abajo está siempre a un
            dedo, sin importar por dónde vaya el formulario.

            Y LLEVA LA CUENTA DEL BORRADOR AL LADO. Es la única cifra que
            se mira sin dejar de contar —cuántos van— y tenerla ahí
            ahorra cambiar de pestaña para averiguarlo. */}
        {/* LA PISTA VA AFUERA DE LA BARRA. Adentro partía el renglón en
            tres y, en el celular —donde la barra es oscura—, quedaba un
            recuadro blanco encima del teclado que no dejaba ver nada. */}
        {desdeTarjeta && !corrigiendo && b.codigo && (
          <p className="fe-desde-tarjeta" role="status">
            {desdeTarjeta === "igual"
              ? <>Quedó lleno como la última vez. <b>Revísalo y dale «Anotar renglón»</b> para guardarlo.</>
              : <>Todo igual que la última vez, fecha incluida: <b>corrige solo la cantidad</b> y dale «Anotar renglón».</>}
          </p>
        )}
        <div className="fe-barra-fija">
          <p className="fe-fija-cuenta">
            <b>{renglones.length}</b> en el borrador
          </p>
          <button type="button" className="btn grande" disabled={guardando} onClick={mod.sinAcceso && !corrigiendo ? anotarSinAcceso : anotar} ref={botonAnotar}>
            {guardando ? "Guardando…" : corrigiendo ? "Guardar la corrección" : mod.sinAcceso ? "Anotar módulo sin acceso" : "Anotar renglón"}
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
            {renglones.length} {renglones.length === 1 ? "renglón" : "renglones"} ·{" "}
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

        {Object.entries(marcasMod).some(([, m]) => m.mezclado || m.sin_acceso) && (
          <div className="fe-marcados">
            <p><b>Módulos marcados</b></p>
            <ul>
              {Object.entries(marcasMod).filter(([, m]) => m.mezclado || m.sin_acceso).map(([id, m]) => (
                <li key={id}>
                  <span><b>{ubicaciones.find((u) => u.id === id)?.clave ?? "Módulo"}</b>{" "}
                    {m.sin_acceso ? <em className="mal">SIN ACCESO</em> : <em>MEZCLADO</em>}</span>
                  {m.ruta && <button type="button" className="fe-mini" onClick={async () => {
                    const { data, error } = await supabase.storage.from("inventario").createSignedUrl(m.ruta!, 600);
                    if (error || !data?.signedUrl) avisar.mal("No se pudo abrir la foto."); else window.open(data.signedUrl, "_blank", "noopener");
                  }}>Ver foto</button>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {renglones.length > 0 && (
          <div className="fe-fichas">
            <Ficha titulo="Total del borrador" ficha={fichaTodo} />
            {filtrando && <Ficha titulo="Lo que ves con el filtro" ficha={fichaVista} suave />}
          </div>
        )}

        {(cortos.length > 0 || semana.length > 0) && (
          <div className={"fe-alerta" + (cortos.length > 0 ? " mal" : "")}>
            {cortos.length > 0 && (
              <p>
                <b>{cortos.length} {cortos.length > 1 ? "renglones" : "renglón"} ya se pasó de su
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

        {claveEscogida && deAqui.length > 0 && !filtrando && (
          <p className="fe-aqui">
            En <b>{claveEscogida}</b> llevas {deAqui.length} {deAqui.length > 1 ? "renglones" : "renglón"}{" "}
            ({nf.format(cajasAqui)} cajas)
          </p>
        )}

        {renglones.length === 0 ? (
          <p className="fe-vacio">Todavía no has anotado nada. Escoge el módulo y arranca.</p>
        ) : (
          <>
            <input ref={camaraFila} type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" hidden onChange={fotoDeFila} />
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
                    {fotosDe[r.id] && (
                      <button type="button" className="fe-mini fe-foto-ver" onClick={() => void verFoto(r.id)}>Ver foto</button>
                    )}
                    <button type="button" className="fe-mini" disabled={guardando || sellando}
                            aria-label={fotosDe[r.id] ? "Cambiar la foto" : "Poner foto"}
                            onClick={() => { filaDeFoto.current = r.id; pedirUbi(); camaraFila.current?.click() }}>
                      {fotosDe[r.id] ? "Otra foto" : "Foto"}
                    </button>
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
