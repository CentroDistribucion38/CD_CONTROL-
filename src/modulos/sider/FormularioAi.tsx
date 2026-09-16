"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type {
  Defecto, EnvaseAi, SocioAi, CanalAi, Revision, DetalleAi,
} from "@/modulos/sider/ai";

/* LO MÍNIMO QUE EL FORMULARIO NECESITA SABER DEL VIAJE. No pide un
   `Pendiente` entero a propósito: así lo puede llamar la certificación
   de llegada, que tiene el viaje en la mano y no va a ir a buscarlo otra
   vez a la vista de pendientes. */
export type ViajeAi = {
  viaje_id: string; placa: string; planta: string; fecha: string; sku: string;
  llego_en?: string | null;
  ai_motivo?: string | null; pedido_nombre?: string | null;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

const cuando = (s?: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      }) : null;

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
  alGuardar, alCancelar, rotuloCancelar,
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
}) {
  const [mandando, setMandando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);

  const [turno, setTurno] = useState(revision?.turno ?? "T1");
  const [canal, setCanal] = useState(revision?.canal ?? canales[0]?.clave ?? "socios");
  const [socio, setSocio] = useState(revision?.socio ?? "");
  const [envase, setEnvase] = useState(revision?.envase ?? "");
  const [certificado, setCertificado] = useState(revision?.certificado ?? false);
  const [recibidas, setRecibidas] = useState(revision ? String(revision.recibidas) : "");
  const [revisadas, setRevisadas] = useState(revision ? String(revision.revisadas) : "");
  const [zcl3, setZcl3] = useState(revision?.zcl3 ?? "");
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
  const rec = num(recibidas), rev = num(revisadas);

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
      p_viaje: viaje.viaje_id,
      p_turno: turno,
      p_canal: canal,
      p_socio: canal === "socios" ? socio : null,
      p_envase: envase,
      p_certificado: certificado,
      p_recibidas: rec,
      p_revisadas: rev,
      p_conteos: limpio,
      p_zcl3: zcl3.trim() || null,
      p_comentarios: comentarios.trim() || null,
    });
    setMandando(false);
    if (error) { setFalla(traducirError(error.message)); return }
    alGuardar();
  }

  const cobran = defectos.filter((d) => d.cobra);
  const noCobran = defectos.filter((d) => !d.cobra);
  const llegada = cuando(viaje.llego_en) ?? viaje.fecha;

  /* Un contador. Es lo único que se toca catorce veces seguidas, así que
     es lo único que mide 44 px de verdad y no «casi». */
  const Contador = ({ d, nc }: { d: Defecto; nc?: boolean }) => {
    const n = conteos[d.clave] ?? 0;
    return (
      <div className={"ai-def" + (n > 0 ? " hay" : "") + (nc ? " nc" : "")}>
        <span className="ai-nd">{d.nombre}</span>
        <div className="ai-step">
          <button type="button" aria-label={`Quitar una de ${d.nombre}`}
                  disabled={n === 0} onClick={() => mover(d.clave, -1)}>−</button>
          {/* `output` y no `span`: un lector de pantalla anuncia el
              número nuevo al cambiar, que es justo lo que hace falta
              cuando no se está mirando la pantalla. */}
          <output aria-label={`${d.nombre}: ${n}`}>{n}</output>
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
              <p>Sale del viaje certificado. Solo se escoge lo que el viaje no trae.</p>
            </div>
            <div className="ai-cuerpo">
              <div className="ai-campos">
                <div className="ai-campo">
                  <label id="rot-turno">TURNO</label>
                  <div className="ai-seg" role="group" aria-labelledby="rot-turno">
                    {["T1", "T2", "T3"].map((t) => (
                      <button key={t} type="button" aria-pressed={turno === t}
                              className={turno === t ? "on" : ""}
                              onClick={() => setTurno(t)}>{t}</button>
                    ))}
                  </div>
                </div>

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
                      {socios.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}
                    </select>
                    {!socio && <div className="aviso">Falta</div>}
                  </div>
                )}

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

                <div className={"ai-campo" + (rec > 0 ? "" : " falta")}>
                  <label htmlFor="ai-rec">BOTELLAS RECIBIDAS</label>
                  <input id="ai-rec" className="num" inputMode="numeric" value={recibidas}
                         placeholder="0" onChange={(e) => setRecibidas(e.target.value)} />
                </div>

                <div className={"ai-campo" + (rev > 0 ? "" : " falta")}>
                  <label htmlFor="ai-rev">BOTELLAS REVISADAS</label>
                  <input id="ai-rev" className="num" inputMode="numeric" value={revisadas}
                         placeholder="0" onChange={(e) => setRevisadas(e.target.value)} />
                </div>

                <div className="ai-campo">
                  <label htmlFor="ai-zcl3">N.° ZCL3</label>
                  <input id="ai-zcl3" value={zcl3} onChange={(e) => setZcl3(e.target.value)} />
                </div>

                <div className="ai-campo ai-check">
                  <label htmlFor="ai-cert" className="plano">
                    <input id="ai-cert" type="checkbox" checked={certificado}
                           onChange={(e) => setCertificado(e.target.checked)} />
                    <span>Venía certificado por el socio</span>
                  </label>
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
                {cobran.map((d) => <Contador key={d.clave} d={d} />)}
              </div>

              <div className="ai-rot mal">SE REGISTRAN · NO COBRAN</div>
              <div className="ai-grid">
                {noCobran.map((d) => <Contador key={d.clave} d={d} nc />)}
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
