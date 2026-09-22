"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Envase, Firma, Linea, Maquina, Pesada } from "@/modulos/rotlinea/datos";
import { TURNOS, horarioDe, letraDe, turnoDeAhora } from "@/modulos/rotlinea/turnos";

/**
 * LA REJILLA DE LA PESADA.
 *
 * Se escoge línea, turno y envase, y sale UNA rejilla con las máquinas
 * del tren en su orden —desempacadora, lavadora, llenadora,
 * pasteurizadora, etiquetadora, empacadora—. Quien la llena va
 * siguiendo la botella, no una lista alfabética, y por eso el orden de
 * las máquinas es el del recorrido y no el del código.
 *
 * SE DIGITA EL KILO Y LAS UNIDADES SALEN SOLAS. Lo que hay en el muelle
 * es una báscula: se pesa la canastilla de vidrio roto y sale un número
 * en kilos. Las unidades se calculan dividiendo por el peso de ese
 * envase, y SE REDONDEA HACIA ARRIBA — media botella rota es una
 * botella que no se vende. El número se ve al lado mientras se teclea,
 * para que nadie tenga que confiar a ciegas.
 *
 * GUARDAR AGREGA UNA PESADA, NO REEMPLAZA. Un turno se pesa más de una
 * vez: la línea para, vuelve a arrancar, y hay otra canastilla. Las
 * pesadas de ese turno se ven arriba y se suman. Para corregir una, se
 * toca y la rejilla se llena con lo que decía.
 *
 * VARIAS LÍNEAS EN UN SOLO ENVÍO. «Relaciono la línea 1 y cuando pase a
 * la 2 y vuelva a la 1 no se borre, y cuando le dé a enviar, todo se
 * genere en un solo informe.» Lo que se teclea queda guardado EN LA
 * PANTALLA por línea + turno + envase: cambiar de línea es cambiar de
 * hoja, no borrar. Abajo se ve lo que hay pendiente, y «Enviar todo»
 * manda cada pesada y abre UNA sola hoja del día con todas las líneas.
 */
export function Rejilla({ fecha, lineas, maquinas, envases, pesadas, firmas,
                          puedeEditar, esAdmin, turnoAhora }: {
  fecha: string;
  lineas: Linea[];
  maquinas: Maquina[];
  envases: Envase[];
  pesadas: Pesada[];
  firmas: Firma[];
  puedeEditar: boolean;
  esAdmin: boolean;
  /** El turno que corresponde a esta hora, calculado en el servidor. */
  turnoAhora: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const vivas = lineas.filter((l) => l.activo);
  const maqs = maquinas.filter((m) => m.activo);

  const [linea, setLinea] = useState<number>(vivas[0]?.linea ?? 1);
  /* EL TURNO ARRANCA EN EL DE AHORA. Quien entra a pesar está pesando lo
     de su turno el 95 % de las veces; que salga puesto el A a las cinco
     de la tarde es un error esperando a que alguien no lo mire. */
  const [turno, setTurno] = useState<number>(turnoAhora);
  const [envase, setEnvase] = useState<string>("");
  /* Kilos por máquina, como TEXTO. Guardar el número obligaría a
     decidir qué es "" y qué es 0 mientras la persona borra para volver
     a escribir, y el campo se pondría en 0 solo. */
  /* EL BORRADOR, POR LÍNEA + TURNO + ENVASE. Antes era una sola rejilla
     que se vaciaba al cambiar de línea; ahora cada combinación guarda lo
     suyo hasta que se envía. */
  const [borr, setBorr] = useState<Record<string, Record<number, string>>>({});
  const [corr, setCorr] = useState<Record<string, number>>({});
  /* CADA LÍNEA RECUERDA EN QUÉ TURNO Y CON QUÉ ENVASE se quedó: volver a
     la línea 1 es volver a SU rejilla, no a la línea 1 con el envase de
     la 4 —que estaría vacía y parecería que se borró—. */
  const [ultimo, setUltimo] = useState<Record<number, { turno: number; envase: string }>>({});
  const [mandando, setMandando] = useState(false);

  const clave = `${linea}|${turno}|${envase}`;
  const irALinea = (l: number) => {
    const u = ultimo[l];
    setLinea(l);
    if (u) { setTurno(u.turno); setEnvase(u.envase) }
  };
  const kilos = borr[clave] ?? {};
  const corrigiendo = corr[clave] ?? null;
  const setKilos = (f: (k: Record<number, string>) => Record<number, string>) =>
    setBorr((b) => ({ ...b, [clave]: f(b[clave] ?? {}) }));
  const ponerCorr = (t: number | null) =>
    setCorr((c) => { const x = { ...c }; if (t == null) delete x[clave]; else x[clave] = t; return x });

  /* La firma de ESTE turno de ESTA línea. Es por turno completo, no por
     envase: el líder da por bueno el turno, no una canastilla. */
  const firmado = firmas.find((f) => f.linea === linea && f.turno === turno);

  async function quitarFirma() {
    setMandando(true);
    const { error } = await supabase.rpc("rotlinea_quitar_firma", {
      p_fecha: fecha, p_linea: linea, p_turno: turno,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien("Firma quitada. El turno queda abierto otra vez.");
    router.refresh();
  }

  const env = envases.find((e) => e.material === envase);

  /* Las pesadas que ya tiene ESTE turno de ESTE envase. */
  const mias = useMemo(
    () => pesadas.filter((p) => p.linea === linea && p.turno === turno && p.envase === envase),
    [pesadas, linea, turno, envase]);

  /* Al cambiar de DÍA sí se limpia todo: el borrador es de ese día.
     Cambiar de línea, de turno o de envase ya no borra nada. */
  useEffect(() => { setBorr({}); setCorr({}); setUltimo({}) }, [fecha]);
  useEffect(() => { if (envase) setUltimo((u) => ({ ...u, [linea]: { turno, envase } })) }, [linea, turno, envase]);

  /* «38,5» Y «38.5» SON LO MISMO. El teclado del celular en español
     pone coma, y Number("38,5") es NaN: la pesada saldría en cero. */
  const num = (kg: string | undefined) => Number((kg ?? "").replace(",", ".")) || 0;
  const und = (kg: string) => {
    const n = num(kg);
    if (!env || !n || n <= 0) return 0;
    return Math.ceil(n / Number(env.peso_kg));
  };
  const totalKg = maqs.reduce((a, m) => a + num(kilos[m.item]), 0);
  const totalUnd = maqs.reduce((a, m) => a + und(kilos[m.item] ?? ""), 0);
  const hayAlgo = totalKg > 0;

  /* LO QUE HAY PENDIENTE DE ENVIAR, en todas las líneas. Se arma del
     borrador: cada combinación con algo escrito es una pesada. */
  const pendientes = useMemo(() => Object.entries(borr).map(([k, ks]) => {
    const [l, t, e] = k.split("|");
    const ev = envases.find((x) => x.material === e);
    const filas = maqs.map((m) => ({ maquina: m.item, kg: num(ks[m.item]) })).filter((x) => x.kg > 0);
    const kg = filas.reduce((a, x) => a + x.kg, 0);
    const unds = ev ? filas.reduce((a, x) => a + Math.ceil(x.kg / Number(ev.peso_kg)), 0) : 0;
    return { k, linea: Number(l), turno: Number(t), envase: e,
             nombre: ev?.descripcion ?? e, filas, kg, und: unds, toma: corr[k] ?? null };
  }).filter((x) => x.filas.length > 0 && x.envase)
    .sort((a, b) => a.linea - b.linea || a.turno - b.turno || a.nombre.localeCompare(b.nombre)),
    [borr, corr, envases, maqs, maquinas]);
  const undPend = pendientes.reduce((a, x) => a + x.und, 0);
  const lineasPend = [...new Set(pendientes.map((x) => x.linea))].sort((a, b) => a - b);
  /* Un turno firmado está cerrado: lo que quedó escrito ahí no se manda. */
  const cerrada = (l: number, t: number) => firmas.some((f) => f.linea === l && f.turno === t);

  /* ENVIAR TODO: una llamada por pesada —la tabla guarda una fila por
     máquina— y al final UNA sola hoja del día con todas las líneas. Lo
     que falle se queda en el borrador con su aviso, para no perderlo. */
  async function enviarTodo() {
    if (!pendientes.length) { avisar.mal("No hay nada escrito para enviar"); return }
    const trancadas = pendientes.filter((x) => cerrada(x.linea, x.turno));
    if (trancadas.length) {
      avisar.mal(`Turno firmado: la línea ${trancadas[0].linea} turno ${letraDe(trancadas[0].turno)} está cerrada. Quítale la firma o borra esa pesada del borrador.`);
      return;
    }
    setMandando(true);
    const malas: string[] = [];
    const buenas: string[] = [];
    for (const x of pendientes) {
      const { error } = await supabase.rpc("rotlinea_guardar", {
        p_fecha: fecha, p_linea: x.linea, p_turno: x.turno, p_envase: x.envase,
        p_kilos: x.filas, p_toma: x.toma,
      });
      if (error) malas.push(`Línea ${x.linea} ${letraDe(x.turno)}: ${error.message}`);
      else buenas.push(x.k);
    }
    setMandando(false);
    /* Solo se saca del borrador lo que de verdad quedó guardado. */
    setBorr((b) => { const y = { ...b }; for (const k of buenas) delete y[k]; return y });
    setCorr((c) => { const y = { ...c }; for (const k of buenas) delete y[k]; return y });
    if (malas.length) { avisar.mal(malas.join(" · ")); if (!buenas.length) return }
    const n = buenas.length;
    avisar.bien(`${n} pesada${n === 1 ? "" : "s"} guardada${n === 1 ? "" : "s"} · ${undPend.toLocaleString("es-CO")} unidades` +
      (lineasPend.length > 1 ? ` · líneas ${lineasPend.join(", ")}` : ""));
    /* «hoja=1»: la página vuelve a armarse en el servidor CON LA PESADA
       NUEVA, y al llegar abre sola el cuadro de generar la hoja del día.
       Con un `refresh` y un aviso aparte, el cuadro se abriría antes de
       que llegaran los datos y el PDF saldría sin lo que se acaba de
       guardar. */
    router.replace(`?d=${fecha}&hoja=1`, { scroll: false });
  }

  /* Enter baja a la máquina siguiente. Es una columna de quince campos
     numéricos: obligar a tocar cada uno con el dedo o con el mouse es
     lo que hace que la gente lo llene en Excel y lo pase después. */
  const campos = useRef<(HTMLInputElement | null)[]>([]);
  const siguiente = (i: number) => campos.current[i + 1]?.focus();

  const fmtKg = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });

  return (
    <div className="rl-rejilla">
      {avisos}

      <div className="rl-escoger">
        <div className="rl-campo">
          <span className="rl-rot"><i className="rl-n">1</i>Línea</span>
          <div className="rl-seg">
            {vivas.map((l) => (
              <button key={l.linea} type="button" className={linea === l.linea ? "on" : ""}
                      onClick={() => irALinea(l.linea)}>{l.linea}</button>
            ))}
          </div>
        </div>

        <div className="rl-campo">
          <span className="rl-rot"><i className="rl-n">2</i>Turno</span>
          {/* LA LETRA Y LA HORA, no el número. "Turno 2" no le dice a
              nadie si es el suyo; "B · 08:00 · 16:00" sí. El número es
              lo que se guarda, la letra es lo que se lee. */}
          <div className="rl-seg turnos">
            {TURNOS.map((t) => (
              <button key={t.n} type="button" className={turno === t.n ? "on" : ""}
                      onClick={() => setTurno(t.n)}>
                <b>{t.letra}</b><i>{horarioDe(t.n)}</i>
              </button>
            ))}
          </div>
        </div>

        <div className="rl-campo rl-ancho">
          <span className="rl-rot"><i className="rl-n">3</i>Envase</span>
          <Escoger valor={envase} envases={envases.filter((e) => e.activo)}
                   alEscoger={setEnvase} />
        </div>
      </div>

      {/* LA FIRMA DEL LÍDER. Va arriba de todo lo del turno porque es lo
          que decide si se puede tocar algo: un turno firmado está
          cerrado y la rejilla no tiene nada que hacer ahí. */}
      {firmado ? (
        <div className="rl-firmado">
          <div className="rl-firmado-txt">
            <b>Turno {letraDe(turno)} firmado</b>
            <span>
              {firmado.firmado_nombre ?? "—"} · {new Date(firmado.firmado_en)
                .toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {" · "}<b>{firmado.firmadas.toLocaleString("es-CO")}</b> unidades
              {firmado.nota && <> · «{firmado.nota}»</>}
            </span>
            {/* LAS DOS CIFRAS, cuando no coinciden. Es la única forma de
                enterarse de que alguien movió algo después de validarlo. */}
            {firmado.cambio_despues && (
              <span className="rl-alerta">
                Hoy la tabla dice <b>{firmado.unidades_hoy.toLocaleString("es-CO")}</b>, no lo que
                se firmó. Algo se movió después de la firma.
              </span>
            )}
          </div>
          {esAdmin && (
            <button type="button" className="rl-btn chico" disabled={mandando}
                    onClick={quitarFirma}>Quitar la firma</button>
          )}
        </div>
      ) : null}
      {/* «FIRMAR EL TURNO» SE QUITÓ: la constancia de quién hizo el
          registro va en la hoja del día, con el nombre de quien elaboró y
          su firma dibujada. Los turnos que ya estaban firmados se siguen
          mostrando arriba, y el administrador puede quitarles la firma. */}

      {/* LAS PESADAS QUE YA TIENE ESE TURNO. Van ARRIBA de la rejilla y
          no abajo: son lo que hay que saber ANTES de empezar a teclear,
          o se registra dos veces lo mismo. */}
      {mias.length > 0 && (
        <div className="rl-tomas">
          <span className="rl-rot">Ya lleva</span>
          {mias.map((p) => (
            <button key={p.toma} type="button"
                    className={"rl-toma" + (corrigiendo === p.toma ? " on" : "") + (p.baja ? " baja" : "")}
                    disabled={!puedeEditar || p.baja}
                    title={p.baja ? "Ya dada de baja en SAP: no se puede corregir"
                                  : "Tocar para corregir esta pesada"}
                    onClick={() => {
                      if (corrigiendo === p.toma) { ponerCorr(null); setKilos(() => ({})); return }
                      ponerCorr(p.toma);
                      avisar.bien(`Corrigiendo la pesada ${p.toma}. Vuelve a llenar la rejilla como debe quedar.`);
                    }}>
              <b>Pesada {p.toma}</b>
              <span>{p.und.toLocaleString("es-CO")} und · {p.kg} kg</span>
              {p.baja && <i>dada de baja</i>}
            </button>
          ))}
          <span className="rl-suma">
            Total del turno: <b>{mias.reduce((a, p) => a + p.und, 0).toLocaleString("es-CO")}</b> unidades
          </span>
        </div>
      )}

      {firmado ? (
        <div className="rl-vacio">
          <b>Este turno está cerrado</b>
          El líder lo firmó y ya no entran pesadas ni correcciones. Si hay que cambiar algo,
          un administrador tiene que quitar la firma primero.
        </div>
      ) : !envase ? (
        <div className="rl-vacio">
          <b>Escoge el envase</b>
          Las unidades salen de dividir los kilos por el peso de ese envase, así que hasta que
          no se sepa cuál es no hay cómo calcularlas.
        </div>
      ) : (
        <>
          {/* TODAS LAS MÁQUINAS A LA VISTA, también en el celular. «En un
              solo registro se pueden relacionar varias causales»: una
              pesada lleva kilos de varias máquinas y hay que verlas todas
              para no dejarse ninguna. En el celular la rejilla se aprieta
              (rotura.css) pero no se esconde. */}
          <p className="rl-paso-maq">
            <span className="rl-rot"><i className="rl-n">4</i>Kilos por máquina</span>
          </p>
          <div className="rl-tabla-env">
            <table className="rl-tabla">
              <thead>
                <tr>
                  <th>Máquina</th>
                  <th className="cen">Kilos</th>
                  <th className="cen">Unidades</th>
                </tr>
              </thead>
              <tbody>
                {maqs.map((m, i) => {
                  const kg = kilos[m.item] ?? "";
                  const u = und(kg);
                  return (
                    <tr key={m.item} className={u > 0 ? "con" : ""}>
                      {/* SIN EL CÓDIGO. Decía 9, 1, 12, 6… al lado de
                          cada máquina y no quiere decir nada para quien
                          está llenando la rejilla: es el código interno
                          con el que la máquina se conoce en el maestro,
                          y ahí es donde tiene sentido verlo. */}
                      <td className="rl-maq">{m.nombre}</td>
                      <td className="cen">
                        <input
                          ref={(el) => { campos.current[i] = el }}
                          /* TEXTO Y NO «number»: el teclado del celular en
                             español pone coma, y un campo number con «38,5»
                             queda vacío sin avisar. Se deja solo dígitos,
                             punto y coma; `num` lee las dos. */
                          type="text" inputMode="decimal"
                          value={kg} placeholder="0" disabled={!puedeEditar}
                          aria-label={`Kilos en ${m.nombre}`}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d.,]/g, "");
                            setKilos((k) => ({ ...k, [m.item]: v }));
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); siguiente(i) } }}
                        />
                      </td>
                      <td className="cen rl-und">{u > 0 ? u.toLocaleString("es-CO") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>TOTAL DE LA PESADA</td>
                  <td className="cen">{totalKg ? fmtKg(totalKg) : "—"}</td>
                  <td className="cen">{totalUnd ? totalUnd.toLocaleString("es-CO") : "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>

        </>
      )}

      {/* LO QUE ESTÁ ESCRITO Y TODAVÍA NO SE HA MANDADO, de todas las
          líneas. Tocar una lleva a su rejilla; la × la borra. Sin esta
          lista, el borrador de otra línea sería invisible y se enviaría
          sin querer —o se perdería creyendo que no había nada—. */}
      {pendientes.length > 0 && (
        <div className="rl-borr">
          <span className="rl-rot">Escrito, sin enviar</span>
          <div className="rl-borr-chips">
            {pendientes.map((x) => (
              <span key={x.k} className={"rl-borr-chip" + (x.k === clave ? " on" : "") + (cerrada(x.linea, x.turno) ? " mala" : "")}>
                <button type="button" title="Abrir esta rejilla"
                        onClick={() => { setLinea(x.linea); setTurno(x.turno); setEnvase(x.envase); }}>
                  <b>Línea {x.linea} · {letraDe(x.turno)}</b>
                  <i>{x.nombre}</i>
                  <span>{x.und.toLocaleString("es-CO")} und · {fmtKg(x.kg)} kg{x.toma ? ` · corrige la ${x.toma}` : ""}</span>
                  {cerrada(x.linea, x.turno) && <em>turno firmado: no se puede enviar</em>}
                </button>
                <button type="button" className="rl-borr-x" aria-label={`Borrar lo escrito de la línea ${x.linea} turno ${letraDe(x.turno)}`}
                        onClick={() => {
                          setBorr((b) => { const y = { ...b }; delete y[x.k]; return y });
                          setCorr((c) => { const y = { ...c }; delete y[x.k]; return y });
                        }}>×</button>
              </span>
            ))}
          </div>
          <span className="rl-suma">
            En total: <b>{undPend.toLocaleString("es-CO")}</b> unidades en {lineasPend.length === 1 ? "una línea" : `${lineasPend.length} líneas`}
          </span>
        </div>
      )}

      {/* EL PIE, SIEMPRE QUE SE PUEDA ANOTAR. En el celular es la barra
          oscura pegada abajo: el botón queda a un dedo sin importar por
          dónde vaya la pantalla, y dice cuántas pesadas lleva el día. */}
      {/* Con el turno firmado la rejilla se cierra, pero si hay otras
          líneas escritas la barra sigue: si no, quedarse parado en un
          turno firmado esconde el botón de enviar lo demás. */}
      {puedeEditar && (!firmado || pendientes.length > 0) && (
        <div className="rl-pie rl-pie-reg">
          {/* Mientras se llena, la barra dice lo que va a guardar; en
              blanco, cuántas pesadas lleva el día. */}
          <p className="rl-pie-cuenta">
            {pendientes.length === 0
              ? <><b>{pesadas.length}</b>pesada{pesadas.length === 1 ? "" : "s"} hoy</>
              : pendientes.length === 1
                ? <><b>{undPend.toLocaleString("es-CO")} u</b>{fmtKg(pendientes[0].kg)} kg · {pendientes[0].filas.length} máq.</>
                : <><b>{undPend.toLocaleString("es-CO")} u</b>{pendientes.length} pesadas · líneas {lineasPend.join(", ")}</>}
          </p>
          <button type="button" className="rl-btn si" disabled={mandando || !pendientes.length}
                  onClick={enviarTodo}>
            {mandando ? "Enviando…"
              : pendientes.length > 1 ? `Enviar todo (${pendientes.length})`
              : corrigiendo ? `Corregir la pesada ${corrigiendo}`
              : `Guardar la pesada ${mias.length + 1}`}
          </button>
          {corrigiendo && (
            <button type="button" className="rl-btn" disabled={mandando}
                    onClick={() => { ponerCorr(null); setKilos(() => ({})) }}>
              Dejar así
            </button>
          )}
          <span className="rl-nota">
            {env && <>Peso del envase: <b>{Number(env.peso_kg)} kg</b> por botella. </>}
            Lo que escribes se queda al cambiar de línea; <b>enviar</b> las manda todas y arma
            una sola hoja del día. Enviar <b>agrega</b>; no borra las pesadas anteriores.
          </span>
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   ESCOGER EL ENVASE

   Son veintiún envases y se parecen entre sí —«Envase Marron 330R»,
   «ENVASE MARRON 330NR NUEVO», «Envase Marron Club Col 330R»—, así que
   la lista sola no basta: lleva buscador y muestra el PESO de cada uno,
   que es lo que de verdad los distingue para este módulo.
   ===================================================================== */
function Escoger({ valor, envases, alEscoger }: {
  valor: string;
  envases: Envase[];
  alEscoger: (m: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const caja = useRef<HTMLDivElement>(null);
  const buscar = useRef<HTMLInputElement>(null);
  const puesto = envases.find((e) => e.material === valor);

  /* EL TECLADO, SOLO SI SE PIDE. «Que no se me despliegue el teclado a
     menos que yo lo quiera.» Con autoFocus, abrir la lista en el celular
     levantaba el teclado y tapaba media lista: para escoger uno de
     veinte envases se toca, no se escribe. En el PC —ratón, teclado de
     verdad— sí se pone el cursor en el buscador, que ahí no tapa nada.
     En el celular el teclado sale solo si se toca el buscador. */
  useEffect(() => {
    if (abierto && window.matchMedia("(pointer: fine)").matches) buscar.current?.focus();
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  const lista = envases.filter((e) => {
    const t = filtro.trim().toLowerCase();
    return !t || e.descripcion.toLowerCase().includes(t) || e.material.includes(t);
  });

  return (
    <div className="rl-sel" ref={caja}>
      <button type="button" className="rl-disparo" aria-expanded={abierto}
              onClick={() => { setAbierto((v) => !v); setFiltro("") }}>
        {puesto
          ? <span className="rl-puesto"><b>{puesto.descripcion}</b><i>{puesto.material} · {Number(puesto.peso_kg)} kg</i></span>
          : <span className="rl-sin">Escoge el envase…</span>}
        <svg viewBox="0 0 24 24" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {abierto && (
        <div className="rl-opciones">
          <div className="rl-filtro">
            <input ref={buscar} value={filtro} placeholder="Buscar — 330, marron, flint…"
                   aria-label="Buscar envase"
                   onChange={(e) => setFiltro(e.target.value)} />
          </div>
          <div className="rl-rollo">
            {lista.length === 0 && <p className="rl-nada">Ningún envase se llama así.</p>}
            {lista.map((e) => (
              <button key={e.material} type="button"
                      className={e.material === valor ? "elegida" : ""}
                      onClick={() => { alEscoger(e.material); setAbierto(false) }}>
                <b>{e.descripcion}</b>
                <i>{e.material} · {Number(e.peso_kg)} kg</i>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
