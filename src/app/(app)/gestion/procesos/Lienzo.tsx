"use client";

import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MiniMap, NodeResizer, NodeToolbar, Handle, Position,
  ConnectionMode, MarkerType, useReactFlow, useNodesState, useEdgesState, addEdge, getNodesBounds, getViewportForBounds,
  type Node, type Edge, type NodeProps, type Connection, type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toPng } from "html-to-image";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import { Selector } from "@/components/Selector";
import { CRITICIDAD } from "@/modulos/gestion/referencia/criticidad-datos";
import {
  COLORES, GRID, ORDEN_TIPOS, TIPOS, nuevoId, ordenar, zonaDe,
  type DocLienzo, type Fig, type Lado, type TipoFig, type Union, type Zona,
} from "@/modulos/gestion/lienzo/doc";
import { guardarLienzo, restaurarLienzo } from "./actions";
import "./lienzo.css";

/**
 * EL MAPA DE PROCESOS COMO LIENZO.
 *
 * Mezcla de las tres opciones que se mostraron:
 *   · IZQUIERDA (C): el árbol del diagrama — cada zona (N1/N2/N3 o las columnas del flujo) con sus figuras. Se busca,
 *     y un toque lleva el lienzo hasta la figura; tocar una zona «entra» a ella (Esc o «Ver todo» para salir).
 *   · CENTRO (B): el lienzo: rueda o dos dedos para acercar, arrastrar para moverse, barra flotante de figuras (clic
 *     para agregar o arrastrarla al sitio), mini mapa, y sobre la figura escogida una barrita con lo de siempre.
 *   · DERECHA (A + C): la ficha de lo escogido — texto, tipo, color, el PI ligado y la criticidad de la actividad; con
 *     varias escogidas, alinear y repartir; sin nada escogido, la leyenda de colores.
 *   · «ORDENAR» acomoda todo solo (se puede deshacer). Se guarda solo, a los segundos de cada cambio.
 */

export type PiLienzo = { id: string; codigo: string; nombre: string };
type FigData = { tipo: TipoFig; t: string; color?: string | null; pi?: string | null };
type ZonaData = { t: string; i: number };
type FigNode = Node<FigData, "fig">;
type ZonaNode = Node<ZonaData, "zona">;
type NodoLz = FigNode | ZonaNode;
type UnionData = { flecha: Union["flecha"] };
type EdgeLz = Edge<UnionData>;

const COLOR_LINEA = "#5B6472";
const sinTilde = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const oscuro = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
};
const POS: Record<Lado, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left };

/* ---------------------------------------------------------------- del documento a nodos y de vuelta */
const marca = (flecha: Union["flecha"], donde: "fin" | "ini") =>
  flecha === "ambas" || (flecha === "fin" && donde === "fin") ? { type: MarkerType.ArrowClosed, color: COLOR_LINEA, width: 18, height: 18 } : undefined;

function aEdge(u: Union): EdgeLz {
  return {
    id: u.id, source: u.de, target: u.a, sourceHandle: u.deLado, targetHandle: u.aLado, type: "step",
    label: u.t || undefined, data: { flecha: u.flecha }, markerEnd: marca(u.flecha, "fin"), markerStart: marca(u.flecha, "ini"),
  };
}
function aNodos(doc: DocLienzo, editable: boolean): NodoLz[] {
  const zonas: ZonaNode[] = doc.zonas.map((z, i) => ({
    id: z.id, type: "zona", position: { x: z.x, y: z.y }, width: z.w, height: z.h, zIndex: -1, draggable: false,
    data: { t: z.t, i }, selectable: editable,
  }));
  const figs: FigNode[] = doc.figuras.map((f) => ({
    id: f.id, type: "fig", position: { x: f.x, y: f.y }, width: f.w, height: f.h, draggable: editable,
    data: { tipo: f.tipo, t: f.t, color: f.color ?? null, pi: f.pi ?? null },
  }));
  return [...zonas, ...figs];
}
const ancho = (n: NodoLz) => n.width ?? n.measured?.width ?? 100;
const alto = (n: NodoLz) => n.height ?? n.measured?.height ?? 40;
function aDoc(nodes: NodoLz[], edges: EdgeLz[]): DocLienzo {
  const figuras: Fig[] = [], zonas: Zona[] = [];
  for (const n of nodes) {
    const r = { x: Math.round(n.position.x), y: Math.round(n.position.y), w: Math.round(ancho(n)), h: Math.round(alto(n)) };
    if (n.type === "zona") zonas.push({ id: n.id, t: (n.data as ZonaData).t, ...r });
    else {
      const d = n.data as FigData;
      figuras.push({ id: n.id, tipo: d.tipo, t: d.t, ...r, ...(d.color ? { color: d.color } : {}), ...(d.pi ? { pi: d.pi } : {}) });
    }
  }
  const uniones: Union[] = edges.map((e) => ({
    id: e.id, de: e.source, a: e.target, deLado: (e.sourceHandle ?? "r") as Lado, aLado: (e.targetHandle ?? "l") as Lado,
    flecha: e.data?.flecha ?? "fin", ...(typeof e.label === "string" && e.label ? { t: e.label } : {}),
  }));
  return { v: 1, figuras, zonas, uniones };
}

/* ---------------------------------------------------------------- las formas */
function trazo(forma: (typeof TIPOS)[TipoFig]["forma"], w: number, h: number): string {
  switch (forma) {
    case "chevron": { const a = Math.min(18, w * 0.14); return `M1,1 H${w - a} L${w - 1},${h / 2} L${w - a},${h - 1} H1 L${a},${h / 2} Z` }
    case "paralelo": { const a = Math.min(16, w * 0.12); return `M${a},1 H${w - 1} L${w - a},${h - 1} H1 Z` }
    case "rombo": return `M${w / 2},1 L${w - 1},${h / 2} L${w / 2},${h - 1} L1,${h / 2} Z`;
    case "doc": return `M1,1 H${w - 1} V${h - 12} C${w * 0.75},${h - 26} ${w * 0.25},${h + 4} 1,${h - 10} Z`;
    default: return `M1,1 H${w - 1} V${h - 1} H1 Z`;
  }
}
function Silueta({ tipo, w = 30, h = 20 }: { tipo: TipoFig; w?: number; h?: number }) {
  const t = TIPOS[tipo];
  if (t.forma === "texto") return <svg width={w} height={h} aria-hidden="true"><text x={w / 2} y={h / 2 + 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#4B5563">T</text></svg>;
  return (
    <svg width={w} height={h} aria-hidden="true">
      <path d={trazo(t.forma, w, h)} fill={t.fondo} stroke={t.borde} strokeWidth="1.5" />
      {t.franja && <rect x="1" y="1" width="3" height={h - 2} fill={t.franja} />}
    </svg>
  );
}

/* ---------------------------------------------------------------- lo que comparten las figuras */
type Ctx = {
  editable: boolean; editando: string | null; setEditando: (id: string | null) => void;
  escribir: (id: string, t: string) => void; crit: (t: string) => number | null; siguiente: (id: string) => void;
  duplicar: (ids: string[]) => void; borrar: (ids: string[]) => void; soloUna: string | null;
};
const LzCtx = createContext<Ctx | null>(null);

const FiguraNodo = memo(function FiguraNodo({ id, data, selected, width, height }: NodeProps<FigNode>) {
  const c = useContext(LzCtx)!;
  const t = TIPOS[data.tipo];
  const w = width ?? t.w, h = height ?? t.h;
  const fondo = data.color ?? t.fondo;
  const color = data.color ? (oscuro(fondo) ? "#FFFFFF" : t.texto === "#FFFFFF" ? "#14171C" : t.texto) : t.texto;
  const editando = c.editando === id;
  const [borrador, setBorrador] = useState(data.t);
  useEffect(() => { if (editando) setBorrador(data.t) }, [editando, data.t]);
  const cr = data.tipo === "etiqueta" ? null : c.crit(data.t);
  const fin = (guardar: boolean) => { if (guardar && borrador.trim() !== data.t) c.escribir(id, borrador.trim()); c.setEditando(null) };
  return (
    <div className={`lz-fig f-${data.tipo}${selected ? " sel" : ""}`} onDoubleClick={() => c.editable && c.setEditando(id)}>
      {c.editable && <NodeResizer isVisible={!!selected} minWidth={60} minHeight={28} lineClassName="lz-rl" handleClassName="lz-rh" />}
      {t.forma !== "texto" && (
        <svg className="lz-forma" width={w} height={h} aria-hidden="true">
          <path d={trazo(t.forma, w, h)} fill={fondo} stroke={selected ? "#E0A92E" : t.borde} strokeWidth={selected ? 2.5 : 1.5} />
          {t.franja && <rect x="1" y="1" width="5" height={h - 2} fill={t.franja} />}
        </svg>
      )}
      <div className={"lz-txt" + (t.forma === "rombo" ? " rombo" : t.forma === "chevron" ? " chev" : t.forma === "paralelo" ? " par" : "")} style={{ color }}>
        {editando ? (
          <textarea className="nodrag nowheel" autoFocus value={borrador} onChange={(e) => setBorrador(e.target.value)} aria-label="Texto de la figura"
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => fin(true)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); fin(true) } if (e.key === "Escape") { e.preventDefault(); fin(false) } e.stopPropagation() }} />
        ) : <span>{data.t || <em>Doble clic para escribir</em>}</span>}
      </div>
      {cr != null && cr >= 22 && <b className="lz-crit" title={`Actividad crítica: ${cr} puntos (desde 22)`}>{cr}</b>}
      {data.pi && <b className="lz-pib" title="Tiene un PI ligado">PI</b>}
      {(["t", "r", "b", "l"] as Lado[]).map((l) => <Handle key={l} id={l} type="source" position={POS[l]} className="lz-h" isConnectable={c.editable} />)}
      {c.editable && c.soloUna === id && !editando && (
        <NodeToolbar position={Position.Top} offset={10} className="lz-mini">
          <button type="button" onClick={() => c.setEditando(id)}>Escribir</button>
          <button type="button" onClick={() => c.siguiente(id)} title="Agrega la siguiente figura a la derecha, ya unida">+ Siguiente →</button>
          <button type="button" onClick={() => c.duplicar([id])}>Duplicar</button>
          <button type="button" className="mal" onClick={() => c.borrar([id])}>Borrar</button>
        </NodeToolbar>
      )}
    </div>
  );
});

const ZonaNodo = memo(function ZonaNodo({ data, selected }: NodeProps<ZonaNode>) {
  const c = useContext(LzCtx)!;
  return (
    <div className={`lz-zona z${data.i % 3}${selected ? " sel" : ""}`}>
      {c.editable && <NodeResizer isVisible={!!selected} minWidth={200} minHeight={120} lineClassName="lz-rl" handleClassName="lz-rh" />}
      <div className="lz-zona-t">{data.t}</div>
    </div>
  );
});
const TIPOS_NODO = { fig: FiguraNodo, zona: ZonaNodo };

/* ---------------------------------------------------------------- el lienzo */
export function Lienzo(p: { id: string; titulo: string; doc: DocLienzo; version: number; editable: boolean; editado: boolean; faltaSql: boolean; pis: PiLienzo[] }) {
  return <ReactFlowProvider><Editor {...p} /></ReactFlowProvider>;
}

type Estado = "guardado" | "cambios" | "guardando" | "error" | "conflicto";

function Editor({ id, titulo, doc, version, editable, editado, faltaSql, pis }: { id: string; titulo: string; doc: DocLienzo; version: number; editable: boolean; editado: boolean; faltaSql: boolean; pis: PiLienzo[] }) {
  const router = useRouter();
  const rf = useReactFlow<NodoLz, EdgeLz>();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();
  const marco = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<NodoLz>(aNodos(doc, editable));
  const [edges, setEdges, onEdgesChange] = useEdgesState<EdgeLz>(doc.uniones.map(aEdge));
  const [sel, setSel] = useState<{ nodos: string[]; uniones: string[] }>({ nodos: [], uniones: [] });
  const [editando, setEditando] = useState<string | null>(null);
  const [modo, setModo] = useState<"mover" | "escoger">("mover");
  const [verArbol, setVerArbol] = useState(true);
  const [verFicha, setVerFicha] = useState(true);
  const [pantalla, setPantalla] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dentro, setDentro] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>("guardado");
  const [mal, setMal] = useState<string | null>(null);

  /* En celular los paneles arrancan cerrados (el lienzo primero). */
  useEffect(() => { if (window.innerWidth < 1000) { setVerArbol(false); setVerFicha(false) } }, []);

  /* ------------------------------------------------ deshacer y guardar */
  const hist = useRef<{ pasado: string[]; futuro: string[]; ultimo: string }>({ pasado: [], futuro: [], ultimo: JSON.stringify(aDoc(aNodos(doc, editable), doc.uniones.map(aEdge))) });
  const arrastrando = useRef(false);
  const ver = useRef(version);
  const reloj = useRef<number | null>(null);
  const [, refrescarHist] = useState(0);

  const guardar = useCallback(async (texto: string) => {
    if (!editable) return;
    setEstado("guardando");
    const r = await guardarLienzo(id, JSON.parse(texto) as DocLienzo, ver.current);
    if ("error" in r) { setEstado(r.conflicto ? "conflicto" : "error"); setMal(r.error); return }
    ver.current = r.version; setMal(null);
    setEstado(hist.current.ultimo === texto ? "guardado" : "cambios");
  }, [editable, id]);

  useEffect(() => {
    if (arrastrando.current) return;
    const t = window.setTimeout(() => {
      const texto = JSON.stringify(aDoc(nodes, edges));
      if (texto === hist.current.ultimo) return;
      hist.current.pasado = [...hist.current.pasado, hist.current.ultimo].slice(-80);
      hist.current.futuro = [];
      hist.current.ultimo = texto;
      refrescarHist((n) => n + 1);
      if (!editable) return;
      setEstado("cambios");
      if (reloj.current) window.clearTimeout(reloj.current);
      reloj.current = window.setTimeout(() => { void guardar(hist.current.ultimo) }, 1200);
    }, 350);
    return () => window.clearTimeout(t);
  }, [nodes, edges, editable, guardar]);

  useEffect(() => {
    const antes = (e: BeforeUnloadEvent) => { if (estado === "cambios" || estado === "guardando") { e.preventDefault(); e.returnValue = "" } };
    window.addEventListener("beforeunload", antes);
    return () => window.removeEventListener("beforeunload", antes);
  }, [estado]);

  /* Deshacer/rehacer ponen «ultimo» ANTES de cambiar los nodos: así el efecto de arriba no lo cuenta como cambio nuevo. */
  const poner = useCallback((d: DocLienzo) => {
    setNodes(aNodos(d, editable));
    setEdges(d.uniones.map(aEdge));
  }, [editable, setNodes, setEdges]);
  const deshacer = useCallback(() => {
    const h = hist.current, prev = h.pasado.at(-1);
    if (!prev) return;
    h.pasado = h.pasado.slice(0, -1); h.futuro = [h.ultimo, ...h.futuro]; h.ultimo = prev;
    poner(JSON.parse(prev)); refrescarHist((n) => n + 1);
    if (editable) { setEstado("cambios"); if (reloj.current) window.clearTimeout(reloj.current); reloj.current = window.setTimeout(() => void guardar(prev), 1200) }
  }, [poner, editable, guardar]);
  const rehacer = useCallback(() => {
    const h = hist.current, sig = h.futuro[0];
    if (!sig) return;
    h.futuro = h.futuro.slice(1); h.pasado = [...h.pasado, h.ultimo]; h.ultimo = sig;
    poner(JSON.parse(sig)); refrescarHist((n) => n + 1);
    if (editable) { setEstado("cambios"); if (reloj.current) window.clearTimeout(reloj.current); reloj.current = window.setTimeout(() => void guardar(sig), 1200) }
  }, [poner, editable, guardar]);

  /* ------------------------------------------------ acciones sobre figuras */
  const centroVista = useCallback(() => {
    const r = caja.current?.getBoundingClientRect();
    return r ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
  }, [rf]);
  const agregar = useCallback((tipo: TipoFig, en?: { x: number; y: number }) => {
    const t = TIPOS[tipo], c = en ?? centroVista();
    const nid = nuevoId("f");
    const x = Math.round((c.x - t.w / 2) / GRID) * GRID, y = Math.round((c.y - t.h / 2) / GRID) * GRID;
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id: nid, type: "fig", position: { x, y }, width: t.w, height: t.h, draggable: true, selected: true, data: { tipo, t: tipo === "etiqueta" ? "Texto" : t.nombre } } as FigNode]);
    setEditando(nid);
  }, [centroVista, setNodes]);
  const agregarZona = useCallback(() => {
    const c = centroVista(), nid = nuevoId("z");
    setNodes((ns) => {
      const i = ns.filter((n) => n.type === "zona").length;
      const z: ZonaNode = { id: nid, type: "zona", position: { x: Math.round(c.x - 300), y: Math.round(c.y - 160) }, width: 600, height: 320, zIndex: -1, draggable: false, selected: true, data: { t: "Zona nueva", i } };
      return [z, ...ns.map((n) => ({ ...n, selected: false }))];
    });
  }, [centroVista, setNodes]);
  const escribir = useCallback((nid: string, t: string) => {
    setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, data: { ...n.data, t } } as NodoLz : n)));
  }, [setNodes]);
  const cambiarDatos = useCallback((ids: string[], c: Partial<FigData>) => {
    setNodes((ns) => ns.map((n) => (ids.includes(n.id) && n.type === "fig" ? { ...n, data: { ...(n.data as FigData), ...c } } as FigNode : n)));
  }, [setNodes]);
  const cambiarTipo = useCallback((ids: string[], tipo: TipoFig) => {
    const t = TIPOS[tipo];
    setNodes((ns) => ns.map((n) => {
      if (!ids.includes(n.id) || n.type !== "fig") return n;
      const w = ancho(n), h = alto(n);
      return { ...n, width: t.w, height: t.h, position: { x: n.position.x + (w - t.w) / 2, y: n.position.y + (h - t.h) / 2 }, data: { ...(n.data as FigData), tipo } } as FigNode;
    }));
  }, [setNodes]);
  const borrar = useCallback((ids: string[]) => {
    const s = new Set(ids);
    setNodes((ns) => ns.filter((n) => !s.has(n.id)));
    setEdges((es) => es.filter((e) => !s.has(e.id) && !s.has(e.source) && !s.has(e.target)));
  }, [setNodes, setEdges]);
  const duplicar = useCallback((ids: string[]) => {
    const mapa = new Map<string, string>();
    setNodes((ns) => {
      const copias = ns.filter((n) => ids.includes(n.id) && n.type === "fig").map((n) => {
        const nid = nuevoId("f"); mapa.set(n.id, nid);
        return { ...n, id: nid, position: { x: n.position.x + 40, y: n.position.y + 40 }, selected: true, data: { ...n.data } } as NodoLz;
      });
      return [...ns.map((n) => ({ ...n, selected: false })), ...copias];
    });
    setEdges((es) => [...es, ...es.filter((e) => mapa.has(e.source) && mapa.has(e.target))
      .map((e) => ({ ...e, id: nuevoId("u"), source: mapa.get(e.source)!, target: mapa.get(e.target)!, selected: false }))]);
  }, [setNodes, setEdges]);
  const siguiente = useCallback((nid: string) => {
    const n = rf.getNode(nid) as FigNode | undefined;
    if (!n) return;
    const tipo: TipoFig = ["actividad", "tarea", "inicio"].includes(n.data.tipo) ? (n.data.tipo === "inicio" ? "tarea" : n.data.tipo) : "tarea";
    const t = TIPOS[tipo], w = ancho(n), h = alto(n);
    const nuevo = nuevoId("f");
    const x = Math.round((n.position.x + w + 60) / GRID) * GRID, y = Math.round(n.position.y + h / 2 - t.h / 2);
    setNodes((ns) => [...ns.map((m) => ({ ...m, selected: false })), { id: nuevo, type: "fig", position: { x, y }, width: t.w, height: t.h, draggable: true, selected: true, data: { tipo, t: "" } } as FigNode]);
    setEdges((es) => [...es, aEdge({ id: nuevoId("u"), de: nid, a: nuevo, deLado: "r", aLado: "l", flecha: "fin" })]);
    setEditando(nuevo);
  }, [rf, setNodes, setEdges]);

  const alinear = useCallback((como: "izq" | "cen" | "der" | "arr" | "med" | "aba" | "repH" | "repV" | "igual") => {
    setNodes((ns) => {
      const elegidos = ns.filter((n) => n.selected && n.type === "fig");
      if (elegidos.length < 2) return ns;
      const L = Math.min(...elegidos.map((n) => n.position.x)), R = Math.max(...elegidos.map((n) => n.position.x + ancho(n)));
      const T = Math.min(...elegidos.map((n) => n.position.y)), B = Math.max(...elegidos.map((n) => n.position.y + alto(n)));
      const pos = new Map<string, { x: number; y: number; w?: number; h?: number }>();
      if (como === "repH" || como === "repV") {
        const ord = [...elegidos].sort((a, b) => (como === "repH" ? a.position.x - b.position.x : a.position.y - b.position.y));
        const total = ord.reduce((s, n) => s + (como === "repH" ? ancho(n) : alto(n)), 0);
        const hueco = ((como === "repH" ? R - L : B - T) - total) / Math.max(1, ord.length - 1);
        let p = como === "repH" ? L : T;
        for (const n of ord) {
          pos.set(n.id, como === "repH" ? { x: p, y: n.position.y } : { x: n.position.x, y: p });
          p += (como === "repH" ? ancho(n) : alto(n)) + hueco;
        }
      } else if (como === "igual") {
        const w = Math.max(...elegidos.map(ancho)), h = Math.max(...elegidos.map(alto));
        for (const n of elegidos) pos.set(n.id, { x: n.position.x, y: n.position.y, w, h });
      } else {
        for (const n of elegidos) {
          const w = ancho(n), h = alto(n);
          const x = como === "izq" ? L : como === "der" ? R - w : como === "cen" ? (L + R) / 2 - w / 2 : n.position.x;
          const y = como === "arr" ? T : como === "aba" ? B - h : como === "med" ? (T + B) / 2 - h / 2 : n.position.y;
          pos.set(n.id, { x, y });
        }
      }
      return ns.map((n) => {
        const q = pos.get(n.id);
        return q ? { ...n, position: { x: Math.round(q.x), y: Math.round(q.y) }, ...(q.w ? { width: q.w, height: q.h } : {}) } : n;
      });
    });
  }, [setNodes]);

  const doOrdenar = useCallback(() => {
    const d = ordenar(aDoc(rf.getNodes() as NodoLz[], rf.getEdges() as EdgeLz[]));
    setNodes(aNodos(d, editable));
    setEdges(d.uniones.map(aEdge));
    window.setTimeout(() => void rf.fitView({ padding: 0.06, duration: 300 }), 60);
    avisar.bien("Ordenado. Si no te gusta, «Deshacer».");
  }, [rf, setNodes, setEdges, editable, avisar]);

  /* ------------------------------------------------ conectar y soltar */
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    setEdges((es) => addEdge({ ...aEdge({ id: nuevoId("u"), de: c.source, a: c.target, deLado: (c.sourceHandle ?? "r") as Lado, aLado: (c.targetHandle ?? "l") as Lado, flecha: "fin" }) }, es));
  }, [setEdges]);
  const onDrop = useCallback((e: React.DragEvent) => {
    const tipo = e.dataTransfer.getData("application/lz-tipo") as TipoFig;
    if (!tipo || !TIPOS[tipo]) return;
    e.preventDefault();
    agregar(tipo, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }, [agregar, rf]);

  /* ------------------------------------------------ ver: entrar a una zona, ir a una figura, todo */
  const verTodo = useCallback(() => { setDentro(null); void rf.fitView({ padding: 0.06, duration: 400 }) }, [rf]);
  const entrar = useCallback((zid: string) => {
    const z = rf.getNode(zid);
    if (!z) return;
    setDentro(zid);
    const w = ancho(z as NodoLz), h = alto(z as NodoLz), r = caja.current?.getBoundingClientRect();
    /* Una zona muy ancha (los carriles del mapa) no se encoge hasta no leerse: se llena de alto y arranca por la izquierda. */
    if (r && r.width / w < (r.height / h) * 0.6) {
      const zm = Math.min(1.1, Math.max(0.35, (r.height - 90) / h));
      void rf.setViewport({ x: -z.position.x * zm + 16, y: -z.position.y * zm + 70, zoom: zm }, { duration: 450 });
    } else void rf.fitBounds({ x: z.position.x, y: z.position.y, width: w, height: h }, { padding: 0.04, duration: 450 });
  }, [rf]);
  const irA = useCallback((nid: string) => {
    const n = rf.getNode(nid);
    if (!n) return;
    setNodes((ns) => ns.map((m) => ({ ...m, selected: m.id === nid })));
    void rf.setCenter(n.position.x + ancho(n as NodoLz) / 2, n.position.y + alto(n as NodoLz) / 2, { zoom: Math.max(rf.getZoom(), 1), duration: 450 });
  }, [rf, setNodes]);

  /* ------------------------------------------------ teclado */
  useEffect(() => {
    const el = marco.current;
    if (!el) return;
    const t = (e: KeyboardEvent) => {
      const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable;
      if (escribiendo) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) { e.preventDefault(); deshacer() }
      else if ((e.ctrlKey || e.metaKey) && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); rehacer() }
      else if ((e.ctrlKey || e.metaKey) && k === "d" && editable) { e.preventDefault(); duplicar(sel.nodos) }
      else if (k === "escape") { setNodes((ns) => ns.map((n) => ({ ...n, selected: false }))); setEdges((es) => es.map((x) => ({ ...x, selected: false }))); if (dentro) verTodo() }
    };
    el.addEventListener("keydown", t);
    return () => el.removeEventListener("keydown", t);
  }, [deshacer, rehacer, duplicar, sel.nodos, editable, dentro, verTodo, setNodes, setEdges]);

  useEffect(() => {
    const h = () => setPantalla(document.fullscreenElement === marco.current);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);
  const completa = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void marco.current?.requestFullscreen?.() };

  const png = async () => {
    const vp = marco.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!vp) return;
    const b = getNodesBounds(rf.getNodes());
    const W = Math.min(6000, Math.max(800, Math.round(b.width) + 120)), H = Math.min(6000, Math.max(600, Math.round(b.height) + 120));
    const v = getViewportForBounds(b, W, H, 0.1, 2, 0.04);
    try {
      const url = await toPng(vp, { backgroundColor: "#FFFFFF", width: W, height: H, pixelRatio: 1.5, style: { width: `${W}px`, height: `${H}px`, transform: `translate(${v.x}px, ${v.y}px) scale(${v.zoom})` } });
      const a = document.createElement("a");
      a.href = url; a.download = `${titulo.replace(/[^\p{L}\p{N} ._-]/gu, "").trim() || "mapa"}.png`; a.click();
    } catch { avisar.mal("No se pudo armar la imagen. Prueba con menos zoom o en otro navegador.") }
  };

  const restaurar = async () => {
    if (!(await pedir({ titulo: "¿Volver al original del Excel?", dice: "Se borra todo lo que se ha cambiado en este diagrama y vuelve como viene del Excel, ordenado. No se puede deshacer.", confirmar: "Volver al original", peligro: true }))) return;
    const r = await restaurarLienzo(id);
    if ("error" in r) { avisar.mal(r.error); return }
    avisar.bien("Volvió al original."); router.refresh();
  };

  /* ------------------------------------------------ criticidad: por el texto de la actividad */
  const critDe = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of CRITICIDAD) for (const b of c.bloques) for (const f of b.filas) { const k = sinTilde(f.a); m.set(k, Math.max(m.get(k) ?? 0, f.t)) }
    return (t: string) => m.get(sinTilde(t)) ?? null;
  }, []);

  const onSel = useCallback((p: OnSelectionChangeParams) => {
    setSel({ nodos: p.nodes.map((n) => n.id), uniones: p.edges.map((e) => e.id) });
  }, []);
  const soloUna = sel.nodos.length === 1 && sel.uniones.length === 0 && nodes.find((n) => n.id === sel.nodos[0])?.type === "fig" ? sel.nodos[0] : null;

  const ctx = useMemo<Ctx>(() => ({ editable, editando, setEditando, escribir, crit: critDe, siguiente, duplicar, borrar, soloUna }),
    [editable, editando, escribir, critDe, siguiente, duplicar, borrar, soloUna]);

  /* ------------------------------------------------ el árbol */
  const [busca, setBusca] = useState("");
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const arbol = useMemo(() => {
    const zonas = nodes.filter((n): n is ZonaNode => n.type === "zona")
      .map((n) => ({ id: n.id, t: n.data.t, x: n.position.x, y: n.position.y, w: ancho(n), h: alto(n) }))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const figs = nodes.filter((n): n is FigNode => n.type === "fig" && n.data.tipo !== "etiqueta");
    const q = sinTilde(busca);
    const grupos = new Map<string, FigNode[]>();
    for (const f of figs) {
      if (q && !sinTilde(f.data.t).includes(q)) continue;
      const z = zonaDe(zonas, { id: f.id, tipo: f.data.tipo, t: f.data.t, x: f.position.x, y: f.position.y, w: ancho(f), h: alto(f) });
      const k = z?.id ?? "";
      grupos.set(k, [...(grupos.get(k) ?? []), f]);
    }
    for (const v of grupos.values()) v.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    return [...zonas.map((z) => ({ id: z.id, t: z.t, figs: grupos.get(z.id) ?? [] })), ...(grupos.get("")?.length ? [{ id: "", t: "Fuera de las zonas", figs: grupos.get("")! }] : [])];
  }, [nodes, busca]);
  const dentroNombre = dentro ? (nodes.find((n) => n.id === dentro)?.data as ZonaData | undefined)?.t : null;

  /* ------------------------------------------------ la ficha */
  const elegidas = nodes.filter((n) => sel.nodos.includes(n.id));
  const figsSel = elegidas.filter((n): n is FigNode => n.type === "fig");
  const zonaSel = elegidas.length === 1 && elegidas[0].type === "zona" ? (elegidas[0] as ZonaNode) : null;
  const unaFig = figsSel.length === 1 && elegidas.length === 1 ? figsSel[0] : null;
  const union = sel.uniones.length === 1 && sel.nodos.length === 0 ? edges.find((e) => e.id === sel.uniones[0]) : undefined;
  const cuentas = useMemo(() => {
    const m = new Map<TipoFig, number>();
    for (const n of nodes) if (n.type === "fig") m.set((n.data as FigData).tipo, (m.get((n.data as FigData).tipo) ?? 0) + 1);
    return m;
  }, [nodes]);
  const opcionesPi = useMemo(() => [{ valor: "", etiqueta: "Sin PI" }, ...pis.map((x) => ({ valor: x.id, etiqueta: x.nombre, codigo: x.codigo }))], [pis]);
  const zonaDeFig = (f: FigNode) => {
    const zs = nodes.filter((n): n is ZonaNode => n.type === "zona").map((n) => ({ id: n.id, t: n.data.t, x: n.position.x, y: n.position.y, w: ancho(n), h: alto(n) }));
    return zonaDe(zs, { id: f.id, tipo: f.data.tipo, t: f.data.t, x: f.position.x, y: f.position.y, w: ancho(f), h: alto(f) })?.t ?? null;
  };
  const cambiarUnion = (eid: string, c: { t?: string; flecha?: Union["flecha"] }) => setEdges((es) => es.map((e) => {
    if (e.id !== eid) return e;
    const flecha = c.flecha ?? e.data?.flecha ?? "fin";
    const t = c.t !== undefined ? c.t : (typeof e.label === "string" ? e.label : "");
    return { ...e, label: t || undefined, data: { flecha }, markerEnd: marca(flecha, "fin"), markerStart: marca(flecha, "ini") };
  }));

  const textoEstado = !editable ? (faltaSql ? "Solo mirar · falta el SQL" : "Solo mirar")
    : estado === "guardado" ? (editado || hist.current.pasado.length ? "Guardado" : "Como viene del Excel")
    : estado === "cambios" ? "Cambios sin guardar…" : estado === "guardando" ? "Guardando…" : estado === "conflicto" ? "Otro lo cambió" : "No se guardó";

  return (
    <LzCtx.Provider value={ctx}>
      <div className={"lz" + (pantalla ? " completa" : "")} ref={marco} tabIndex={-1}>
        {avisos}{dialogo}
        <div className="lz-barra">
          <button type="button" className={"lz-b ico" + (verArbol ? " on" : "")} onClick={() => setVerArbol((v) => !v)} aria-pressed={verArbol} title="Procesos (árbol)">☰</button>
          <div className="lz-tit">
            <b>{titulo}</b>
            {dentroNombre && <span className="lz-miga">› {dentroNombre} <button type="button" onClick={verTodo}>Ver todo</button></span>}
          </div>
          <span className={"lz-estado e-" + (editable ? estado : "lectura")} role="status">{textoEstado}</span>
          <span className="lz-esp" />
          {editable && <>
            <button type="button" className="lz-b" onClick={deshacer} disabled={!hist.current.pasado.length} title="Deshacer (Ctrl+Z)">↶<span className="lz-tx"> Deshacer</span></button>
            <button type="button" className="lz-b ico" onClick={rehacer} disabled={!hist.current.futuro.length} title="Rehacer (Ctrl+Y)">↷</button>
            <button type="button" className="lz-b pri" onClick={doOrdenar} title="Acomoda solo: mismo tamaño por tipo, filas alineadas, sin figuras encimadas">✦<span className="lz-tx"> Ordenar</span></button>
          </>}
          <button type="button" className="lz-b" onClick={png} title="Descargar como imagen">⇩<span className="lz-tx"> PNG</span></button>
          <button type="button" className="lz-b" onClick={completa} title={pantalla ? "Salir de pantalla completa" : "Pantalla completa"}>{pantalla ? "Salir" : <>⤢<span className="lz-tx"> Pantalla completa</span></>}</button>
          <button type="button" className={"lz-b ico" + (verFicha ? " on" : "")} onClick={() => setVerFicha((v) => !v)} aria-pressed={verFicha} title="Ficha">◨</button>
        </div>
        {mal && (
          <p className="lz-mal" role="alert">{mal}
            {estado === "conflicto" && <button type="button" onClick={() => router.refresh()}>Recargar</button>}
            {estado === "error" && <button type="button" onClick={() => void guardar(hist.current.ultimo)}>Reintentar</button>}
          </p>
        )}

        <div className="lz-cuerpo">
          {verArbol && (
            <aside className="lz-arbol" aria-label="Procesos del diagrama">
              <input className="lz-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar actividad o proceso…" aria-label="Buscar en el diagrama" />
              <div className="lz-ramas">
                {arbol.map((z) => {
                  const ab = !!busca || abiertas.has(z.id) || dentro === z.id;
                  if (busca && !z.figs.length) return null;
                  return (
                    <div key={z.id || "fuera"} className={"lz-rama" + (dentro === z.id && z.id ? " on" : "")}>
                      <div className="lz-rama-cab">
                        <button type="button" className="lz-flecha" aria-expanded={ab} onClick={() => setAbiertas((s) => { const n = new Set(s); if (n.has(z.id)) n.delete(z.id); else n.add(z.id); return n })}>{ab ? "▾" : "▸"}</button>
                        <button type="button" className="lz-rama-t" onClick={() => z.id ? entrar(z.id) : undefined} title={z.id ? "Entrar a esta zona" : undefined}>{z.t}<small>{z.figs.length}</small></button>
                      </div>
                      {ab && z.figs.map((f) => (
                        <button key={f.id} type="button" className={"lz-hoja" + (sel.nodos.includes(f.id) ? " on" : "")} onClick={() => irA(f.id)}>
                          <Silueta tipo={f.data.tipo} w={22} h={14} /><span>{f.data.t || "(sin texto)"}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
                {!arbol.length && <p className="lz-nada">Nada con «{busca}».</p>}
              </div>
            </aside>
          )}

          <div className="lz-lienzo" ref={caja} onDragOver={(e) => { if (editable) { e.preventDefault(); e.dataTransfer.dropEffect = "copy" } }} onDrop={onDrop}>
            <ReactFlow<NodoLz, EdgeLz>
              nodes={nodes} edges={edges} nodeTypes={TIPOS_NODO}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={editable ? onConnect : undefined}
              onSelectionChange={onSel}
              onNodeDragStart={() => { arrastrando.current = true }}
              onNodeDragStop={() => { arrastrando.current = false; setNodes((ns) => [...ns]) }}
              onNodeDoubleClick={(_, n) => { if (n.type === "zona") entrar(n.id) }}
              connectionMode={ConnectionMode.Loose}
              nodesDraggable={editable} nodesConnectable={editable} elementsSelectable
              deleteKeyCode={editable ? ["Delete", "Backspace"] : null}
              snapToGrid snapGrid={[GRID / 2, GRID / 2]}
              panOnDrag={modo === "mover" ? true : [1, 2]} selectionOnDrag={modo === "escoger"} panOnScroll={false}
              selectionKeyCode="Shift" multiSelectionKeyCode={["Meta", "Control"]}
              elevateNodesOnSelect={false} elevateEdgesOnSelect
              minZoom={0.05} maxZoom={2.5} fitView fitViewOptions={{ padding: 0.06 }}
              onMove={(_, v) => setZoom(v.zoom)}
              defaultEdgeOptions={{ type: "step" }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={GRID} size={1.2} color="#C9CED6" />
              <MiniMap pannable zoomable position="bottom-right" className="lz-mapa"
                nodeColor={(n) => (n.type === "zona" ? "#EEF0F3" : ((n.data as FigData).color ?? TIPOS[(n.data as FigData).tipo].fondo))}
                nodeStrokeColor={(n) => (n.type === "zona" ? "#E3E6EA" : TIPOS[(n.data as FigData).tipo].borde)} maskColor="rgba(20,23,28,.06)" />
            </ReactFlow>

            {editable && (
              <div className="lz-paleta" role="toolbar" aria-label="Figuras">
                <button type="button" className={modo === "mover" ? "on" : ""} onClick={() => setModo("mover")} title="Mover el lienzo (arrastrar)">✋</button>
                <button type="button" className={modo === "escoger" ? "on" : ""} onClick={() => setModo("escoger")} title="Escoger varias (arrastrar un recuadro)">⬚</button>
                <span className="lz-sep" />
                {ORDEN_TIPOS.map((t) => (
                  <button key={t} type="button" draggable title={`${TIPOS[t].nombre} · clic para agregar o arrástrala`}
                    onDragStart={(e) => { e.dataTransfer.setData("application/lz-tipo", t); e.dataTransfer.effectAllowed = "copy" }}
                    onClick={() => agregar(t)}><Silueta tipo={t} /></button>
                ))}
                <span className="lz-sep" />
                <button type="button" onClick={agregarZona} title="Zona o carril (agrupa figuras)">▭</button>
              </div>
            )}
            <div className="lz-zoom" role="group" aria-label="Zoom">
              <button type="button" onClick={() => void rf.zoomOut({ duration: 200 })} aria-label="Alejar">−</button>
              <output>{Math.round(zoom * 100)}%</output>
              <button type="button" onClick={() => void rf.zoomIn({ duration: 200 })} aria-label="Acercar">+</button>
              <button type="button" onClick={verTodo}>Ver todo</button>
            </div>
            <p className="lz-ayuda">{editable ? "Doble clic para escribir · arrastra de un punto a otra figura para unir · Supr borra · Shift+arrastrar escoge varias" : "Rueda para acercar · arrastra para moverte · toca una zona a la izquierda para entrar"}</p>
          </div>

          {verFicha && (
            <aside className="lz-ficha" aria-label="Ficha">
              {unaFig ? (() => {
                const d = unaFig.data, cr = critDe(d.t), zn = zonaDeFig(unaFig);
                return (<>
                  <p className="lz-ojo">Figura</p>
                  <div className="lz-ficha-cab"><Silueta tipo={d.tipo} w={34} h={22} /><b>{d.t || "(sin texto)"}</b></div>
                  {zn && <p className="lz-donde">En «{zn}»</p>}
                  <label className="lz-campo"><span>Texto</span>
                    <textarea value={d.t} disabled={!editable} rows={3} onChange={(e) => escribir(unaFig.id, e.target.value)} /></label>
                  <label className="lz-campo"><span>Tipo</span>
                    {editable
                      ? <Selector valor={d.tipo} onCambiar={(v) => cambiarTipo([unaFig.id], v as TipoFig)} buscar={false} ariaLabel="Tipo de figura"
                          opciones={ORDEN_TIPOS.map((t) => ({ valor: t, etiqueta: TIPOS[t].nombre }))} />
                      : <b>{TIPOS[d.tipo].nombre}</b>}</label>
                  {editable && d.tipo !== "etiqueta" && (
                    <div className="lz-campo"><span>Color</span>
                      <div className="lz-colores">
                        <button type="button" className={"auto" + (!d.color ? " on" : "")} onClick={() => cambiarDatos([unaFig.id], { color: null })} title="El del tipo">Auto</button>
                        {COLORES.map((c) => <button key={c} type="button" className={d.color === c ? "on" : ""} style={{ background: c }} onClick={() => cambiarDatos([unaFig.id], { color: c })} aria-label={`Color ${c}`} />)}
                      </div>
                    </div>
                  )}
                  {d.tipo !== "etiqueta" && (
                    <label className="lz-campo"><span>PI ligado</span>
                      {editable
                        ? <Selector valor={d.pi ?? ""} onCambiar={(v) => cambiarDatos([unaFig.id], { pi: v || null })} ariaLabel="PI ligado" opciones={opcionesPi} vacio="Sin PI" />
                        : <b>{pis.find((x) => x.id === d.pi)?.nombre ?? "Sin PI"}</b>}</label>
                  )}
                  {cr != null && (
                    <div className={"lz-crit-caja" + (cr >= 22 ? " mal" : "")}>
                      <small>Criticidad (matriz)</small><b>{cr}</b><span>{cr >= 22 ? "Actividad crítica (22+)" : "No es crítica"}</span>
                    </div>
                  )}
                  {editable && (
                    <div className="lz-botones">
                      <button type="button" className="lz-b" onClick={() => duplicar([unaFig.id])}>Duplicar</button>
                      <button type="button" className="lz-b mal" onClick={() => borrar([unaFig.id])}>Borrar</button>
                    </div>
                  )}
                </>);
              })() : zonaSel ? (<>
                <p className="lz-ojo">Zona</p>
                <label className="lz-campo"><span>Nombre</span>
                  <input value={zonaSel.data.t} disabled={!editable} onChange={(e) => setNodes((ns) => ns.map((n) => (n.id === zonaSel.id ? { ...n, data: { ...(n.data as ZonaData), t: e.target.value } } as NodoLz : n)))} /></label>
                <p className="lz-donde">Para cambiar su tamaño, arrastra los cuadritos de las esquinas. «Ordenar» la ajusta sola a sus figuras.</p>
                <div className="lz-botones">
                  <button type="button" className="lz-b" onClick={() => entrar(zonaSel.id)}>Entrar</button>
                  {editable && <button type="button" className="lz-b mal" onClick={() => borrar([zonaSel.id])}>Quitar la zona</button>}
                </div>
              </>) : union ? (<>
                <p className="lz-ojo">Unión</p>
                <label className="lz-campo"><span>Texto en la línea</span>
                  <input value={typeof union.label === "string" ? union.label : ""} disabled={!editable} placeholder="Ej.: Sí / No" onChange={(e) => cambiarUnion(union.id, { t: e.target.value })} /></label>
                <label className="lz-campo"><span>Flecha</span>
                  {editable
                    ? <Selector valor={union.data?.flecha ?? "fin"} onCambiar={(v) => cambiarUnion(union.id, { flecha: v as Union["flecha"] })} buscar={false} ariaLabel="Flecha"
                        opciones={[{ valor: "fin", etiqueta: "Al final →" }, { valor: "ambas", etiqueta: "En las dos puntas ↔" }, { valor: "ninguna", etiqueta: "Sin flecha —" }]} />
                    : <b>{union.data?.flecha}</b>}</label>
                {editable && <div className="lz-botones"><button type="button" className="lz-b mal" onClick={() => borrar([union.id])}>Borrar la unión</button></div>}
              </>) : figsSel.length > 1 ? (<>
                <p className="lz-ojo">{figsSel.length} figuras escogidas</p>
                {editable && (<>
                  <div className="lz-campo"><span>Alinear</span>
                    <div className="lz-rejilla">
                      <button type="button" onClick={() => alinear("izq")}>⇤ Izquierda</button>
                      <button type="button" onClick={() => alinear("cen")}>↔ Centro</button>
                      <button type="button" onClick={() => alinear("der")}>Derecha ⇥</button>
                      <button type="button" onClick={() => alinear("arr")}>⤒ Arriba</button>
                      <button type="button" onClick={() => alinear("med")}>↕ Medio</button>
                      <button type="button" onClick={() => alinear("aba")}>Abajo ⤓</button>
                    </div>
                  </div>
                  <div className="lz-campo"><span>Repartir</span>
                    <div className="lz-rejilla dos">
                      <button type="button" onClick={() => alinear("repH")}>A lo ancho</button>
                      <button type="button" onClick={() => alinear("repV")}>A lo alto</button>
                    </div>
                  </div>
                  <label className="lz-campo"><span>Tipo de todas</span>
                    <Selector valor="" vacio="Cambiar tipo…" onCambiar={(v) => v && cambiarTipo(figsSel.map((f) => f.id), v as TipoFig)} buscar={false} ariaLabel="Tipo de las escogidas"
                      opciones={ORDEN_TIPOS.map((t) => ({ valor: t, etiqueta: TIPOS[t].nombre }))} /></label>
                  <div className="lz-botones">
                    <button type="button" className="lz-b" onClick={() => alinear("igual")}>Mismo tamaño</button>
                    <button type="button" className="lz-b" onClick={() => duplicar(figsSel.map((f) => f.id))}>Duplicar</button>
                    <button type="button" className="lz-b mal" onClick={() => borrar(figsSel.map((f) => f.id))}>Borrar</button>
                  </div>
                </>)}
              </>) : (<>
                <p className="lz-ojo">Leyenda</p>
                <ul className="lz-leyenda">
                  {ORDEN_TIPOS.map((t) => <li key={t}><Silueta tipo={t} w={34} h={22} /><span>{TIPOS[t].nombre}</span><small>{cuentas.get(t) ?? 0}</small></li>)}
                  <li><b className="lz-crit muestra">24</b><span>Actividad crítica (matriz)</span></li>
                </ul>
                <p className="lz-donde">Toca una figura para ver su ficha. {editable ? "Doble clic para escribir; arrastra desde sus puntos para unirla con otra." : ""}</p>
                {editable && editado && <button type="button" className="lz-b mal lz-restaurar" onClick={restaurar}>Volver al original del Excel</button>}
              </>)}
            </aside>
          )}
        </div>
      </div>
    </LzCtx.Provider>
  );
}
