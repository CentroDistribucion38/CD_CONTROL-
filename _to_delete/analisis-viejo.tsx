import Link from "next/link";
import {
  salidas as leerSalidas, tolvas as leerTolvas, lineasDeSalidas,
  type Salida, type TolvaPesada,
} from "@/modulos/roturas/datos";
import { kilos } from "@/modulos/roturas/formato";
import { hoyLocal } from "@/modulos/traspasos/datos";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { Filtros } from "../../Filtros";
import { BotonInforme } from "./BotonInforme";
import type { DatosInforme } from "./informe";

export const dynamic = "force-dynamic";

const COLORES = [
  { id: "ambar", nombre: "Ámbar" },
  { id: "flint", nombre: "Flint" },
  { id: "green", nombre: "Green" },
];

/**
 * ANÁLISIS DE LA SALIDA — cuánto vidrio salió por la puerta.
 *
 * AQUÍ NO HAY UNA SOLA UNIDAD, a propósito. Esta rama pesa kilos; las
 * unidades por causa y por proceso viven en el análisis de En sitio y
 * contestan otra pregunta.
 *
 * TODO SE MIDE SOBRE SALIDAS DESPACHADAS. Una salida que todavía no ha
 * salido por la puerta se puede corregir: contarla aquí sería publicar
 * un número que mañana cambia, y un informe que cambia solo deja de
 * creerse a la tercera vez.
 *
 * ---------------------------------------------------------------------
 * LOS FILTROS, Y POR QUÉ SE FILTRA AQUÍ Y NO EN LA BASE
 * ---------------------------------------------------------------------
 * «Agrega los filtros de todo, o sea, falta.» No había ninguno: la
 * pantalla mostraba todo lo que existe, y «cuánto vidrio salió» sin
 * decir DE CUÁNDO no contesta ninguna pregunta que alguien tenga.
 *
 * El rango se aplica sobre LA FECHA EN QUE SALIÓ —no la de apertura—,
 * que es una cascada de tres columnas (despachada_en, validador_en,
 * supervisora_en: la historia del módulo escrita en las filas). Eso no
 * se puede pedir con un `gte` a PostgREST sin inventarse una columna, y
 * las salidas son cientos, no millones. Así que se traen y se filtran
 * aquí. El día que sean decenas de miles, esto pide una vista con la
 * fecha ya resuelta — y no antes: una vista más es otra cosa que
 * mantener.
 */
export default async function AnalisisSalidaPage({ searchParams }: {
  searchParams: Promise<{ desde?: string; hasta?: string; placa?: string; tolva?: string; color?: string }>;
}) {
  const q = await searchParams;
  const [sal, tol] = await Promise.all([leerSalidas(2000), leerTolvas(false)]);
  if (sal.falta) return <div className="rt"><SinTablas /></div>;

  const hoy = hoyLocal();
  const esFecha = (x?: string) => /^\d{4}-\d{2}-\d{2}$/.test(x ?? "");
  const desde = esFecha(q.desde) ? q.desde! : "";
  const hasta = esFecha(q.hasta) ? q.hasta! : "";
  const placa = (q.placa ?? "").trim();
  const color = COLORES.some((c) => c.id === q.color) ? q.color! : "";
  const tolvaF = (q.tolva ?? "").trim();

  /* CUÁNDO SALIÓ DE VERDAD. Ver la nota de arriba: tres columnas en
     cascada, que son las tres épocas de este módulo. */
  const cuandoSalio = (s: Salida) =>
    s.despachada_en ?? s.validador_en ?? s.supervisora_en ?? null;
  const diaDe = (s: Salida) => (cuandoSalio(s) ?? "").slice(0, 10);

  const enRango = (s: Salida) => {
    const d = diaDe(s);
    if (!d) return !desde && !hasta;
    if (desde && d < desde) return false;
    if (hasta && d > hasta) return false;
    return true;
  };
  const mismaPlaca = (s: Salida) => !placa || s.placa === placa;

  /* LAS LÍNEAS, SOBRE LAS CANDIDATAS. Antes se pedían solo al filtrar
     por color o por tolva; ahora también las necesita la gráfica «por
     color del vidrio», que es la pregunta propia de este módulo. Se
     piden sobre lo YA RECORTADO por fecha y placa, no sobre las dos mil
     salidas: es la diferencia entre una consulta y una descarga. */
  const porLinea = !!color || !!tolvaF;
  const candidatas = sal.salidas.filter((s) => enRango(s) && mismaPlaca(s));
  const lineas: TolvaPesada[] = await lineasDeSalidas(candidatas.map((s) => s.id));
  const dejaPasar = (id: string) => {
    if (!porLinea) return true;
    return lineas.some((l) =>
      l.salida_id === id && (!color || l.color === color) && (!tolvaF || l.tolva === tolvaF));
  };

  const vivas = candidatas.filter((s) => dejaPasar(s.id));

  /* LAS OPCIONES SALEN DE LO QUE HAY, no de una lista escrita aquí: una
     placa que nunca sacó vidrio no tiene por qué ofrecerse, y el día que
     aparezca una nueva sale sola. */
  const placasTodas = [...new Set(sal.salidas.map((s) => s.placa).filter(Boolean))].sort();
  const tolvasTodas = tol.filter((x) => x.activo).map((x) => x.codigo).sort();

  const completas = vivas.filter((s) => s.completa);
  const abiertas = vivas.filter((s) => s.estado === "abierta");
  const porSalir = vivas.filter((s) => s.estado === "cerrada" && !s.completa);

  const kg = completas.reduce((t, s) => t + Number(s.neto_kg), 0);
  const bruto = completas.reduce((t, s) => t + Number(s.bruto_kg), 0);
  const tara = completas.reduce((t, s) => t + Number(s.tara_kg), 0);
  const nTolvas = completas.reduce((t, s) => t + s.tolvas, 0);
  const promedio = nTolvas ? kg / nTolvas : 0;

  /* CUÁNTO SALE POR MES. Se agrupa por la fecha en que la salida quedó
     TERMINADA y no por la de apertura: una salida es del mes en que de
     verdad salió de la contabilidad.

     TRES CAMPOS EN CASCADA, Y NO ES INDECISIÓN — ES LA HISTORIA DEL
     MÓDULO, que está escrita en las filas de la tabla:
       · despachada_en  las de hoy: facturación despachó el vidrio con
                        el viaje;
       · validador_en   las de cuando existía Validación;
       · supervisora_en el último recurso, para que una fila rara no se
                        pierda del informe.

     ESTABA EN `validador_en!` A SECAS, y esa firma ya no se pone nunca:
     toda salida nueva daba `new Date(null)` → «Invalid Date», y el mes
     entero se iba a una barra con ese nombre. No revienta, no avisa, y
     el informe del mes simplemente deja de tener los meses. Es la clase
     de fallo que sobrevive años. */
  const porMes = new Map<string, number>();
  for (const s of completas) {
    const cuando = cuandoSalio(s);
    if (!cuando) continue;
    const k = new Date(cuando).toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
    porMes.set(k, (porMes.get(k) ?? 0) + Number(s.neto_kg));
  }
  const meses = [...porMes.entries()].slice(-8);
  const maxMes = Math.max(1, ...meses.map(([, v]) => v));

  /* CUÁNTO SALIÓ DE CADA COLOR. Sale de las LÍNEAS y no de la salida:
     el color no está en la cabecera —una salida de tres tolvas puede
     llevar dos ámbar y una green— y por eso esta cifra no se puede
     deducir de los totales de arriba.

     SOLO DE LAS COMPLETAS, igual que el neto: si contara las que están
     en báscula, las dos cifras de la misma pantalla no cuadrarían y la
     gráfica parecería el error. */
  const idsCompletas = new Set(completas.map((s) => s.id));
  const porColor = new Map<string, number>();
  for (const l of lineas) {
    if (!idsCompletas.has(l.salida_id)) continue;
    if (tolvaF && l.tolva !== tolvaF) continue;
    porColor.set(l.color, (porColor.get(l.color) ?? 0) + (Number(l.bruto_kg) - Number(l.tara_kg)));
  }
  /* LOS TRES COLORES SIEMPRE, aunque uno esté en cero: un color que
     desaparece de la gráfica se lee como «no hay», y lo que dice es
     «este mes no salió ni un kilo de flint», que es otra cosa. */
  const colores = COLORES.map((c) => ({ etiqueta: c.nombre, kg: Math.round(porColor.get(c.id) ?? 0) }));
  const maxColor = Math.max(1, ...colores.map((c) => c.kg));

  /* LO QUE LLEVA EL PDF. Se arma AQUÍ, del mismo cálculo que pinta la
     pantalla: ver la nota larga de informe.ts. */
  const fLargo = (x: string) => x.split("-").reverse().join("/");
  const periodo = desde && hasta ? `del ${fLargo(desde)} al ${fLargo(hasta)}`
    : desde ? `desde el ${fLargo(desde)}`
    : hasta ? `hasta el ${fLargo(hasta)}`
    : "todo el histórico";
  const filtros = [
    placa && `placa ${placa}`,
    color && `color ${COLORES.find((c) => c.id === color)?.nombre ?? color}`,
    tolvaF && `tolva ${tolvaF}`,
  ].filter(Boolean).join(" · ");
  /* CÓMO SE LEE EL PERÍODO EN LA BANDA, cortito: «24 de septiembre»,
     «del 01 al 24 de septiembre». Sin filtro no se pone nada — decir
     «todo el histórico» al lado de la cifra grande es ocupar un renglón
     para no decir nada. */
  const MES_L = ["enero","febrero","marzo","abril","mayo","junio","julio",
                 "agosto","septiembre","octubre","noviembre","diciembre"];
  const dia = (f: string) => `${+f.slice(8, 10)} de ${MES_L[+f.slice(5, 7) - 1]}`;
  const periodoCorto = desde && hasta
    ? (desde === hasta ? dia(hasta)
       : desde.slice(0, 7) === hasta.slice(0, 7)
         ? `del ${+desde.slice(8, 10)} al ${dia(hasta)}`
         : `del ${dia(desde)} al ${dia(hasta)}`)
    : desde ? `desde el ${dia(desde)}` : hasta ? `hasta el ${dia(hasta)}` : "";

  /* LA HORA DEL RENGLÓN. La fecha va aparte y en tinta —se busca por
     día—, y la hora al lado en gris. */
  const fechaHora = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("es-CO",
      { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }) : "";

  const estadoDe = (s: Salida) =>
    s.estado === "abierta" ? "En báscula" : s.completa ? "Despachada" : "Esperando Vh";
  const datosInforme: DatosInforme = {
    hoy, periodo, filtros,
    mirando: (desde || hasta || placa || color || tolvaF)
      ? { de: vivas.length, total: sal.salidas.length } : null,
    kg: Math.round(kg), bruto: Math.round(bruto), tara: Math.round(tara),
    completas: completas.length, tolvas: nTolvas, promedio: Math.round(promedio),
    porSalir: porSalir.length, abiertas: abiertas.length,
    meses: meses.map(([etiqueta, v]) => ({ etiqueta, kg: Math.round(v) })),
    colores,
    /* LA MÁS NUEVA ARRIBA, igual que en la pantalla. Y con tope: un PDF
       de cuatrocientas páginas no lo abre nadie, y el informe que se
       manda es el del mes. */
    salidas: vivas.slice(0, 300).map((s) => ({
      codigo: s.codigo,
      fecha: (cuandoSalio(s) ?? s.creada_en ?? "").slice(0, 10).split("-").reverse().join("/"),
      placa: s.placa ?? "—",
      tolvas: s.tolvas,
      bruto: Math.round(Number(s.bruto_kg)),
      tara: Math.round(Number(s.tara_kg)),
      neto: Math.round(Number(s.neto_kg)),
      estado: estadoDe(s),
    })),
  };

  /* Las taras en uso. Es el número que más silenciosamente puede estar
     mal: se teclea una vez en el maestro y después se copia a cada
     línea sin que nadie lo vuelva a mirar. */
  const activas = tol.filter((t) => t.activo);


  /* ------------------------------------------------------------------
     LO QUE PIDE EL DISEÑO NUEVO
     ------------------------------------------------------------------ */

  /* LOS ÚLTIMOS SIETE DÍAS, para la línea de dentro de la banda dorada.
     NO son «los siete días del filtro»: es una tendencia y se mira
     SIEMPRE contra hoy, esté el filtro donde esté. Una tendencia que se
     mueve con el filtro no es una tendencia, es el mismo dato otra vez. */
  const dia7: { dia: string; kg: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.parse(hoy + "T12:00:00") - i * 86400_000).toISOString().slice(0, 10);
    dia7.push({ dia: d, kg: 0 });
  }
  for (const s of sal.salidas) {
    if (!s.completa) continue;
    const d = diaDe(s);
    const f = dia7.find((x) => x.dia === d);
    if (f) f.kg += Number(s.neto_kg);
  }
  const maxDia = Math.max(1, ...dia7.map((d) => d.kg));
  /* La línea, en un viewBox de 110×34. Se dibuja aquí y no en el
     navegador: es un SVG de siete puntos, y mandarlo ya hecho ahorra
     traer los datos del mes al cliente. */
  const puntos = dia7.map((d, i) =>
    `${(i * 110 / 6).toFixed(1)},${(34 - (d.kg / maxDia) * 32).toFixed(1)}`).join(" ");

  /* CÓMO SE REPARTE EL BRUTO. Un neto suelto no se puede comprobar
     contra la báscula; bruto = tara + neto, sí. */
  const pctTara = bruto > 0 ? Math.round((tara / bruto) * 100) : 0;

  /* EL COLOR DE CADA SALIDA. No está en la salida: está en sus líneas.
     Una salida de tres tolvas puede llevar dos ámbar y una green, y en
     ese caso se dice «Varios» en vez de escoger uno — poner el primero
     sería inventar un dato que la fila no tiene. */
  const colorDe = (id: string) => {
    const ls = lineas.filter((l) => l.salida_id === id);
    const set = new Set(ls.map((l) => l.color));
    if (set.size === 0) return null;
    if (set.size > 1) return "varios";
    return [...set][0];
  };
  const nombreColor = (c: string | null) =>
    c === null ? "—" : c === "varios" ? "Varios" : (COLORES.find((x) => x.id === c)?.nombre ?? c);

  /* EL ANILLO. Se arma con `stroke-dasharray` sobre un círculo: cada
     color es un tramo de la circunferencia. Los que están en cero no se
     dibujan —un tramo de longitud cero pinta un punto— pero SÍ salen en
     la leyenda: un color que desaparece se lee como «no hay», y lo que
     dice es «este mes no salió ni un kilo de flint». */
  const R = 62, CIRC = 2 * Math.PI * R;
  const totalColor = colores.reduce((t, c) => t + c.kg, 0);
  let acum = 0;
  const tramos = colores.map((c) => {
    const largo = totalColor > 0 ? (c.kg / totalColor) * CIRC : 0;
    const desde = acum;
    acum += largo;
    return { ...c, largo, desde };
  });
  const TONO: Record<string, string> = {
    "Ámbar": "#B87F00", "Flint": "#C9C9C3", "Green": "#16A75A",
  };

  /* LA MISMA PALABRA EN LA PANTALLA Y EN EL PDF. `estadoDe` ya existía
     para el informe; aquí se le pone al lado el color de la etiqueta y
     nada más. Dos listas de estados se separan. */
  const chipDe = (s: Salida) => ({
    t: estadoDe(s).toUpperCase(),
    /* `an-ok` / `an-esp` Y NO `cuenta` / `esperando`: en este módulo
       `.rt .cuenta` es la caja grande de «bruto − tara = neto» de otra
       pantalla, y su tipografía se colaba en el renglón de la tabla —
       «FACTURADA» salía del tamaño de un titular. */
    c: s.completa ? "an-ok" : "an-esp",
  });

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · SALIDA · ANÁLISIS</p>
          <h1>Cuánto vidrio salió</h1>
          <p className="sub">
            Kilos netos de lo que <b>ya salió por la puerta</b>. Las que se están pesando y las
            cédulas que todavía esperan Vh no entran: se pueden corregir, y un informe que
            cambia solo deja de creerse a la tercera vez.
            {(desde || hasta || placa || color || tolvaF) && (
              <> · Mirando <b>{vivas.length}</b> de {sal.salidas.length} salidas.</>
            )}
          </p>
        </div>
        {/* EL KPI SE FUE AL BLOQUE DE ABAJO, con la línea de los siete
            días y el reparto del bruto: una cifra suelta arriba no deja
            comprobar nada, y al lado de su bruto y su tara sí. Aquí
            queda solo el botón, así que `.cabeza` sigue teniendo DOS
            hijos —ver la nota del arnés: con tres, la rejilla manda el
            segundo a la columna ancha y la barra dorada sale mocha. */}
        <BotonInforme datos={datosInforme} />
      </section>

      {/* LOS FILTROS, DEBAJO DEL TÍTULO Y A LO ANCHO: son de toda la
          pantalla, no de una de sus cajas. Es el mismo sitio en que
          están en el control de Traspasos. */}
      <Filtros hoy={hoy}
        cuenta={`${vivas.length} salida${vivas.length === 1 ? "" : "s"} en el filtro`}
        campos={[
        { clave: "placa", rotulo: "Placa", todas: "todas",
          opciones: (placasTodas as string[]).map((p) => ({ id: p, nombre: p })) },
        { clave: "color", rotulo: "Color del vidrio", todas: "todos", opciones: COLORES },
        { clave: "tolva", rotulo: "Tolva", todas: "todas",
          opciones: tolvasTodas.map((t) => ({ id: t, nombre: t })) },
      ]} />

      {/* ------------------------------------------------------------
          LA BANDA: LA CIFRA Y DE DÓNDE SALE, JUNTAS.

          Una cifra sola arriba no deja comprobar nada. Al lado de su
          bruto y su tara, sí: bruto = tara + neto es una resta que
          cualquiera puede hacer contra la báscula. Por eso las dos
          mitades son una sola pieza, con un solo borde.

          Y LA LÍNEA DE LOS SIETE DÍAS VA DENTRO: contesta «¿esto es
          mucho?», que es la pregunta que sigue a cualquier cifra y que
          ningún número suelto contesta.
          ------------------------------------------------------------ */}
      <section className="an-hero">
        <div className="an-neto">
          <span className="corte" aria-hidden />
          <div className="k">NETO DESPACHADO</div>
          <div className="v">{kilos(kg)}<em>kg</em></div>
          <div className="s">
            {completas.length} salida{completas.length === 1 ? "" : "s"} completa
            {completas.length === 1 ? "" : "s"} · {nTolvas} tolva{nTolvas === 1 ? "" : "s"}
            {periodoCorto && <> · {periodoCorto}</>}
          </div>
          <div className="chispa">
            <div className="t">ÚLTIMOS 7 DÍAS</div>
            {/* SIEMPRE CONTRA HOY, esté el filtro donde esté: una
                tendencia que se mueve con el filtro no es una
                tendencia, es el mismo dato otra vez. */}
            <svg viewBox="0 0 110 34" preserveAspectRatio="none" role="img"
                 aria-label={`Kilos de los últimos siete días: ${dia7.map((d) => Math.round(d.kg)).join(", ")}`}>
              <polygon points={`0,34 ${puntos} 110,34`} fill="#0D0D0D" opacity=".16" />
              <polyline points={puntos} fill="none" stroke="#0D0D0D"
                        strokeWidth="2.4" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <div className="an-bal">
          <div className="k">CÓMO SE REPARTE EL BRUTO</div>
          <div className="pila">
            <i className="tara" style={{ width: `${pctTara}%` }}>{kilos(tara)}</i>
            <i className="neto" style={{ width: `${100 - pctTara}%` }}>{kilos(kg)} kg netos</i>
          </div>
          <div className="ley">
            <span>Tara de la tolva <b>{kilos(tara)}</b></span>
            <span>Bruto pesado <b>{kilos(bruto)}</b></span>
          </div>
          <p>
            El neto sale de sumar las tolvas, aquí igual que en cada salida. No hay ningún total
            guardado en la base que pueda quedar desfasado de sus partes.
          </p>
        </div>
      </section>

      <section className="an-kp">
        <div className="an-k4">
          <div className="an-cif">
            <span className="ic" aria-hidden>
              <svg viewBox="0 0 24 24"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" /></svg>
            </span>
            <div><div className="n">{nTolvas}</div><div className="l">Tolvas despachadas</div></div>
          </div>
          <div className="s">en esas mismas salidas</div>
        </div>
        <div className="an-k4">
          <div className="an-cif">
            <span className="ic" aria-hidden>
              <svg viewBox="0 0 24 24"><path d="M12 4v16M5 8l7-4 7 4M4 12h5l-2.5 5L4 12Zm11 0h5l-2.5 5L15 12Z" /></svg>
            </span>
            <div><div className="n">{kilos(promedio)}</div><div className="l">Promedio por tolva</div></div>
          </div>
          <div className="s">kg netos · si una salida se sale mucho de aquí, vale la pena mirarla</div>
        </div>
        {/* «ESPERANDO VH» Y NO «ESPERANDO FIRMA»: lo que esperan desde
            que se quitó Validación es un camión. En ámbar y no en rojo:
            esperar camión es el estado normal entre pesar y despachar. */}
        <div className={"an-k4" + (porSalir.length ? " aten" : "")}>
          <div className="an-cif">
            <span className="ic" aria-hidden>
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 1.8" /></svg>
            </span>
            <div><div className="n">{porSalir.length}</div><div className="l">Esperando Vh</div></div>
          </div>
          <div className="s">cédulas cerradas sin salir · no cuentan aquí</div>
        </div>
        <div className={"an-k4" + (abiertas.length ? " aten" : "")}>
          <div className="an-cif">
            <span className="ic" aria-hidden>
              <svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="1.5" /><path d="M8 10V7a4 4 0 0 1 7-2.6" /></svg>
            </span>
            <div><div className="n">{abiertas.length}</div><div className="l">Abiertas</div></div>
          </div>
          <div className="s">
            {kilos(abiertas.reduce((t, s) => t + Number(s.neto_kg), 0))} kg todavía pesándose
          </div>
        </div>
      </section>

      <section className="an-tri">
        <div className="caja">
          <div className="an-h"><b>Por mes</b><span>kg netos facturados</span></div>
          {meses.length === 0 && (
            <div className="vacio"><b>Sin datos</b>
              {desde || hasta || placa || color || tolvaF
                ? "Ninguna salida despachada cae en este filtro. Prueba con «Todo»."
                : "Todavía no hay vidrio despachado."}
            </div>
          )}
          {meses.map(([mes, v]) => (
            <div key={mes} className={"an-fl" + (v === 0 ? " cero" : "")}>
              <span>{mes}</span>
              <span className="p"><i style={{ width: `${Math.round((v / maxMes) * 100)}%` }} /></span>
              <span className="v">{v > 0 ? kilos(v) : "—"}</span>
            </div>
          ))}
        </div>

        <div className="caja">
          <div className="an-h"><b>Por color</b><span>kg</span></div>
          {/* EL ANILLO, DIBUJADO AQUÍ. Los colores en cero no se dibujan
              —un tramo de largo cero pinta un punto— pero SÍ salen en la
              leyenda: un color que desaparece se lee como «no hay», y lo
              que dice es «este mes no salió ni un kilo de flint». */}
          <div className="an-donac">
            <svg viewBox="0 0 150 150" role="img"
                 aria-label={`Kilos por color: ${colores.map((c) => `${c.etiqueta} ${c.kg}`).join(", ")}`}>
              {totalColor === 0 && (
                <circle cx="75" cy="75" r={R} fill="none" stroke="#E9ECF0" strokeWidth="26" />
              )}
              {tramos.filter((t) => t.largo > 0).map((t) => (
                <circle key={t.etiqueta} cx="75" cy="75" r={R} fill="none"
                        stroke={TONO[t.etiqueta] ?? "#C9C9C3"} strokeWidth="26"
                        strokeDasharray={`${t.largo.toFixed(1)} ${(CIRC - t.largo).toFixed(1)}`}
                        strokeDashoffset={`${(-t.desde).toFixed(1)}`}
                        transform="rotate(-90 75 75)" />
              ))}
              <text x="75" y="73" textAnchor="middle" className="an-donac-n">{kilos(kg)}</text>
              <text x="75" y="91" textAnchor="middle" className="an-donac-u">KG NETOS</text>
            </svg>
            <div className="ley">
              {colores.map((c) => (
                <div key={c.etiqueta} className="l">
                  <i style={{ background: TONO[c.etiqueta] ?? "#C9C9C3" }} aria-hidden />
                  {c.etiqueta}<b>{c.kg > 0 ? kilos(c.kg) : "—"}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="caja">
          <div className="an-h"><b>Las salidas</b>
            <span>{vivas.length} en el filtro</span></div>
          <div className="an-tabla">
            <table>
              <thead><tr>
                <th>Salida</th><th>Fecha</th><th>Placa</th><th>Color</th>
                <th>Tara / neto</th>
                <th className="num">Bruto</th><th className="num">Tara</th><th className="num">Neto</th>
                <th>Estado</th>
              </tr></thead>
              <tbody>
                {vivas.length === 0 && (
                  <tr><td colSpan={9} className="an-vacio">
                    No hay salidas en este período con estos filtros.
                  </td></tr>
                )}
                {vivas.slice(0, 60).map((s) => {
                  const ch = chipDe(s);
                  const b = Number(s.bruto_kg);
                  const pt = b > 0 ? Math.round((Number(s.tara_kg) / b) * 100) : 0;
                  return (
                    <tr key={s.id}>
                      <td className="cod">{s.codigo}</td>
                      <td>{(cuandoSalio(s) ?? s.creada_en ?? "").slice(8, 10)}/
                          {(cuandoSalio(s) ?? s.creada_en ?? "").slice(5, 7)}{" "}
                        <span className="an-hora">{fechaHora(cuandoSalio(s) ?? s.creada_en)}</span></td>
                      <td className="cod">{s.placa ?? "—"}</td>
                      <td>{nombreColor(colorDe(s.id))}</td>
                      <td>
                        {/* LA MISMA RESTA DE ARRIBA, POR RENGLÓN. Es lo
                            que deja ver de un vistazo la salida cuya
                            tara se comió media carga. */}
                        <span className="an-minibar" title={`Tara ${kilos(s.tara_kg)} de ${kilos(b)}`}>
                          <i style={{ width: `${pt}%`, background: "#EDEDE8" }} />
                          <i style={{ width: `${100 - pt}%`, background: "var(--rt-oro)" }} />
                        </span>
                      </td>
                      <td className="num">{kilos(b)}</td>
                      <td className="num">{kilos(s.tara_kg)}</td>
                      <td className="num an-nt">{kilos(s.neto_kg)}</td>
                      <td><span className={"an-chip " + ch.c}>{ch.t}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {vivas.length > 60 && (
            <p className="an-mas">
              Se muestran las 60 más nuevas de {vivas.length}. Afina el filtro para llegar al resto,
              o baja el informe en PDF, que las trae todas.
            </p>
          )}
        </div>
      </section>

      <section className="caja">
        <div className="cab"><div>
          <h2>Las taras en uso</h2>
          <p>
            Es el número que más silenciosamente puede estar mal: se teclea una vez y después se
            copia solo a cada línea. Si una tolva pesa distinto a la de al lado, que sea porque
            de verdad lo pesa.
          </p>
        </div></div>
        <div className="rueda">
          {activas.length === 0 && (
            <div className="vacio"><b>Sin tolvas</b>No hay ninguna activa en el maestro.</div>
          )}
          {activas.map((t) => (
            <div key={t.codigo} className="tolva">
              <div>
                <div className="nom">{t.codigo}</div>
                <div className="det">{t.modelo}</div>
              </div>
              <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{kilos(t.tara_kg)} kg</div>
            </div>
          ))}
        </div>
      </section>

      <div className="aviso">
        <b>Estos kilos no se cuadran con las unidades de En sitio.</b> Miden cosas distintas:
        una botella de 330 y una de 750 pesan diferente, el vidrio se acumula días antes de
        salir, y parte de lo que se pesa nunca se contó en sitio. Las unidades están en{" "}
        <Link href="/roturas/en-sitio/analisis">En sitio → Análisis</Link>, aparte y a propósito.
      </div>
    </div>
  );
}
