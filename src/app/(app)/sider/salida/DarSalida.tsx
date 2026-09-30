"use client";

/**
 * DAR SALIDA — la segunda mitad de la salida.
 *
 * En el patio se certificó el camión —ubicación, materiales con sus
 * estibas, placa y tres fotos— y quedó una FICHA pendiente. Aquí el
 * facturador la ve, escribe el NÚMERO DE FACTURA y le da salida: recién
 * entonces nacen los viajes, uno por material, todos con la misma placa y
 * la misma factura, y pasan a En tránsito. La hora de salida es la de ese
 * momento.
 *
 * Quien no tiene el permiso de «Dar salida» ve sus propias fichas, sin
 * botones. El permiso lo pone la base; esta pantalla solo lo refleja.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Origen, Sku, Ficha } from "@/modulos/sider/datos";
import { traducirFicha } from "@/modulos/sider/evidencia";
import { haceCuanto } from "../sorting/Sorting";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** La factura: en mayúscula y sin signos raros; hasta 30 caracteres. */
const limpiaFactura = (t: string) => t.toUpperCase().replace(/[^A-Z0-9\-\/\.]/g, "").slice(0, 30);

export function DarSalida({ fichas, origenes, skus, estibasPorSider, nombres, yo, ahora, puedeDarSalida }: {
  fichas: Ficha[];
  origenes: Origen[];
  skus: Sku[];
  estibasPorSider: number;
  nombres: Record<string, string>;
  yo: string;
  ahora: string;
  puedeDarSalida: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [facturas, setFacturas] = useState<Record<string, string>>({});
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [seguro, setSeguro] = useState<string | null>(null);
  const [mal, setMal] = useState<Record<string, string>>({});

  const skuDe = (sku: string) => skus.find((k) => k.sku === sku);
  const cdDe = (planta: string) => origenes.find((o) => o.planta === planta)?.cd_origen ?? planta;

  /* LAS CIFRAS DE CADA MATERIAL, las mismas fórmulas de la base. */
  const cifras = (f: Ficha) => f.lineas.map((l) => {
    const m = skuDe(l.sku);
    const cajas = m?.cajas_x_estiba == null ? null : Number(m.cajas_x_estiba) * l.estibas;
    const unidades = cajas == null || m?.unidades_x_caja == null ? null : Number(m.unidades_x_caja) * cajas;
    const hl = unidades == null || m?.hl_x_unidad == null ? null : Number(m.hl_x_unidad) * unidades;
    return { ...l, nombre: m?.descripcion ?? l.sku, cajas, unidades, hl };
  });

  async function darSalida(f: Ficha) {
    const factura = (facturas[f.id] ?? "").trim();
    if (!factura) return;
    setOcupada(f.id);
    setMal((m) => ({ ...m, [f.id]: "" }));
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { error } = await (supabase as any).rpc("sider_ficha_dar_salida", { p_ficha: f.id, p_factura: factura });
    setOcupada(null);
    if (error) { setMal((m) => ({ ...m, [f.id]: traducirFicha(error.message) })); return }
    avisar.bien(`${f.placa} salió con la factura ${factura}: ${f.lineas.length} viaje${f.lineas.length > 1 ? "s" : ""} en tránsito.`);
    router.refresh();
  }

  async function descartar(f: Ficha) {
    setOcupada(f.id);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { error } = await (supabase as any).rpc("sider_ficha_descartar", { p_ficha: f.id });
    setOcupada(null);
    setSeguro(null);
    if (error) { setMal((m) => ({ ...m, [f.id]: traducirFicha(error.message) })); return }
    avisar.bien(`La ficha de ${f.placa} se descartó.`);
    router.refresh();
  }

  return (
    <>
      <div className="ds-barra">
        <div className="ds-cuenta">
          <b>{fichas.length}</b>
          <span>{fichas.length === 1 ? "ficha por dar salida" : "fichas por dar salida"}</span>
        </div>
        {!puedeDarSalida && (
          <p className="ds-solover">
            Solo puedes ver tus fichas: falta el permiso «Dar salida». Pídeselo al
            administrador en Roles.
          </p>
        )}
      </div>

      {fichas.length === 0 ? (
        <section className="tarjeta ds-vacia">
          <h2>No hay fichas por dar salida</h2>
          <p className="ct-dice">
            Un camión aparece aquí cuando se certifica en <b>Certificar</b> y se guarda.
            Ahí se escogen los materiales, se pone la placa y se toman las tres fotos.
          </p>
        </section>
      ) : (
        <ul className="ds-lista">
          {fichas.map((f) => {
            const cs = cifras(f);
            const factura = facturas[f.id] ?? "";
            const suya = f.creado_por === yo;
            const tarde = (Date.parse(ahora) - Date.parse(f.creado_en)) / 3600000 > 12;
            const totalEst = f.lineas.reduce((a, l) => a + l.estibas, 0);
            const totalCajas = cs.every((c) => c.cajas != null) ? cs.reduce((a, c) => a + (c.cajas as number), 0) : null;
            const totalHl = cs.every((c) => c.hl != null) ? cs.reduce((a, c) => a + (c.hl as number), 0) : null;
            return (
              <li key={f.id} className={"ds-ficha" + (tarde ? " tarde" : "")}>
                <header>
                  <b className="ds-placa">{f.placa}</b>
                  <span className="ds-ruta">{cdDe(f.planta)} → Barranquilla</span>
                  <span className={"ds-fotos" + (f.fotos < 3 ? " mal" : "")}>{f.fotos}/3 fotos</span>
                </header>

                <ul className="ds-mats">
                  {cs.map((c) => (
                    <li key={c.sku}>
                      <div>
                        <b>{c.nombre}</b>
                        <em>{c.sku}</em>
                      </div>
                      <div className="ds-num">
                        <b>{nf2.format(c.estibas)}</b><span>estibas</span>
                      </div>
                      <div className="ds-cif">
                        {c.cajas == null
                          ? <span className="sin">Sin factores en el maestro</span>
                          : <>{nf.format(c.cajas)} cajas · {c.unidades != null ? nf.format(c.unidades) : "—"} unidades · {c.hl != null ? nf2.format(c.hl) : "—"} HL</>}
                      </div>
                    </li>
                  ))}
                </ul>

                <dl className="ds-total">
                  <div><dt>Estibas</dt><dd>{nf2.format(totalEst)}</dd></div>
                  <div><dt>Sider</dt><dd>{nf2.format(totalEst / estibasPorSider)}</dd></div>
                  <div><dt>Cajas</dt><dd>{totalCajas == null ? "—" : nf.format(totalCajas)}</dd></div>
                  <div><dt>HL</dt><dd>{totalHl == null ? "—" : nf2.format(totalHl)}</dd></div>
                </dl>

                <p className="ds-quien">
                  Certificó {suya ? "tú" : (f.creado_por ? nombres[f.creado_por] ?? "—" : "—")} · {haceCuanto(f.creado_en, ahora)}
                  {f.direccion ? <em>{f.direccion}</em> : null}
                  {f.lote ? <em>Lote {f.lote}</em> : null}
                  {f.nota ? <em>{f.nota}</em> : null}
                </p>

                {f.fotos < 3 && (
                  <p className="ds-mal">
                    Le faltan fotos: no se le puede dar salida. Quien la creó debe descartarla y hacerla de nuevo.
                  </p>
                )}

                {puedeDarSalida && f.fotos >= 3 && (
                  <div className="ds-accion">
                    <label>
                      <span>Número de factura</span>
                      <input value={factura} placeholder="FE-4471" autoCapitalize="characters" autoComplete="off"
                             aria-label={`Número de factura de ${f.placa}`}
                             onChange={(e) => setFacturas((x) => ({ ...x, [f.id]: limpiaFactura(e.target.value) }))} />
                    </label>
                    <button type="button" className="btn" disabled={!factura.trim() || ocupada === f.id}
                            onClick={() => darSalida(f)}>
                      {ocupada === f.id ? "Dando salida…" : "Dar salida"}
                    </button>
                  </div>
                )}
                {puedeDarSalida && f.fotos >= 3 && !factura.trim() && (
                  <p className="ds-ayuda">Sin el número de factura el botón no se enciende.</p>
                )}
                {mal[f.id] && <p className="ds-mal" role="alert">{mal[f.id]}</p>}

                {(puedeDarSalida || suya) && (
                  <div className="ds-pie">
                    {seguro === f.id ? (
                      <>
                        <span>¿Descartar la ficha de {f.placa}?</span>
                        <button type="button" className="btn mal" disabled={ocupada === f.id} onClick={() => descartar(f)}>Sí, descartar</button>
                        <button type="button" className="btn plano" onClick={() => setSeguro(null)}>No</button>
                      </>
                    ) : (
                      <button type="button" className="btn plano" onClick={() => setSeguro(f.id)}>Descartar</button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {avisos}
    </>
  );
}
