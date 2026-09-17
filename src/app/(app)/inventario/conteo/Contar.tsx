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

import { useMemo, useRef, useState } from "react";
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

/* Lo que se teclea de un renglón, todo junto. Va en un solo objeto para
   que corregir sea CARGARLO y no reconstruirlo campo por campo: con doce
   estados sueltos, abrir una fila para corregirla era doce asignaciones
   y olvidar una dejaba el dato de la fila anterior. */
type Modo = "estibas" | "cajas" | "saldo";

type Borrador = {
  calle: string;
  /* EL MÓDULO YA NO ES LA UBICACIÓN: es el módulo pelado —«A01»— y el
     lado va aparte. La ubicación sale de juntar los dos. En la lista
     salía «A01_DER», que obligaba a escoger el lado dos veces: una
     dentro del nombre del módulo y otra en el campo de al lado. */
  base: string;
  lado: string;
  codigo: string;
  dia: string; mes: string; anio: string;
  modo: Modo; cuantas: string;
  rot: boolean | null;
  averia: boolean; pnc: boolean; estado: string; nota: string;
};
const VACIO: Borrador = {
  calle: "", base: "", lado: "", codigo: "", dia: "", mes: "", anio: "",
  modo: "estibas", cuantas: "", rot: null,
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
  const [b, setB] = useState<Borrador>(VACIO);
  const campoCodigo = useRef<HTMLInputElement>(null);

  const pon = <K extends keyof Borrador>(k: K, v: Borrador[K]) =>
    setB((x) => ({ ...x, [k]: v }));

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

  function limpiar(dejarSitio: boolean) {
    setCorrigiendo(null);
    setB((x) => dejarSitio
      /* SOLO EL SITIO SE QUEDA: sigo parado frente al mismo módulo. Todo
         lo demás vuelve a cero —código, fecha, cantidad, ¿rota?, las
         marcas— porque el siguiente renglón es otra estiba.

         LA FECHA SE QUEDABA, y estaba mal. La dejé pensando que dentro
         de un módulo las estibas son del mismo lote, y sí lo son a
         veces; pero cuando NO lo son hay que borrar tres casillas antes
         de teclear la nueva, y eso es peor que teclearlas. Y hay algo
         más grave: una fecha que se quedó puesta no se ve como un campo
         por llenar, se ve como un campo ya lleno. Un renglón con la
         fecha del anterior se anota sin que nadie lo note. */
      ? { ...VACIO, calle: x.calle, base: x.base, lado: x.lado }
      : VACIO);
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
    if (ent(b.cuantas) == null) return `¿Cuántas ${b.modo}?`;
    if (b.rot == null) return "Falta decir si rota.";
    if (!esEnvase && (ent(b.dia) == null || ent(b.mes) == null || b.anio.trim() === ""))
      return "Falta la fecha de vencimiento.";
    return null;
  }

  const argumentos = () => ({
    p_sku: material!.sku,
    p_ubicacion: ubicacion!.id,
    p_rotacion: b.rot,
    p_estibas: b.modo === "estibas" ? ent(b.cuantas) : null,
    p_cajas: b.modo === "cajas" ? ent(b.cuantas) : null,
    p_saldo: b.modo === "saldo" ? ent(b.cuantas) : null,
    p_venc_dia: ent(b.dia), p_venc_mes: ent(b.mes),
    p_venc_anio: b.anio.trim() === "" ? null : Number(b.anio.trim()),
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
      : `${material!.sku} · ${ent(b.cuantas)} ${b.modo} anotadas.`);
    /* Corregir DEVUELVE al borrador: se vino de ahí a arreglar una fila y
       ahí es donde se comprueba que quedó bien. Anotar se queda en el
       formulario, que es donde va el siguiente renglón. */
    if (corrigiendo) setPestania("borrador");
    limpiar(!corrigiendo);
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
      dia: r.venc_dia != null ? String(r.venc_dia) : "",
      mes: r.venc_mes != null ? String(r.venc_mes) : "",
      anio: r.venc_anio != null ? String(r.venc_anio) : "",
      /* El modo se deduce de cuál de las TRES vino llena. El orden
         importa: `estibas ?? cajas ?? saldo` con estibas en cero daría
         cero y parecería vacío, así que se compara contra null. */
      modo: r.estibas != null ? "estibas" : r.saldo != null ? "saldo" : "cajas",
      cuantas: String(r.estibas ?? r.saldo ?? r.cajas ?? ""),
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
    if (corrigiendo === r.id) limpiar(false);
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
    setConteo(null); setRenglones([]); limpiar(false);
    router.refresh();
  }

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
            <button type="button" className="fe-mini" onClick={() => limpiar(false)}>
              Dejarlo como estaba
            </button>
          )}
        </div>

        {/* ---------- 1 · CAL · MOD · D/I ----------
            LOS TRES SE TECLEAN. Eran desplegables del navegador, y con
            428 ubicaciones el desplegable solo deja saltar por la
            primera letra: llegar a E06 era pulsar «E» y rodar. Ahora se
            escribe «e06» y queda una. */}
        <div className="fe-tres">
          <label><span>Calle</span>
            <Buscador
              valor={b.calle}
              marcador="Todas"
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
              /* SIN EL LADO EN EL NOMBRE. Salía «A01_DER · RB F1000», que
                 hacía escoger el lado dos veces: dentro del módulo y en
                 el campo de al lado. */
              opciones={modulos.map((m) => ({
                valor: m.base,
                texto: `${m.calle}${m.modulo}`,
                pista: m.familia,
              }))}
              onEscoge={(base) => {
                const u = ubicaciones.find((x) => x.activa && claveBase(x) === base);
                const posibles = ubicaciones.filter((x) => x.activa && claveBase(x) === base);
                /* Escoger el módulo pone su calle sola, y si solo tiene
                   un lado lo pone también: preguntar «¿izquierdo o
                   derecho?» donde no hay más que uno es un toque de más
                   por renglón. La fecha se borra —arrastrar la del
                   módulo anterior es cómo se cuela una fecha ajena. */
                setB((x) => ({ ...x, base,
                               calle: u?.calle ?? x.calle,
                               lado: posibles.length === 1 ? (posibles[0].lado ?? "") : "",
                               dia: "", mes: "", anio: "" }));
              }} /></label>

          {/* EL LADO SE ESCOGE, y solo entre los que ese módulo tiene.
              Puede tener los dos, uno, o ninguno —EST07, JAULA_PNC—.
              Ofrecer «izquierdo» donde no existe es ofrecer una
              ubicación que no está, que es lo que dejó 38 de las 152
              filas de la hoja sin poder ubicar. */}
          <label><span>Lado</span>
            {!b.base ? (
              <output className="fe-lado">—</output>
            ) : lados.length === 1 ? (
              <output className="fe-lado">{lados[0] === "" ? "sin lado" : lados[0]}</output>
            ) : (
              <select value={b.lado} onChange={(e) => pon("lado", e.target.value)}>
                <option value="">Escoge…</option>
                {lados.map((l) => (
                  <option key={l} value={l}>{l === "" ? "Sin lado" : l === "IZQ" ? "Izquierdo" : "Derecho"}</option>
                ))}
              </select>
            )}
          </label>
        </div>

        {/* ---------- 2 · CÓDIGO y su DESCRIPCIÓN ----------
            MITAD Y MITAD, y del mismo tamaño. La descripción iba debajo
            en letra chica, como una nota al pie, y es LA CONFIRMACIÓN de
            que se tecleó el código correcto: 3128 y 3182 existen los
            dos. Lo que confirma un dato no puede ser más pequeño que el
            dato. */}
        <div className="fe-cod-dos">
          {/* EL MARCADOR NO PUEDE SER UN CÓDIGO DE VERDAD. Decía «3128»,
              que es la Águila 330, y en gris claro dentro de un campo
              grande se lee como un campo YA LLENO — sobre todo después
              de anotar, que es justo cuando el campo acaba de vaciarse.
              Un ejemplo que se puede confundir con un dato no es un
              ejemplo, es un error esperando. */}
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

        {/* ---------- 3 · VENCIMIENTO ---------- */}
        <div className={"fe-fecha" + (esEnvase ? " opcional" : "")}>
          <span>Vence</span>
          {esEnvase && <em className="fe-opcional">el envase no trae fecha</em>}
          <div className="fe-dma">
            <input inputMode="numeric" maxLength={2} placeholder="DD" value={b.dia}
                   onChange={(e) => pon("dia", e.target.value)} />
            <input inputMode="numeric" maxLength={2} placeholder="MM" value={b.mes}
                   onChange={(e) => pon("mes", e.target.value)} />
            <input inputMode="numeric" maxLength={2} placeholder="AA" value={b.anio}
                   onChange={(e) => pon("anio", e.target.value)} />
          </div>
        </div>

        {/* ---------- 4 · ESTIBAS | CAJAS | ROT ----------
            ESTIBAS Y CAJAS SON LA MISMA CASILLA CON DOS NOMBRES. En la
            hoja son dos columnas y en 151 de 152 filas una de las dos va
            vacía; la única que traía las dos es un dedazo. Poner las dos
            invita a repetirlo. */}
        <div className="fe-tres">
          <label><span>Qué cuentas</span>
            {/* ARRANCA EN ESTIBAS porque es lo que más se cuenta: quien
                llega a un módulo lleno anota estibas y sigue. Saldo es
                lo que queda de una estiba a medias, y cajas son las
                sueltas — las dos se escogen, la común viene puesta. */}
            <select value={b.modo} onChange={(e) => pon("modo", e.target.value as Modo)}>
              <option value="estibas">Estibas</option>
              <option value="saldo">Saldo</option>
              <option value="cajas">Cajas</option>
            </select></label>
          <label><span>Cuántas</span>
            <input inputMode="numeric" value={b.cuantas}
                   onChange={(e) => pon("cuantas", e.target.value)} /></label>
          {/* ROT SE CONTESTA SIEMPRE: 94 «SI» y 58 «NO» en las 152 filas.
              Arranca vacío porque preseleccionar «no» habría quedado 58
              veces bien y 94 veces mal. */}
          <div className="fe-rota">
            <span>¿Rota?</span>
            <div className="fe-si-no">
              <button type="button" className={b.rot === true ? "on" : ""}
                      onClick={() => pon("rot", true)}>Sí</button>
              <button type="button" className={b.rot === false ? "on" : ""}
                      onClick={() => pon("rot", false)}>No</button>
            </div>
          </div>
        </div>

        {/* ---------- 5 · AVER | PNC | ESTA ----------
            Lo raro va de último y sin abultar: avería salió en 2 filas de
            152, PNC en 1 y el estado del envase en 10. Darles el peso del
            código sería cobrarle a los 150 renglones normales el costo de
            los tres raros. */}
        <div className="fe-tres fe-marcas">
          <label className="fe-check">
            <input type="checkbox" checked={b.averia}
                   onChange={(e) => pon("averia", e.target.checked)} />
            <span>Avería</span>
          </label>
          <label className="fe-check">
            <input type="checkbox" checked={b.pnc}
                   onChange={(e) => pon("pnc", e.target.checked)} />
            <span>PNC</span>
          </label>
          <label><span>Estado del envase</span>
            <select value={b.estado} onChange={(e) => pon("estado", e.target.value)}>
              <option value="">—</option>
              {estados.map((e) => <option key={e} value={e}>{e}</option>)}
            </select></label>
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

        <button type="button" className="btn grande" disabled={guardando} onClick={anotar}>
          {guardando ? "Guardando…" : corrigiendo ? "Guardar la corrección" : "Anotar renglón"}
        </button>
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
        </div>

        {ubicacion && deAqui.length > 0 && (
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
              {renglones.map((r) => (
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
                    <div><dt>{r.estibas != null ? "Estibas" : "Cajas"}</dt>
                      <dd>{r.estibas ?? r.cajas}</dd></div>
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
