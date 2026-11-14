"use client";

/**
 * SEGURIDAD · CERTIFICACIONES · ALERTAS — las licencias VACA que hay que exigir, en tres columnas:
 *   VENCIDAS · TRABAJANDO (exigir hoy)   VENCEN EN 7 DÍAS (programar la renovación)   VENCEN ESTE MES (pedir fecha)
 * Cada tarjeta dice a quién se le exige (Interventor ABI y Coordinador de la contratista). Copiar alertas (texto para
 * WhatsApp/correo) e Imagen (copiar, compartir, descargar), como los cierres de turno.
 */
import { useMemo, useRef, useState } from "react";
import {
  URGENCIA, armarTablero, claveTexto, fechaCorta, textoAlertas, PERMISOS,
  type Alerta, type ConfigCert, type PersonaCert, type Urgencia,
} from "@/modulos/seguridad/certificaciones";
import { logoMarca, useFotoCompartir } from "@/components/FotoCompartir";
import { leerPaleta } from "@/app/(app)/quiebra/rotura/HojaFirma";

const nf = new Intl.NumberFormat("es-CO");
const COLS: { k: Exclude<Urgencia, "vigente">; t: string; sub: string }[] = [
  { k: "vencida", t: "VENCIDAS · TRABAJANDO", sub: "exigir hoy" },
  { k: "critica", t: "VENCEN EN 7 DÍAS", sub: "programar ya la renovación" },
  { k: "aviso", t: "VENCEN ESTE MES", sub: "pedir fecha de renovación" },
];
const MOSTRAR = 12;

export function AlertasCert({ personas, hoy, config, departamentos }: {
  personas: PersonaCert[]; hoy: string; config: ConfigCert; departamentos: string[];
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [empresa, setEmpresa] = useState("");
  const [resp, setResp] = useState("");
  const [busca, setBusca] = useState("");
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  const [aviso, setAviso] = useState<string | null>(null);

  const filtradas = useMemo(() => personas.filter((p) =>
    (!empresa || claveTexto(p.empresa) === claveTexto(empresa)) &&
    (!resp || p.interventor === resp || p.coordinador === resp) &&
    (!busca || claveTexto(`${p.nombre} ${p.cedula}`).includes(claveTexto(busca)))), [personas, empresa, resp, busca]);
  const t = useMemo(() => armarTablero(filtradas, hoy, config), [filtradas, hoy, config]);
  const todas = useMemo(() => armarTablero(personas, hoy, config), [personas, hoy, config]);
  const empresas = [...new Set(personas.map((p) => p.empresa.trim()))].sort();
  const responsables = [...new Set(personas.flatMap((p) => [p.interventor, p.coordinador]).filter(Boolean) as string[])].sort();
  const deptos = departamentos.map((d) => d.charAt(0) + d.slice(1).toLowerCase()).join(", ");

  const foto = useFotoCompartir(async () => {
    const [{ dibujarTableroCert, nombreTableroCert }, logo] = await Promise.all([import("@/modulos/seguridad/foto-cert"), logoMarca()]);
    return { lienzo: dibujarTableroCert(t, { paleta: leerPaleta(caja.current), logo }), nombre: nombreTableroCert(hoy) };
  }, "Licencias VACA", { dashboard: "Alertas" }, undefined, ["dashboard"]);

  async function copiar() {
    try { await navigator.clipboard.writeText(textoAlertas(t)); setAviso("Alertas copiadas. Pégalas en WhatsApp o en el correo.") }
    catch { setAviso("Este navegador no dejó copiar.") }
    window.setTimeout(() => setAviso(null), 3500);
  }

  const tarjeta = (a: Alerta) => {
    const U = URGENCIA[a.urgencia];
    return (
      <div key={a.cedula} className="sg-tj">
        <div className="sg-tj-d" style={{ color: a.urgencia === "vencida" ? "#2A2A2A" : U.texto }}>
          <b>{Math.abs(a.dias)}</b><span>{a.dias < 0 ? "días vencida" : a.dias === 0 ? "vence hoy" : a.dias === 1 ? "día" : "días"}</span>
        </div>
        <div className="sg-tj-i">
          <b title={a.nombre}>{a.nombre}</b>
          <small>{a.empresa} · CC {a.cedula}{a.nivel ? ` · ${a.nivel}` : ""}</small>
          {a.permisos.length > 0 && <div className="sg-pm">{a.permisos.map((k) => <i key={k}>{PERMISOS.find((x) => x.k === k)?.t ?? k}</i>)}</div>}
          <div className="sg-tj-r">{a.interventor || a.coordinador ? `${a.interventor ?? "—"} · ${a.coordinador ?? "—"}` : "Sin interventor ABI ni coordinador"}</div>
        </div>
        <div className="sg-tj-f">{fechaCorta(a.vencimiento)}</div>
      </div>
    );
  };

  return (
    <div className="sg" ref={caja}>
      <header className="sg-cab">
        <div>
          <p className="sg-ojo">SEGURIDAD · CERTIFICACIONES</p>
          <h1>Licencias VACA <span className="sg-tag">{deptos}</span></h1>
          <p className="sg-sub">
            {nf.format(todas.activos)} personas trabajando · {todas.alertas.length} con alerta · aviso con {config.diasAviso} días de antelación
          </p>
        </div>
        <div className="sg-acc">
          <button type="button" className="sg-bt" onClick={copiar} disabled={!t.alertas.length}>
            <svg viewBox="0 0 24 24" aria-hidden><rect x="8" y="8" width="12" height="12" /><path d="M16 8V4H4v12h4" /></svg>Copiar alertas
          </button>
          <button type="button" className="sg-bt osc" onClick={() => foto.abrir("dashboard")} disabled={foto.armando != null}>
            <svg viewBox="0 0 24 24" aria-hidden><rect x="3" y="5" width="18" height="14" /><circle cx="9" cy="11" r="2" /><path d="M21 16l-5-5-8 8" /></svg>
            {foto.armando ? "Armando…" : "Imagen"}
          </button>
        </div>
      </header>
      {aviso && <p className="sg-aviso" role="status">{aviso}</p>}

      <div className="sg-filtros">
        <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} aria-label="Empresa">
          <option value="">Todas las empresas</option>
          {empresas.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Interventor ABI o coordinador">
          <option value="">Todos los responsables</option>
          {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input type="search" placeholder="Nombre o cédula" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar persona" />
      </div>

      <div className="sg-kb">
        {COLS.map((c) => {
          const L = t.alertas.filter((a) => a.urgencia === c.k);
          const ver = abiertas[c.k] ? L : L.slice(0, MOSTRAR);
          return (
            <section key={c.k} className={"sg-kb-col " + c.k} aria-label={c.t}>
              <header><span>{c.t}</span><b>{L.length}</b><small>{c.sub}</small></header>
              <div className="sg-kb-lista">
                {L.length === 0 && <div className="sg-kb-nada">Nadie en esta columna.</div>}
                {ver.map(tarjeta)}
                {L.length > MOSTRAR && (
                  <button type="button" className="sg-mas" onClick={() => setAbiertas((x) => ({ ...x, [c.k]: !x[c.k] }))}>
                    {abiertas[c.k] ? "Ver menos" : `Ver las ${L.length - MOSTRAR} restantes`}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {foto.vista}
    </div>
  );
}
