import Link from "next/link";
import { MODULOS_DE_LA_HOJA } from "@/modulos/inventario/modulos-hoja";
import { fechaConDia } from "@/modulos/inventario/fiscal";
import { cargarFiscales } from "../datos";
import { BarraPlanillas } from "./BarraPlanillas";
import "./planillas.css";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · PLAN FISCAL · PLANILLAS DE CONTEO.
 * Una planilla por pareja (por hoja), lista para imprimir en carta horizontal: el logo de Bavaria, el inventario, la hoja,
 * la calle con sus módulos, los dos contadores y, abajo, dos cuadros LIBRES para que firmen los responsables
 * (del operador logístico y de Bavaria). Se imprime o se guarda en PDF desde el navegador.
 */
const FILAS = 20; /* renglones por página */
const ancho = (n: number) => String(n).padStart(2, "0");

/** Los renglones de módulo de una calle, en el orden en que se recorre: 01 IZQ, 01 DER, 02 IZQ… y los que no tienen lado, sueltos. */
function modulosDe(calle: string): string[] {
  const lista = MODULOS_DE_LA_HOJA[calle] ?? [];
  const out: string[] = [];
  for (const m of lista) {
    if (/^\d/.test(m)) { out.push(`${calle}${m} IZQ`, `${calle}${m} DER`); } else { out.push(`${calle} ${m}`); }
  }
  return out;
}

export default async function PlanillasPage({ searchParams }: { searchParams: Promise<{ fiscal?: string; hoja?: string }> }) {
  const q = await searchParams;
  const r = await cargarFiscales();
  if ("fallo" in r) return r.fallo;
  const { fiscales, personas } = r.datos;
  const f = fiscales.find((x) => x.id === q.fiscal);
  if (!f) {
    return (
      <div className="pl">
        <p className="pl-vacio">Escoge un inventario fiscal en el <Link href="/inventario/fiscal">Plan fiscal</Link> y toca el icono de la impresora.</p>
      </div>
    );
  }
  const nombre = new Map(personas.map((p) => [p.id, p.nombre]));
  const soloHoja = Number(q.hoja);
  const hojas = f.hojas.filter((h) => !soloHoja || h.numero === soloHoja);
  const paginasDe = hojas.map((h) => {
    const mods = h.calle ? modulosDe(h.calle) : [];
    const n = Math.max(1, Math.ceil(mods.length / FILAS));
    return { h, mods, n };
  });
  const total = paginasDe.reduce((t, p) => t + p.n, 0);
  const hoy = new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="pl">
      <BarraPlanillas>
        <b>{f.nombre}</b>
        <span>{fechaConDia(f.fecha)} · {hojas.length} {hojas.length === 1 ? "planilla" : "planillas"} · {total} {total === 1 ? "página" : "páginas"} carta horizontal</span>
        <span className="pl-filtro">
          <Link href={`/inventario/fiscal/planillas?fiscal=${f.id}`} className={!soloHoja ? "on" : ""}>Todas</Link>
          {f.hojas.map((h) => <Link key={h.numero} href={`/inventario/fiscal/planillas?fiscal=${f.id}&hoja=${h.numero}`} className={soloHoja === h.numero ? "on" : ""}>Hoja {h.numero}</Link>)}
        </span>
      </BarraPlanillas>
      {hojas.length === 0 && <p className="pl-vacio">Este inventario todavía no tiene hojas. Arma las parejas en el Plan fiscal.</p>}
      {paginasDe.flatMap(({ h, mods, n }) => Array.from({ length: n }, (_, i) => {
        const trozo = mods.slice(i * FILAS, (i + 1) * FILAS);
        const filas = Array.from({ length: FILAS }, (_, k) => trozo[k] ?? "");
        const numerados = h.calle ? (MODULOS_DE_LA_HOJA[h.calle] ?? []).filter((m) => /^\d/.test(m)) : [];
        const ol = h.ol ? (nombre.get(h.ol) ?? "—") : "";
        const bav = h.bavaria ? (nombre.get(h.bavaria) ?? "—") : "";
        return (
          <section key={`${h.numero}-${i}`} className="pl-pg" aria-label={`Planilla hoja ${h.numero}, página ${i + 1} de ${n}`}>
            <div className="pl-hd">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca/logo-bavaria.png" alt="Bavaria" />
              <div className="pl-tit"><b>PLANILLA DE CONTEO</b><span>Inventario fiscal · producto terminado y envase</span></div>
              <div className="pl-hoja"><small>HOJA</small><b>{h.numero}</b></div>
            </div>
            <div className="pl-regla" />
            <div className="pl-meta">
              <div><small>Inventario</small><b>{f.nombre}</b></div>
              <div><small>Fecha</small><b>{fechaConDia(f.fecha)}</b></div>
              <div><small>Inicio</small><b className="blanco" /></div>
              <div><small>Final</small><b className="blanco" /></div>
              <div><small>Calle</small><b>{h.calle ? `Calle ${h.calle}` : ""}</b></div>
              <div><small>Página</small><b>{i + 1} de {n}</b></div>
            </div>
            <div className="pl-par">
              <div><span><small>Contador · Operador logístico{numerados.length > 1 ? ` · ${numerados[0]} → ${numerados[numerados.length - 1]}` : ""}</small><b>{ol}</b></span><i /></div>
              <div><span><small>Contador · Bavaria{numerados.length > 1 ? ` · ${numerados[numerados.length - 1]} → ${numerados[0]}` : ""}</small><b>{bav}</b></span><i /></div>
            </div>
            <table className="pl-t">
              <thead><tr>
                <th>Módulo</th><th style={{ width: 96 }}>Código</th><th>Descripción</th><th style={{ width: 62 }}>Uds caja</th><th style={{ width: 70 }}>Estibas</th>
                <th style={{ width: 70 }}>Saldo<br />(sueltas)</th><th style={{ width: 76 }}>Cajas</th><th style={{ width: 86 }}>Total cajas</th><th style={{ width: 150 }}>Observación</th>
              </tr></thead>
              <tbody>{filas.map((m, k) => (
                <tr key={k}><td className="m">{m}</td>{Array.from({ length: 8 }, (_, c) => <td key={c} />)}</tr>
              ))}</tbody>
            </table>
            <div className="pl-pie">
              <div className="pl-firma"><b>Responsable OL</b><small>nombre completo y firma</small></div>
              <div className="pl-mini">{f.nombre} · Hoja {h.numero} · generada por CONTROL CD38 · {hoy}</div>
              <div className="pl-firma"><b>Responsable Bavaria</b><small>nombre completo y firma</small></div>
            </div>
          </section>
        );
      }))}
    </div>
  );
}
