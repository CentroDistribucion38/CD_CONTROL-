"use client";

/**
 * CAMPO DE FECHA DE CONTROL — reemplaza al <input type="date"> del navegador en toda la app.
 *
 * Se usa igual que el input: value «AAAA-MM-DD», onChange(e) con e.target.value, min, max, disabled, id,
 * aria-label, className. Se ve como un campo de texto (dd/mm/aaaa, también se puede escribir) y al tocarlo
 * abre el calendario de CONTROL: un mes, atajos a la izquierda, recto, blanco y amarillo.
 *
 * DESDE / HASTA: si el campo es parte de un par, se le pasa el otro extremo —al «Desde» `hasta` y `alHasta`,
 * al «Hasta» `desde` y `alDesde`— y el calendario escoge el período completo (con atajos «Esta semana»,
 * «Últimos 7 días»…). Al aplicar, primero cambia su propio campo y, ya con la página al día, el otro.
 *
 * En celular el calendario sale como hoja abajo, a todo el ancho.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { aTexto, diasDelMes, partes, primerDia } from "./CalendarioRango";
import "./campo-fecha.css";

type Cambio = (e: { target: { value: string } }) => void;
type Props = {
  value: string;
  onChange?: Cambio;
  min?: string;
  max?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
  /* el par Desde/Hasta */
  desde?: string; alDesde?: Cambio;
  hasta?: string; alHasta?: Cambio;
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_C = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const SEM = ["LU", "MA", "MI", "JU", "VI", "SÁ", "DO"];
const esFecha = (f: string | undefined): f is string => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f);

/** Hoy en Colombia (no el de la máquina). */
export function hoyCO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}
const sumar = (f: string, n: number) => { const { a, m, d } = partes(f); const x = new Date(Date.UTC(a, m, d + n)); return aTexto(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) };
const diaSem = (f: string) => { const { a, m, d } = partes(f); return new Date(Date.UTC(a, m, d)).getUTCDay() };
const lunes = (f: string) => sumar(f, -((diaSem(f) + 6) % 7));
const corta = (f: string) => { const { m, d } = partes(f); return `${DIAS_C[diaSem(f)]} ${d} ${MES_C[m]}` };
const larga = (f: string) => { const { a, m, d } = partes(f); return `${DIAS_C[diaSem(f)]} ${d} de ${MESES[m]} de ${a}` };
const aMostrar = (f: string) => { const { a, m, d } = partes(f); return `${String(d).padStart(2, "0")}/${String(m + 1).padStart(2, "0")}/${a}` };
const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;

/** «26/11/2026», «26-11-26», «2026-11-26» → «2026-11-26»; lo que no sea fecha real → null. */
function leer(t: string): string | null {
  const s = t.trim();
  let a: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const co = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/.exec(s);
  if (iso) { a = +iso[1]; m = +iso[2]; d = +iso[3] }
  else if (co) { d = +co[1]; m = +co[2]; a = co[3].length === 2 ? 2000 + +co[3] : +co[3] }
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > diasDelMes(a, m - 1)) return null;
  return aTexto(a, m - 1, d);
}

type Atajo = { t: string; d: string; h: string };
function atajosDe(par: boolean, hoy: string, min?: string, max?: string): Atajo[] {
  const { a, m } = partes(hoy);
  const am = m === 0 ? a - 1 : a, mm = m === 0 ? 11 : m - 1;
  const lista: Atajo[] = par ? [
    { t: "Hoy", d: hoy, h: hoy },
    { t: "Ayer", d: sumar(hoy, -1), h: sumar(hoy, -1) },
    { t: "Esta semana", d: lunes(hoy), h: sumar(lunes(hoy), 6) },
    { t: "Semana pasada", d: sumar(lunes(hoy), -7), h: sumar(lunes(hoy), -1) },
    { t: "Últimos 7 días", d: sumar(hoy, -6), h: hoy },
    { t: "Últimos 30 días", d: sumar(hoy, -29), h: hoy },
    { t: "Este mes", d: aTexto(a, m, 1), h: aTexto(a, m, diasDelMes(a, m)) },
    { t: "Mes pasado", d: aTexto(am, mm, 1), h: aTexto(am, mm, diasDelMes(am, mm)) },
  ] : [
    { t: "Hoy", d: hoy, h: hoy },
    { t: "Ayer", d: sumar(hoy, -1), h: "" },
    { t: "Mañana", d: sumar(hoy, 1), h: "" },
    { t: "Lunes de esta semana", d: lunes(hoy), h: "" },
    { t: "Inicio del mes", d: aTexto(a, m, 1), h: "" },
    { t: "En 7 días", d: sumar(hoy, 7), h: "" },
    { t: "En 30 días", d: sumar(hoy, 30), h: "" },
  ];
  /* Al período se le recorta lo que quede fuera de min/max; si no queda nada, el atajo no sale. */
  return lista.flatMap((x) => {
    let d = x.d, h = x.h || x.d;
    if (min && d < min) d = min;
    if (max && h > max) h = max;
    if (d > h) return [];
    if (!par && d !== x.d) return [];
    return [{ ...x, d, h: par ? h : "" }];
  });
}

export function CampoFecha(p: Props) {
  const { value, onChange, min, max, disabled, id, className, placeholder } = p;
  const par = p.alHasta ? "desde" : p.alDesde ? "hasta" : null;
  const [texto, setTexto] = useState(esFecha(value) ? aMostrar(value) : "");
  const [abierto, setAbierto] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => { setTexto(esFecha(value) ? aMostrar(value) : "") }, [value]);

  /* El otro extremo del par se aplica en el render siguiente, con los manejadores ya al día. */
  const pendiente = useRef<string | null>(null);
  const [, empujar] = useState(0);
  const pRef = useRef(p);
  pRef.current = p;
  useEffect(() => {
    if (pendiente.current == null) return;
    const v = pendiente.current; pendiente.current = null;
    const q = pRef.current;
    (par === "desde" ? q.alHasta : q.alDesde)?.({ target: { value: v } });
  });

  const fijar = useCallback((v: string) => onChange?.({ target: { value: v } }), [onChange]);
  const aplicarPar = (d: string, h: string) => {
    const propio = par === "desde" ? d : h, otro = par === "desde" ? h : d;
    pendiente.current = otro;
    fijar(propio);
    empujar((n) => n + 1);
  };

  const escrito = () => {
    if (!texto.trim()) { if (value) fijar(""); return }
    const f = leer(texto);
    if (f && (!min || f >= min) && (!max || f <= max)) { if (f !== value) fijar(f); setTexto(aMostrar(f)) }
    else setTexto(esFecha(value) ? aMostrar(value) : "");
  };

  return (
    <>
      <input
        ref={campo}
        id={id}
        className={"fc-campo" + (className ? " " + className : "") + (abierto ? " fc-ab" : "")}
        data-fecha=""
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder ?? "dd/mm/aaaa"}
        aria-label={p["aria-label"]}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        title={esFecha(value) ? larga(value) : undefined}
        value={texto}
        disabled={disabled}
        onChange={(e) => setTexto(e.target.value)}
        onClick={(e) => { if (disabled) return; setAbierto(true); if (window.innerWidth < 640) e.currentTarget.blur() }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); escrito(); setAbierto(false) }
          else if (e.key === "ArrowDown" || (e.key === " " && !texto)) { e.preventDefault(); setAbierto(true) }
          else if (e.key === "Escape") setAbierto(false);
        }}
        onBlur={escrito}
      />
      {abierto && !disabled && (
        <Panel
          ancla={campo}
          par={par}
          valor={esFecha(value) ? value : ""}
          desde={par === "desde" ? (esFecha(value) ? value : "") : esFecha(p.desde) ? p.desde : ""}
          hasta={par === "hasta" ? (esFecha(value) ? value : "") : esFecha(p.hasta) ? p.hasta : ""}
          /* En el par, el tope que solo amarra un extremo al otro (min = desde, max = hasta) no limita el período. */
          min={esFecha(min) && !(par === "hasta" && min === p.desde) ? min : undefined}
          max={esFecha(max) && !(par === "desde" && max === p.hasta) ? max : undefined}
          cerrar={(volver) => { setAbierto(false); if (volver) campo.current?.focus() }}
          uno={(f) => fijar(f)}
          dos={aplicarPar}
        />
      )}
    </>
  );
}

function Panel({ ancla, par, valor, desde, hasta, min, max, cerrar, uno, dos }: {
  ancla: React.RefObject<HTMLInputElement | null>;
  par: "desde" | "hasta" | null;
  valor: string; desde: string; hasta: string; min?: string; max?: string;
  cerrar: (volverAlCampo: boolean) => void;
  uno: (f: string) => void;
  dos: (d: string, h: string) => void;
}) {
  const hoy = hoyCO();
  const caja = useRef<HTMLDivElement>(null);
  const [ini, setIni] = useState(par ? desde : valor);
  const [fin, setFin] = useState(par ? hasta : "");
  const [sobre, setSobre] = useState("");
  const base = (par ? (par === "desde" ? desde || hasta : hasta || desde) : valor) || (max && hoy > max ? max : min && hoy < min ? min : hoy);
  const [vista, setVista] = useState(() => { const { a, m } = partes(base); return { a, m } });
  const [foco, setFoco] = useState(base);
  const [meses, setMeses] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; arriba: boolean } | null>(null);
  const [movil, setMovil] = useState(false);
  const atajos = atajosDe(!!par, hoy, min, max);
  const fuera = (f: string) => (!!min && f < min) || (!!max && f > max);

  /* Debajo del campo; si no cabe, encima. En pantalla angosta, hoja abajo. */
  useLayoutEffect(() => {
    const medir = () => {
      const r = ancla.current?.getBoundingClientRect();
      const w = window.innerWidth, h = window.innerHeight;
      if (w < 640) { setMovil(true); setPos({ top: 0, left: 0, arriba: false }); return }
      setMovil(false);
      if (!r) return;
      const alto = caja.current?.offsetHeight ?? 380, ancho = caja.current?.offsetWidth ?? 470;
      const arriba = r.bottom + 6 + alto > h && r.top - 6 - alto > 0;
      setPos({ top: arriba ? r.top - 6 - alto : r.bottom + 6, left: Math.max(8, Math.min(r.left, w - ancho - 8)), arriba });
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => { window.removeEventListener("resize", medir); window.removeEventListener("scroll", medir, true) };
  }, [ancla, meses]);

  useEffect(() => {
    const fueraDe = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!caja.current?.contains(t) && !ancla.current?.contains(t)) cerrar(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); cerrar(true) } };
    document.addEventListener("pointerdown", fueraDe);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("pointerdown", fueraDe); document.removeEventListener("keydown", tecla) };
  }, [ancla, cerrar]);

  /* el foco del teclado sigue al día marcado */
  const primeraVez = useRef(true);
  useEffect(() => {
    if (primeraVez.current) { primeraVez.current = false; return }
    caja.current?.querySelector<HTMLButtonElement>(`button[data-f="${foco}"]`)?.focus();
  }, [foco, vista]);

  const irA = (f: string) => { setFoco(f); const { a, m } = partes(f); setVista({ a, m }) };
  const mover = (n: number) => { const x = vista.m + n; setVista({ a: vista.a + Math.floor(x / 12), m: ((x % 12) + 12) % 12 }) };

  const tocar = (f: string) => {
    if (fuera(f)) return;
    if (!par) { uno(f); cerrar(true); return }
    if (!ini || fin) { setIni(f); setFin(""); return }
    if (f < ini) { setFin(ini); setIni(f) } else setFin(f);
  };
  const tecla = (e: React.KeyboardEvent, f: string) => {
    const k: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (k[e.key] != null) { e.preventDefault(); irA(sumar(f, k[e.key])) }
    else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const { a, m, d } = partes(f), x = m + (e.key === "PageUp" ? -1 : 1);
      const na = a + Math.floor(x / 12), nm = ((x % 12) + 12) % 12;
      irA(aTexto(na, nm, Math.min(d, diasDelMes(na, nm))));
    } else if (e.key === "Home") { e.preventDefault(); irA(lunes(f)) }
    else if (e.key === "End") { e.preventDefault(); irA(sumar(lunes(f), 6)) }
  };

  const finVista = fin || (ini && sobre && !fin ? sobre : "");
  const [r1, r2] = ini && finVista ? (finVista < ini ? [finVista, ini] : [ini, finVista]) : [ini, ini];
  const hueco = primerDia(vista.a, vista.m), n = diasDelMes(vista.a, vista.m);
  const atras = { a: vista.m === 0 ? vista.a - 1 : vista.a, m: vista.m === 0 ? 11 : vista.m - 1 };
  const total = Math.ceil((hueco + n) / 7) * 7;
  const celdas = Array.from({ length: total }, (_, i) => {
    const k = i - hueco + 1;
    if (k < 1) return aTexto(atras.a, atras.m, diasDelMes(atras.a, atras.m) + k);
    if (k > n) { const x = vista.m + 1; return aTexto(vista.a + Math.floor(x / 12), x % 12, k - n) }
    return aTexto(vista.a, vista.m, k);
  });
  const listo = !!par && !!ini;

  const cuerpo = (
    <div ref={caja} className={"fc-pop" + (movil ? " fc-hoja" : "") + (par ? " fc-par" : "")} role="dialog" aria-label={par ? "Escoger período" : "Escoger día"}
      style={movil || !pos ? (movil ? undefined : { visibility: "hidden", top: 0, left: 0 }) : { top: pos.top, left: pos.left }}>
      <div className="fc-cuerpo">
        {atajos.length > 0 && (
          <div className="fc-atajos">
            {atajos.map((x) => {
              const on = par ? ini === x.d && fin === x.h : valor === x.d;
              return (
                <button key={x.t} type="button" className={on ? "on" : ""}
                  onClick={() => { if (par) { dos(x.d, x.h); cerrar(true) } else { uno(x.d); cerrar(true) } }}>{x.t}</button>
              );
            })}
          </div>
        )}
        <div className="fc-mes">
          <div className="fc-cab">
            <button type="button" className="fc-fl" aria-label={meses ? "Año anterior" : "Mes anterior"} onClick={() => meses ? setVista({ ...vista, a: vista.a - 1 }) : mover(-1)}>‹</button>
            <button type="button" className="fc-tit" aria-label="Escoger mes y año" onClick={() => setMeses(!meses)}>
              {meses ? vista.a : <>{MESES[vista.m]} {vista.a}</>}<span aria-hidden>▾</span>
            </button>
            <button type="button" className="fc-fl" aria-label={meses ? "Año siguiente" : "Mes siguiente"} onClick={() => meses ? setVista({ ...vista, a: vista.a + 1 }) : mover(1)}>›</button>
          </div>
          {meses ? (
            <div className="fc-meses">
              {MES_C.map((t, m) => {
                const ultimo = aTexto(vista.a, m, diasDelMes(vista.a, m)), primero = aTexto(vista.a, m, 1);
                const no = (!!min && ultimo < min) || (!!max && primero > max);
                return <button key={t} type="button" disabled={no} className={vista.m === m ? "on" : ""} onClick={() => { setVista({ a: vista.a, m }); setMeses(false) }}>{t}</button>;
              })}
            </div>
          ) : (
            <div className="fc-g" role="grid" onMouseLeave={() => setSobre("")}>
              {SEM.map((s) => <span key={s} className="fc-sem" role="columnheader">{s}</span>)}
              {celdas.map((f) => {
                const otroMes = partes(f).m !== vista.m, no = fuera(f);
                const punta = f === r1 || f === r2 ? (par ? !!ini : f === valor) : false;
                const dentro = !!par && !!ini && f > r1 && f < r2;
                const cls = ["fc-d", otroMes && "om", no && "no", punta && "pt", dentro && "rg", f === hoy && "hoy",
                  par && f === r1 && r1 !== r2 && "ini", par && f === r2 && r1 !== r2 && "fin"].filter(Boolean).join(" ");
                return (
                  <button key={f} type="button" data-f={f} className={cls} disabled={no} tabIndex={f === foco ? 0 : -1}
                    aria-label={larga(f)} aria-pressed={punta} aria-current={f === hoy ? "date" : undefined}
                    onClick={() => tocar(f)} onKeyDown={(e) => tecla(e, f)}
                    onMouseEnter={() => par && ini && !fin && setSobre(f)}>{partes(f).d}</button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="fc-pie">
        {par ? (
          <span className="fc-res">{!ini ? "Toca el primer día" : !fin ? <>Desde <b>{corta(ini)}</b> · toca el último día</>
            : <><b>{corta(ini)}</b> → <b>{corta(fin)}</b> · {dias(ini, fin)} día{dias(ini, fin) === 1 ? "" : "s"}</>}</span>
        ) : (
          <span className="fc-res">{valor ? larga(valor) : "Sin fecha"}</span>
        )}
        <span className="fc-bts">
          {par ? <>
            <button type="button" className="fc-b" onClick={() => { setIni(""); setFin("") }}>Limpiar</button>
            <button type="button" className="fc-b fc-ok" disabled={!listo} onClick={() => { if (!ini) return; dos(ini, fin || ini); cerrar(true) }}>Aplicar</button>
          </> : <>
            {valor && <button type="button" className="fc-b" onClick={() => { uno(""); cerrar(true) }}>Borrar</button>}
            <button type="button" className="fc-b" onClick={() => cerrar(true)}>Cerrar</button>
          </>}
        </span>
      </div>
    </div>
  );

  return createPortal(movil ? <div className="fc-fondo" onPointerDown={(e) => { if (e.target === e.currentTarget) cerrar(false) }}>{cuerpo}</div> : cuerpo, document.body);
}

export default CampoFecha;
