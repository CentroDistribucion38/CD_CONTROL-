"use client";

/**
 * MODO REVISIÓN — pasar los casos uno por uno, con la foto grande, ANTES de cobrar.
 *
 * Se abre desde el Tablero sobre lo que está filtrado. Foto enorme a la izquierda; a la derecha, las
 * cantidades y dos botones: «Está bien» (marca revisada y pasa al siguiente pendiente) o «Corregir»
 * (cambia rotas y contaminadas, con motivo; un caso corregido queda revisado). Abajo, la tira de casos
 * con su estado: verde revisada, amarillo corregida, gris pendiente.
 *
 * TECLADO: Enter = está bien · C = corregir · ← → = anterior / siguiente · Esc = cancelar o cerrar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Rotura } from "@/modulos/roturas/datos";
import type { Corr } from "./Caso";
import { cobroDe } from "./Corregir";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
type Foto = { url: string; tomada_en: string | null; lat: number | null; lng: number | null; precision_m: number | null };

/* Las fotos se piden al abrir cada caso (las URL firmadas vencen) y se guardan mientras dura la revisión. */
async function pedirFotos(id: string): Promise<Foto[]> {
  try {
    const r = await fetch(`/api/roturas/evidencia/${id}`, { cache: "no-store" });
    const j = await r.json();
    return ((j.fotos ?? []) as (Foto & { url: string | null })[]).filter((f) => f.url) as Foto[];
  } catch { return [] }
}

const MOTIVOS = ["Conteo mal digitado", "La foto no coincide", "Contaminadas mal contadas", "Cajas de más"];

export function Revision({ lista, nombres, revisadas, correcciones, inicio, guardando, cerrar, revisar, corregir }: {
  lista: Rotura[];
  nombres: Record<string, string>;
  revisadas: Set<string>;
  correcciones: Record<string, Corr[]>;
  inicio: number;
  guardando: boolean;
  cerrar: () => void;
  revisar: (r: Rotura, ok: boolean) => Promise<boolean>;
  corregir: (r: Rotura, rotas: number, contam: number, motivo: string) => Promise<boolean>;
}) {
  const [i, setI] = useState(Math.min(Math.max(inicio, 0), Math.max(lista.length - 1, 0)));
  const [editando, setEditando] = useState(false);
  const [fotos, setFotos] = useState<Record<string, Foto[]>>({});
  const [nFoto, setNFoto] = useState(0);
  const [rotas, setRotas] = useState("");
  const [contam, setContam] = useState("");
  const [motivo, setMotivo] = useState("");
  const pidiendo = useRef(new Set<string>());
  const r = lista[i];

  const cargar = useCallback((id: string, otra = false) => {
    if (!otra && (pidiendo.current.has(id))) return;
    pidiendo.current.add(id);
    pedirFotos(id).then((f) => setFotos((p) => ({ ...p, [id]: f })));
  }, []);

  /* El caso, los dos siguientes y los cuatro de atrás (la tira), con su foto lista. */
  useEffect(() => {
    for (let k = i - 4; k <= i + 6; k++) if (lista[k]) cargar(lista[k].id);
  }, [i, lista, cargar]);

  const irA = useCallback((k: number) => { setI(Math.min(Math.max(k, 0), lista.length - 1)); setEditando(false); setNFoto(0) }, [lista.length]);
  const siguientePendiente = useCallback((desde: number) => {
    for (let k = desde + 1; k < lista.length; k++) if (!revisadas.has(lista[k].id)) return k;
    for (let k = 0; k < desde; k++) if (!revisadas.has(lista[k].id)) return k;
    return -1;
  }, [lista, revisadas]);

  const estaBien = useCallback(async () => {
    if (!r || guardando) return;
    if (!revisadas.has(r.id)) { if (!(await revisar(r, true))) return }
    const s = siguientePendiente(i);
    if (s >= 0 && s !== i) irA(s); else if (i < lista.length - 1) irA(i + 1);
  }, [r, guardando, revisadas, revisar, siguientePendiente, i, irA, lista.length]);

  const abrirEdicion = useCallback(() => {
    if (!r) return;
    setRotas(String(r.unidades)); setContam(String(r.contaminadas ?? 0)); setMotivo(""); setEditando(true);
  }, [r]);

  /* UNA CASILLA VACÍA CUENTA COMO 0: no hay que llenar las dos, basta con la que cambia. */
  const entero = (s: string) => (s.trim() === "" ? 0 : /^\d+$/.test(s.trim()) ? Number(s) : NaN);
  const eer = r?.tipo === "eer";
  const nr = entero(rotas), nc = eer ? 0 : entero(contam);
  const valido = Number.isFinite(nr) && Number.isFinite(nc);
  const igual = !!r && valido && nr === r.unidades && nc === (r.contaminadas ?? 0);
  const vacia = valido && nr + nc === 0;
  const puedeGuardar = editando && valido && !vacia && !igual && motivo.trim().length >= 4 && !guardando;

  const guardar = useCallback(async () => {
    if (!r || !puedeGuardar) return;
    if (await corregir(r, nr, nc, motivo.trim())) {
      setEditando(false);
      const s = siguientePendiente(i);
      if (s >= 0 && s !== i) irA(s);
    }
  }, [r, puedeGuardar, corregir, nr, nc, motivo, siguientePendiente, i, irA]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const escribiendo = !!t && /^(INPUT|TEXTAREA)$/.test(t.tagName);
      if (e.key === "Escape") { e.preventDefault(); if (editando) setEditando(false); else cerrar(); return }
      if (escribiendo) {
        if (e.key === "Enter" && editando && t!.tagName === "INPUT") { e.preventDefault(); void guardar() }
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); if (!editando) void estaBien() }
      else if (e.key === "c" || e.key === "C") { e.preventDefault(); if (!editando) abrirEdicion() }
      else if (e.key === "ArrowRight") { e.preventDefault(); irA(i + 1) }
      else if (e.key === "ArrowLeft") { e.preventDefault(); irA(i - 1) }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [editando, cerrar, estaBien, abrirEdicion, irA, i, guardar]);

  const hechas = useMemo(() => lista.filter((x) => revisadas.has(x.id)).length, [lista, revisadas]);

  if (!r) {
    return (
      <div className="rv" role="dialog" aria-modal="true">
        <div className="rv-top"><b>REVISIÓN DE ROTURAS</b><button type="button" className="rv-x" onClick={cerrar}>Cerrar ✕</button></div>
        <p className="rv-vacio">No hay casos para revisar con estos filtros.</p>
      </div>
    );
  }

  const fs = fotos[r.id];
  const f = fs?.[Math.min(nFoto, Math.max((fs?.length ?? 1) - 1, 0))];
  const hecha = revisadas.has(r.id);
  const hist = correcciones[r.id] ?? [];
  const antes = r.cobro_total != null ? Number(r.cobro_total) : cobroDe(r, r.unidades, r.contaminadas ?? 0);
  const despues = valido ? cobroDe(r, nr, nc) : null;
  const falta = !valido ? "Pon un número entero" : vacia ? "No pueden quedar en cero" : igual ? "Cambia alguna cifra"
    : motivo.trim().length < 4 ? "Escribe o elige el motivo" : "Guardar corrección";
  const pendientes = lista.length - hechas;

  return (
    <div className="rv" role="dialog" aria-modal="true" aria-label="Revisión de roturas">
      <div className="rv-top">
        <b>REVISIÓN DE ROTURAS · {hechas} DE {lista.length} REVISADAS</b>
        <span>{pendientes > 0 ? `${pendientes} por revisar` : "Todas revisadas"}</span>
        <button type="button" className="rv-x" onClick={cerrar}>Cerrar ✕</button>
      </div>
      <div className="rv-prog"><i style={{ width: `${lista.length ? (hechas / lista.length) * 100 : 0}%` }} /></div>

      <div className="rv-cuerpo">
        <div className="rv-foto">
          {f
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <a href={f.url} target="_blank" rel="noreferrer" title="Abrir la foto en grande"><img src={f.url} alt={`Foto de ${r.codigo}`}
                onError={() => { pidiendo.current.delete(r.id); cargar(r.id, true) }} /></a>
            : <div className="rv-sinfoto">{fs ? "Esta rotura no tiene foto" : "Trayendo la foto…"}</div>}
          <div className="rv-cod"><b>{r.codigo}</b><i>{r.tipo === "eer" ? "EER" : "PT"}</i></div>
          {fs && fs.length > 1 && (
            <div className="rv-fotos">{fs.map((_, k) => (
              <button key={k} type="button" className={k === nFoto ? "on" : ""} onClick={() => setNFoto(k)}>{k + 1}</button>))}</div>
          )}
          <div className="rv-pie">
            {f ? <>Tomada {f.tomada_en ? new Date(f.tomada_en).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "sin hora"}
              {f.precision_m != null && <> · ±{Math.round(Number(f.precision_m))} m</>} · </> : null}
            {r.area_nombre ?? "—"} · registró {nombres[r.reportada_por ?? ""] ?? "—"}
          </div>
          <button type="button" className="rv-flecha izq" onClick={() => irA(i - 1)} disabled={i === 0} aria-label="Caso anterior">‹</button>
          <button type="button" className="rv-flecha der" onClick={() => irA(i + 1)} disabled={i === lista.length - 1} aria-label="Caso siguiente">›</button>
        </div>

        <div className="rv-lado">
          <div>
            <div className="rv-k">{r.material_nombre}{r.factor_caja ? ` · ${r.factor_caja} por caja` : ""}</div>
            <h2>{r.causa_nombre}</h2>
            <div className="rv-sub">{r.proceso_nombre}{r.descripcion ? ` · «${r.descripcion}»` : ""}</div>
            <div className="rv-est">
              {hecha && <span className="ok">✓ Revisada</span>}
              {hist.length > 0 && <span className="corr" title={`Antes: ${hist[hist.length - 1].antes_rotas} rotas`}>Corregida · antes {hist[hist.length - 1].antes_rotas}{hist[hist.length - 1].antes_contaminadas ? ` + ${hist[hist.length - 1].antes_contaminadas} contam.` : ""}</span>}
              {r.ol_nota && <span className="ol">OL: «{r.ol_nota}»</span>}
            </div>
          </div>

          <div className="rv-cifras">
            <label className={"rv-caja" + (editando ? " edit" : "")}>
              <span>Rotas</span>
              {editando
                ? <input autoFocus inputMode="numeric" value={rotas} onChange={(e) => setRotas(e.target.value)} />
                : <b>{r.unidades}</b>}
            </label>
            {!eer && (
              <label className={"rv-caja" + (editando ? " edit" : "")}>
                <span>Contaminadas</span>
                {editando
                  ? <input inputMode="numeric" value={contam} onChange={(e) => setContam(e.target.value)} />
                  : <b className={r.contaminadas ? "" : "cero"}>{r.contaminadas ?? 0}</b>}
              </label>
            )}
          </div>

          <div className="rv-cobro">
            <span>Cobro</span>
            <b>{antes != null ? cop.format(antes) : "sin precio o sin factor"}
              {editando && !igual && valido && !vacia && <em> → {despues != null ? cop.format(despues) : "sin precio o sin factor"}</em>}</b>
          </div>

          {editando ? (
            <>
              <div className="rv-motivos">
                {MOTIVOS.map((m) => (
                  <button key={m} type="button" className={motivo === m ? "on" : ""} onClick={() => setMotivo(m)}>{m}</button>))}
              </div>
              <textarea className="rv-motivo" rows={2} value={motivo} placeholder="Por qué se corrige (queda escrito junto a la cifra anterior)"
                        onChange={(e) => setMotivo(e.target.value)} />
              <div className="rv-botones">
                <button type="button" className="rv-b plano" onClick={() => setEditando(false)}>Cancelar <small>Esc</small></button>
                <button type="button" className="rv-b oro" disabled={!puedeGuardar} onClick={() => void guardar()}>
                  {guardando ? "Guardando…" : falta} <small>Enter</small></button>
              </div>
            </>
          ) : (
            <div className="rv-botones">
              <button type="button" className="rv-b verde" disabled={guardando} onClick={() => void estaBien()}>
                {hecha ? "Siguiente pendiente →" : "✓ Está bien"} <small>Enter</small></button>
              <button type="button" className="rv-b oro" onClick={abrirEdicion}>✎ Corregir <small>C</small></button>
            </div>
          )}
          {hecha && !editando && (
            <button type="button" className="rv-quitar" disabled={guardando} onClick={() => void revisar(r, false)}>Quitar la marca de revisada</button>
          )}
          <p className="rv-ayuda">← → cambian de caso · Enter marca revisado y pasa al siguiente pendiente · C corrige</p>
        </div>
      </div>

      <div className="rv-tira" role="list">
        {lista.map((x, k) => {
          const u = fotos[x.id]?.[0]?.url;
          const est = (correcciones[x.id]?.length ?? 0) > 0 ? "corr" : revisadas.has(x.id) ? "ok" : "";
          return (
            <button key={x.id} type="button" role="listitem" className={"rv-mini" + (k === i ? " on" : "")} onClick={() => irA(k)}
                    ref={(el) => { if (el && k === i) el.scrollIntoView({ block: "nearest", inline: "center" }) }}>
              {u /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={u} alt="" loading="lazy" /> : <span className="rv-nada" />}
              <em>{x.codigo}</em>
              <i className={est} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
