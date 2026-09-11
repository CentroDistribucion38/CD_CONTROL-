"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import type { Salida, Tolva, TolvaPesada } from "@/modulos/roturas/datos";
import { COLOR_VIDRIO, fecha, kilos, quien } from "@/modulos/roturas/formato";

/**
 * PESAR UNA SALIDA — bruto menos tara, tolva por tolva.
 *
 * LA RESTA SE DIBUJA COMO RESTA y no como tres celdas de una tabla:
 * quien pesa tiene la báscula al lado y tiene que poder mirar la
 * pantalla y reconocer la cuenta que acaba de hacer. Una tabla con
 * columnas "bruto / tara / neto" se lee después, en la oficina; esto se
 * lee de pie.
 *
 * LA TARA NO SE TECLEA. Viene del maestro y se copia a la línea al
 * pesar. Teclearla cada vez es teclear 111 mal una vez de cada veinte, y
 * ese error no lo ve nadie hasta que la factura no cuadra.
 *
 * LAS TRES FIRMAS EN CADENA. Solo se pinta el botón de LA QUE SIGUE: las
 * otras dos esperan o ya están. Tres botones activos al tiempo invitan a
 * que la misma persona toque los tres, que es exactamente lo que la
 * regla quiere impedir.
 */

const PAPELES = [
  { id: "supervisora", t: "Supervisora", h: "cierra la salida" },
  { id: "verificador", t: "Verificador", h: "verifica el peso" },
  { id: "facturador", t: "Facturador", h: "factura la salida" },
] as const;

export function Pesar({ salida, tolvas, maestro, nombres, rol, manda }: {
  salida: Salida;
  tolvas: TolvaPesada[];
  maestro: Tolva[];
  nombres: Record<string, string>;
  rol: string;
  manda: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();

  const [tolva, setTolva] = useState(maestro[0]?.codigo ?? "");
  const [color, setColor] = useState<"ambar" | "flint" | "green">("ambar");
  const [bruto, setBruto] = useState("");
  const [mandando, setMandando] = useState(false);

  const abierta = salida.estado === "abierta";
  const elegida = maestro.find((t) => t.codigo === tolva) ?? null;
  const brutoN = Number(bruto.replace(",", ".")) || 0;
  const netoPrevio = elegida ? brutoN - Number(elegida.tara_kg) : 0;

  async function pesar() {
    setMandando(true);
    const { error } = await supabase.rpc("salida_pesar", {
      p_salida: salida.id, p_tolva: tolva, p_color: color, p_bruto: brutoN,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${tolva} quedó pesada: ${kilos(netoPrevio)} kg netos.`);
    setBruto("");
    router.refresh();
  }

  async function quitar(t: TolvaPesada) {
    const ok = await pedir({
      titulo: `¿Quitar ${t.tolva} de esta salida?`,
      dice: `Se va a borrar el pesaje de ${kilos(t.bruto_kg)} kg brutos. El neto de la salida baja ${kilos(Number(t.bruto_kg) - Number(t.tara_kg))} kg.`,
      confirmar: "Quitar la tolva",
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("salida_quitar_tolva", { p_id: t.id });
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${t.tolva} salió de la salida.`);
    router.refresh();
  }

  async function firmar(papel: string, nombre: string) {
    const ok = await pedir({
      titulo: `¿Firmar como ${nombre}?`,
      dice: papel === "supervisora"
        ? `Esto CIERRA la salida: después no se pueden agregar ni quitar tolvas. Quedan ${salida.tolvas} tolva${salida.tolvas === 1 ? "" : "s"} y ${kilos(salida.neto_kg)} kg netos.`
        : `Queda escrito tu nombre y la hora sobre ${kilos(salida.neto_kg)} kg netos en ${salida.tolvas} tolva${salida.tolvas === 1 ? "" : "s"}.`,
      confirmar: "Firmar",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("salida_firmar", { p_salida: salida.id, p_papel: papel });
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`Firmada como ${nombre}.`);
    router.refresh();
  }

  /* CUÁL FIRMA SIGUE. Es lo único que decide qué botón se pinta, y sale
     del estado de la salida y no de quién esté mirando: la cadena es la
     misma para todos. */
  const siguiente = !salida.supervisora_en ? "supervisora"
    : !salida.verificador_en ? "verificador"
    : !salida.facturador_en ? "facturador" : null;

  const puedeFirmar = (papel: string) => manda
    || (papel === "supervisora" && rol === "supervisor")
    || (papel === "verificador" && rol === "verificador")
    || (papel === "facturador" && rol === "facturador");

  return (
    <>
      {avisos}{dialogo}

      {/* ================= La cuenta de la salida ================= */}
      <section className="caja">
        <div className="cab">
          <div>
            <h2>{salida.codigo} · {salida.tolvas} tolva{salida.tolvas === 1 ? "" : "s"}</h2>
            <p>
              El neto sale de sumar las tolvas cada vez que se mira. No hay ningún total
              guardado que pueda quedar desfasado de sus propias tolvas.
            </p>
          </div>
        </div>
        <div style={{ padding: 14 }}>
          <div className="cuenta">
            <span className="caja-n"><small>BRUTO</small>{kilos(salida.bruto_kg)}</span>
            <span className="signo">−</span>
            <span className="caja-n tara"><small>TARA</small>{kilos(salida.tara_kg)}</span>
            <span className="signo">=</span>
            <span className="caja-n neto"><small>NETO KG</small>{kilos(salida.neto_kg)}</span>
          </div>
        </div>
      </section>

      {/* ================= Pesar una tolva ================= */}
      {abierta && (
        <section className="caja">
          <div className="cab"><div>
            <h2>Pesar una tolva</h2>
            <p>La tara la pone el maestro y se copia a esta línea. Solo se teclea el bruto.</p>
          </div></div>
          <div className="panel" style={{ margin: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 9 }}>
              <div>
                <label htmlFor="tolva">Tolva</label>
                <select id="tolva" value={tolva} onChange={(e) => setTolva(e.target.value)}>
                  {maestro.map((t) => (
                    <option key={t.codigo} value={t.codigo}>
                      {t.codigo} · tara {kilos(t.tara_kg)} kg
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="color">Color del vidrio</label>
                <select id="color" value={color}
                        onChange={(e) => setColor(e.target.value as typeof color)}>
                  {Object.entries(COLOR_VIDRIO).map(([k, v]) =>
                    <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="bruto">Bruto en la báscula (kg)</label>
                <input id="bruto" type="number" inputMode="decimal" step="0.1" min="0"
                       value={bruto} onChange={(e) => setBruto(e.target.value)}
                       placeholder="1203" />
              </div>
            </div>

            {elegida && brutoN > 0 && (
              <div className="cuenta" style={{ marginTop: 4 }}>
                <span className="caja-n"><small>BRUTO</small>{kilos(brutoN)}</span>
                <span className="signo">−</span>
                <span className="caja-n tara"><small>TARA {elegida.codigo}</small>{kilos(elegida.tara_kg)}</span>
                <span className="signo">=</span>
                <span className="caja-n neto"><small>NETO KG</small>{kilos(netoPrevio)}</span>
              </div>
            )}

            {elegida && brutoN > 0 && netoPrevio <= 0 && (
              <div className="aviso rojo">
                {kilos(brutoN)} kg no puede ser el bruto de una tolva que pesa {kilos(elegida.tara_kg)} kg
                vacía. Revisa el número de la báscula.
              </div>
            )}

            <div className="acciones-panel">
              <button type="button" className="btn si"
                      disabled={mandando || !elegida || netoPrevio <= 0}
                      onClick={pesar}>
                {mandando ? "Guardando…" : "Agregar esta tolva"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ================= Las tolvas pesadas ================= */}
      <section className="caja">
        <div className="cab"><div>
          <h2>Tolvas de esta salida</h2>
          <p>Cada una con la tara que tenía el día que se pesó, no la de hoy.</p>
        </div></div>
        <div className="rueda">
          {tolvas.length === 0 && (
            <div className="vacio">
              <b>Sin tolvas</b>
              Una salida sin tolvas pesadas no se puede firmar.
            </div>
          )}
          {tolvas.map((t) => (
            <div key={t.id} className="tolva">
              <div>
                <div className="nom">
                  {t.tolva} · <span className={"vidrio " + t.color}><i aria-hidden />{COLOR_VIDRIO[t.color]}</span>
                </div>
                <div className="det">
                  {kilos(t.bruto_kg)} − {kilos(t.tara_kg)} = <b>{kilos(Number(t.bruto_kg) - Number(t.tara_kg))} kg</b>
                  {" · "}{quien(nombres, t.pesada_por)} · {fecha(t.pesada_en)}
                </div>
              </div>
              {abierta && (
                <button type="button" className="btn mal" onClick={() => quitar(t)}>
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ================= Las tres firmas ================= */}
      <section className="caja">
        <div className="cab"><div>
          <h2>Las tres firmas</h2>
          <p>
            En cadena y en orden: no se verifica lo que la supervisora no ha cerrado, ni se
            factura lo que nadie verificó. Y son tres personas: quien pesó no verifica.
          </p>
        </div></div>
        <div style={{ padding: 12 }}>
          <div className="firmas">
            {PAPELES.map((p) => {
              const en = p.id === "supervisora" ? salida.supervisora_en
                : p.id === "verificador" ? salida.verificador_en : salida.facturador_en;
              const por = p.id === "supervisora" ? salida.supervisora_por
                : p.id === "verificador" ? salida.verificador_por : salida.facturador_por;
              const turno = siguiente === p.id && salida.estado !== "anulada";

              return (
                <div key={p.id} className={"firma" + (en ? " lista" : turno ? " turno" : "")}>
                  <div className="rot">{p.t.toUpperCase()}</div>
                  {en ? (
                    <>
                      <div className="quien">{quien(nombres, por)}</div>
                      <div className="cuando">{fecha(en)}</div>
                    </>
                  ) : (
                    <>
                      <div className="quien" style={{ color: "var(--rt-gris)" }}>Sin firmar</div>
                      <div className="cuando">{p.h}</div>
                      {turno ? (
                        puedeFirmar(p.id) ? (
                          <button type="button" className="btn si"
                                  disabled={p.id === "supervisora" && salida.tolvas === 0}
                                  onClick={() => firmar(p.id, p.t)}>
                            {p.id === "supervisora" && salida.tolvas === 0
                              ? "Falta pesar" : "Firmar"}
                          </button>
                        ) : (
                          <div className="espera">Le toca al rol <b>{p.t}</b>.</div>
                        )
                      ) : (
                        <div className="espera">Espera la firma anterior.</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {salida.completa && (
            <div className="aviso" style={{ marginTop: 12 }}>
              Salida completa: {kilos(salida.neto_kg)} kg netos con las tres firmas.
            </div>
          )}
          {salida.estado === "anulada" && (
            <div className="aviso rojo" style={{ marginTop: 12 }}>Esta salida está anulada.</div>
          )}
        </div>
      </section>
    </>
  );
}
