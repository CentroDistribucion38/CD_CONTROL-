"use client";

/**
 * CARGAR ZLDE — el HL EER recibido por CD.
 *
 * ZLDE es un export de SAP y su formato se mueve: cambian los nombres de
 * las columnas, aparece una nueva, el pivote sale con otro orden. Por eso
 * esto NO asume una plantilla: lee los encabezados, adivina cuál es cuál
 * y deja CORREGIR la elección antes de guardar. Una plantilla fija
 * funciona hasta el mes en que alguien exporta distinto, y entonces
 * falla en silencio o con un error que no dice nada.
 *
 * Y se muestra lo que va a quedar ANTES de guardar. Importar a ciegas es
 * como se meten los datos malos que después nadie sabe de dónde salieron.
 */

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { MESES_LARGO } from "@/modulos/sider/comun";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });

/* Cómo se llama cada cosa en las versiones del export que hemos visto.
   Se compara sin tildes ni mayúsculas, así que "Centro de Origen",
   "CENTRO DE ORIGEN" y "centro origen" caen en el mismo sitio. */
const PISTAS = {
  cd: ["cd origen", "centro de origen", "centro origen", "cd de origen", "planta origen",
       "etiquetas de fila", "cd", "origen"],
  hl: ["hectolitros", "hl", "suma de hectolitros", "suma de hl", "hl eer", "cantidad"],
  planta: ["planta", "cd destino", "centro"],
  clase: ["clase", "tipo", "familia"],
};

const limpia = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function adivina(cols: string[], pistas: string[]): number {
  /* Primero exacto, después "empieza por", y solo al final "contiene":
     buscar "contiene" de una vez hace que "hl" encuentre "Hl x unidad". */
  for (const p of pistas) {
    const i = cols.findIndex((c) => limpia(c) === p);
    if (i >= 0) return i;
  }
  for (const p of pistas) {
    const i = cols.findIndex((c) => limpia(c).startsWith(p));
    if (i >= 0) return i;
  }
  for (const p of pistas) {
    const i = cols.findIndex((c) => limpia(c).includes(p));
    if (i >= 0) return i;
  }
  return -1;
}

/** "1.234,5" y "1,234.5" son el mismo número escrito por dos SAP. */
function aNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let t = v.trim().replace(/\s|HL/gi, "");
  if (!t) return null;
  const coma = t.lastIndexOf(","), punto = t.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    // El último separador es el decimal; el otro es de miles.
    t = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (coma >= 0) {
    // Con una sola coma: decimal si deja dos o menos dígitos detrás.
    t = t.length - coma - 1 <= 3 && !/,\d{3}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

type Hoja = { nombre: string; filas: unknown[][] };
type Fila = { cd_origen: string; hl: number };

export function Zlde({ origenes, ultimos }: {
  origenes: { cd_origen: string; activo: boolean }[];
  ultimos: { mes: string; cd: number; hl: number }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);

  const [archivo, setArchivo] = useState<string | null>(null);
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const [iHoja, setIHoja] = useState(0);
  const [iCab, setICab] = useState(0);
  const [colCd, setColCd] = useState(-1);
  const [colHl, setColHl] = useState(-1);
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  const hoja = hojas[iHoja];
  const cols = useMemo<string[]>(() => {
    if (!hoja) return [];
    const f = hoja.filas[iCab] ?? [];
    return f.map((c, i) => (c == null || String(c).trim() === "" ? `Columna ${i + 1}` : String(c)));
  }, [hoja, iCab]);

  /** Los CD conocidos, para saber cuáles del archivo van a quedar sueltos. */
  const conocidos = useMemo(
    () => new Set(origenes.map((o) => limpia(o.cd_origen))),
    [origenes]
  );

  const filas = useMemo<Fila[]>(() => {
    if (!hoja || colCd < 0 || colHl < 0) return [];
    const acum = new Map<string, number>();
    for (let i = iCab + 1; i < hoja.filas.length; i++) {
      const f = hoja.filas[i] ?? [];
      const cd = String(f[colCd] ?? "").trim();
      const hl = aNumero(f[colHl]);
      if (!cd || hl == null) continue;
      /* Las filas de total del pivote se cuelan y duplicarían todo. */
      if (/^(total|gran total|total general|suma)/i.test(limpia(cd))) continue;
      acum.set(cd, (acum.get(cd) ?? 0) + hl);
    }
    return [...acum].map(([cd_origen, hl]) => ({ cd_origen, hl }))
                    .sort((a, b) => b.hl - a.hl);
  }, [hoja, iCab, colCd, colHl]);

  const total = filas.reduce((s, f) => s + f.hl, 0);
  const sueltos = filas.filter((f) => !conocidos.has(limpia(f.cd_origen)));

  async function leer(f: File) {
    setAviso(null);
    setArchivo(f.name);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: false });
      const hs: Hoja[] = wb.SheetNames.map((n) => ({
        nombre: n,
        filas: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], {
          header: 1, blankrows: false, defval: null, raw: true,
        }),
      })).filter((h) => h.filas.length > 1);
      if (!hs.length) {
        setAviso({ mal: true, texto: "Ese archivo no tiene ninguna hoja con datos." });
        return;
      }
      /* Se arranca en la hoja que más se parezca a ZLDE, y si ninguna,
         en la primera con datos. */
      const i = Math.max(0, hs.findIndex((h) => limpia(h.nombre).includes("zlde")));
      setHojas(hs);
      elegir(hs, i);
    } catch {
      setAviso({ mal: true, texto: "No se pudo leer ese archivo. Tiene que ser .xlsx, .xls o .csv." });
    }
  }

  /* Al cambiar de hoja se busca el encabezado y se vuelve a adivinar: si
     se dejaran las columnas de la hoja anterior, los índices apuntarían
     a otra cosa y el resultado sería basura con cara de dato. */
  function elegir(hs: Hoja[], i: number) {
    setIHoja(i);
    const h = hs[i];
    let mejor = 0, puntos = -1;
    for (let f = 0; f < Math.min(12, h.filas.length); f++) {
      const c = (h.filas[f] ?? []).map((x) => String(x ?? ""));
      const p = (adivina(c, PISTAS.cd) >= 0 ? 2 : 0) + (adivina(c, PISTAS.hl) >= 0 ? 2 : 0)
              + c.filter((x) => x.trim()).length / 100;
      if (p > puntos) { puntos = p; mejor = f; }
    }
    setICab(mejor);
    const c = (h.filas[mejor] ?? []).map((x) => String(x ?? ""));
    setColCd(adivina(c, PISTAS.cd));
    setColHl(adivina(c, PISTAS.hl));
  }

  async function guardar() {
    if (!filas.length) return;
    setGuardando(true);
    setAviso(null);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cli = supabase as any;
    const { data, error } = await cli.rpc("sider_zlde_guardar", {
      p_mes: `${mes}-01`,
      p_filas: filas,
    });
    setGuardando(false);
    if (error) {
      setAviso({
        mal: true,
        texto: /does not exist|schema cache|function/i.test(error.message)
          ? "Falta correr supabase/modulos/sider.sql en Supabase: creció con la tabla de ZLDE."
          : error.message,
      });
      return;
    }
    setAviso({
      mal: false,
      texto: `Quedaron ${data} CD de ${MESES_LARGO[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}` +
             ` con ${nf.format(total)} HL en total.`,
    });
    router.refresh();
  }

  return (
    <>
      {/* ---------- El archivo ---------- */}
      <section className="tarjeta">
        <div className="cab">
          <div>
            <h2>1 · El archivo de ZLDE</h2>
            <p>
              El pivote de ZLDE con <b>Planta = Barranquilla</b> y <b>Clase = EER</b>,
              agrupado por CD de origen. Sirve el .xlsx tal como sale, o un .csv.
            </p>
          </div>
        </div>
        <div className="zl-suelta">
          <input
            ref={entrada} type="file" accept=".xlsx,.xls,.csv" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ""; }}
          />
          <button type="button" className="ct-grande" onClick={() => entrada.current?.click()}>
            {archivo ? `Cambiar archivo · ${archivo}` : "Escoger el archivo de ZLDE"}
          </button>
          <p className="zl-ojo">
            Lee los encabezados y adivina las columnas, pero no adivina bien siempre: en el
            paso 2 se puede corregir. Nada se guarda hasta que lo apruebes.
          </p>
        </div>
      </section>

      {/* ---------- El mapeo ---------- */}
      {!!hojas.length && (
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>2 · Qué columna es qué</h2>
              <p>
                Si el export cambió de forma, aquí se arregla sin tocar código. Los CD que
                no estén en el maestro se van a guardar igual, marcados, para que se vean
                en el seguimiento y no se pierdan.
              </p>
            </div>
          </div>
          <div className="zl-mapa">
            <label>
              <span>Hoja</span>
              <select value={iHoja} onChange={(e) => elegir(hojas, Number(e.target.value))}>
                {hojas.map((h, i) => (
                  <option key={h.nombre} value={i}>{h.nombre} ({h.filas.length} filas)</option>
                ))}
              </select>
            </label>
            <label>
              <span>Fila del encabezado</span>
              <select value={iCab} onChange={(e) => {
                const f = Number(e.target.value);
                setICab(f);
                const c = (hoja.filas[f] ?? []).map((x) => String(x ?? ""));
                setColCd(adivina(c, PISTAS.cd));
                setColHl(adivina(c, PISTAS.hl));
              }}>
                {hoja.filas.slice(0, 15).map((f, i) => (
                  <option key={i} value={i}>
                    Fila {i + 1} — {(f ?? []).filter(Boolean).slice(0, 3).join(" · ").slice(0, 46) || "(vacía)"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>CD de origen</span>
              <select value={colCd} onChange={(e) => setColCd(Number(e.target.value))}>
                <option value={-1}>— escoger —</option>
                {cols.map((c, i) => <option key={i} value={i}>{c}</option>)}
              </select>
            </label>
            <label>
              <span>Hectolitros</span>
              <select value={colHl} onChange={(e) => setColHl(Number(e.target.value))}>
                <option value={-1}>— escoger —</option>
                {cols.map((c, i) => <option key={i} value={i}>{c}</option>)}
              </select>
            </label>
            <label>
              <span>Mes al que pertenece</span>
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
            </label>
          </div>
        </section>
      )}

      {/* ---------- Lo que va a quedar ---------- */}
      {!!hojas.length && (
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>3 · Lo que va a quedar</h2>
              <p>
                {filas.length
                  ? <>Se van a guardar <b>{filas.length} CD</b> con{" "}
                     <b>{nf.format(total)} HL</b>. Cargar un mes <b>reemplaza</b> ese mes
                     completo: el archivo de ZLDE es la foto del mes entero, así que un CD
                     que ya no aparece es un CD que dejó de tener movimiento.</>
                  : "Escoge las dos columnas para ver el resultado."}
              </p>
            </div>
            <button type="button" className="btn" disabled={!filas.length || guardando}
                    onClick={guardar}>
              {guardando ? "Guardando…" : `Guardar ${MESES_LARGO[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`}
            </button>
          </div>

          {!!sueltos.length && (
            <p className="sg-aparte">
              <b>{sueltos.length} de estos nombres no está{sueltos.length > 1 ? "n" : ""} en el
              maestro</b>: {sueltos.map((s) => s.cd_origen).join(" · ")}. Se guardan igual y
              el seguimiento los muestra marcados, pero no entran en ningún total hasta que
              el nombre coincida.
            </p>
          )}

          {!!filas.length && (
            <div className="marco sg-marco chico">
              <table>
                <thead>
                  <tr><th>CD de origen</th><th className="num">Hectolitros</th></tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.cd_origen}>
                      <td className={conocidos.has(limpia(f.cd_origen)) ? undefined : "apagado"}>
                        {f.cd_origen}
                        {!conocidos.has(limpia(f.cd_origen)) && <div className="cod">no está en el maestro</div>}
                      </td>
                      <td className="num">{nf.format(f.hl)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td>Total general</td><td className="num">{nf.format(total)}</td></tr>
                </tfoot>
              </table>
            </div>
          )}
          {aviso && <div className={"aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
        </section>
      )}

      {/* ---------- Lo que ya está cargado ---------- */}
      {!!ultimos.length && (
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>Meses ya cargados</h2>
              <p>Volver a cargar un mes lo reemplaza completo.</p>
            </div>
          </div>
          <div className="marco">
            <table>
              <thead>
                <tr><th>Mes</th><th className="num">CD</th><th className="num">Hectolitros</th></tr>
              </thead>
              <tbody>
                {ultimos.map((u) => (
                  <tr key={u.mes}>
                    <td>{MESES_LARGO[Number(u.mes.slice(5, 7)) - 1]} {u.mes.slice(0, 4)}</td>
                    <td className="num">{u.cd}</td>
                    <td className="num">{nf.format(u.hl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
