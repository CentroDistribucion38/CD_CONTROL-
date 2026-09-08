"use client";

/**
 * QUIEBRA DIARIA — el segundo tablero.
 *
 * Es la hoja QUIEBRA DIARIA del maestro, pero viva: se para en UN día,
 * trae lo que haya en la base y deja escribir lo que falte.
 *
 * La regla de oro, que se ve en toda la pantalla:
 *   SAP y lo escrito a mano son DOS columnas, no una.
 * Importar vuelve a llenar la columna de SAP y no toca la otra. Lo
 * escrito manda al calcular, y cuando las dos no coinciden la pantalla
 * lo dice en vez de esconderlo. Así nadie pierde lo que tecleó a las
 * 6 a.m. porque a las 10 alguien subió el maestro, y nadie reporta una
 * cifra escrita a mano sin enterarse de que SAP dice otra cosa.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  CAUSALES,
  NOMBRE_HOJA,
  leerMes,
  type MesDiario,
} from "@/modulos/quiebra/diario";

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_LARGO = ["enero","febrero","marzo","abril","mayo","junio","julio",
                     "agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS_SEM = ["L","M","M","J","V","S","D"];

const COLOR_CAUSAL: Record<string, string> = {
  "Sorting distribución": "#E4002B",
  "Presorting": "#B8001F",
  "Rotura máquina": "#8E0018",
  "Sorting envase": "#E9A81F",
  "Lavado / extrasucio": "#C58A12",
  "Otros": "#9AA9BB",
  "Rotura depósito": "#C6D0DC",
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const pf = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(d).replace(".", ",") + "%";

const partes = (f: string) => ({
  a: Number(f.slice(0, 4)), m: Number(f.slice(5, 7)) - 1, d: Number(f.slice(8, 10)),
});
const aTexto = (a: number, m: number, d: number) =>
  `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const bonita = (f: string) => {
  const { a, m, d } = partes(f);
  return `${d} de ${MESES_LARGO[m]} de ${a}`;
};
const diasDelMes = (a: number, m: number) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
const primerDia = (a: number, m: number) => (new Date(Date.UTC(a, m, 1)).getUTCDay() + 6) % 7;
const mesDe = (f: string) => `${f.slice(0, 7)}-01`;

/** Corre un día sin pasar por Date y sin líos de zona horaria. */
function correr(f: string, paso: number): string {
  const { a, m, d } = partes(f);
  const t = new Date(Date.UTC(a, m, d + paso));
  return t.toISOString().slice(0, 10);
}

/**
 * Lee un número escrito como se escribe aquí: 12.400 son doce mil
 * cuatrocientos y 12,5 son doce y medio. Si el punto no está separando
 * miles (1.5), se toma como decimal para no inventar un 15.
 */
function aNumero(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const limpio = t.replace(/[^\d.,-]/g, "");
  if (limpio === "" || limpio === "-") return null;
  let normal: string;
  if (limpio.includes(",")) {
    normal = limpio.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpio)) {
    normal = limpio.replace(/\./g, "");
  } else {
    normal = limpio;
  }
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

const texto = (v: number | null | undefined) =>
  v == null ? "" : String(Math.round(v * 1000) / 1000).replace(".", ",");

/* ===================================================================
   Estado del formulario: lo que hay escrito en las casillas.
   Se guarda como TEXTO, no como número, porque mientras se teclea
   "1.2" todavía no es un número y convertirlo a cada letra pelea con
   el cursor.
   =================================================================== */
type Form = {
  le_produccion: string;
  le_baja: string;
  produccion: string;
  nota: string;
  causales: Record<string, string>;
};

const VACIO: Form = { le_produccion: "", le_baja: "", produccion: "", nota: "", causales: {} };

function formDe(datos: MesDiario, fecha: string): Form {
  const m = datos.manual[fecha];
  if (!m) return { ...VACIO, causales: {} };
  const causales: Record<string, string> = {};
  for (const c of CAUSALES) if (m.causales[c] != null) causales[c] = texto(m.causales[c]);
  return {
    le_produccion: texto(m.le_produccion),
    le_baja: texto(m.le_baja),
    produccion: texto(m.produccion),
    nota: m.nota ?? "",
    causales,
  };
}

const igualForm = (a: Form, b: Form) =>
  a.le_produccion === b.le_produccion && a.le_baja === b.le_baja &&
  a.produccion === b.produccion && a.nota === b.nota &&
  CAUSALES.every((c) => (a.causales[c] ?? "") === (b.causales[c] ?? ""));

/* =================================================================== */

type Props = {
  inicial: MesDiario;
  fechaInicial: string;
  esEditor: boolean;
  hoy: string;
};

export function Diario({ inicial, fechaInicial, esEditor, hoy }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [datos, setDatos] = useState(inicial);
  const [fecha, setFecha] = useState(fechaInicial);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  const [form, setForm] = useState<Form>(() => formDe(inicial, fechaInicial));
  const original = useMemo(() => formDe(datos, fecha), [datos, fecha]);
  const sucio = !igualForm(form, original);

  /* ---- cambiar de día: si el mes cambia, traer el mes nuevo ---- */
  const irA = useCallback(
    async (f: string) => {
      if (sucio && !confirm("Hay cambios sin guardar en este día. ¿Salir de todos modos?")) return;
      setAviso(null);
      if (mesDe(f) !== datos.mes) {
        setCargando(true);
        try {
          const nuevo = await leerMes(supabase, mesDe(f));
          setDatos(nuevo);
          setForm(formDe(nuevo, f));
        } catch {
          setAviso({ mal: true, texto: "No se pudo leer el mes. Revisa la conexión." });
        } finally {
          setCargando(false);
        }
      } else {
        setForm(formDe(datos, f));
      }
      setFecha(f);
    },
    [datos, supabase, sucio]
  );

  /* ---- lo que hay para este día ---- */
  const sap = datos.sap[fecha];
  const manual = datos.manual[fecha];

  const sapProd = sap?.produccion ?? null;
  const sapBaja = sap ? sap.baja : null;

  const escProd = aNumero(form.produccion);
  const escCausal = (c: string) => aNumero(form.causales[c] ?? "");
  const hayCausalEscrita = CAUSALES.some((c) => escCausal(c) != null);
  const escBaja = hayCausalEscrita
    ? CAUSALES.reduce((s, c) => s + (escCausal(c) ?? 0), 0)
    : null;

  // Manda lo escrito; si no hay nada escrito, lo de SAP.
  const prod = escProd ?? sapProd;
  const baja = escBaja ?? sapBaja;
  const pct = prod && prod > 0 && baja != null ? baja / prod : null;

  const leProd = aNumero(form.le_produccion);
  const leBaja = aNumero(form.le_baja);
  const lePct = leProd && leProd > 0 && leBaja != null ? leBaja / leProd : null;

  const meta = datos.meta;
  const sobreMeta = pct != null && meta != null && pct > meta;

  /* ---- el valor efectivo de cada causal (escrito o SAP) ---- */
  const valorCausal = (c: string): number | null => {
    const e = escCausal(c);
    if (e != null) return e;
    if (hayCausalEscrita) return 0; // si se abrió el desglose a mano, lo no escrito es cero
    return sap?.causales[c] ?? null;
  };

  /* ---- validaciones: el "para que todo quede igual" ---- */
  const chequeos = useMemo(() => {
    const out: { estado: "grave" | "ojo" | "ok"; texto: string }[] = [];

    if (prod == null || prod === 0) {
      out.push({ estado: "grave", texto: "Sin producción del día no se puede calcular la quiebra. Escríbela abajo." });
    }
    if (baja != null && baja < 0) {
      out.push({ estado: "grave", texto: "La baja del día quedó negativa. Revisa las causales." });
    }
    if (escProd != null && sapProd != null && Math.abs(escProd - sapProd) > 0.5) {
      const dif = escProd - sapProd;
      out.push({
        estado: "ojo",
        texto: `La producción escrita se aparta de SAP en ${nf.format(Math.abs(dif))} cajas (${dif > 0 ? "más" : "menos"}). Manda la escrita.`,
      });
    }
    if (escBaja != null && sapBaja != null && Math.abs(escBaja - sapBaja) > 0.5) {
      const dif = escBaja - sapBaja;
      out.push({
        estado: "ojo",
        texto: `La baja escrita se aparta de SAP en ${nf.format(Math.abs(dif))} cajas (${dif > 0 ? "más" : "menos"}). Manda la escrita.`,
      });
    }
    if (hayCausalEscrita && sap) {
      const faltan = CAUSALES.filter((c) => (sap.causales[c] ?? 0) > 0 && escCausal(c) == null);
      if (faltan.length) {
        out.push({
          estado: "ojo",
          texto: `SAP tiene ${faltan.join(", ")} en este día y quedaron en cero al escribir el desglose a mano.`,
        });
      }
    }
    if (pct != null && meta != null) {
      out.push(
        pct > meta
          ? { estado: "grave", texto: `El día cerró en ${pf(pct)}, por encima de la meta de ${pf(meta)}.` }
          : { estado: "ok", texto: `El día cerró en ${pf(pct)}, dentro de la meta de ${pf(meta)}.` }
      );
    }
    if (leProd != null && prod != null && prod > 0) {
      const dif = prod - leProd;
      out.push({
        estado: "ojo",
        texto: `Producción real ${dif >= 0 ? "por encima" : "por debajo"} del LE en ${nf.format(Math.abs(dif))} cajas.`,
      });
    }
    if (!sap && !manual) {
      out.push({ estado: "ojo", texto: "Este día no tiene nada: ni importado ni escrito." });
    }
    if (out.length === 0) out.push({ estado: "ok", texto: "El día cuadra." });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prod, baja, escProd, escBaja, sapProd, sapBaja, pct, meta, leProd, form, sap, manual]);

  /* ---- guardar ---- */
  async function guardar() {
    setGuardando(true);
    setAviso(null);
    const causales: Record<string, number> = {};
    for (const c of CAUSALES) {
      const v = escCausal(c);
      if (v != null) causales[c] = v;
    }
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { error } = await (supabase as any).rpc("quiebra_diario_guardar", {
      p_fecha: fecha,
      p_le_produccion: aNumero(form.le_produccion),
      p_le_baja: aNumero(form.le_baja),
      p_produccion: escProd,
      p_nota: form.nota.trim() || null,
      p_causales: causales,
    });

    if (error) {
      const m = error.message.toLowerCase();
      setAviso({
        mal: true,
        texto: m.includes("does not exist") || m.includes("schema cache")
          ? "Falta crear las tablas del diario en Supabase: ejecuta supabase/modulos/quiebra-diario.sql en el SQL Editor."
          : m.includes("supervisor") || m.includes("row-level security") || m.includes("permission")
            ? "Tu usuario no tiene permiso para editar el diario. Se necesita rol de supervisor o administrador."
            : error.message,
      });
      setGuardando(false);
      return;
    }

    try {
      const nuevo = await leerMes(supabase, datos.mes);
      setDatos(nuevo);
      setForm(formDe(nuevo, fecha));
      setAviso({ mal: false, texto: "Día guardado." });
    } catch {
      setAviso({ mal: false, texto: "Guardado, pero no se pudo refrescar la pantalla." });
    }
    setGuardando(false);
  }

  function limpiarTodo() {
    if (!confirm("Se borra todo lo escrito a mano en este día y vuelve a mandar lo importado de SAP. ¿Seguir?")) return;
    setForm({ ...VACIO, causales: {} });
  }

  const editar = (parche: Partial<Form>) => setForm((f) => ({ ...f, ...parche }));
  const editarCausal = (c: string, v: string) =>
    setForm((f) => ({ ...f, causales: { ...f.causales, [c]: v } }));

  const autor = manual?.actualizado_por ? datos.autores[manual.actualizado_por] : null;
  const { a: anioSel, m: mesSel } = partes(fecha);

  return (
    <div className="qb qd">
      {/* ====================== Cabeza ====================== */}
      <header className="cabeza">
        <div className="texto">
          <div className="ojo">QUIEBRA · DIARIO</div>
          <h1>Quiebra diaria</h1>
          <p className="sub">
            El día a día de la hoja <b>QUIEBRA DIARIA</b>. Trae lo importado de SAP y deja
            escribir a mano lo que todavía no llega. Lo escrito manda y la importación no
            lo borra. <Link href="/quiebra">Ver el tablero del periodo</Link>
          </p>
        </div>
        <div className={"kpi" + (sobreMeta ? "" : " bajo")}>
          <span className="corte" />
          <div className="rot">QUIEBRA DEL DÍA</div>
          <div className="num">{pf(pct)}</div>
          <div className="pie">
            <b>{bonita(fecha)}</b>
            {meta != null && <span className="delta">Meta {pf(meta)}</span>}
          </div>
        </div>
      </header>

      {/* ====================== Selector de día ====================== */}
      <section className="filtros qd-sel">
        <div className="arriba">
          <div className="qd-paso">
            <button type="button" aria-label="Día anterior" onClick={() => irA(correr(fecha, -1))}>
              <svg viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6" /></svg>
            </button>
            <div className="qd-dia-actual">
              <span className="d">{partes(fecha).d}</span>
              <span className="m">{MESES_LARGO[mesSel]} {anioSel}</span>
            </div>
            <button type="button" aria-label="Día siguiente" onClick={() => irA(correr(fecha, 1))}>
              <svg viewBox="0 0 24 24"><path d="M10 6l6 6-6 6" /></svg>
            </button>
          </div>

          <ElegirDia fecha={fecha} datos={datos} hoy={hoy} elegir={irA} />

          <button type="button" className="limpiar" onClick={() => irA(hoy)}>
            Ir a hoy
          </button>
        </div>

        <TiraMes datos={datos} fecha={fecha} hoy={hoy} elegir={irA} cargando={cargando} />
      </section>

      {/* ====================== Cifras del día ====================== */}
      <section className="cifras cuatro">
        <Cifra rot="PRODUCCIÓN" n={prod == null ? "—" : nf.format(prod)} u="cajas del día"
               marca={escProd != null ? "escrito" : sap ? "sap" : "falta"} />
        <Cifra rot="BAJA" n={baja == null ? "—" : nf.format(baja)} u="cajas perdidas"
               marca={escBaja != null ? "escrito" : sap ? "sap" : "falta"} />
        <Cifra rot="QUIEBRA" n={pf(pct)} u={meta != null ? `meta ${pf(meta)}` : "sin meta cargada"}
               tono={pct == null || meta == null ? undefined : pct > meta ? "alerta" : "buena"} />
        <Cifra rot="LE DEL DÍA" n={pf(lePct)} u={leBaja != null ? `${nf.format(leBaja)} cajas de plan` : "sin LE escrito"} />
      </section>

      {/* ====================== La hoja editable ====================== */}
      <section className="tarjeta qd-hoja">
        <div className="cab">
          <div>
            <h2>Detalle del día</h2>
            <p>
              La columna <b>SAP</b> es lo importado y no se toca. La columna <b>Escrito</b> es
              tuya: lo que escribas manda sobre SAP, y dejarlo en blanco es volver a SAP.
            </p>
          </div>
          {manual && (
            <div className="qd-firma">
              <b>Editado a mano</b>
              <span>
                {autor ? `${autor} · ` : ""}
                {manual.actualizado_en
                  ? new Date(manual.actualizado_en).toLocaleString("es-CO", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    })
                  : ""}
              </span>
            </div>
          )}
        </div>

        <div className="qd-tabla">
          <div className="qd-cab">
            <span>Concepto</span>
            <span className="num">SAP</span>
            <span className="num">Escrito</span>
            <span className="num">Vale</span>
          </div>

          <div className="qd-grupo">Real del día</div>

          <Linea
            nombre="Producción"
            ayuda="cajas producidas"
            sap={sapProd}
            valor={form.produccion}
            cambiar={(v) => editar({ produccion: v })}
            efectivo={prod}
            editable={esEditor}
          />

          <div className="qd-grupo">
            Pérdida por causal
            <span className="qd-pista">
              {hayCausalEscrita
                ? "Escribiendo el desglose a mano: lo que dejes en blanco cuenta como cero."
                : "En blanco = tal cual lo importado."}
            </span>
          </div>

          {CAUSALES.map((c) => (
            <Linea
              key={c}
              nombre={NOMBRE_HOJA[c] ?? c}
              ayuda={NOMBRE_HOJA[c] ? c : undefined}
              punto={COLOR_CAUSAL[c]}
              sap={sap?.causales[c] ?? null}
              valor={form.causales[c] ?? ""}
              cambiar={(v) => editarCausal(c, v)}
              efectivo={valorCausal(c)}
              editable={esEditor}
            />
          ))}

          <div className="qd-linea total">
            <div className="qd-nom"><b>Total baja del día</b></div>
            <div className="num sap">{sapBaja == null ? "—" : nf.format(sapBaja)}</div>
            <div className="num esc">{escBaja == null ? "—" : nf.format(escBaja)}</div>
            <div className="num vale">{baja == null ? "—" : nf.format(baja)}</div>
          </div>

          <div className="qd-linea total pct">
            <div className="qd-nom"><b>Quiebra del día</b></div>
            <div className="num sap">
              {sapProd && sapProd > 0 && sapBaja != null ? pf(sapBaja / sapProd) : "—"}
            </div>
            <div className="num esc">
              {escProd && escProd > 0 && escBaja != null ? pf(escBaja / escProd) : "—"}
            </div>
            <div className={"num vale" + (sobreMeta ? " mal" : "")}>{pf(pct)}</div>
          </div>

          <div className="qd-grupo">
            LE del día
            <span className="qd-pista">Lo que el plan decía. Solo se escribe a mano.</span>
          </div>

          <Linea nombre="Producción LE" sap={null} valor={form.le_produccion}
                 cambiar={(v) => editar({ le_produccion: v })} efectivo={leProd} editable={esEditor} soloEscrito />
          <Linea nombre="Baja LE" sap={null} valor={form.le_baja}
                 cambiar={(v) => editar({ le_baja: v })} efectivo={leBaja} editable={esEditor} soloEscrito />
          <div className="qd-linea total">
            <div className="qd-nom"><b>Quiebra LE</b></div>
            <div className="num sap">—</div>
            <div className="num esc">{pf(lePct)}</div>
            <div className="num vale">{pf(lePct)}</div>
          </div>
        </div>

        <div className="qd-nota">
          <label htmlFor="qd-nota">Nota del día</label>
          <textarea
            id="qd-nota"
            rows={2}
            placeholder="Por qué se escribió a mano, qué turno faltaba, a quién se le pidió el dato…"
            value={form.nota}
            disabled={!esEditor}
            onChange={(e) => editar({ nota: e.target.value })}
          />
        </div>

        {esEditor && (
          <div className="qd-acciones">
            <button type="button" className="qd-btn" disabled={!sucio || guardando} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar el día"}
            </button>
            <button type="button" className="qd-btn plano" disabled={!sucio || guardando}
                    onClick={() => setForm(original)}>
              Deshacer
            </button>
            <button type="button" className="qd-btn plano" disabled={guardando} onClick={limpiarTodo}>
              Volver a lo de SAP
            </button>
            <span className={"qd-estado" + (sucio ? " sucio" : "")}>
              {sucio ? "Hay cambios sin guardar" : "Todo guardado"}
            </span>
          </div>
        )}
        {!esEditor && (
          <div className="qd-acciones">
            <span className="qd-estado">Solo lectura. Escribir el diario requiere rol de supervisor.</span>
          </div>
        )}
        {aviso && <div className={"qd-aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
      </section>

      {/* ====================== Cuadre y mezcla ====================== */}
      <div className="tarjetas pareja">
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>Cuadre</h2>
              <p>Lo que hay que mirar antes de dar el día por bueno.</p>
            </div>
          </div>
          <div className="cuerpo">
            <ul className="qd-checks">
              {chequeos.map((c, i) => (
                <li key={i} className={"qd-" + c.estado}>
                  <i />
                  <span>{c.texto}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>Mezcla del día</h2>
              <p>Con qué se armó la pérdida, ya con lo escrito aplicado.</p>
            </div>
          </div>
          <div className="cuerpo">
            {baja && baja > 0 ? (
              CAUSALES.map((c) => {
                const v = valorCausal(c) ?? 0;
                if (v <= 0) return null;
                return (
                  <div className="fila" key={c}>
                    <div className="nom">{c}</div>
                    <div className="pista">
                      <div className="relleno"
                           style={{ width: `${Math.min(100, (v / baja) * 100)}%`, background: COLOR_CAUSAL[c] }} />
                    </div>
                    <div className="pct">{((v / baja) * 100).toFixed(0)}%</div>
                  </div>
                );
              })
            ) : (
              <p className="qd-sin">Sin pérdida registrada en el día.</p>
            )}
          </div>
        </section>
      </div>

      <p className="nota-pie">
        Importar el maestro vuelve a llenar la columna de SAP de todos los días del archivo.
        Lo escrito a mano vive en otra tabla y no se toca: por eso un día editado sigue
        editado después de importar, y por eso la pantalla muestra las dos cifras cuando
        se apartan. Para devolver un día a lo que dice SAP, usa <b>Volver a lo de SAP</b>.
      </p>
    </div>
  );
}

/* ==================== Una fila de la hoja ==================== */
function Linea({ nombre, ayuda, punto, sap, valor, cambiar, efectivo, editable, soloEscrito }: {
  nombre: string;
  ayuda?: string;
  punto?: string;
  sap: number | null;
  valor: string;
  cambiar: (v: string) => void;
  efectivo: number | null;
  editable: boolean;
  soloEscrito?: boolean;
}) {
  const escrito = valor.trim() !== "";
  const difiere = escrito && sap != null && Math.abs((aNumero(valor) ?? 0) - sap) > 0.5;

  return (
    <div className={"qd-linea" + (escrito ? " tocada" : "")}>
      <div className="qd-nom">
        {punto && <i className="qd-punto" style={{ background: punto }} />}
        <span>
          {nombre}
          {ayuda && <em>{ayuda}</em>}
        </span>
      </div>
      <div className="num sap">{soloEscrito ? "—" : sap == null ? "—" : nf.format(sap)}</div>
      <div className="num esc">
        <div className="qd-caja">
          <input
            inputMode="decimal"
            value={valor}
            disabled={!editable}
            placeholder={soloEscrito ? "—" : sap == null ? "—" : nf.format(sap)}
            onChange={(e) => cambiar(e.target.value)}
            aria-label={`${nombre}, valor escrito a mano`}
          />
          {escrito && editable && (
            <button type="button" className="qd-x" onClick={() => cambiar("")}
                    aria-label={`Borrar lo escrito en ${nombre}`}>
              <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>
      </div>
      <div className={"num vale" + (difiere ? " difiere" : "")}>
        {efectivo == null ? "—" : nf.format(efectivo)}
      </div>
    </div>
  );
}

/* ==================== Cifra grande ==================== */
function Cifra({ rot, n, u, tono, marca }: {
  rot: string; n: string; u: string;
  tono?: "alerta" | "buena";
  marca?: "escrito" | "sap" | "falta";
}) {
  return (
    <div className={"cifra" + (tono ? " " + tono : "")}>
      <div className="rot">{rot}</div>
      <div className="n">{n}</div>
      <div className="u">
        {u}
        {marca === "escrito" && <span className="qd-sello escrito">a mano</span>}
        {marca === "sap" && <span className="qd-sello sap">SAP</span>}
        {marca === "falta" && <span className="qd-sello falta">sin dato</span>}
      </div>
    </div>
  );
}

/* ==================== Tira del mes ====================
   De un vistazo: qué días tienen dato, cuáles están escritos a mano y
   cuáles están en blanco. Es la respuesta a "¿qué me falta reportar?".
   ==================================================== */
function TiraMes({ datos, fecha, hoy, elegir, cargando }: {
  datos: MesDiario; fecha: string; hoy: string;
  elegir: (f: string) => void; cargando: boolean;
}) {
  const a = Number(datos.mes.slice(0, 4));
  const m = Number(datos.mes.slice(5, 7)) - 1;
  const total = diasDelMes(a, m);

  return (
    <div className={"qd-tira" + (cargando ? " cargando" : "")}>
      <div className="qd-tira-rot">
        {MESES_LARGO[m]} {a}
        <span className="qd-leyenda">
          <span><i className="p-esc" />escrito</span>
          <span><i className="p-sap" />importado</span>
          <span><i className="p-no" />en blanco</span>
        </span>
      </div>
      <div className="qd-celdas">
        {Array.from({ length: total }).map((_, i) => {
          const f = aTexto(a, m, i + 1);
          const esc = !!datos.manual[f];
          const s = datos.sap[f];
          const tiene = !!s && (s.produccion > 0 || s.baja !== 0);
          const p = s && s.produccion > 0 ? s.baja / s.produccion : null;
          const sobre = p != null && datos.meta != null && p > datos.meta;
          return (
            <button
              key={f}
              type="button"
              className={[
                "qd-celda",
                f === fecha ? "sel" : "",
                esc ? "esc" : tiene ? "sap" : "no",
                sobre ? "sobre" : "",
                f === hoy ? "hoy" : "",
                f > hoy ? "futuro" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => elegir(f)}
              title={`${bonita(f)}${p != null ? ` · ${pf(p)}` : ""}${esc ? " · escrito a mano" : ""}`}
            >
              <span className="d">{i + 1}</span>
              <span className="q">{p == null ? "·" : pf(p, 1)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ==================== Calendario de un solo día ==================== */
function ElegirDia({ fecha, datos, hoy, elegir }: {
  fecha: string; datos: MesDiario; hoy: string; elegir: (f: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState(() => partes(fecha));

  useEffect(() => { if (abierto) setVista(partes(fecha)); }, [abierto, fecha]);

  useEffect(() => {
    if (!abierto) return;
    const clic = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", clic);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const { a, m } = vista;
  const hueco = primerDia(a, m);
  const dias = diasDelMes(a, m);
  const mover = (paso: number) => {
    const t = new Date(Date.UTC(a, m + paso, 1));
    setVista({ a: t.getUTCFullYear(), m: t.getUTCMonth(), d: 1 });
  };

  return (
    <div className="sel">
      <label>Día</label>
      <div className="calendario" ref={caja}>
        <button type="button" className="disparo ancho" aria-expanded={abierto}
                onClick={() => setAbierto((v) => !v)}>
          <svg className="ico" viewBox="0 0 24 24" fill="none" strokeLinecap="round">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          <span className="txt">{bonita(fecha)}</span>
          <svg className="flecha" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
        </button>

        {abierto && (
          <div className="panel">
            <div className="cal-cuerpo">
              <div className="meses">
                <div className="mes">
                  <div className="mes-cab">
                    <button type="button" aria-label="Mes anterior" onClick={() => mover(-1)}>
                      <svg viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6" /></svg>
                    </button>
                    <div className="titulo-mes">{MESES_LARGO[m]} {a}</div>
                    <button type="button" aria-label="Mes siguiente" onClick={() => mover(1)}>
                      <svg viewBox="0 0 24 24"><path d="M10 6l6 6-6 6" /></svg>
                    </button>
                  </div>
                  <div className="semana">{DIAS_SEM.map((d, i) => <span key={i}>{d}</span>)}</div>
                  <div className="dias">
                    {Array.from({ length: hueco }).map((_, i) => <span key={"h" + i} />)}
                    {Array.from({ length: dias }).map((_, i) => {
                      const f = aTexto(a, m, i + 1);
                      const mismoMes = datos.mes === `${f.slice(0, 7)}-01`;
                      const marca = mismoMes && datos.manual[f] ? " escrito" : "";
                      return (
                        <button key={f} type="button"
                                className={(f === fecha ? "punta inicio fin" : "") + (f === hoy ? " hoy" : "") + marca}
                                onClick={() => { setAbierto(false); elegir(f); }}>
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="cal-pie">
              <div className="resumen">Un día a la vez. <b>{MESES[m]}</b> {a}</div>
              <div className="btns">
                <button type="button" className="cancelar" onClick={() => setAbierto(false)}>Cerrar</button>
                <button type="button" className="aplicar" onClick={() => { setAbierto(false); elegir(hoy); }}>
                  Hoy
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
