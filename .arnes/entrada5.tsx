import { createRoot } from "react-dom/client";
import { BotonExportar } from "@/app/(app)/sider/Exportar";
// @ts-expect-error datos del arnés
import { viajesFalsos } from "./datos.mjs";

const viajes = viajesFalsos(60);
const porDia = new Map<string, number>();
for (const v of viajes) { const d = String(v.fecha).slice(0,10); porDia.set(d, (porDia.get(d) ?? 0) + 1) }
const dias = [...porDia.entries()].map(([fecha, n]) => ({ fecha, hl_zlde: 0, viajes: n }))
  .sort((a,b)=>a.fecha.localeCompare(b.fecha));

createRoot(document.getElementById("r")!).render(
  <div className="sd">
    <section className="tarjeta">
      <div className="cab"><div><h2>Los viajes</h2></div><BotonExportar dias={dias} /></div>
    </section>
  </div>
);
