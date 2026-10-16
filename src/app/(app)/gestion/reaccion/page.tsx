import "../../inventario/fefo.css";
import "../gestion.css";
import "../mapa.css";
import "../referencia.css";
import Link from "next/link";
import { AREAS_ARBOL, type AreaArbol, type CeldaArbol } from "@/modulos/gestion/referencia/arbol-datos";
import { DIAGRAMAS } from "@/modulos/gestion/referencia/diagramas-datos";
import { Diagrama } from "../Diagrama";

export const dynamic = "force-dynamic";

/**
 * GESTIÓN · PLAN DE REACCIÓN — el «Árbol de KPI y Planes de Reacción» de Logística, tal como está en el Excel:
 * por cada área, el árbol de indicadores (dónde se mide, qué se controla, PI y SIC) y el plan de reacción
 * (FALLO → CAUSA → VERIFICACIÓN DE LA CAUSA → ACCIÓN). Es de consulta: los datos salen de src/modulos/gestion/referencia.
 */
/* Primero lo del inventario (pasivos, quiebra, envase), luego el resto en el orden del libro. */
const ORDEN = ["pasivos", "quiebra", "dcbl", "ftct", "wnp", "cero-exposicion", "wqi", "maquila-exportacion", "maquila-nacional", "fpa", "ppa", "ira"];
const AREAS = [...AREAS_ARBOL].sort((a, b) => ORDEN.indexOf(a.id) - ORDEN.indexOf(b.id));

const sinTilde = (t: string) => Array.from(t).map((c) => c.normalize("NFD")[0]).join("").toLowerCase();

/** Resalta lo buscado sin importar tildes ni mayúsculas (la posición se conserva: una letra por letra). */
function Resaltado({ t, q }: { t: string; q: string }) {
  if (!q) return <>{t}</>;
  const a = sinTilde(t), b = sinTilde(q);
  const partes: React.ReactNode[] = [];
  let i = 0, k = 0;
  while (i < t.length) {
    const j = a.indexOf(b, i);
    if (j < 0) break;
    if (j > i) partes.push(t.slice(i, j));
    partes.push(<mark key={k++}>{t.slice(j, j + b.length)}</mark>);
    i = j + b.length;
  }
  partes.push(t.slice(i));
  return <>{partes}</>;
}

function tipoCelda(c: CeldaArbol, heads: CeldaArbol[]): string {
  if (c.h) return "h";
  let h: CeldaArbol | null = null;
  for (const x of heads) if (x.c <= c.c && (!h || x.c >= h.c)) h = x;
  const t = (h?.t ?? "").toUpperCase();
  if (t.startsWith("KPI")) return "kpi";
  if (t.startsWith("SIC")) return "sic";
  if (t.startsWith("PI")) return "pi";
  if (t.startsWith("CAUSA")) return "causa";
  return "";
}

function Rejilla({ a }: { a: AreaArbol }) {
  const heads = a.celdas.filter((c) => c.h);
  const filas = Array.from({ length: a.filas }, (_, i) => (a.huecos.includes(i + 1) ? "6px" : "auto")).join(" ");
  return (
    <div className="rf-scroll">
      <div className="rf-rejilla" style={{ gridTemplateColumns: `repeat(${a.cols}, minmax(160px, 1fr))`, gridTemplateRows: filas }}>
        {a.celdas.map((c, i) => (
          <div key={i} className={"rf-c " + tipoCelda(c, heads)} style={{ gridRow: `${c.r} / span ${c.rs}`, gridColumn: `${c.c} / span ${c.cs}` }}>{c.t}</div>
        ))}
      </div>
    </div>
  );
}

type Fila = AreaArbol["plan"][number] & { area?: string };

function TablaPlan({ filas, q, conArea }: { filas: Fila[]; q: string; conArea: boolean }) {
  return (
    <div className="rf-scroll">
      <table className="rf-plan">
        <thead>
          <tr>{conArea && <th>Área</th>}<th>Fallo</th><th>Causa</th><th>Verificación de la causa</th><th>Acción</th></tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              {conArea && <td className="ar"><span>{f.area}</span></td>}
              <td className="f"><Resaltado t={f.fallo} q={q} /></td>
              <td><Resaltado t={f.causa} q={q} /></td>
              <td><Resaltado t={f.verificacion} q={q} /></td>
              <td>{f.accion.length > 1
                ? <ul>{f.accion.map((l, k) => <li key={k}><Resaltado t={l} q={q} /></li>)}</ul>
                : <Resaltado t={f.accion[0] ?? ""} q={q} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReaccionPage({ searchParams }: { searchParams: Promise<{ area?: string; q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const todas = sp.area === "todas";
  const area = todas ? null : (AREAS.find((a) => a.id === sp.area) ?? AREAS[0]);
  const total = AREAS.reduce((s, a) => s + a.plan.length, 0);
  const coincide = (f: Fila) => !q || sinTilde([f.fallo, f.causa, f.verificacion, ...f.accion].join(" ")).includes(sinTilde(q));
  const href = (id: string) => `/gestion/reaccion?area=${id}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  const filas: Fila[] = (todas ? AREAS.flatMap((a) => a.plan.map((p) => ({ ...p, area: a.nombre }))) : (area?.plan ?? [])).filter(coincide);
  const diagrama = area?.diagrama ? DIAGRAMAS.find((d) => d.id === area.diagrama) : undefined;

  return (
    <div className="fe gs gm rf">
      <section className="cabeza">
        <div>
          <p className="ojo">GESTIÓN · PLAN DE REACCIÓN</p>
          <h1>Árbol de KPI y plan de reacción</h1>
          <p className="sub">
            Cómo se mide cada indicador de Logística y qué se hace cuando falla: <b>fallo → causa → verificación de la causa → acción</b>.
            Viene del Excel «Árbol KPI y Planes de Reacción»; lo que se mide cada día está en <Link href="/gestion/arbol">Árbol de KPI</Link>.
          </p>
        </div>
      </section>

      <nav className="rf-chips" aria-label="Área">
        {AREAS.map((a) => (
          <Link key={a.id} href={href(a.id)} className={!todas && area?.id === a.id ? "on" : ""}>{a.nombre}{a.plan.length > 0 && <small>{a.plan.length}</small>}</Link>
        ))}
        <Link href={href("todas")} className={todas ? "on" : ""}>Todos los planes<small>{total}</small></Link>
      </nav>

      {area && (
        <section className="rf-sec">
          <h2>Árbol de indicadores · {area.nombre}</h2>
          <p className="rf-titulo">{area.titulo}</p>
          {area.nota && <p className="rf-nota">{area.nota}</p>}
          {diagrama ? <Diagrama d={diagrama} /> : area.celdas.length === 0 ? null : (
            <>
              <Rejilla a={area} />
              <div className="rf-ley">
                <span><i className="k" />KPI</span><span><i className="p" />PI (indicador de proceso)</span><span><i className="s" />SIC</span>
                <span>La hoja se muestra como está en el Excel: cada fila agrupa lo que va junto.</span>
              </div>
            </>
          )}
          {area.extras && (
            <div className="rf-extras" aria-label="También se mide">
              {area.extras.map((e, i) => <div key={i}><b>También se mide</b>{e.map((l) => <div key={l}>{l}</div>)}</div>)}
            </div>
          )}
        </section>
      )}

      <section className="rf-sec">
        <h2>Plan de reacción{area ? ` · ${area.nombre}` : " · todas las áreas"} <small>{filas.length} {filas.length === 1 ? "fila" : "filas"}</small></h2>
        <form className="rf-buscar" action="/gestion/reaccion" method="get">
          <input type="hidden" name="area" value={todas ? "todas" : (area?.id ?? "")} />
          <label>Buscar en fallo, causa o acción
            <input name="q" defaultValue={q} placeholder="Ej. montacargas, extrasucio, ausentismo" />
          </label>
          <button type="submit">Buscar</button>
          {q && <Link href={`/gestion/reaccion?area=${todas ? "todas" : area?.id}`}>Quitar filtro</Link>}
          {q && !todas && <Link href={`/gestion/reaccion?area=todas&q=${encodeURIComponent(q)}`}>Buscar en todas las áreas</Link>}
        </form>
        {filas.length
          ? <TablaPlan filas={filas} q={q} conArea={todas} />
          : <p className="rf-vacio">{q ? "Nada coincide con esa búsqueda en este alcance." : `El Excel no trae plan de reacción para ${area?.nombre}.`}</p>}
      </section>
    </div>
  );
}
