"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Baja, Produccion, Meta, Carga, MesAnio } from "@/modulos/quiebra/datos";
import { Calendario, useAfuera } from "@/components/CalendarioRango";
import { TablaAnio } from "@/components/TablaAnio";
import { createClient } from "@/lib/supabase/client";

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_LARGO = ["enero","febrero","marzo","abril","mayo","junio","julio",
                     "agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS_SEM = ["L","M","M","J","V","S","D"];

/**
 * El color va atado al NOMBRE de la causal, no a su posición: si mañana una
 * causal sube o baja en el ranking, no se le cambia el color debajo.
 */
const COLOR_CAUSAL: Record<string, string> = {
  "Sorting distribución": "#E4002B",
  "Presorting": "#B8001F",
  "Rotura máquina": "#8E0018",
  "Sorting envase": "#E9A81F",
  "Lavado / extrasucio": "#C58A12",
  "Otros": "#9AA9BB",
  "Rotura depósito": "#C6D0DC",
};
const OTRO_COLOR = "#7E8CA0";
const color = (c: string) => COLOR_CAUSAL[c] ?? OTRO_COLOR;

const nf = new Intl.NumberFormat("es-CO");
const pf = (v: number | null | undefined, d = 2) =>
  v == null ? "—" : (v * 100).toFixed(d).replace(".", ",") + "%";
const mesDe = (f: string) => Number(f.slice(5, 7));

/* --------- fechas como texto AAAA-MM-DD: sin líos de zona horaria --------- */
const aTexto = (a: number, m: number, d: number) =>
  `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const partes = (f: string) => ({
  a: Number(f.slice(0, 4)), m: Number(f.slice(5, 7)) - 1, d: Number(f.slice(8, 10)),
});
const bonita = (f: string) => {
  const { a, m, d } = partes(f);
  return `${d} ${MESES[m].toLowerCase()} ${a}`;
};
const diasDelMes = (a: number, m: number) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
/** 0 = lunes, para que la semana empiece como se lee aquí. */
const primerDia = (a: number, m: number) => (new Date(Date.UTC(a, m, 1)).getUTCDay() + 6) % 7;

type Props = {
  bajas: Baja[];
  produccion: Produccion[];
  metas: Meta[];
  ultimaCarga: Carga | null;
  esEditor: boolean;
  /** El año mes por mes, ya con lo escrito a mano del diario aplicado. */
  meses?: MesAnio[];
  /** Lo guardado del simulador, un renglón por mes. */
  simuladores?: Guardado[];
};

/** Lo que alguien dejó guardado para un mes. */
type Guardado = {
  anio: number; mes: number; cona: number; pct: number;
  /** null = no se escribió: se usa la que calcula la plataforma. */
  baja: number | null;
  quien: string | null; cuando: string;
};

export function TableroQuiebra({
  bajas, produccion, metas, ultimaCarga, esEditor, meses = [], simuladores = [],
}: Props) {
  /* ------------------------ catálogos ------------------------ */
  const causales = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bajas) m.set(b.causal, (m.get(b.causal) ?? 0) + Number(b.cantidad));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }, [bajas]);

  const almacenes = useMemo(
    () => [...new Set(bajas.map((b) => b.almacen).filter(Boolean))].sort() as string[],
    [bajas]
  );
  const lineas = useMemo(
    () => [...new Set(produccion.map((p) => p.linea).filter((l) => l != null))]
      .sort((a, b) => Number(a) - Number(b)) as number[],
    [produccion]
  );

  const [minF, maxF] = useMemo(() => {
    const f = [...bajas.map((b) => b.fecha), ...produccion.map((p) => p.fecha)].sort();
    return [f[0] ?? "", f[f.length - 1] ?? ""];
  }, [bajas, produccion]);

  /* ------------------------ filtros ------------------------ */
  const [desde, setDesde] = useState(minF);
  const [hasta, setHasta] = useState(maxF);
  const [almacen, setAlmacen] = useState("");
  const [linea, setLinea] = useState("");
  const [apagadas, setApagadas] = useState<Set<string>>(new Set());

  const metaDe = (m: number) => metas.find((x) => x.mes === m)?.meta ?? 0.016;

  const bj = useMemo(
    () => bajas.filter((b) =>
      b.fecha >= desde && b.fecha <= hasta &&
      (almacen === "" || b.almacen === almacen) &&
      !apagadas.has(b.causal)
    ),
    [bajas, desde, hasta, almacen, apagadas]
  );
  const pr = useMemo(
    () => produccion.filter((p) =>
      p.fecha >= desde && p.fecha <= hasta && (linea === "" || String(p.linea) === linea)
    ),
    [produccion, desde, hasta, linea]
  );

  const perdida = bj.reduce((a, b) => a + Number(b.cantidad), 0);
  const total = pr.reduce((a, p) => a + Number(p.cantidad), 0);
  const pct = total > 0 ? perdida / total : null;

  const prodMes = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of pr) m.set(mesDe(p.fecha), (m.get(mesDe(p.fecha)) ?? 0) + Number(p.cantidad));
    return m;
  }, [pr]);
  const perdMes = useMemo(() => {
    const m = new Map<number, number>();
    for (const b of bj) m.set(mesDe(b.fecha), (m.get(mesDe(b.fecha)) ?? 0) + Number(b.cantidad));
    return m;
  }, [bj]);

  // La meta del período se pondera por producción: un mes que produjo poco no
  // puede pesar igual que uno que produjo el triple.
  const meta = useMemo(() => {
    let a = 0, t = 0;
    for (const [m, v] of prodMes) { a += v * metaDe(m); t += v; }
    return t ? a / t : 0.016;
  }, [prodMes, metas]);

  /* La tabla del año usa el año del último día del filtro, y las metas
     con la misma llave "AAAA-MM" que espera el componente compartido. */
  const anioTabla = useMemo(() => {
    const a = Number((hasta || maxF || "").slice(0, 4));
    return Number.isFinite(a) && a > 2000 ? a : null;
  }, [hasta, maxF]);
  const mapaMetas = useMemo(() => {
    const m: Record<string, number> = {};
    for (const x of metas) m[`${x.anio}-${String(x.mes).padStart(2, "0")}`] = Number(x.meta);
    return m;
  }, [metas]);

  const exceso = Math.round(total * ((pct ?? 0) - meta));
  const sobre = pct != null && pct > meta;
  const pp = ((pct ?? 0) - meta) * 100;
  const parcial = apagadas.size > 0 || almacen !== "" || linea !== "";

  if (bajas.length === 0 && produccion.length === 0) {
    return (
      <div className="qb">
        <div className="vacio-total">
          <h2>Todavía no hay datos cargados</h2>
          <p>
            El tablero se arma con las hojas <b>BAJA MB51</b> y <b>ZPREC</b> del
            maestro. Importa el archivo y aparece solo.
          </p>
          {esEditor ? (
            <Link href="/quiebra/importar">Importar el maestro</Link>
          ) : (
            <p>Pídele a un supervisor que lo importe.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="qb">
      {/* Solo sale en el papel: el PDF no lleva la barra de la app. */}
      <div className="hoja-impresa">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-b.png" alt="" />
        <div>
          <b>CD38 · CONTROL</b>
          <span>Centro de Distribución 38 · Bavaria BAQ</span>
        </div>
        <div className="sello-fecha">
          Quiebra de envase<br />
          {bonita(desde)} — {bonita(hasta)}
        </div>
      </div>

      {/* ---------------- Encabezado ---------------- */}
      <section className="cabeza" data-parte="cabeza">
        <div className="texto">
          <div className="ojo">ENVASE RETORNABLE · AG01</div>
          <h1>Quiebra de envase</h1>
          <p className="sub">
            Rotura medida contra la producción del período.
            {ultimaCarga && <> Datos del {bonita(ultimaCarga.desde)} al {bonita(ultimaCarga.hasta)}.</>}
            {" "}<Link href="/quiebra/diario">Ver el día a día</Link>
            {esEditor && <> · <Link href="/quiebra/importar">Actualizar</Link></>}
          </p>
        </div>
        <div className="lado-derecho">
        <AccionesInforme
          armar={() => construirInforme({
            desde, hasta,
            filtros: resumenFiltros(almacen, linea, causales, apagadas),
          })}
        />
        <div className={"kpi" + (sobre ? "" : " bajo")}>
          <div className="corte" />
          <div className="rot">QUIEBRA DEL PERÍODO</div>
          <div className="num">{pf(pct)}</div>
          <div className="pie">
            <span>Meta <b>{pf(meta)}</b>{parcial ? " · filtrado" : ""}</span>
            <span className="delta">
              {pp >= 0 ? "+" : "−"}{Math.abs(pp).toFixed(2).replace(".", ",")} pp{" "}
              {sobre ? "sobre" : "bajo"} la meta
            </span>
          </div>
        </div>
        </div>
      </section>

      {/* ---------------- Filtros ---------------- */}
      <section className="filtros">
        <div className="arriba">
          <div className="sel">
            <label>Período</label>
            <Calendario
              desde={desde} hasta={hasta} minF={minF} maxF={maxF}
              aplicar={(d, h) => { setDesde(d); setHasta(h); }}
            />
          </div>

          <div className="sel">
            <label>Almacén</label>
            <Desplegable
              valor={almacen} cambiar={setAlmacen}
              opciones={[{ v: "", t: "Todos" }, ...almacenes.map((a) => ({ v: a, t: a }))]}
            />
          </div>

          <div className="sel">
            <label>Línea</label>
            <Desplegable
              valor={linea} cambiar={setLinea}
              opciones={[{ v: "", t: "Todas" },
                         ...lineas.map((l) => ({ v: String(l), t: `Línea ${l}` }))]}
            />
          </div>

          <button
            className="limpiar"
            onClick={() => {
              setDesde(minF); setHasta(maxF); setAlmacen(""); setLinea(""); setApagadas(new Set());
            }}
          >
            Restablecer
          </button>
        </div>

        <div className="causales">
          <span className="rot">Causales</span>
          {causales.map((c) => {
            const on = !apagadas.has(c);
            return (
              <button
                key={c}
                className={"chip" + (on ? "" : " off")}
                aria-pressed={on}
                onClick={() => {
                  const n = new Set(apagadas);
                  // nunca se apagan todas: el tablero quedaría en cero sin explicación
                  if (on && apagadas.size < causales.length - 1) n.add(c);
                  else n.delete(c);
                  setApagadas(n);
                }}
              >
                <i style={{ background: color(c) }} />
                {c}
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------- Cifras ---------------- */}
      <section className="cifras" data-parte="cifras">
        <div className="cifra">
          <div className="rot">ENVASE PRODUCIDO</div>
          <div className="n">{nf.format(total)}</div>
          <div className="u">unidades</div>
        </div>
        <div className="cifra">
          <div className="rot">ENVASE ROTO</div>
          <div className="n">{nf.format(perdida)}</div>
          <div className="u">neto de reversos</div>
        </div>
        <div className={"cifra " + (exceso > 0 ? "alerta" : "buena")}>
          <div className="rot">{exceso > 0 ? "EXCESO SOBRE META" : "MARGEN BAJO LA META"}</div>
          <div className="n">{nf.format(Math.abs(exceso))}</div>
          <div className="u">
            {exceso > 0 ? "unidades por encima de lo permitido" : "unidades por debajo de lo permitido"}
          </div>
        </div>
      </section>

      {/* ---------------- Fila 1 ---------------- */}
      <section className="tarjetas" data-parte="graficos1">
        <div className="tarjeta">
          <div className="cab">
            <div>
              <h2>Quiebra mensual contra meta</h2>
              <p>Porcentaje sobre la producción del mes</p>
            </div>
          </div>
          <div className="cuerpo">
            <GraficoMes prodMes={prodMes} perdMes={perdMes} metaDe={metaDe} />
            <div className="leyenda abajo">
              <span><i style={{ background: "#0B4EA2" }} /> Bajo meta</span>
              <span><i style={{ background: "#E4002B" }} /> Sobre meta</span>
              <span><i className="meta" /> Meta del mes</span>
            </div>
          </div>
        </div>

        <div className="tarjeta">
          <div className="cab">
            <div>
              <h2>De dónde sale la quiebra</h2>
              <p>Participación en el período</p>
            </div>
          </div>
          <div className="cuerpo doble">
            <div className="parte">
              <div className="rotulo">Por causal</div>
              <Barras
                datos={causales.map((c) => ({
                  nom: c,
                  v: bj.filter((b) => b.causal === c).reduce((a, b) => a + Number(b.cantidad), 0),
                  col: color(c),
                }))}
                total={perdida}
              />
            </div>
            <div className="parte abajo-parte">
              <div className="rotulo">Por almacén</div>
              <Barras
                datos={almacenes.map((a) => ({
                  nom: a,
                  v: bj.filter((b) => b.almacen === a).reduce((x, b) => x + Number(b.cantidad), 0),
                  col: "#E4002B",
                })).sort((x, y) => y.v - x.v)}
                total={perdida}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Fila 2 ---------------- */}
      <section className="tarjetas dos" data-parte="graficos2">
        <TarjetaDia bajas={bj} prod={pr} meta={meta} />

        <div className="tarjeta">
          <div className="cab">
            <div>
              <h2>Composición mes a mes</h2>
              <p>Unidades rotas por causal</p>
            </div>
          </div>
          <div className="cuerpo">
            <GraficoApilado bajas={bj} causales={causales} />
            <div className="leyenda abajo">
              {causales.filter((c) => !apagadas.has(c)).map((c) => (
                <span key={c}><i style={{ background: color(c) }} /> {c}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Fila 3 ---------------- */}
      <section className="tarjetas pareja" data-parte="tablas">
        <div className="tarjeta">
          <div className="cab"><div><h2>Quiebra por envase</h2><p>Top 8 del período</p></div></div>
          <div className="cuerpo tabla">
            <TablaMateriales bajas={bj} total={perdida} />
          </div>
        </div>

        <div className="tarjeta">
          <div className="cab"><div><h2>Detalle mensual</h2><p>Producción, quiebra y meta</p></div></div>
          <div className="cuerpo tabla">
            <TablaMes prodMes={prodMes} perdMes={perdMes} metaDe={metaDe} />
          </div>
        </div>
      </section>

      {/* ---------------- El simulador de CONA ---------------- */}
      <Simulador guardados={simuladores} meses={meses} esEditor={esEditor} hasta={hasta} />

      {/* ---------------- El año mes por mes ---------------- */}
      {anioTabla != null && (
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>El año mes por mes</h2>
              <p>
                Con lo escrito a mano del diario aplicado, no solo lo importado.{" "}
                <Link href="/quiebra/diario">Escribirlo en el diario</Link>
              </p>
            </div>
          </div>
          <TablaAnio
            anio={anioTabla}
            meses={meses.filter((m) => m.anio === anioTabla)}
            metas={mapaMetas}
          />
        </section>
      )}

      <p className="nota-pie">
        {nf.format(bj.length)} de {nf.format(bajas.length)} movimientos de baja y{" "}
        {nf.format(pr.length)} de {nf.format(produccion.length)} órdenes de producción dentro
        del filtro actual. La quiebra es neta: los reversos con cantidad positiva restan.
      </p>
    </div>
  );
}

/* ---------- Escribir cifras con los puntos puestos ----------
   Se reformatea EN CADA TECLA y hay que devolver el cursor a su sitio:
   al reescribir el valor, el navegador lo manda al final, y corregir un
   dígito en la mitad de "85.166.358" se vuelve imposible. El truco es
   contar DÍGITOS antes del cursor —no caracteres— y volver a esa
   posición contando dígitos otra vez: así los puntos que entran o salen
   no lo corren. */
const soloDigitos = (t: string) => t.replace(/\D/g, "");
const conPuntos = (t: string) => {
  const d = soloDigitos(t);
  return d === "" ? "" : nf.format(Number(d));
};
function alEscribirCifra(
  e: React.ChangeEvent<HTMLInputElement>,
  poner: (v: string) => void
) {
  const caja = e.target;
  const antes = caja.selectionStart ?? caja.value.length;
  const digitosAntes = soloDigitos(caja.value.slice(0, antes)).length;
  const nuevo = conPuntos(caja.value);
  poner(nuevo);
  /* Después de que React repinte: si se hiciera ya mismo, el valor de la
     caja todavía es el viejo y el cursor quedaría mal igual. */
  requestAnimationFrame(() => {
    let i = 0, vistos = 0;
    while (i < nuevo.length && vistos < digitosAntes) {
      if (/\d/.test(nuevo[i])) vistos++;
      i++;
    }
    caja.setSelectionRange(i, i);
  });
}

/* ==================== EL SIMULADOR DE CONA ====================
   La pregunta que responde es una sola: cuánta quiebra me queda antes de
   pasarme del tope del mes.

       CONA            se escribe    las unidades que se van a producir
       % Quiebra       se escribe    el tope con el que se trabaja
       Proyección und  = CONA × %    cuántas unidades me puedo permitir
       Disponible      = Proyección − lo que ya llevo roto ESTE MES

   Dos decisiones que no son de adorno:

   · Lo de abajo NO se guarda. Se calcula. Guardar una cifra que sale de
     otras dos es guardarse el derecho a que un día no cuadren, y cuando
     eso pasa nadie sabe cuál de las tres está mal.

   · La quiebra que se resta es la del MES EN CURSO, no la del filtro de
     arriba. Es a propósito y por eso está escrito en la pantalla: el
     filtro sirve para mirar mayo desde septiembre, y el disponible de
     septiembre no cambia porque uno esté mirando mayo. Se toma de
     `meses`, que ya trae lo escrito a mano del diario aplicado sobre lo
     importado — no del subconjunto filtrado.
   ============================================================== */
function Simulador({ guardados, meses, esEditor, hasta }: {
  guardados: Guardado[];
  meses: MesAnio[];
  esEditor: boolean;
  /** El último día del filtro. Su mes es del que habla esta tarjeta. */
  hasta: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  /* EL MES DEL QUE SE HABLA ES EL DEL "HASTA" DEL FILTRO, no el de hoy.
     De enero a agosto, esta tarjeta habla de agosto; de enero a julio,
     de julio. Es lo que se espera: el filtro dice hasta dónde se está
     mirando, y el disponible es el de ese cierre. Se lee del texto de la
     fecha y no con Date, para no cruzar la frontera del mes por la zona
     horaria del navegador. */
  const anio = Number(hasta.slice(0, 4));
  const mes = Number(hasta.slice(5, 7));
  const nombreMes = MESES_LARGO[mes - 1] ?? "";
  /* LO QUE SE ACABA DE GUARDAR, sin esperar al servidor.
     `guardados` viene del render del servidor y no cambia porque uno
     guarde: guardar agosto, irse a septiembre y volver mostraba otra vez
     el agosto VIEJO, con toda la pinta de que no se hubiera guardado.
     Se queda aquí lo que esta sesión ya escribió, y router.refresh()
     trae después la versión del servidor —que dirá lo mismo—. */
  const [propios, setPropios] = useState<Record<string, Guardado>>({});
  const llaveMes = `${anio}-${mes}`;
  const guardado = useMemo(
    () => propios[llaveMes] ?? guardados.find((g) => g.anio === anio && g.mes === mes) ?? null,
    [propios, llaveMes, guardados, anio, mes]
  );

  /* Se guarda como fracción y se escribe como porcentaje: la conversión
     vive AQUÍ y en un solo sitio. */
  const comoTexto = (g: Guardado | null) => ({
    cona: g ? nf.format(Math.round(g.cona)) : "",
    pct: g ? String(+(g.pct * 100).toFixed(4)).replace(".", ",") : "",
    baja: g && g.baja != null ? nf.format(Math.round(g.baja)) : "",
  });

  const [cona, setCona] = useState(() => comoTexto(guardado).cona);
  const [pct, setPct] = useState(() => comoTexto(guardado).pct);
  const [baja, setBaja] = useState(() => comoTexto(guardado).baja);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  /* Al CAMBIAR DE MES se recarga lo de ese mes. Sin esto, mover el filtro
     de agosto a julio dejaba en pantalla el CONA de agosto encima de los
     datos de julio: la cuenta salía con dos meses mezclados y con toda la
     pinta de estar bien. Depende solo del mes —no de lo tecleado—, así
     que no pisa nada mientras alguien escribe. */
  const mesRef = useRef(`${anio}-${mes}`);
  useEffect(() => {
    const llave = `${anio}-${mes}`;
    if (mesRef.current === llave) return;
    mesRef.current = llave;
    const t = comoTexto(guardado);
    setCona(t.cona);
    setPct(t.pct);
    setBaja(t.baja);
    setAviso(null);
  }, [anio, mes, guardado]);

  /* OJO CON EL PUNTO. Desde que las cifras se escriben con separador de
     miles, "85.166.358" tiene puntos que NO son decimales: quitar todo
     menos dígitos y puntos daba 85,166 en vez de 85.166.358 —cinco
     órdenes de magnitud menos— y el disponible salía absurdo sin que
     nada pareciera roto. Las unidades son enteras: solo dígitos.
     El porcentaje es el único con decimales, y su separador es la coma. */
  const nCona = Number(soloDigitos(cona));
  const nPct = Number(pct.replace(",", ".").replace(/[^\d.]/g, "")) / 100;
  const hay = cona.trim() !== "" && pct.trim() !== "" &&
              Number.isFinite(nCona) && Number.isFinite(nPct) && nCona > 0 && nPct > 0;

  const proyeccion = hay ? Math.round(nCona * nPct) : null;

  /* La quiebra del mes se puede ESCRIBIR. Si el campo va en blanco se usa
     la que calcula la plataforma: hay meses en los que lo importado
     todavía no está completo —falta el archivo, o faltan días del
     diario— y entonces el disponible salía mostrando la proyección
     entera, como si no se hubiera roto nada.
     El blanco no es un cero: en blanco quiere decir "usa la tuya", y un
     cero escrito quiere decir "este mes no se rompió nada". */
  const delaApp = meses.find((m) => m.anio === anio && m.num_mes === mes)?.baja ?? 0;
  const nBaja = Number(soloDigitos(baja));
  const bajaEscrita = baja.trim() !== "" && Number.isFinite(nBaja) && nBaja >= 0;
  const delMes = bajaEscrita ? nBaja : delaApp;
  /* Se avisa solo cuando de verdad discrepan: ver las dos cifras cuando
     dicen lo mismo es ruido, y verlas cuando no, es el aviso de que una
     de las dos está desactualizada. */
  const discrepa = bajaEscrita && Math.abs(nBaja - delaApp) >= 1;

  const disponible = proyeccion == null ? null : Math.round(proyeccion - delMes);

  /* "Guardar cambios" solo si de verdad cambió algo. Un botón que
     siempre se puede tocar no dice si hay algo sin guardar. */
  const sucio = hay && (
    guardado == null ||
    Math.abs(nCona - guardado.cona) > 0.005 ||
    Math.abs(nPct - guardado.pct) > 0.000005 ||
    (bajaEscrita ? guardado.baja == null || Math.abs(nBaja - guardado.baja) > 0.005
                 : guardado.baja != null)
  );

  async function guardar() {
    setAviso(null);
    setGuardando(true);
    const { error } = await supabase.rpc("quiebra_simulador_guardar", {
      p_anio: anio, p_mes: mes, p_cona: nCona, p_pct: Number(nPct.toFixed(5)),
      p_baja: bajaEscrita ? nBaja : null,
    });
    setGuardando(false);
    if (error) {
      setAviso({
        mal: true,
        texto: /does not exist|schema cache/i.test(error.message)
          ? "Falta crear la tabla en Supabase: ejecuta supabase/migraciones/2026-09-simulador-cona.sql."
          : error.message,
      });
      return;
    }
    /* Se anota aquí mismo para que volver a este mes lo encuentre, y se
       le pide al servidor la versión buena —que trae quién y cuándo—. */
    setPropios((p) => ({
      ...p,
      [llaveMes]: {
        anio, mes, cona: nCona, pct: nPct,
        baja: bajaEscrita ? nBaja : null,
        quien: guardado?.quien ?? null,
        cuando: new Date().toISOString(),
      },
    }));
    router.refresh();
    setAviso({ mal: false, texto: `Guardado para ${nombreMes} de ${anio}.` });
  }

  return (
    <section className="tarjeta sim">
      <div className="cab">
        <div>
          <h2>Cuánto me queda en {nombreMes}</h2>
          <p>
            Las tres primeras se escriben; la proyección y el disponible se
            calculan. Habla de <b>{nombreMes} de {anio}</b>, que es donde termina
            el filtro de arriba.
          </p>
        </div>
        {guardado && (
          <p className="sim-firma">
            Guardado{guardado.quien ? ` por ${guardado.quien}` : ""}
            <em>{new Date(guardado.cuando).toLocaleString("es-CO", {
              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
            })}</em>
          </p>
        )}
      </div>

      <div className="sim-cuerpo">
        <div className="sim-filas">
          <label className="sim-fila">
            <span>CONA</span>
            {esEditor ? (
              <input inputMode="numeric" value={cona} placeholder="85.166.358"
                     aria-label={`CONA de ${nombreMes} en unidades`}
                     onChange={(e) => alEscribirCifra(e, setCona)} />
            ) : <b>{hay ? nf.format(nCona) : "—"}</b>}
            <em>unidades a producir</em>
          </label>

          <label className="sim-fila">
            <span>% Quiebra</span>
            {esEditor ? (
              <input inputMode="decimal" value={pct} placeholder="2,65"
                     aria-label={`Porcentaje de quiebra de ${nombreMes}`}
                     onChange={(e) => setPct(e.target.value)} />
            ) : <b>{hay ? pf(nPct) : "—"}</b>}
            <em>el tope del mes</em>
          </label>

          <div className="sim-fila calc">
            <span>Proyección und</span>
            <b>{proyeccion == null ? "—" : nf.format(proyeccion)}</b>
            <em>CONA × %</em>
          </div>

          <label className="sim-fila">
            <span>Quiebra de {nombreMes}</span>
            {esEditor ? (
              <input inputMode="numeric" value={baja}
                     placeholder={delaApp > 0 ? nf.format(Math.round(delaApp)) : "0"}
                     aria-label={`Quiebra de ${nombreMes} en unidades`}
                     onChange={(e) => alEscribirCifra(e, setBaja)} />
            ) : <b>{nf.format(Math.round(delMes))}</b>}
            <em>
              {!bajaEscrita
                ? `en blanco usa la de la plataforma: ${nf.format(Math.round(delaApp))}`
                : discrepa
                  ? `la plataforma calcula ${nf.format(Math.round(delaApp))}`
                  : "lo que ya se rompió"}
            </em>
          </label>
        </div>

        {/* El disponible va aparte y grande: es la única cifra por la que
            alguien abre esto. En rojo cuando ya se pasó del tope — un
            número negativo en el mismo tono que los demás se lee como un
            dato más y no como lo que es. */}
        <div className={"sim-total" + (disponible != null && disponible < 0 ? " pasado" : "")}>
          <span>{disponible != null && disponible < 0 ? "Pasado del tope" : "Disponible"}</span>
          <b>{disponible == null ? "—" : nf.format(Math.abs(disponible))}</b>
          <em>
            {disponible == null
              ? `Escribe el CONA y el porcentaje de ${nombreMes}`
              : disponible < 0
                ? "unidades por encima de lo proyectado"
                : "unidades de quiebra antes de pasarse"}
          </em>
        </div>
      </div>

      {esEditor && (
        <div className="sim-pie">
          <button type="button" className="btn" onClick={guardar}
                  aria-busy={guardando} disabled={!sucio || guardando}>
            {guardando ? "Guardando…" : sucio ? `Guardar ${nombreMes}` : "Sin cambios por guardar"}
          </button>
          <p>
            Se guarda para <b>{nombreMes} de {anio}</b> y lo ve todo el mundo igual.
            Cada mes lleva su propio CONA: cambiar el filtro cambia el mes del que
            habla esta tarjeta.
          </p>
        </div>
      )}

      {aviso && <div className={"aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
    </section>
  );
}

/* ==================== Desplegable ==================== */
function Desplegable({ valor, cambiar, opciones }: {
  valor: string;
  cambiar: (v: string) => void;
  opciones: { v: string; t: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useAfuera(caja, () => setAbierto(false));

  const actual = opciones.find((o) => o.v === valor)?.t ?? opciones[0]?.t ?? "";

  return (
    <div className="desplegable" ref={caja}>
      <button
        type="button"
        className="disparo"
        aria-expanded={abierto}
        aria-haspopup="listbox"
        onClick={() => setAbierto((a) => !a)}
      >
        <span className="txt">{actual}</span>
        <svg className="flecha" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {abierto && (
        <div className="opciones" role="listbox">
          {opciones.map((o) => (
            <button
              key={o.v}
              type="button"
              role="option"
              aria-selected={o.v === valor}
              className={o.v === valor ? "elegida" : ""}
              onClick={() => { cambiar(o.v); setAbierto(false); }}
            >
              <svg className="tic" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
              {o.t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================== Barras horizontales ==================== */
function Barras({ datos, total }: {
  datos: { nom: string; v: number; col: string }[];
  total: number;
}) {
  const max = Math.max(1, ...datos.map((d) => d.v));
  return (
    <>
      {datos.map((d) => (
        <div className="fila" key={d.nom}>
          <div className="nom" title={d.nom}>{d.nom}</div>
          <div className="pista">
            <div
              className="relleno"
              style={{ width: `${Math.max(0, (d.v / max) * 100)}%`, background: d.col }}
            />
          </div>
          <div className="pct">{total > 0 ? pf(d.v / total, 1) : "—"}</div>
        </div>
      ))}
      {!datos.length && <p className="nota-pie">Sin datos con este filtro.</p>}
    </>
  );
}

/* ==================== Gráfico mensual ==================== */
function GraficoMes({ prodMes, perdMes, metaDe }: {
  prodMes: Map<number, number>; perdMes: Map<number, number>; metaDe: (m: number) => number;
}) {
  const W = 720, H = 300, m = { t: 20, r: 12, b: 32, l: 64 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const meses = [...prodMes.keys()].sort((a, b) => a - b);
  const filas = meses.map((mm) => {
    const prod = prodMes.get(mm) ?? 0, perd = perdMes.get(mm) ?? 0;
    return { mm, prod, perd, pct: prod ? perd / prod : 0, meta: metaDe(mm) };
  });
  const max = Math.max(0.01, ...filas.map((f) => Math.max(f.pct, f.meta))) * 1.16;
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const paso = iw / Math.max(1, filas.length);
  const an = Math.min(34, paso * 0.42);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="grafico g-mes" role="img"
         aria-label="Quiebra mensual contra la meta">
      {[0, 1, 2, 3, 4].map((i) => {
        const v = (max * i) / 4;
        return (
          <g key={i}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="rejilla" />
            <text x={m.l - 10} y={y(v) + 4} className="eje" textAnchor="end">{pf(v, 1)}</text>
          </g>
        );
      })}
      {filas.map((f, i) => {
        const cx = m.l + paso * i + paso / 2;
        const alto = Math.max(2, m.t + ih - y(f.pct));
        const encima = f.pct > f.meta;
        return (
          <g key={f.mm}>
            <rect x={cx - an / 2} y={y(f.pct)} width={an} height={alto}
                  fill={encima ? "#E4002B" : "#0B4EA2"}>
              <title>{`${MESES[f.mm - 1]}\nQuiebra ${pf(f.pct)} · Meta ${pf(f.meta)}\n${nf.format(f.perd)} de ${nf.format(f.prod)} und`}</title>
            </rect>
            <text x={cx} y={y(f.pct) - 8} className="val" textAnchor="middle">{pf(f.pct, 2)}</text>
            <line x1={cx - an / 2 - 8} x2={cx + an / 2 + 8} y1={y(f.meta)} y2={y(f.meta)} className="meta" />
            <text x={cx} y={H - 14} className="eje" textAnchor="middle">{MESES[f.mm - 1]}</text>
          </g>
        );
      })}
      {!filas.length && (
        <text x={W / 2} y={H / 2} className="eje" textAnchor="middle">Sin datos con este filtro</text>
      )}
    </svg>
  );
}

/* ==================== Día a día ==================== */
function TarjetaDia({ bajas, prod, meta }: { bajas: Baja[]; prod: Produccion[]; meta: number }) {
  const pd = new Map<string, number>(), ld = new Map<string, number>();
  for (const p of prod) pd.set(p.fecha, (pd.get(p.fecha) ?? 0) + Number(p.cantidad));
  for (const b of bajas) ld.set(b.fecha, (ld.get(b.fecha) ?? 0) + Number(b.cantidad));
  const dias = [...new Set([...pd.keys(), ...ld.keys()])].sort();
  const filas = dias.map((f) => {
    const p = pd.get(f) ?? 0, q = ld.get(f) ?? 0;
    return { f, prod: p, perd: q, pct: p ? q / p : 0 };
  });

  // Percentil 95: unos pocos días de producción mínima disparan porcentajes
  // enormes y aplastan el resto. Los que se salen van al tope con una punta.
  const orden = filas.map((x) => x.pct).sort((a, b) => a - b);
  const p95 = orden[Math.min(orden.length - 1, Math.floor(orden.length * 0.95))] || 0.01;
  const max = Math.max(meta * 1.6, p95) * 1.12 || 0.01;
  const fuera = filas.filter((x) => x.pct > max).length;

  const W = 1000, H = 250, m = { t: 14, r: 12, b: 28, l: 88 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const y = (v: number) => m.t + ih - (Math.min(v, max) / max) * ih;
  const paso = iw / Math.max(1, filas.length);
  const an = Math.max(1.6, Math.min(12, paso * 0.62));

  // Una marca por mes: con 250 días, una etiqueta por día es ilegible.
  const marcas = filas.map((x, i) => ({ ...x, i }))
    .filter((x, i, arr) => i === 0 || x.f.slice(5, 7) !== arr[i - 1].f.slice(5, 7));

  return (
    <div className="tarjeta">
      <div className="cab">
        <div>
          <h2>Día a día</h2>
          <p>
            {filas.length} días del período
            {fuera > 0 && <> · {fuera} día{fuera > 1 ? "s" : ""} por encima de la escala</>}
          </p>
        </div>
      </div>
      <div className="cuerpo">
        <svg viewBox={`0 0 ${W} ${H}`} className="grafico g-dia" role="img" aria-label="Quiebra diaria">
          {[0, 1, 2, 3, 4].map((i) => {
            const v = (max * i) / 4;
            return (
              <g key={i}>
                <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="rejilla" />
                <text x={m.l - 10} y={y(v) + 4} className="eje" textAnchor="end">
                  {pf(v, 1)}{i === 4 ? "+" : ""}
                </text>
              </g>
            );
          })}
          {!!filas.length && (
            <line x1={m.l} x2={W - m.r} y1={y(meta)} y2={y(meta)} className="meta" />
          )}
          {filas.map((x, i) => {
            const px = m.l + paso * i + (paso - an) / 2;
            const corta = x.pct > max, yv = y(x.pct);
            return (
              <g key={x.f}>
                <rect x={px} y={yv} width={an} height={Math.max(1.2, m.t + ih - yv)}
                      fill={x.pct > meta ? "#E4002B" : "#0B4EA2"}>
                  <title>{`${x.f}\nQuiebra ${pf(x.pct)}${corta ? " (fuera de escala)" : ""}\n${nf.format(x.perd)} de ${nf.format(x.prod)} und`}</title>
                </rect>
                {corta && (
                  <path d={`M${px - 2} ${yv} L${px + an / 2} ${yv - 7} L${px + an + 2} ${yv} Z`}
                        fill="#E4002B" />
                )}
              </g>
            );
          })}
          {marcas.map((x) => (
            <text key={x.f} x={m.l + paso * x.i + paso / 2} y={H - 10}
                  className="eje" textAnchor="middle">
              {x.f.slice(8)}/{x.f.slice(5, 7)}
            </text>
          ))}
          {!filas.length && (
            <text x={W / 2} y={H / 2} className="eje" textAnchor="middle">Sin datos con este filtro</text>
          )}
        </svg>
        <div className="leyenda abajo">
          <span><i style={{ background: "#0B4EA2" }} /> Bajo meta</span>
          <span><i style={{ background: "#E4002B" }} /> Sobre meta</span>
          <span><i className="meta" /> Meta</span>
        </div>
      </div>
    </div>
  );
}

/* ==================== Composición apilada ==================== */
function GraficoApilado({ bajas, causales }: { bajas: Baja[]; causales: string[] }) {
  const W = 620, H = 290, m = { t: 14, r: 10, b: 30, l: 66 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const meses = [...new Set(bajas.map((b) => mesDe(b.fecha)))].sort((a, b) => a - b);
  const cs = causales.filter((c) => bajas.some((b) => b.causal === c));

  const mat = meses.map((mm) =>
    cs.map((c) => bajas
      .filter((b) => mesDe(b.fecha) === mm && b.causal === c)
      .reduce((a, b) => a + Number(b.cantidad), 0))
  );
  const tot = mat.map((f) => f.reduce((a, b) => a + Math.max(0, b), 0));
  const max = Math.max(1, ...tot) * 1.12;
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const paso = iw / Math.max(1, meses.length), an = Math.min(34, paso * 0.56);

  const etiqueta = (v: number) =>
    v >= 1e6 ? (v / 1e6).toFixed(1).replace(".", ",") + "M" : Math.round(v / 1e3) + "k";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="grafico g-apilado" role="img"
         aria-label="Composición mensual por causal">
      {[0, 1, 2, 3].map((i) => {
        const v = (max * i) / 3;
        return (
          <g key={i}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="rejilla" />
            <text x={m.l - 10} y={y(v) + 4} className="eje" textAnchor="end">{etiqueta(v)}</text>
          </g>
        );
      })}
      {meses.map((mm, i) => {
        const x = m.l + paso * i + (paso - an) / 2;
        let ac = 0;
        return (
          <g key={mm}>
            {cs.map((c, j) => {
              const v = mat[i][j];
              if (v <= 0) return null;
              const y0 = y(ac + v), h = Math.max(1, y(ac) - y0 - 1.5);
              ac += v;
              return (
                <rect key={c} x={x} y={y0} width={an} height={h} fill={color(c)}>
                  <title>{`${MESES[mm - 1]} · ${c}\n${nf.format(v)} und`}</title>
                </rect>
              );
            })}
            <text x={x + an / 2} y={H - 10} className="eje" textAnchor="middle">{MESES[mm - 1]}</text>
          </g>
        );
      })}
      {!meses.length && (
        <text x={W / 2} y={H / 2} className="eje" textAnchor="middle">Sin datos con este filtro</text>
      )}
    </svg>
  );
}

/* ==================== Tablas ==================== */
function TablaMateriales({ bajas, total }: { bajas: Baja[]; total: number }) {
  const map = new Map<string, { den: string; v: number }>();
  for (const b of bajas) {
    const k = b.material ?? "—";
    const a = map.get(k) ?? { den: b.denominacion ?? k, v: 0 };
    a.v += Number(b.cantidad);
    map.set(k, a);
  }
  const top = [...map.entries()].filter((x) => x[1].v > 0)
    .sort((a, b) => b[1].v - a[1].v).slice(0, 8);
  const mx = top[0]?.[1].v ?? 1;

  return (
    <table>
      <thead>
        <tr>
          <th>Envase</th>
          <th className="num">Unidades</th>
          <th className="num">Part.</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {top.map(([cod, x]) => (
          <tr key={cod}>
            <td>
              <div className="nom">{x.den}</div>
              <div className="cod">{cod}</div>
            </td>
            <td className="num">{nf.format(x.v)}</td>
            <td className="num">{total > 0 ? pf(x.v / total, 1) : "—"}</td>
            <td className="mini">
              <div className="pista">
                <div className="relleno" style={{ width: `${(x.v / mx) * 100}%` }} />
              </div>
            </td>
          </tr>
        ))}
        {!top.length && <tr><td className="vacio" colSpan={4}>Sin datos con este filtro</td></tr>}
      </tbody>
    </table>
  );
}

function TablaMes({ prodMes, perdMes, metaDe }: {
  prodMes: Map<number, number>; perdMes: Map<number, number>; metaDe: (m: number) => number;
}) {
  const meses = [...prodMes.keys()].sort((a, b) => a - b);
  return (
    <table>
      <thead>
        <tr>
          <th>Mes</th>
          <th className="num">Producción</th>
          <th className="num">Quiebra</th>
          <th className="num">%</th>
          <th className="num">Meta</th>
        </tr>
      </thead>
      <tbody>
        {meses.map((mm) => {
          const p = prodMes.get(mm) ?? 0, q = perdMes.get(mm) ?? 0;
          const pc = p ? q / p : 0, mt = metaDe(mm), encima = pc > mt;
          return (
            <tr key={mm}>
              <td className="mes">{MESES[mm - 1]}</td>
              <td className="num">{nf.format(p)}</td>
              <td className="num">{nf.format(q)}</td>
              <td className={"num " + (encima ? "sobre" : "bajo")}>
                {encima ? "▲" : "▼"} {pf(pc)}
              </td>
              <td className="num meta">{pf(mt)}</td>
            </tr>
          );
        })}
        {!meses.length && <tr><td className="vacio" colSpan={5}>Sin datos con este filtro</td></tr>}
      </tbody>
    </table>
  );
}

/* ==================== Informe: PDF y copiar ==================== */

/** Los bloques del tablero que van al informe, en orden. */
const PARTES = ["cabeza", "cifras", "graficos1", "graficos2", "tablas"];

type Foto = { url: string; an: number; al: number };

/**
 * Fotografía cada bloque del tablero. Se hace sobre lo que está en pantalla
 * a propósito: así el informe SIEMPRE coincide con lo que la persona está
 * viendo, con sus filtros, y no puede desfasarse de una copia aparte.
 *
 * Durante la captura se ensancha el contenido a 1900px: si se rasteriza tal
 * cual en un celular, el PDF sale con la versión apilada y las gráficas
 * ilegibles.
 */
async function fotografiar(): Promise<Foto[]> {
  const html2canvas = (await import("html2canvas")).default;
  document.body.classList.add("capturando");
  // Un respiro para que el navegador aplique el ancho antes de medir.
  await new Promise((r) => setTimeout(r, 150));

  const salida: Foto[] = [];
  try {
    for (const nombre of PARTES) {
      const el = document.querySelector<HTMLElement>(`[data-parte="${nombre}"]`);
      if (!el) continue;
      const lienzo = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#FFFFFF",
        logging: false,
        useCORS: true,
        windowWidth: 2000,
        width: el.getBoundingClientRect().width,
        onclone: (doc) =>
          doc.querySelectorAll(".acciones-informe").forEach((e) => e.remove()),
      });
      salida.push({ url: lienzo.toDataURL("image/png"), an: lienzo.width, al: lienzo.height });
    }
  } finally {
    document.body.classList.remove("capturando");
  }
  return salida;
}

/** Una línea que dice con qué filtros se sacó el informe. */
function resumenFiltros(
  almacen: string, linea: string, causales: string[], apagadas: Set<string>
): string {
  const fuera = causales.filter((c) => apagadas.has(c));
  return (
    `Almacén ${almacen || "Todos"} · Línea ${linea ? `Línea ${linea}` : "Todas"} · ` +
    (fuera.length ? `Causales excluidas: ${fuera.join(", ")}` : "Todas las causales")
  );
}

function selloFecha(): string {
  const f = new Date();
  return (
    "Generado " +
    f.toLocaleDateString("es-CO") +
    " " +
    f.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
  );
}

/**
 * Dos formas de sacar el tablero de la pantalla:
 *
 *  · Generar PDF — arma un A4 horizontal paginado, con encabezado en cada
 *    página (marca, período y filtros) y numeración al pie. Se descarga
 *    directo, sin pasar por el diálogo de impresión.
 *
 *  · Copiar informe — deja el tablero en el portapapeles listo para pegar
 *    en un correo. Es el formato en que de verdad se manda esto a diario.
 */
/* ---------- Composición de las hojas ----------
   Las hojas se dibujan una sola vez y sirven para las dos salidas: el PDF
   mete cada hoja como página y el portapapeles pega esas mismas imágenes.
   Así lo que se descarga y lo que se pega son idénticos, no dos armados
   parecidos que pueden separarse con el tiempo. */

/** A4 horizontal a 6 px por milímetro: nítido al imprimir y liviano al pegar. */
const PX_MM = 6;
const HOJA = { ancho: 297 * PX_MM, alto: 210 * PX_MM, margen: 10 * PX_MM };

const TIPO = '"Helvetica Neue", Helvetica, Arial, sans-serif';

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => mal(new Error("no cargó " + url));
    im.src = url;
  });
}

/**
 * Reparte los bloques del tablero en hojas A4 y devuelve cada hoja como
 * imagen, con el encabezado repetido y el pie numerado.
 */
async function componerHojas(fotos: Foto[], enc: string[]): Promise<string[]> {
  const { ancho, alto, margen: M } = HOJA;
  const util = ancho - M * 2;
  const yInicio = M + 84;
  const yTope = alto - M - 30;

  let logo: HTMLImageElement | null = null;
  try { logo = await cargarImagen("/marca/logo-b.png"); } catch { /* sin logo se sigue */ }

  // 1. repartir: un bloque no se parte a la mitad entre dos hojas
  const hojas: { im: HTMLImageElement; y: number; alto: number }[][] = [];
  let actual: { im: HTMLImageElement; y: number; alto: number }[] = [];
  let y = yInicio;

  for (const f of fotos) {
    const im = await cargarImagen(f.url);
    const h = (f.al / f.an) * util;
    if (y + h > yTope && actual.length) { hojas.push(actual); actual = []; y = yInicio; }
    actual.push({ im, y, alto: h });
    y += h + 24;
  }
  if (actual.length) hojas.push(actual);
  if (!hojas.length) return [];

  // 2. dibujar
  const sello = selloFecha() + " · CONTROL";
  return hojas.map((bloques, i) => {
    const c = document.createElement("canvas");
    c.width = ancho;
    c.height = alto;
    const g = c.getContext("2d")!;

    g.fillStyle = "#FFFFFF";
    g.fillRect(0, 0, ancho, alto);

    // --- encabezado
    if (logo) g.drawImage(logo, M, M - 6, 51, 51);
    g.fillStyle = "#04203F";
    g.font = `700 26px ${TIPO}`;
    g.textBaseline = "alphabetic";
    g.fillText(enc[0], M + 66, M + 22);
    g.fillStyle = "#5B6B7F";
    g.font = `400 17px ${TIPO}`;
    g.fillText(enc[1], M + 66, M + 46);
    g.fillStyle = "#E4002B";
    g.fillRect(M, M + 60, util, 3);

    // --- bloques
    for (const b of bloques) g.drawImage(b.im, M, b.y, util, b.alto);

    // --- pie
    g.fillStyle = "#8C98A8";
    g.font = `400 16px ${TIPO}`;
    g.textAlign = "left";
    g.fillText(sello, M, alto - M - 4);
    g.textAlign = "right";
    g.fillText(`Página ${i + 1} de ${hojas.length}`, ancho - M, alto - M - 4);
    g.textAlign = "left";

    return c.toDataURL("image/png");
  });
}

function AccionesInforme({ armar }: { armar: () => { enc: string[]; nombre: string } }) {
  const [estado, setEstado] = useState<"" | "listo" | "mal">("");
  const [aviso, setAviso] = useState("");
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    if (!estado) return;
    const t = setTimeout(() => setEstado(""), 3600);
    return () => clearTimeout(t);
  }, [estado]);

  function fallo(msg: string) {
    setAviso(msg);
    setEstado("mal");
  }

  /** Prepara las hojas una sola vez y las guarda para las dos salidas. */
  async function prepararHojas(enc: string[]): Promise<string[]> {
    const fotos = await fotografiar();
    if (!fotos.length) throw new Error("no se pudo leer el tablero");
    const hojas = await componerHojas(fotos, enc);
    if (!hojas.length) throw new Error("no se pudo componer el informe");
    return hojas;
  }

  async function generarPdf() {
    setGenerando(true);
    try {
      const { enc, nombre } = armar();
      const hojas = await prepararHojas(enc);

      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      hojas.forEach((hoja, i) => {
        if (i > 0) pdf.addPage();
        // La hoja ya trae encabezado y pie dibujados: entra completa.
        pdf.addImage(hoja, "PNG", 0, 0, 297, 210, undefined, "FAST");
      });
      pdf.save(nombre);

      setAviso(`PDF de ${hojas.length} hoja${hojas.length > 1 ? "s" : ""} generado.`);
      setEstado("listo");
    } catch (e) {
      // Si el navegador no puede rasterizar, al menos queda la impresión del
      // navegador, que usa los estilos de papel de quiebra.css.
      fallo("No se pudo armar el PDF. Se abrirá la impresión del navegador.");
      setTimeout(() => window.print(), 900);
      void e;
    }
    setGenerando(false);
  }

  return (
    <>
      <div className="acciones-informe">
        <button type="button" className="accion" onClick={generarPdf} disabled={generando}>
          <svg viewBox="0 0 24 24">
            <path d="M8 3.5h5.5L18 8v12.5H6V3.5z" />
            <path d="M13.5 3.5V8H18" />
            <path d="M9.5 15.5h5M9.5 12.5h3" />
          </svg>
          {generando ? "Generando…" : "Generar PDF"}
        </button>
      </div>

      {estado && (
        <div className={"qb-aviso-copia" + (estado === "mal" ? " mal" : "")} role="status">
          <svg viewBox="0 0 24 24">
            {estado === "listo"
              ? <path d="M5 12.5l4.5 4.5L19 7" />
              : <path d="M6 6l12 12M18 6L6 18" />}
          </svg>
          {aviso}
        </div>
      )}
    </>
  );
}

type DatosInforme = {
  desde: string; hasta: string;
  filtros: string;
};

/** Encabezado que se repite en cada hoja, y el nombre del archivo. */
function construirInforme(d: DatosInforme): { enc: string[]; nombre: string } {
  const periodo = `${bonita(d.desde)} — ${bonita(d.hasta)}`;
  return {
    enc: [
      "Quiebra de envase · Ag01",
      `Centro de Distribución 38 · Bavaria BAQ · ${periodo} · ${d.filtros}`,
    ],
    nombre: `quiebra-ag01-${d.desde}-a-${d.hasta}.pdf`,
  };
}
