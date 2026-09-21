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
  const [kilos, setKilos] = useState<Record<number, string>>({});
  const [corrigiendo, setCorrigiendo] = useState<number | null>(null);
  const [mandando, setMandando] = useState(false);
  /* EN EL CELULAR SE LLENA UNA MÁQUINA A LA VEZ: se escoge la máquina y
     se digitan sus kilos. Es la MISMA rejilla de arriba —los mismos
     kilos por máquina—, solo que vista de a un renglón, porque quince
     casillas en una columna de 360 px obligan a rodar para cada una. */
  const [maqCel, setMaqCel] = useState<number>(maquinas.find((m) => m.activo)?.item ?? 0);

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

  /* Al cambiar de turno, de línea o de envase, la rejilla se limpia: lo
     que había escrito era de otra cosa, y dejarlo puesto es la forma
     más fácil de guardar los kilos del turno anterior. */
  useEffect(() => { setKilos({}); setCorrigiendo(null) }, [linea, turno, envase, fecha]);

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

  async function guardar() {
    if (!envase) { avisar.mal("Falta escoger el envase"); return }
    if (!hayAlgo) { avisar.mal("La rejilla está en cero: no hay nada que guardar"); return }
    setMandando(true);
    const { error } = await supabase.rpc("rotlinea_guardar", {
      p_fecha: fecha,
      p_linea: linea,
      p_turno: turno,
      p_envase: envase,
      p_kilos: maqs
        .map((m) => ({ maquina: m.item, kg: num(kilos[m.item]) }))
        .filter((x) => x.kg > 0),
      p_toma: corrigiendo,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(corrigiendo
      ? `Pesada ${corrigiendo} corregida: ${totalUnd.toLocaleString("es-CO")} unidades.`
      : `Pesada guardada: ${totalKg} kg · ${totalUnd.toLocaleString("es-CO")} unidades.`);
    setKilos({}); setCorrigiendo(null);
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

  const maqPuesta = maqs.find((m) => m.item === maqCel) ?? maqs[0];
  const llenas = maqs.filter((m) => num(kilos[m.item]) > 0);
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
                      onClick={() => setLinea(l.linea)}>{l.linea}</button>
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
                      if (corrigiendo === p.toma) { setCorrigiendo(null); setKilos({}); return }
                      setCorrigiendo(p.toma);
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
          {/* ---------- EL CELULAR: MÁQUINA Y KILOS, DE A UNA ----------
              Se ve solo en pantallas angostas; en el PC está la rejilla
              completa de abajo. Las dos escriben en los mismos kilos. */}
          <div className="rl-cel">
            <label className="rl-campo">
              <span className="rl-rot"><i className="rl-n">4</i>Máquina</span>
              <select className="rl-cel-maq" value={maqPuesta?.item ?? ""}
                      onChange={(e) => setMaqCel(Number(e.target.value))}>
                {maqs.map((m) => (
                  <option key={m.item} value={m.item}>
                    {m.nombre}{num(kilos[m.item]) > 0 ? ` · ${fmtKg(num(kilos[m.item]))} kg` : ""}
                  </option>
                ))}
              </select>
            </label>
            {maqPuesta && (
              <label className="rl-campo">
                <span className="rl-rot"><i className="rl-n">5</i>Kilos de la canastilla</span>
                <span className="rl-kilos">
                  <input type="text" inputMode="decimal" placeholder="0" disabled={!puedeEditar}
                         aria-label={`Kilos en ${maqPuesta.nombre}`}
                         value={kilos[maqPuesta.item] ?? ""}
                         onChange={(e) => {
                           const v = e.target.value.replace(/[^\d.,]/g, "");
                           setKilos((k) => ({ ...k, [maqPuesta.item]: v }));
                         }} />
                  <span>kg</span>
                </span>
              </label>
            )}
            {maqPuesta && env && (
              <p className="rl-salen">
                <span className="k">
                  {num(kilos[maqPuesta.item]) > 0
                    ? <>{fmtKg(num(kilos[maqPuesta.item]))} ÷ {fmtKg(Number(env.peso_kg))} · <b>salen solas</b></>
                    : <>÷ {fmtKg(Number(env.peso_kg))} kg por envase · <b>salen solas</b></>}
                </span>
                <span className="v">{und(kilos[maqPuesta.item] ?? "").toLocaleString("es-CO")} u</span>
              </p>
            )}
            {/* LO QUE YA LLEVA ESTA PESADA, máquina por máquina. Tocar una
                la vuelve a poner arriba para corregirla. */}
            {llenas.length > 0 && (
              <div className="rl-cel-lleva">
                <span className="rl-rot">En esta pesada</span>
                {llenas.map((m) => (
                  <button key={m.item} type="button"
                          className={m.item === maqPuesta?.item ? "on" : ""}
                          onClick={() => setMaqCel(m.item)}>
                    <b>{m.nombre}</b>
                    <span>{fmtKg(num(kilos[m.item]))} kg · {und(kilos[m.item] ?? "").toLocaleString("es-CO")} u</span>
                  </button>
                ))}
                {llenas.length > 1 && (
                  <span className="rl-cel-total">
                    Total: <b>{fmtKg(totalKg)} kg · {totalUnd.toLocaleString("es-CO")} u</b>
                  </span>
                )}
              </div>
            )}
          </div>

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
                          type="number" inputMode="decimal" min={0} step="0.01"
                          value={kg} placeholder="0" disabled={!puedeEditar}
                          aria-label={`Kilos en ${m.nombre}`}
                          onChange={(e) => setKilos((k) => ({ ...k, [m.item]: e.target.value }))}
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
                  <td className="cen">{totalKg ? totalKg.toFixed(2).replace(/\.00$/, "") : "—"}</td>
                  <td className="cen">{totalUnd ? totalUnd.toLocaleString("es-CO") : "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>

        </>
      )}

      {/* EL PIE, SIEMPRE QUE SE PUEDA ANOTAR. En el celular es la barra
          oscura pegada abajo: el botón queda a un dedo sin importar por
          dónde vaya la pantalla, y dice cuántas pesadas lleva el día. */}
      {puedeEditar && !firmado && (
        <div className="rl-pie rl-pie-reg">
          <p className="rl-pie-cuenta">
            <b>{pesadas.length}</b> pesada{pesadas.length === 1 ? "" : "s"} hoy
          </p>
          <button type="button" className="rl-btn si" disabled={mandando || !envase || !hayAlgo}
                  onClick={guardar}>
            {mandando ? "Guardando…"
              : corrigiendo ? `Corregir la pesada ${corrigiendo}`
              : `Guardar la pesada ${mias.length + 1}`}
          </button>
          {corrigiendo && (
            <button type="button" className="rl-btn" disabled={mandando}
                    onClick={() => { setCorrigiendo(null); setKilos({}) }}>
              Dejar así
            </button>
          )}
          <span className="rl-nota">
            {env && <>Peso del envase: <b>{Number(env.peso_kg)} kg</b> por botella. </>}
            Guardar <b>agrega</b> una pesada; no borra las anteriores.
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
  const puesto = envases.find((e) => e.material === valor);

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
            <input autoFocus value={filtro} placeholder="Buscar — 330, marron, flint…"
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
