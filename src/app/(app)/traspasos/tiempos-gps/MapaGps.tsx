"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * EL MAPA (Leaflet, cargado desde cdnjs al abrir la pantalla: no engorda la app).
 * Dibuja las zonas con su etiqueta, los vehículos moviéndose suave, las líneas de flujo entre zonas
 * y deja dibujar zonas nuevas (rectángulo o polígono) con el ratón.
 */
import { useEffect, useRef, useState } from "react";
import type { Punto } from "@/modulos/traspasos/gps/geo";

declare global { interface Window { L?: any } }

const VERSION = "1.9.4";
let cargando: Promise<any> | null = null;
function cargarLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("sin ventana"));
  if (window.L) return Promise.resolve(window.L);
  if (cargando) return cargando;
  cargando = new Promise((ok, mal) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${VERSION}/leaflet.min.css`;
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${VERSION}/leaflet.min.js`;
    s.onload = () => ok(window.L);
    s.onerror = () => { cargando = null; mal(new Error("No se pudo cargar el mapa. Revisa la conexión.")) };
    document.head.appendChild(s);
  });
  return cargando;
}

export type CapaBase = "calles" | "oscuro" | "satelite";
const CAPAS: Record<CapaBase, { url: string; atrib: string; sub?: string }> = {
  calles: { url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", atrib: "© OpenStreetMap · © CARTO", sub: "abcd" },
  oscuro: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", atrib: "© OpenStreetMap · © CARTO", sub: "abcd" },
  satelite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", atrib: "Imágenes © Esri" },
};

export type ZonaMapa = { id: string; nombre: string; color: string; poligono: Punto[]; adentro: number };
export type VehiculoMapa = { id: string; etiqueta: string; lat: number; lng: number; rumbo: number | null; estado: "dentro" | "transito" | "quieto"; color: string };
export type FlujoMapa = { origen: Punto; destino: Punto; viajes: number; texto: string };

const escapar = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export function MapaGps({ zonas, vehiculos, flujos, capa, dibujo, alDibujar, alCancelarDibujo, seleccion, alSeleccionar, ajustar, centroInicial }: {
  zonas: ZonaMapa[]; vehiculos: VehiculoMapa[]; flujos: FlujoMapa[]; capa: CapaBase;
  dibujo: null | "rect" | "poli"; alDibujar: (p: Punto[]) => void; alCancelarDibujo: () => void;
  seleccion: string | null; alSeleccionar: (id: string | null) => void;
  /** Cada vez que cambia, el mapa se encuadra sobre las zonas. */
  ajustar: number; centroInicial: Punto;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<any>(null);
  const L = useRef<any>(null);
  const base = useRef<any>(null);
  const grupoZonas = useRef<any>(null), grupoFlujos = useRef<any>(null), grupoDibujo = useRef<any>(null);
  const marcas = useRef(new Map<string, any>());
  const dibujando = useRef(false);
  const cb = useRef({ alDibujar, alCancelarDibujo, alSeleccionar });
  cb.current = { alDibujar, alCancelarDibujo, alSeleccionar };
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Crear el mapa una vez. */
  useEffect(() => {
    let vivo = true;
    let obs: ResizeObserver | null = null;
    cargarLeaflet().then((leaf) => {
      if (!vivo || !caja.current || mapa.current) return;
      L.current = leaf;
      const m = leaf.map(caja.current, { zoomControl: false, zoomSnap: 0.25 }).setView(centroInicial, 16);
      leaf.control.zoom({ position: "bottomright" }).addTo(m);
      m.attributionControl.setPrefix(false);
      grupoZonas.current = leaf.layerGroup().addTo(m);
      grupoFlujos.current = leaf.layerGroup().addTo(m);
      grupoDibujo.current = leaf.layerGroup().addTo(m);
      m.on("click", () => { if (!dibujando.current) cb.current.alSeleccionar(null) });
      mapa.current = m;
      setTimeout(() => m.invalidateSize(), 60);
      if (typeof ResizeObserver !== "undefined" && caja.current) { obs = new ResizeObserver(() => m.invalidateSize()); obs.observe(caja.current) }
      setListo(true);
    }).catch((e: Error) => { if (vivo) setError(e.message) });
    return () => { vivo = false; obs?.disconnect(); mapa.current?.remove(); mapa.current = null; marcas.current.clear(); setListo(false) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* El fondo del mapa. */
  useEffect(() => {
    if (!listo) return;
    const c = CAPAS[capa];
    base.current?.remove();
    base.current = L.current.tileLayer(c.url, { attribution: c.atrib, subdomains: c.sub ?? "abc", maxZoom: 19, detectRetina: true }).addTo(mapa.current);
    base.current.bringToBack();
    caja.current?.setAttribute("data-capa", capa);
  }, [listo, capa]);

  /* Las zonas, con su nombre y cuántos hay adentro. */
  useEffect(() => {
    if (!listo) return;
    const g = grupoZonas.current; g.clearLayers();
    for (const z of zonas) {
      if (z.poligono.length < 3) continue;
      const p = L.current.polygon(z.poligono, { color: z.color, weight: 2.5, fillColor: z.color, fillOpacity: z.adentro > 0 ? 0.3 : 0.14, className: "tg-zona" + (z.adentro > 0 ? " activa" : "") }).addTo(g);
      /* La etiqueta va justo encima del borde de arriba, para no tapar a los vehículos de adentro. */
      const norte = Math.max(...z.poligono.map((q) => q[0]));
      const medio = (Math.min(...z.poligono.map((q) => q[1])) + Math.max(...z.poligono.map((q) => q[1]))) / 2;
      L.current.marker([norte, medio], { interactive: false, keyboard: false, icon: L.current.divIcon({ className: "tg-etq-z", html: `<span class="tg-etq"><b>${escapar(z.nombre)}</b>${z.adentro > 0 ? `<i>${z.adentro}</i>` : ""}</span>`, iconSize: [0, 0] }) }).addTo(g);
    }
  }, [listo, zonas]);

  /* Encuadrar sobre las zonas (al abrir y cuando se pide). */
  useEffect(() => {
    if (!listo || zonas.length === 0) return;
    const pts = zonas.flatMap((z) => z.poligono);
    if (pts.length) mapa.current.fitBounds(L.current.latLngBounds(pts), { padding: [60, 60], maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, ajustar, zonas.length > 0]);

  /* Las líneas de flujo entre zonas: más gruesas mientras más viajes. */
  useEffect(() => {
    if (!listo) return;
    const g = grupoFlujos.current; g.clearLayers();
    for (const f of flujos) {
      const l = L.current.polyline([f.origen, f.destino], { color: "#ffc20e", weight: 2 + Math.min(4, Math.ceil(f.viajes / 4)), opacity: 0.85, className: "tg-flujo", lineCap: "butt" }).addTo(g);
      l.bindTooltip(escapar(f.texto), { sticky: true, className: "tg-tip" });
    }
  }, [listo, flujos]);

  /* Los vehículos: se crean una vez y después solo se mueven (el CSS los desliza). */
  useEffect(() => {
    if (!listo) return;
    const hay = new Set<string>();
    for (const v of vehiculos) {
      hay.add(v.id);
      let m = marcas.current.get(v.id);
      const html = `<span class="tg-pulso"></span><span class="tg-punto"><i class="tg-flecha"></i></span><span class="tg-placa">${escapar(v.etiqueta)}</span>`;
      if (!m) {
        m = L.current.marker([v.lat, v.lng], { icon: L.current.divIcon({ className: "tg-veh", html, iconSize: [0, 0] }), zIndexOffset: 500, riseOnHover: true }).addTo(mapa.current);
        m.on("click", (e: any) => { L.current.DomEvent.stopPropagation(e); cb.current.alSeleccionar(v.id) });
        marcas.current.set(v.id, m);
      } else {
        m.setLatLng([v.lat, v.lng]);
      }
      const el: HTMLElement | undefined = m.getElement();
      if (el) {
        el.dataset.estado = v.estado; el.dataset.sel = seleccion === v.id ? "1" : "";
        el.style.setProperty("--c", v.color);
        const placa = el.querySelector(".tg-placa"); if (placa && placa.textContent !== v.etiqueta) placa.textContent = v.etiqueta;
        const fl = el.querySelector<HTMLElement>(".tg-flecha"); if (fl) fl.style.transform = `rotate(${v.rumbo ?? 0}deg)`;
      }
    }
    for (const [id, m] of marcas.current) if (!hay.has(id)) { m.remove(); marcas.current.delete(id) }
  }, [listo, vehiculos, seleccion]);

  /* Seguir al vehículo escogido. */
  useEffect(() => {
    if (!listo || !seleccion) return;
    const v = vehiculos.find((x) => x.id === seleccion);
    if (v) mapa.current.panTo([v.lat, v.lng], { animate: true, duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, seleccion]);

  /* DIBUJAR UNA ZONA: rectángulo (dos clics) o polígono (clics y doble clic o Enter). Esc cancela. */
  useEffect(() => {
    if (!listo || !dibujo) return;
    const m = mapa.current, leaf = L.current, g = grupoDibujo.current;
    g.clearLayers();
    dibujando.current = true;
    m.getContainer().style.cursor = "crosshair";
    m.doubleClickZoom.disable();
    const estilo = { color: "#ffc20e", weight: 3, dashArray: "6 6", fillColor: "#ffc20e", fillOpacity: 0.18 };
    let pts: [number, number][] = [];
    let vista: any = null, linea: any = null;
    const fin = (lista: [number, number][]) => { g.clearLayers(); cb.current.alDibujar(lista) };

    const clic = (e: any) => {
      const p: [number, number] = [e.latlng.lat, e.latlng.lng];
      if (dibujo === "rect") {
        if (pts.length === 0) { pts = [p]; return }
        const [a] = pts;
        fin([[a[0], a[1]], [a[0], p[1]], [p[0], p[1]], [p[0], a[1]]]);
        pts = [];
      } else {
        pts.push(p);
        linea?.remove();
        linea = leaf.polyline(pts, estilo).addTo(g);
        leaf.circleMarker(p, { radius: 5, color: "#111", weight: 2, fillColor: "#ffc20e", fillOpacity: 1 }).addTo(g);
      }
    };
    const mover = (e: any) => {
      if (dibujo === "rect" && pts.length === 1) {
        const a = pts[0], p: [number, number] = [e.latlng.lat, e.latlng.lng];
        vista?.remove();
        vista = leaf.rectangle([a, p], estilo).addTo(g);
      } else if (dibujo === "poli" && pts.length > 0) {
        vista?.remove();
        vista = leaf.polyline([...pts, [e.latlng.lat, e.latlng.lng]], { ...estilo, fill: false }).addTo(g);
      }
    };
    const doble = () => { if (dibujo === "poli" && pts.length >= 3) { const l = pts.slice(0, -1).length >= 3 ? pts.slice(0, -1) : pts; fin(l); pts = [] } };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { g.clearLayers(); cb.current.alCancelarDibujo() }
      if (e.key === "Enter" && dibujo === "poli" && pts.length >= 3) { fin(pts); pts = [] }
    };
    m.on("click", clic); m.on("mousemove", mover); m.on("dblclick", doble);
    document.addEventListener("keydown", tecla);
    return () => {
      m.off("click", clic); m.off("mousemove", mover); m.off("dblclick", doble);
      document.removeEventListener("keydown", tecla);
      m.getContainer().style.cursor = ""; m.doubleClickZoom.enable();
      dibujando.current = false;
      g.clearLayers();
    };
  }, [listo, dibujo]);

  return (
    <div className="tg-mapa-caja">
      <div ref={caja} className="tg-mapa" role="application" aria-label="Mapa de zonas y vehículos" />
      {!listo && !error && <p className="tg-mapa-msg">Cargando el mapa…</p>}
      {error && <p className="tg-mapa-msg mal" role="alert">{error}</p>}
    </div>
  );
}
