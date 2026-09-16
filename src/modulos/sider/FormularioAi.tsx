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
  ai_motivo?: string | null; pedido_nombre?: string | null;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/**
 * EL FORMULARIO DE LA REVISIÓN AI.
 *
 * REEMPLAZA UNA FILA DE «Registro Cobro AI COL V02.xlsx» —cincuenta y
 * nueve columnas— por trece campos. Las otras cuarenta y seis eran
 * cuentas, y las cuentas no se digitan: de las cincuenta y nueve, solo
 * trece son datos que alguien observa. El resto salía de fórmulas, y
 * cuando una fórmula se digita se equivoca.
 *
 * LO QUE SE CALCULA SE VE MIENTRAS SE ESCRIBE, y ese es el punto de
 * hacerlo aquí y no al guardar: quien está contando botellas ve subir
 * el índice y las unidades que no se le van a abonar al socio. Si va a
 * salir un número raro, se nota ANTES de mandarlo, no cuando el socio
 * reclame.
 *
 * Y LO QUE SE VE AQUÍ NO ES LO QUE MANDA. El índice de verdad lo
 * calcula la base con la misma fórmula; esto es un anticipo para que
 * nadie escriba a ciegas. Se escribió a propósito de forma que las dos
 * cuentas sean la misma —defectos que cobran ÷ revisadas— y hay una
 * prueba en la base que la fija.
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

  const [conteos, setConteos] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const d of detalle) m[d.defecto] = String(d.unidades);
    return m;
  });

  const num = (v: string) => {
    const n = Number(v.replace(/\D/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const rec = num(recibidas), rev = num(revisadas);

  /* LA MISMA CUENTA DE LA BASE, y por eso está escrita igual: suma de
     los defectos que COBRAN, dividida entre las revisadas. Los cuatro
     que no cobran —mezclado, cuerpo extraño, cajas, estibas— se cuentan
     aparte y se muestran, porque hay que saber que pasaron aunque no
     suban el cobro. */
  const cuentas = useMemo(() => {
    let cobran = 0, otros = 0;
    for (const d of defectos) {
      const n = num(conteos[d.clave] ?? "");
      if (d.cobra) cobran += n; else otros += n;
    }
    const indice = rev > 0 ? cobran / rev : 0;
    const noAbono = rev > 0 ? Math.round(rec * indice) : 0;
    const lit = envases.find((e) => e.clave === envase)?.litros ?? 0;
    return { cobran, otros, indice, noAbono, abono: rec - noAbono, hl: (cobran * lit) / 100 };
  }, [conteos, defectos, rec, rev, envase, envases]);

  /* LOS AVISOS SE CALCULAN, no se esperan del servidor: decirle a
     alguien que marcó más botellas malas que las que revisó DESPUÉS de
     que llenó cuarenta casillas es hacerle perder el trabajo. */
  const problemas: string[] = [];
  if (rev > rec && rec > 0) problemas.push("Se revisaron más botellas de las que llegaron.");
  if (cuentas.cobran + cuentas.otros > rev && rev > 0)
    problemas.push(`Hay ${nf.format(cuentas.cobran + cuentas.otros)} botellas marcadas de ${nf.format(rev)} revisadas.`);
  if (canal === "socios" && !socio) problemas.push("Falta decir de qué socio es.");
  if (!envase) problemas.push("Falta el tipo de envase.");
  if (rec <= 0) problemas.push("Falta cuántas botellas llegaron de la referencia.");
  if (rev <= 0) problemas.push("Falta cuántas botellas se revisaron.");

  async function guardar() {
    setFalla(null);
    setMandando(true);
    const supabase = createClient();
    const limpio: Record<string, number> = {};
    for (const d of defectos) {
      const n = num(conteos[d.clave] ?? "");
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

  return (
    <div className="ai-form">
      {/* 1 ─ DE QUÉ CAMIÓN. No se pide: ya está. */}
      <section className="ai-caja">
        <div className="ai-cab">
          <h2>El vehículo</h2>
          <p>Sale del viaje. No se digita: ya está, y volver a escribirlo
             es una oportunidad de equivocarse.</p>
        </div>
        <dl className="ai-datos">
          <div><dt>Placa</dt><dd>{viaje.placa}</dd></div>
          <div><dt>Planta</dt><dd>{viaje.planta}</dd></div>
          <div><dt>Fecha</dt><dd>{viaje.fecha}</dd></div>
          <div><dt>Material</dt><dd>{viaje.sku}</dd></div>
        </dl>
        {viaje.ai_motivo && (
          <p className="ai-motivo">
            <b>Por qué se revisa:</b> {viaje.ai_motivo}
            {viaje.pedido_nombre ? ` — ${viaje.pedido_nombre}` : ""}
          </p>
        )}
      </section>

      {/* 2 ─ LA CABECERA */}
      <section className="ai-caja">
        <div className="ai-cab"><h2>De quién y de qué</h2></div>
        <div className="ai-campos">
          <label>
            <span>Turno</span>
            <div className="ai-seg">
              {["T1", "T2", "T3"].map((t) => (
                <button key={t} type="button" className={turno === t ? "on" : ""}
                        onClick={() => setTurno(t)}>{t}</button>
              ))}
            </div>
          </label>

          <label>
            <span>Canal de envase</span>
            <select value={canal} onChange={(e) => setCanal(e.target.value)}>
              {canales.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
            </select>
          </label>

          {/* EL SOCIO SOLO CUANDO EL CANAL ES SOCIOS. En un traslado
              propio no hay a quién cobrarle, y dejar el campo puesto
              invita a llenarlo con cualquiera. */}
          {canal === "socios" && (
            <label className="ancho">
              <span>Socio</span>
              <select value={socio} onChange={(e) => setSocio(e.target.value)}>
                <option value="">— escoge el socio —</option>
                {socios.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}
              </select>
            </label>
          )}

          <label>
            <span>Tipo de envase</span>
            <select value={envase} onChange={(e) => setEnvase(e.target.value)}>
              <option value="">— escoge —</option>
              {envases.map((e) => (
                <option key={e.clave} value={e.clave}>
                  {e.clave}{e.descripcion ? ` · ${e.descripcion}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="ai-check">
            <input type="checkbox" checked={certificado}
                   onChange={(e) => setCertificado(e.target.checked)} />
            <span>El envase venía certificado por el socio</span>
          </label>
        </div>
      </section>

      {/* 3 ─ LAS DOS CIFRAS QUE MANDAN */}
      <section className="ai-caja">
        <div className="ai-cab">
          <h2>La muestra</h2>
          <p>De estas dos cifras y de los conteos sale todo lo demás.</p>
        </div>
        <div className="ai-campos">
          <label>
            <span>Botellas recibidas de la referencia</span>
            <input inputMode="numeric" value={recibidas} placeholder="0"
                   onChange={(e) => setRecibidas(e.target.value)} />
          </label>
          <label>
            <span>Botellas revisadas</span>
            <input inputMode="numeric" value={revisadas} placeholder="0"
                   onChange={(e) => setRevisadas(e.target.value)} />
          </label>
          <label>
            <span>N.° ZCL3</span>
            <input value={zcl3} onChange={(e) => setZcl3(e.target.value)} />
          </label>
        </div>
      </section>

      {/* 4 ─ LOS CONTEOS */}
      <section className="ai-caja">
        <div className="ai-cab">
          <h2>Botellas con defecto</h2>
          <p>
            Las de arriba <b>cobran</b>: entran en el índice. Las de abajo se
            cuentan pero no cobran — hay que saber que pasaron.
          </p>
        </div>

        <div className="ai-defectos">
          {cobran.map((d) => (
            <label key={d.clave}>
              <span>{d.nombre}</span>
              <input inputMode="numeric" value={conteos[d.clave] ?? ""} placeholder="0"
                     onChange={(e) => setConteos({ ...conteos, [d.clave]: e.target.value })} />
            </label>
          ))}
        </div>

        <div className="ai-cab chico"><h3>No cobran</h3></div>
        <div className="ai-defectos no-cobra">
          {noCobran.map((d) => (
            <label key={d.clave}>
              <span>{d.nombre}</span>
              <input inputMode="numeric" value={conteos[d.clave] ?? ""} placeholder="0"
                     onChange={(e) => setConteos({ ...conteos, [d.clave]: e.target.value })} />
            </label>
          ))}
        </div>
      </section>

      {/* 5 ─ LO QUE SALE, mientras se escribe */}
      <section className="ai-cuenta">
        <div className="ai-cab">
          <h2>Lo que sale</h2>
          <p>Se recalcula solo. Nadie digita estos números.</p>
        </div>
        <div className="ai-cifras">
          <div><span>Con defecto</span><b>{nf.format(cuentas.cobran)}</b><i>de {nf.format(rev)} revisadas</i></div>
          <div className="ojo"><span>Índice de cobro</span><b>{(cuentas.indice * 100).toFixed(3)} %</b><i>defectos ÷ revisadas</i></div>
          <div className="ojo"><span>No se abona</span><b>{nf.format(cuentas.noAbono)}</b><i>unidades</i></div>
          <div><span>Abono final SAP</span><b>{nf.format(cuentas.abono)}</b><i>unidades</i></div>
          <div><span>Hectolitros</span><b>{cuentas.hl.toFixed(4)}</b><i>del envase roto</i></div>
          {cuentas.otros > 0 && (
            <div><span>Que no cobran</span><b>{nf.format(cuentas.otros)}</b><i>mezclado, cajas, estibas…</i></div>
          )}
        </div>
      </section>

      <label className="ai-caja ai-coment">
        <span>Comentarios para el facturador</span>
        <textarea rows={2} value={comentarios} onChange={(e) => setComentarios(e.target.value)} />
      </label>

      {problemas.length > 0 && (
        <ul className="ai-faltan">
          {problemas.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      {falla && <p className="ai-falla">{falla}</p>}

      <div className="ai-pie">
        <button type="button" className="ai-btn si"
                disabled={mandando || problemas.length > 0} onClick={guardar}>
          {mandando ? "Guardando…" : revision ? "Guardar la corrección" : "Guardar la revisión"}
        </button>
        <button type="button" className="ai-btn" onClick={alCancelar}>
          {rotuloCancelar ?? "Cancelar"}
        </button>
        {revision && (
          <span className="ai-ya">
            Ya estaba revisado{revision.ediciones > 0 ? ` · corregido ${revision.ediciones} vez${revision.ediciones === 1 ? "" : "es"}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
