"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type {
  Defecto, EnvaseAi, SocioAi, CanalAi, Revision, DetalleAi,
} from "@/modulos/sider/ai";
import { NOMBRE_TIPO_LARGO, turnoAi, letraTurno } from "@/modulos/sider/comun";

/* LO MÍNIMO QUE EL FORMULARIO NECESITA SABER DEL VIAJE. No pide un
   `Pendiente` entero a propósito: así lo puede llamar la certificación
   de llegada, que tiene el viaje en la mano y no va a ir a buscarlo otra
   vez a la vista de pendientes. */
export type ViajeAi = {
  viaje_id: string; placa: string; planta: string; fecha: string; sku: string;
  llego_en?: string | null;
  /** Botellas del viaje, tal como las muestra la tarjeta del camión.
   *  Si viene, «recibidas» sale de aquí y no se digita. */
  unidades?: number | null;
  ai_motivo?: string | null; pedido_nombre?: string | null;
  /** LO QUE EL VIAJE YA SABE de quién y de qué. Si viene, el formulario lo
   *  trae puesto y quien revisa solo cuenta botellas: el canal y el socio
   *  los dijo el Vh Interno al crearse, y el envase sale del material. */
  canal?: string | null; socio?: string | null; envase?: string | null;
  /** Lo creó control con el «+» (y no lo certificó Sider): cambia de dónde
   *  dice el formulario que salió el canal. */
  interno?: boolean;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/* LA FECHA SE FORMATEA SIEMPRE, venga como venga. Salía en crudo
   —«2026-09-10T17:41:01.717404+00:00»— porque el respaldo era
   `viaje.fecha` a pelo, y esa columna a veces trae la marca de tiempo
   entera. Poner un texto sin formatear en una cinta es peor que no
   ponerlo: ocupa el triple y no se lee. */
const cuando = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-CO", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
};

/**
 * LA REVISIÓN AI DEL ENVASE.
 *
 * REEMPLAZA UNA FILA DE «Registro Cobro AI COL V02.xlsx» —cincuenta y
 * nueve columnas— por trece campos. Las otras cuarenta y seis eran
 * cuentas, y las cuentas no se digitan: de las cincuenta y nueve, solo
 * trece son datos que alguien observa. El resto salía de fórmulas, y
 * cuando una fórmula se digita se equivoca.
 *
 * SE TOCA, NO SE DIGITA. Los catorce conteos eran casillas de teclear y
 * ahora son botones de más y menos. No es un gusto: esto se llena de
 * pie, en el muelle, con el celular en una mano y la otra señalando
 * botellas. Teclear un número ahí es abrir el teclado del sistema, que
 * tapa media pantalla y el campo siguiente. Y hay una razón más honda:
 * al tocar «más» por cada botella mala, el número NO se puede escribir
 * mal — no existe el 44 donde iba el 4.
 *
 * EL PANEL NO SE VA. El índice de cobro, lo que no se le abona al socio
 * y lo que falta para poder cerrar están a la vista TODO el tiempo: al
 * lado en pantalla ancha, pegados abajo en el celular. Antes había que
 * bajar hasta el final para ver en qué iba la cuenta, y quien está
 * contando botellas no baja: sigue contando y se entera del número raro
 * cuando el socio reclama.
 *
 * Y LO QUE SE VE AQUÍ NO ES LO QUE MANDA. El índice de verdad lo calcula
 * la base con la misma fórmula; esto es un anticipo para que nadie
 * cuente a ciegas. Se escribió a propósito de forma que las dos cuentas
 * sean la misma —defectos que cobran ÷ revisadas— y hay una prueba en la
 * base que la fija.
 */
export function FormularioAi({
  viaje, revision, detalle, defectos, envases, socios, canales,
  alGuardar, alCancelar, rotuloCancelar, tipo = "ai",
}: {
  viaje: ViajeAi;
  revision: Revision | null;
  detalle: DetalleAi[];
  defectos: Defecto[];
  envases: EnvaseAi[];
  socios: SocioAi[];
  canales: CanalAi[];
  /* QUIÉN DECIDE A DÓNDE SE VA DESPUÉS ES QUIEN LLAMA, no el
     formulario. Antes hacía `router.push("/sider/ai")` por dentro, y eso
     lo ataba a la pantalla suelta: desde la certificación de llegada esa
     salida no tiene ningún sentido —quien acaba de contar botellas en el
     muelle no quiere caer en una lista de pendientes—. */
  alGuardar: () => void;
  alCancelar: () => void;
  rotuloCancelar?: string;
  /**
   * `ai` = Revisión AI CERTIFICADA (el camión llegó certificado por
   * Sider); `sorting` = Revisión AI NORMAL (lo creó control con el «+»
   * de Tránsito). Las dos claves son las internas de la base.
   *
   * LAS DOS SON LA MISMA REVISIÓN Y LAS DOS COBRAN: mismos campos, mismos
   * catorce defectos, misma cuenta del índice, mismo «Abono final SAP».
   * Antes el Sorting escondía las cifras de plata porque no entraba al
   * cobro; ahora entra, y esconderlas sería dejar a quien cuenta sin ver
   * lo que su conteo mueve. Lo único que cambia es a qué tipo se guarda
   * y la marca escrita en la cinta.
   */
  tipo?: "ai" | "sorting";
}) {
  const esSorting = tipo === "sorting";
  const [mandando, setMandando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);

  /* LO QUE EL VIAJE YA TRAE, y solo si sigue siendo válido: un canal, un
     socio o un envase que el maestro ya apagó no se precargan. Al CORREGIR
     una revisión ya hecha manda lo que quedó guardado, no el viaje. */
  const canalViaje = !revision && viaje.canal && canales.some((c) => c.clave === viaje.canal)
    ? viaje.canal : "";
  const socioViaje = canalViaje === "socios" && viaje.socio && socios.some((x) => x.clave === viaje.socio)
    ? viaje.socio : "";
  const envaseViaje = !revision && viaje.envase && envases.some((e) => e.clave === viaje.envase)
    ? viaje.envase : "";

  /* EL TURNO ABRE EN EL DE AHORA (A 06–14, B 14–22, C 22–06, hora de
     Colombia; la base los guarda como T1, T2 y T3): nadie lo escribe. Se puede cambiar, por si quien revisa
     está cerrando el turno anterior. Al corregir, el que se guardó. */
  const [turno, setTurno] = useState(revision?.turno ?? turnoAi());
  const [canal, setCanal] = useState(revision?.canal ?? (canalViaje || canales[0]?.clave || "socios"));
  const [socio, setSocio] = useState(revision?.socio ?? socioViaje);
  const [envase, setEnvase] = useState(revision?.envase ?? envaseViaje);
  /* LO QUE VINO DEL VIAJE NO SE TOCA: se lee y ya. Si el viaje no lo
     trae, o ya no vale, el campo se escoge como siempre. */
  const canalFijo = !!canalViaje && (canalViaje !== "socios" || !!socioViaje);
  const envaseFijo = !!envaseViaje;
  /* «Venía certificado por el socio» ya no se pregunta en pantalla: se conserva lo que ya traía la revisión (o «no»). */
  const certificado = revision?.certificado ?? false;
  const [recibidas, setRecibidas] = useState(revision ? String(revision.recibidas) : "");
  const [revisadas, setRevisadas] = useState(revision ? String(revision.revisadas) : "");
  const [comentarios, setComentarios] = useState(revision?.comentarios ?? "");

  /* Los conteos son NÚMEROS y no texto, porque ya no se teclean. Con
     casillas había que guardarlos como cadena para dejar escribir «» a
     medias; con botones el estado es lo que vale. */
  const [conteos, setConteos] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const d of detalle) m[d.defecto] = d.unidades;
    return m;
  });

  const num = (v: string) => {
    const n = Number(v.replace(/\D/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  /* LAS RECIBIDAS SON LAS DE LA TARJETA. Quien cuenta no las teclea: el
     viaje ya sabe cuántas botellas traía (estibas × cajas × unidades).
     Solo si la tarjeta no las puede calcular —material sin factores— se
     deja escribirlas, para no bloquear la revisión. */
  const deTarjeta = viaje.unidades != null && viaje.unidades > 0 ? viaje.unidades : null;
  const rec = deTarjeta ?? num(recibidas), rev = num(revisadas);

  /* ESCRIBIR EL NÚMERO DIRECTO: además del + y el −, el contador acepta teclado (se abre el teclado numérico).
     Vacío = 0; solo dígitos; tope razonable para que un dedazo no meta un millón. */
  const poner = (clave: string, texto: string) => {
    const n = Math.min(99999, Number(texto.replace(/\D/g, "") || "0"));
    setConteos((c) => {
      if (n === 0) { const { [clave]: _, ...resto } = c; return resto }
      return { ...c, [clave]: n };
    });
  };
  const mover = (clave: string, paso: number) =>
    setConteos((c) => {
      const n = Math.max(0, (c[clave] ?? 0) + paso);
      /* El cero se borra de la mano en vez de guardarse: así lo que se
         manda a la base son solo los defectos que de verdad aparecieron,
         igual que antes. */
      if (n === 0) { const { [clave]: _, ...resto } = c; return resto }
      return { ...c, [clave]: n };
    });

  /* LA MISMA CUENTA DE LA BASE, y por eso está escrita igual: suma de
     los defectos que COBRAN, dividida entre las revisadas. Los cuatro
     que no cobran —mezclado, cuerpo extraño, cajas, estibas— se cuentan
     aparte y se muestran, porque hay que saber que pasaron aunque no
     suban el cobro. */
  const cuentas = useMemo(() => {
    let cobran = 0, otros = 0;
    for (const d of defectos) {
      const n = conteos[d.clave] ?? 0;
      if (d.cobra) cobran += n; else otros += n;
    }
    const indice = rev > 0 ? cobran / rev : 0;
    const noAbono = rev > 0 ? Math.round(rec * indice) : 0;
    const lit = envases.find((e) => e.clave === envase)?.litros ?? 0;
    return { cobran, otros, indice, noAbono, abono: rec - noAbono, hl: (cobran * lit) / 100 };
  }, [conteos, defectos, rec, rev, envase, envases]);

  /* LO QUE FALTA SE DICE POR SU NOMBRE Y EN EL PANEL, no en una lista de
     errores al final. Decirle a alguien que marcó más botellas malas que
     las que revisó DESPUÉS de que llenó cuarenta casillas es hacerle
     perder el trabajo. */
  const faltan: string[] = [];
  if (canal === "socios" && !socio) faltan.push("El socio");
  if (!envase) faltan.push("El tipo de envase");
  if (rec <= 0) faltan.push("Cuántas botellas llegaron");
  if (rev <= 0) faltan.push("Cuántas se revisaron");

  /* Y lo que está MAL va aparte de lo que falta: no es lo mismo «todavía
     no lo has puesto» que «lo que pusiste no puede ser». */
  const malos: string[] = [];
  if (rev > rec && rec > 0) malos.push("Se revisaron más botellas de las que llegaron.");
  if (cuentas.cobran + cuentas.otros > rev && rev > 0)
    malos.push(`Hay ${nf.format(cuentas.cobran + cuentas.otros)} botellas marcadas de ${nf.format(rev)} revisadas.`);

  const puedeCerrar = faltan.length === 0 && malos.length === 0;

  async function guardar() {
    setFalla(null);
    setMandando(true);
    const supabase = createClient();
    const limpio: Record<string, number> = {};
    for (const d of defectos) {
      const n = conteos[d.clave] ?? 0;
      if (n > 0) limpio[d.clave] = n;
    }
    const { error } = await supabase.rpc("sider_ai_guardar", {
      /* `p_tipo` SOLO VA CUANDO ES LA NORMAL. La certificada se guarda
         exactamente como antes, sin el parámetro: así sigue funcionando
         el día que se sube este código y ANTES de correr las migraciones
         de Sorting, porque Postgres rechaza un parámetro con nombre que
         la función vieja no conoce. */
      ...(esSorting ? { p_tipo: "sorting" } : {}),
      p_viaje: viaje.viaje_id,
      p_turno: turno,
      p_canal: canal,
      p_socio: canal === "socios" ? socio : null,
      p_envase: envase,
      p_certificado: certificado,
      p_recibidas: rec,
      p_revisadas: rev,
      p_conteos: limpio,
      /* El N.° ZCL3 ya no se pide (ni a socios ni a T1). Al corregir una
         revisión vieja se conserva el que ya tenía. */
      p_zcl3: revision?.zcl3 ?? null,
      p_comentarios: comentarios.trim() || null,
    });
    setMandando(false);
    if (error) { setFalla(traducirError(error.message)); return }
    alGuardar();
  }

  const cobran = defectos.filter((d) => d.cobra);
  const noCobran = defectos.filter((d) => !d.cobra);
  const llegada = cuando(viaje.llego_en) ?? cuando(viaje.fecha) ?? viaje.fecha;

  /* Un contador. Es lo único que se toca catorce veces seguidas, así que
     es lo único que mide 44 px de verdad y no «casi». */
  /* Se llama como función y NO como componente: un componente definido aquí adentro se rehace en cada tecla
     y la casilla perdería el cursor a cada dígito. */
  const contador = (d: Defecto, nc?: boolean) => {
    const n = conteos[d.clave] ?? 0;
    return (
      <div key={d.clave} className={"ai-def" + (n > 0 ? " hay" : "") + (nc ? " nc" : "")}>
        <span className="ai-nd">{d.nombre}</span>
        <div className="ai-step">
          <button type="button" aria-label={`Quitar una de ${d.nombre}`}
                  disabled={n === 0} onClick={() => mover(d.clave, -1)}>−</button>
          {/* `output` y no `span`: un lector de pantalla anuncia el
              número nuevo al cambiar, que es justo lo que hace falta
              cuando no se está mirando la pantalla. */}
          <input className="ai-n" inputMode="numeric" pattern="[0-9]*" autoComplete="off" aria-label={`${d.nombre}: cantidad`}
                 value={String(n)} onFocus={(e) => e.target.select()}
                 onChange={(e) => poner(d.clave, e.target.value)} />
          <button type="button" aria-label={`Sumar una de ${d.nombre}`}
                  onClick={() => mover(d.clave, +1)}>+</button>
        </div>
      </div>
    );
  };

  const Panel = () => (
    <>
      <div className="ai-p-cab">
        <div className="ai-p-rot">ÍNDICE DE COBRO</div>
        <div className="ai-p-ind">{(cuentas.indice * 100).toFixed(2)} %</div>
        <div className="ai-p-sub">
          {nf.format(cuentas.cobran)} con defecto de {nf.format(rev)} revisadas
        </div>
      </div>
      {/* La barra no es adorno: un 6 % y un 60 % se leen igual de rápido
          en cifras, pero no se SIENTEN igual, y aquí el que cuenta tiene
          que notar cuándo el camión se salió de lo normal. */}
      <div className="ai-p-barra">
        <i style={{ width: `${Math.min(100, cuentas.indice * 100)}%` }} />
      </div>
      <div className="ai-p-lista">
        <div className="ai-p-l"><span>Recibidas</span><b>{nf.format(rec)}</b></div>
        <div className="ai-p-l"><span>No se abona</span><b>{nf.format(cuentas.noAbono)}</b></div>
        <div className="ai-p-l fuerte"><span>Abono final SAP</span><b>{nf.format(cuentas.abono)}</b></div>
        <div className="ai-p-l"><span>Hectolitros</span><b>{cuentas.hl.toFixed(4)}</b></div>
        {cuentas.otros > 0 && (
          <div className="ai-p-l"><span>Que no cobran</span><b>{nf.format(cuentas.otros)}</b></div>
        )}
      </div>

      {(faltan.length > 0 || malos.length > 0) && (
        <div className="ai-p-faltan">
          <div className="t">{malos.length ? "HAY QUE REVISARLO" : "FALTA PARA CERRAR"}</div>
          <ul>
            {malos.map((m) => <li key={m} className="mal">{m}</li>)}
            {faltan.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}

      {falla && <p className="ai-p-falla">{falla}</p>}

      <div className="ai-p-acciones">
        <button type="button" className="b1" disabled={mandando || !puedeCerrar}
                onClick={guardar}>
          {mandando ? "Guardando…" : revision ? "Guardar la corrección" : "Cerrar revisión"}
        </button>
        <button type="button" className="b2" onClick={alCancelar}>
          {rotuloCancelar ?? "Después"}
        </button>
      </div>
      {revision && (
        <p className="ai-p-ya">
          Ya estaba revisado{revision.ediciones > 0
            ? ` · corregido ${revision.ediciones} vez${revision.ediciones === 1 ? "" : "es"}` : ""}
        </p>
      )}
    </>
  );

  return (
    <div className="ai-form">
      {/* LA CINTA REEMPLAZA LA FICHA DEL VEHÍCULO. Lo mismo que antes era
          una lista de cuatro datos ocupando una tarjeta entera, aquí es
          una franja: no se digita nada de esto —sale del viaje— así que
          no merece el espacio de un formulario. */}
      <div className="ai-cinta">
        <div className="ai-placa">{viaje.placa}</div>
        <div className="c"><div className="k">PLANTA</div><div className="v">{viaje.planta}</div></div>
        <div className="c"><div className="k">LLEGADA</div><div className="v">{llegada}</div></div>
        <div className="c"><div className="k">MATERIAL</div><div className="v">{viaje.sku}</div></div>
        {/* LA CLASE, ESCRITA. Las dos revisiones se hacen con el mismo
            formulario y entran al mismo informe: la palabra es lo que
            dice cuál se está llenando. */}
        <div className="c"><div className="k">REVISIÓN</div>
          <div className="v">{NOMBRE_TIPO_LARGO[tipo]}</div></div>
      </div>

      {viaje.ai_motivo && (
        <p className="ai-motivo">
          <b>Por qué se revisa:</b> {viaje.ai_motivo}
          {viaje.pedido_nombre ? ` — ${viaje.pedido_nombre}` : ""}
        </p>
      )}

      <div className="ai-marco">
        <div className="ai-izq">
          <section className="ai-caja">
            <div className="ai-cab">
              <h3>De quién y de qué</h3>
              <p>Sale del viaje. Solo se completa lo que el viaje no trae.</p>
            </div>
            <div className="ai-cuerpo">
              <div className="ai-campos">
                <div className="ai-campo">
                  <label id="rot-turno">TURNO</label>
                  <div className="ai-seg" role="group" aria-labelledby="rot-turno">
                    {["T1", "T2", "T3"].map((t) => (
                      <button key={t} type="button" aria-pressed={turno === t}
                              aria-label={`Turno ${letraTurno(t)}`}
                              className={turno === t ? "on" : ""}
                              onClick={() => setTurno(t)}>{letraTurno(t)}</button>
                    ))}
                  </div>
                  <div className="ai-nota">A 6 a. m.–2 p. m. · B 2–10 p. m. · C 10 p. m.–6 a. m.</div>
                </div>

                {canalFijo ? (
                  <>
                    <div className="ai-campo">
                      <label id="rot-canal">CANAL DE ENVASE</label>
                      <output id="ai-canal" className="ai-dato txt" aria-labelledby="rot-canal">
                        {canales.find((c) => c.clave === canal)?.nombre ?? canal}
                      </output>
                      <div className="ai-nota">{viaje.interno ? "Lo dijo el Vh Interno" : "Camión certificado por Sider"}</div>
                    </div>
                    {canal === "socios" && (
                      <div className="ai-campo">
                        <label id="rot-socio">SOCIO</label>
                        <output id="ai-socio" className="ai-dato txt" aria-labelledby="rot-socio">
                          {socios.find((x) => x.clave === socio)?.nombre ?? socio}
                        </output>
                        <div className="ai-nota">{viaje.interno ? "Lo dijo el Vh Interno" : "Camión certificado por Sider"}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="ai-campo">
                      <label htmlFor="ai-canal">CANAL DE ENVASE</label>
                      <select id="ai-canal" value={canal} onChange={(e) => setCanal(e.target.value)}>
                        {canales.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
                      </select>
                    </div>

                    {/* EL SOCIO SOLO CUANDO EL CANAL ES SOCIOS. En un traslado
                        propio no hay a quién cobrarle, y dejar el campo puesto
                        invita a llenarlo con cualquiera. */}
                    {canal === "socios" && (
                      <div className={"ai-campo" + (socio ? "" : " falta")}>
                        <label htmlFor="ai-socio">SOCIO</label>
                        <select id="ai-socio" value={socio} onChange={(e) => setSocio(e.target.value)}>
                          <option value="">— escoge el socio —</option>
                          {socios.map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
                        </select>
                        {!socio && <div className="aviso">Falta</div>}
                      </div>
                    )}
                  </>
                )}

                {envaseFijo ? (
                  <div className="ai-campo">
                    <label id="rot-envase">TIPO DE ENVASE</label>
                    <output id="ai-envase" className="ai-dato txt" aria-labelledby="rot-envase">
                      {envase}{envases.find((e) => e.clave === envase)?.descripcion
                        ? ` · ${envases.find((e) => e.clave === envase)?.descripcion}` : ""}
                    </output>
                    <div className="ai-nota">Sale del material del viaje</div>
                  </div>
                ) : (
                  <div className={"ai-campo" + (envase ? "" : " falta")}>
                    <label htmlFor="ai-envase">TIPO DE ENVASE</label>
                    <select id="ai-envase" value={envase} onChange={(e) => setEnvase(e.target.value)}>
                      <option value="">— escoge —</option>
                      {envases.map((e) => (
                        <option key={e.clave} value={e.clave}>
                          {e.clave}{e.descripcion ? ` · ${e.descripcion}` : ""}
                        </option>
                      ))}
                    </select>
                    {!envase && <div className="aviso">Falta</div>}
                  </div>
                )}

                {deTarjeta != null ? (
                  <div className="ai-campo">
                    <label id="rot-rec">BOTELLAS RECIBIDAS</label>
                    <output id="ai-rec" className="num ai-dato" aria-labelledby="rot-rec">{nf.format(deTarjeta)}</output>
                    <div className="ai-nota">Salen de la tarjeta del camión</div>
                  </div>
                ) : (
                  <div className={"ai-campo" + (rec > 0 ? "" : " falta")}>
                    <label htmlFor="ai-rec">BOTELLAS RECIBIDAS</label>
                    <input id="ai-rec" className="num" inputMode="numeric" value={recibidas}
                           placeholder="0" onChange={(e) => setRecibidas(e.target.value)} />
                    <div className="ai-nota">La tarjeta no pudo calcularlas; escríbelas</div>
                  </div>
                )}

                <div className={"ai-campo" + (rev > 0 ? "" : " falta")}>
                  <label htmlFor="ai-rev">BOTELLAS REVISADAS</label>
                  <input id="ai-rev" className="num" inputMode="numeric" value={revisadas}
                         placeholder="0" onChange={(e) => setRevisadas(e.target.value)} />
                </div>
              </div>
            </div>
          </section>

          <section className="ai-caja">
            <div className="ai-cab">
              <h3>Conteo de la muestra</h3>
              <p>
                Se toca, no se digita. Lo de arriba entra al índice de cobro;
                lo de abajo se registra pero no cobra.
              </p>
            </div>
            <div className="ai-cuerpo">
              <div className="ai-rot">ENTRAN AL COBRO</div>
              <div className="ai-grid">
                {cobran.map((d) => contador(d))}
              </div>

              <div className="ai-rot mal">SE REGISTRAN · NO COBRAN</div>
              <div className="ai-grid">
                {noCobran.map((d) => contador(d, true))}
              </div>

              <label className="ai-coment">
                <span>COMENTARIOS PARA EL FACTURADOR</span>
                <textarea rows={2} value={comentarios}
                          onChange={(e) => setComentarios(e.target.value)} />
              </label>
            </div>
          </section>
        </div>

        <aside className="ai-panel"><Panel /></aside>
      </div>

      {/* LA BARRA PEGADA ABAJO, cuando el panel ya no cabe al lado. En
          cuanto la pantalla se angosta el panel se va abajo del todo, y
          ahí deja de servir para lo que existe: ver la cuenta MIENTRAS se
          cuenta. Esta barra es el panel reducido a lo que no se puede
          perder de vista — el índice y si ya se puede cerrar. */}
      <div className="ai-fija">
        <div>
          <div className="k">ÍNDICE DE COBRO</div>
          <div className="v">{(cuentas.indice * 100).toFixed(2)} %</div>
        </div>
        <div className="ai-fija-der">
          {!puedeCerrar && (
            <span>
              {malos.length ? "revisa lo marcado"
                : `falta${faltan.length === 1 ? "" : "n"} ${faltan.length} dato${faltan.length === 1 ? "" : "s"}`}
            </span>
          )}
          <button type="button" disabled={mandando || !puedeCerrar} onClick={guardar}>
            {mandando ? "Guardando…" : "Cerrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
