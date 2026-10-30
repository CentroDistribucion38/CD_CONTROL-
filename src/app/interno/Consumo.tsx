import { fBytes, type Medida, type Panel } from "@/modulos/consumo/datos";
import { salir } from "./actions";

const nf = (d = 0) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: d });
const ETIQUETA = { ok: "Holgado", atencion: "Atención", alto: "Casi al tope", sin: "Sin tope" } as const;

function Barra({ m }: { m: Medida }) {
  const p = m.pct ?? 0;
  return (
    <div className={`ci-med ${m.nivel}`}>
      <div className="ci-med-cab">
        <span className="ci-fuente">{m.fuente}</span>
        <b>{m.titulo}</b>
        <span className="ci-estado">{ETIQUETA[m.nivel]}</span>
      </div>
      <div className="ci-med-cifra"><b>{m.usado}</b>{m.limite && <small> de {m.limite}</small>}{m.pct != null && <em>{nf(p < 10 ? 1 : 0).format(p)} %</em>}</div>
      <div className="ci-pista" role="img" aria-label={`${nf(0).format(p)} % usado`}>
        <i style={{ width: `${Math.min(100, p)}%` }} />
        {m.proyeccionPct != null && <u style={{ left: `${Math.min(100, m.proyeccionPct)}%` }} title="Cómo cerraría el mes a este ritmo" />}
      </div>
      {m.proyeccion && <p className="ci-proy">A este ritmo, al cerrar el mes: <b>{m.proyeccion}</b></p>}
    </div>
  );
}

export function Consumo({ panel: p }: { panel: Panel }) {
  const s = p.supabase, v = p.vercel;
  const hora = new Date(p.generado).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });
  const mes = new Date(p.generado).toLocaleDateString("es-CO", { timeZone: "America/Bogota", month: "long", year: "numeric" });
  return (
    <div className="ci-pag">
      <header className="ci-top">
        <div>
          <p className="ci-ojo">Sistema · uso interno</p>
          <h1>Consumo de la plataforma</h1>
          <p className="ci-sub">{mes} · día {p.diaDelMes} de {p.diasDelMes} · actualizado {hora}</p>
        </div>
        <div className="ci-acc">
          <a className="ci-btn" href="/interno">Actualizar</a>
          <form action={salir}><button className="ci-btn osc" type="submit">Cerrar y salir</button></form>
        </div>
      </header>

      <p className="ci-planes">Planes leídos: Supabase <b>{p.planSupabase.toUpperCase()}</b> · Vercel <b>{p.planVercel.toUpperCase()}</b>. Se cambian con las variables CONSUMO_PLAN_SUPABASE y CONSUMO_PLAN_VERCEL.</p>

      {p.lecturas.length > 0 && (
        <section className="ci-lect" aria-label="Lo que más pesa">
          <h2>Lo que más pesa</h2>
          <ol>{p.lecturas.map((t, i) => <li key={i}>{t}</li>)}</ol>
        </section>
      )}

      {(!s.ok || !v.ok) && (
        <section className="ci-aviso" role="status">
          {!s.ok && <p><b>Supabase:</b> {s.error}</p>}
          {!v.ok && <p><b>Vercel:</b> {v.error}</p>}
        </section>
      )}

      {p.medidas.length > 0 && (
        <section aria-label="Uso frente al plan">
          <h2>Uso frente a lo que incluye el plan</h2>
          <div className="ci-rej">{p.medidas.map((m) => <Barra key={m.id} m={m} />)}</div>
          <p className="ci-nota">La rayita sobre la barra es hacia dónde iría el mes si sigue este ritmo. Supabase no entrega por API la «salida de datos» (egress): se ve en su panel, <a href="https://supabase.com/dashboard/org/_/usage" target="_blank" rel="noreferrer">Usage</a>; y el detalle de Vercel está en <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">Usage</a>.</p>
        </section>
      )}

      {s.ok && s.peticiones && (
        <section aria-label="Peticiones a la API">
          <h2>Peticiones a la API de Supabase (últimos 30 días)</h2>
          <div className="ci-fichas">
            <div><b>{nf().format(s.peticiones.total)}</b><small>en total</small></div>
            <div><b>{nf().format(s.peticiones.rest)}</b><small>datos (REST)</small></div>
            <div><b>{nf().format(s.peticiones.auth)}</b><small>sesiones (Auth)</small></div>
            <div><b>{nf().format(s.peticiones.storage)}</b><small>archivos (Storage)</small></div>
            <div><b>{nf().format(s.peticiones.realtime)}</b><small>tiempo real</small></div>
          </div>
        </section>
      )}

      <div className="ci-dos">
        {s.ok && !!s.tablas?.length && (
          <section className="ci-tab" aria-label="Tablas más pesadas">
            <h2>Tablas más pesadas</h2>
            <table><thead><tr><th>Tabla</th><th className="r">Peso</th><th className="r">Filas aprox.</th></tr></thead>
              <tbody>{s.tablas.map((t) => <tr key={t.tabla}><td>{t.tabla}</td><td className="r">{fBytes(t.bytes)}</td><td className="r">{nf().format(t.filas)}</td></tr>)}</tbody></table>
          </section>
        )}
        {s.ok && !!s.buckets?.length && (
          <section className="ci-tab" aria-label="Archivos guardados">
            <h2>Archivos guardados</h2>
            <table><thead><tr><th>Balde</th><th className="r">Archivos</th><th className="r">Peso</th></tr></thead>
              <tbody>{s.buckets.map((b) => <tr key={b.bucket}><td>{b.bucket}</td><td className="r">{nf().format(b.objetos)}</td><td className="r">{fBytes(b.bytes)}</td></tr>)}</tbody></table>
          </section>
        )}
      </div>

      {s.ok && !!s.consultas?.length && (
        <section className="ci-tab" aria-label="Consultas más pesadas">
          <h2>Consultas que más tiempo de base consumen</h2>
          <p className="ci-nota">Acumulado desde el último reinicio de las estadísticas de Postgres. Aquí se ve qué pantalla le pesa de verdad a la base.</p>
          <div className="ci-scroll"><table><thead><tr><th>Consulta</th><th className="r">Llamadas</th><th className="r">Tiempo total</th><th className="r">Cada una</th></tr></thead>
            <tbody>{s.consultas.map((c, i) => <tr key={i}><td className="ci-q">{c.q}</td><td className="r">{nf().format(c.llamadas)}</td><td className="r">{nf().format(c.segTotal)} s</td><td className="r">{nf().format(c.msMedio)} ms</td></tr>)}</tbody></table></div>
        </section>
      )}

      {v.ok && !!v.servicios?.length && (
        <div className="ci-dos">
          <section className="ci-tab" aria-label="Consumo en Vercel por servicio">
            <h2>Vercel · consumo del mes por servicio</h2>
            <div className="ci-scroll"><table><thead><tr><th>Servicio</th><th className="r">Consumido</th><th className="r">Costo</th></tr></thead>
              <tbody>{v.servicios.slice(0, 14).map((x, i) => <tr key={i}><td>{x.servicio}</td><td className="r">{nf(1).format(x.cantidad)} {x.unidad}</td><td className="r">US$ {nf(2).format(x.efectivo)}</td></tr>)}</tbody></table></div>
          </section>
          {!!v.proyectos?.length && (
            <section className="ci-tab" aria-label="Costo por proyecto en Vercel">
              <h2>Vercel · por proyecto</h2>
              <table><thead><tr><th>Proyecto</th><th className="r">Costo del mes</th></tr></thead>
                <tbody>{v.proyectos.map((x) => <tr key={x.proyecto}><td>{x.proyecto}</td><td className="r">US$ {nf(2).format(x.efectivo)}</td></tr>)}</tbody></table>
            </section>
          )}
        </div>
      )}

      <footer className="ci-pie">Proyecto Supabase: {p.ref ?? "—"} · Esta pantalla no guarda copia en el equipo y se cierra sola a los 30 minutos.</footer>
    </div>
  );
}
