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

function pista(col: string, pistas: string[]): number {
  const c = limpia(col);
  /* Exacto vale más que "empieza por", y eso más que "contiene": buscar
     "contiene" de una vez hace que "hl" encuentre "Hl x unidad". */
  for (const p of pistas) if (c === p) return 6;
  for (const p of pistas) if (c.startsWith(p)) return 4;
  for (const p of pistas) if (c.includes(p)) return 2;
  return 0;
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
type Eleccion = { iHoja: number; iCab: number; colCd: number; colHl: number; puntos: number };

/* Cuántas filas se miran para juzgar un candidato. Con 60 ya se distingue
   una hoja de datos de una portada, y no se paga leer diez mil. */
const MUESTRA = 60;

/**
 * QUÉ HOJA Y QUÉ COLUMNAS — decidido por los DATOS.
 *
 * La primera versión escogía la hoja por el nombre y, si no encontraba
 * ninguna con "zlde", se quedaba con la primera que tuviera filas. En un
 * libro que empieza con una Portada eso significaba escoger la Portada,
 * dejar las columnas en blanco y pasarle el problema al que subió el
 * archivo. Eso no es adivinar: es rendirse y disimular.
 *
 * Ahora se prueba cada hoja, cada fila de encabezado y cada par de
 * columnas, y gana el que de verdad TIENE los datos: filas con un texto
 * que parece un CD y, al lado, un número. Una portada saca cero porque
 * no tiene ninguna, por bonitos que sean sus encabezados.
 */
function detectar(hojas: Hoja[]): Eleccion {
  let mejor: Eleccion = { iHoja: 0, iCab: 0, colCd: -1, colHl: -1, puntos: -1 };

  hojas.forEach((h, iHoja) => {
    // Un empujón si la hoja se llama como uno espera, pero no manda.
    const nombre = limpia(h.nombre);
    const bono = nombre.includes("zlde") ? 14
               : /fuente|base|datos|movimiento/.test(nombre) ? 6
               : /portada|resumen|instruc|leeme/.test(nombre) ? -12 : 0;

    const hasta = Math.min(14, h.filas.length - 1);
    for (let iCab = 0; iCab <= hasta; iCab++) {
      const cab = (h.filas[iCab] ?? []).map((x) => String(x ?? ""));
      if (cab.filter((c) => c.trim()).length < 2) continue;

      const fin = Math.min(h.filas.length, iCab + 1 + MUESTRA);
      const anchoMax = Math.min(cab.length, 40);

      for (let cCd = 0; cCd < anchoMax; cCd++) {
        for (let cHl = 0; cHl < anchoMax; cHl++) {
          if (cCd === cHl) continue;
          const pCd = pista(cab[cCd] ?? "", PISTAS.cd);
          const pHl = pista(cab[cHl] ?? "", PISTAS.hl);
          /* Sin ninguna señal en los encabezados no vale la pena probar
             el par: si no, con veinte columnas se prueban cuatrocientas
             combinaciones por fila y gana cualquiera por azar. */
          if (pCd === 0 && pHl === 0) continue;

          let buenas = 0;
          for (let f = iCab + 1; f < fin; f++) {
            const fila = h.filas[f] ?? [];
            const cd = String(fila[cCd] ?? "").trim();
            // Un CD es texto, no un número: así una columna de cifras no
            // se hace pasar por la de nombres.
            if (!cd || aNumero(cd) != null) continue;
            if (/^(total|gran total|total general|suma)/i.test(limpia(cd))) continue;
            if (aNumero(fila[cHl]) == null) continue;
            buenas++;
          }
          if (!buenas) continue;

          const puntos = buenas * 3 + pCd * 2 + pHl * 2 + bono;
          if (puntos > mejor.puntos) mejor = { iHoja, iCab, colCd: cCd, colHl: cHl, puntos };
        }
      }
    }
  });

  return mejor;
}

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
  /* El mapeo empieza ESCONDIDO. Si acertó, subir el archivo y darle
     guardar es todo; si no, se abre. Un formulario de cinco listas
     delante de alguien que solo quería subir un archivo es trabajo que
     yo no supe hacer y le pasé a él. */
  const [verMapa, setVerMapa] = useState(false);
  const [acerto, setAcerto] = useState(false);

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
      setHojas(hs);
      const d = detectar(hs);
      setIHoja(d.iHoja);
      setICab(d.iCab);
      setColCd(d.colCd);
      setColHl(d.colHl);
      const bien = d.colCd >= 0 && d.colHl >= 0;
      setAcerto(bien);
      /* Si no encontró nada, el mapeo se abre solo: no tiene sentido
         esconder lo único que puede arreglar el problema. */
      setVerMapa(!bien);
      if (!bien) {
        setAviso({
          mal: true,
          texto: "No reconocí ninguna hoja con CD de origen y hectolitros. " +
                 "Escoge la hoja y las dos columnas abajo.",
        });
      }
    } catch {
      setAviso({ mal: true, texto: "No se pudo leer ese archivo. Tiene que ser .xlsx, .xls o .csv." });
    }
  }

  /* Cuando alguien cambia de hoja a mano se vuelve a detectar DENTRO de
     esa hoja: si se dejaran las columnas de la hoja anterior, los índices
     apuntarían a otra cosa y el resultado sería basura con cara de dato. */
  function elegir(hs: Hoja[], i: number) {
    const d = detectar([hs[i]]);
    setIHoja(i);
    setICab(d.iCab);
    setColCd(d.colCd);
    setColHl(d.colHl);
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
            <h2>El archivo de ZLDE</h2>
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
            Busca la hoja y las columnas por los datos que tienen, no por cómo se llamen.
            Si se equivoca se corrige, y nada se guarda hasta que lo apruebes.
          </p>
        </div>
      </section>

      {/* ---------- Qué leyó ---------- */}
      {!!hojas.length && acerto && !verMapa && (
        <section className="zl-leyo">
          <p>
            <b>Leí la hoja «{hoja?.nombre}»</b>, el CD de origen en «{cols[colCd]}» y los
            hectolitros en «{cols[colHl]}». Si está bien, no tienes que tocar nada más:
            revisa la tabla y guarda.
          </p>
          <button type="button" className="btn plano" onClick={() => setVerMapa(true)}>
            Cambiar lo que leyó
          </button>
        </section>
      )}

      {/* ---------- El mapeo, solo si hace falta ---------- */}
      {!!hojas.length && verMapa && (
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>Qué columna es qué</h2>
              <p>
                Si el export cambió de forma, aquí se arregla sin tocar código. Los CD que
                no estén en el maestro se van a guardar igual, marcados, para que se vean
                en el seguimiento y no se pierdan.
              </p>
            </div>
            {acerto && (
              <button type="button" className="btn plano" onClick={() => setVerMapa(false)}>
                Listo
              </button>
            )}
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
                /* Con el encabezado fijado a mano, se buscan las columnas
                   solo con esa fila: los índices de la fila anterior
                   apuntarían a otras columnas. */
                const cab = (hoja.filas[f] ?? []).map((x) => String(x ?? ""));
                let cd = -1, hl = -1, pc = 0, ph = 0;
                cab.forEach((c, i) => {
                  const a = pista(c, PISTAS.cd), b = pista(c, PISTAS.hl);
                  if (a > pc) { pc = a; cd = i; }
                  if (b > ph) { ph = b; hl = i; }
                });
                setColCd(cd);
                setColHl(hl);
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
              <h2>Lo que va a quedar</h2>
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
