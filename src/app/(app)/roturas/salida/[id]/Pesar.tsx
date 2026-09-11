"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import type { Salida, Tolva, TolvaPesada } from "@/modulos/roturas/datos";
import { COLOR_VIDRIO, fecha, kilos, quien } from "@/modulos/roturas/formato";
import { Firmas, etapaDe, puedeFirmar } from "../Firmas";
import { IlustracionTolva } from "../IlustracionTolva";

/**
 * PESAR UNA SALIDA — bruto menos tara, tolva por tolva.
 *
 * LA RESTA VA POR TOLVA Y NO SOLO AL FINAL. Quien pesa hace la cuenta en
 * la báscula tolva por tolva; si la pantalla solo mostrara el total, un
 * bruto tecleado mal no se vería hasta el final, cuando ya no se sabe
 * cuál de las tres estaba mala.
 *
 * LA TARA NO SE TECLEA. Viene del maestro y se copia a la línea al
 * pesar. Teclearla cada vez es teclear 111 mal una vez de cada veinte, y
 * ese error no lo ve nadie hasta que la factura no cuadra.
 *
 * AQUÍ SOLO SE PONE LA PRIMERA FIRMA. Verificar y validar tienen sus
 * propias pantallas, porque son otras dos personas. Antes los tres
 * botones estaban aquí, la misma persona tocaba dos y la base le
 * contestaba "quien pesó no verifica": la regla estaba bien, pero la
 * pantalla la convertía en un regaño en lugar de un camino.
 */
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

  const [nueva, setNueva] = useState(false);
  const [tolva, setTolva] = useState(maestro[0]?.codigo ?? "");
  const [color, setColor] = useState<"ambar" | "flint" | "green">("ambar");
  const [bruto, setBruto] = useState("");
  const [mandando, setMandando] = useState(false);
  /* La nota de ESTA firma. Se pide antes de cerrar y no después: si
     saliera al terminar, lo que había que contar ya se firmó sin
     contarlo. */
  const [cerrando, setCerrando] = useState(false);
  const [nota, setNota] = useState("");

  const abierta = salida.estado === "abierta";
  const elegida = maestro.find((t) => t.codigo === tolva) ?? null;
  const brutoN = Number(bruto.replace(",", ".")) || 0;
  const netoPrevio = elegida ? brutoN - Number(elegida.tara_kg) : 0;
  const taraEjemplo = maestro[0]?.tara_kg ?? 111;

  /* El vidrio se vende POR COLOR, así que un total único no le sirve a
     quien factura. Se parte aquí, sobre lo que ya está pesado. */
  const porColor = (c: string) => tolvas.filter((t) => t.color === c)
    .reduce((s, t) => s + (Number(t.bruto_kg) - Number(t.tara_kg)), 0);

  async function pesar() {
    setMandando(true);
    const { error } = await supabase.rpc("salida_pesar", {
      p_salida: salida.id, p_tolva: tolva, p_color: color, p_bruto: brutoN,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${tolva} quedó pesada: ${kilos(netoPrevio)} kg netos.`);
    setBruto(""); setNueva(false);
    router.refresh();
  }

  async function quitar(t: TolvaPesada) {
    const ok = await pedir({
      titulo: `¿Quitar ${t.tolva} de esta salida?`,
      dice: `Se borra el pesaje de ${kilos(t.bruto_kg)} kg brutos. El neto de la salida baja ${kilos(Number(t.bruto_kg) - Number(t.tara_kg))} kg.`,
      confirmar: "Quitar la tolva",
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("salida_quitar_tolva", { p_id: t.id });
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${t.tolva} salió de la salida.`);
    router.refresh();
  }

  async function cerrar() {
    const ok = await pedir({
      titulo: "¿Cerrar y enviar a verificación?",
      dice: `Después no se pueden agregar ni quitar tolvas. Van ${salida.tolvas} tolva${salida.tolvas === 1 ? "" : "s"} y ${kilos(salida.neto_kg)} kg netos, y pasa a la bandeja de otra persona: tú no la verificas.`,
      confirmar: "Cerrar y enviar",
    });
    if (!ok) return;
    setMandando(true);
    const { error } = await supabase.rpc("salida_firmar", {
      p_salida: salida.id, p_papel: "supervisora", p_nota: nota.trim() || null,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${salida.codigo} quedó cerrada y pasó a Verificación.`);
    router.push("/roturas/salida");
    router.refresh();
  }

  const etapa = etapaDe(salida);
  const meToca = etapa === "supervisora" && puedeFirmar("supervisora", rol, manda);

  return (
    <>
      {avisos}{dialogo}

      {/* ============ CÓMO SE MIDE ============ */}
      <section className="comomide">
        <div>
          <div className="rot">CÓMO SE MIDE</div>
          <h2>Bruto menos tolva</h2>
          <p>
            Se pesa la tolva llena en la báscula y el sistema descuenta los {kilos(taraEjemplo)} kg
            del recipiente. Si mañana entra una tolva de otro modelo, se cambia la tara en el
            maestro, no a mano en cada salida.
          </p>
          <div className="formula">
            <span className="chip">BRUTO</span>
            <span className="signo">−</span>
            <span className="chip tara">TARA {kilos(taraEjemplo)}</span>
            <span className="signo">=</span>
            <span className="chip neto">NETO</span>
          </div>
        </div>
        {/* El dibujo con su cota y el sello encima del extremo derecho:
            la tara es de ESTO —el recipiente completo—, no del vidrio
            que lleva dentro. Una frase lo explica; el dibujo lo hace
            obvio para quien llega nuevo a la báscula. */}
        <div className="dibujo">
          <IlustracionTolva />
          <div className="tara-sello">
            <div className="r">TARA</div>
            <div className="v">{kilos(taraEjemplo)} kg</div>
          </div>
        </div>
      </section>

      {/* ============ LAS TOLVAS ============ */}
      <section className="caja">
        <div className="cab">
          <div>
            <h2>Tolvas de esta salida</h2>
            <p>
              Una salida puede llevar varios vidrios. Cada tolva guarda la tara que tenía el día
              en que se pesó, no la de hoy.
            </p>
          </div>
        </div>

        <div className="tolvas">
          {tolvas.map((t) => (
            <div key={t.id} className="tolva-card">
              <div className="arriba">
                <span className="nom">{t.tolva}</span>
                {abierta && (
                  <button type="button" className="quitar" onClick={() => quitar(t)}>Quitar</button>
                )}
              </div>

              <label>Vidrio</label>
              <div className="vidrio" style={{ padding: "12px 0", fontSize: 15 }}>
                <i aria-hidden className={""} style={{
                  background: t.color === "ambar" ? "#C8801F" : t.color === "flint" ? "#E7EBE7" : "#2F6B3C",
                  width: 18, height: 18, border: "1px solid rgba(0,0,0,.18)", display: "inline-block",
                }} />
                {COLOR_VIDRIO[t.color]}
              </div>

              <div className="resta">
                <div className="l"><span>Bruto</span><span>{kilos(t.bruto_kg)} kg</span></div>
                <div className="l menos"><span>− Tara de la tolva</span><span>{kilos(t.tara_kg)} kg</span></div>
                <div className="l neto">
                  <span>Neto</span>
                  <span>{kilos(Number(t.bruto_kg) - Number(t.tara_kg))} kg</span>
                </div>
              </div>

              <div className="pie-t">{quien(nombres, t.pesada_por)} · {fecha(t.pesada_en)}</div>
            </div>
          ))}

          {/* La tolva que se está pesando ahora. Es la misma tarjeta que
              las demás, con los campos abiertos: así se ve la resta
              armándose mientras se teclea el bruto. */}
          {abierta && nueva && (
            <div className="tolva-card">
              <div className="arriba">
                <span className="nom">NUEVA TOLVA</span>
                <button type="button" className="quitar"
                        onClick={() => { setNueva(false); setBruto("") }}>Cancelar</button>
              </div>

              <label htmlFor="p-tolva">Tolva</label>
              <select id="p-tolva" value={tolva} onChange={(e) => setTolva(e.target.value)}>
                {maestro.map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.codigo} · tara {kilos(t.tara_kg)} kg
                  </option>
                ))}
              </select>

              <label htmlFor="p-color">Vidrio</label>
              <select id="p-color" value={color}
                      onChange={(e) => setColor(e.target.value as typeof color)}>
                {Object.entries(COLOR_VIDRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>

              <label htmlFor="p-bruto">Peso en báscula (bruto)</label>
              <input id="p-bruto" className="peso" type="number" inputMode="decimal"
                     step="0.1" min="0" value={bruto} autoFocus
                     onChange={(e) => setBruto(e.target.value)} placeholder="523" />

              <div className="resta">
                <div className="l"><span>Bruto</span><span>{kilos(brutoN)} kg</span></div>
                <div className="l menos">
                  <span>− Tara de la tolva</span>
                  <span>{kilos(elegida?.tara_kg ?? 0)} kg</span>
                </div>
                <div className="l neto">
                  <span>Neto</span><span>{kilos(Math.max(0, netoPrevio))} kg</span>
                </div>
              </div>

              {brutoN > 0 && netoPrevio <= 0 && (
                <div className="pie-t" style={{ color: "var(--rt-mal)" }}>
                  {kilos(brutoN)} kg no puede ser el bruto de una tolva que pesa{" "}
                  {kilos(elegida?.tara_kg ?? 0)} kg vacía. Revisa la báscula.
                </div>
              )}

              <button type="button" className="btn si" style={{ width: "100%", marginTop: 14 }}
                      disabled={mandando || !elegida || netoPrevio <= 0} onClick={pesar}>
                {mandando ? "Guardando…" : "Guardar esta tolva"}
              </button>
            </div>
          )}

          {abierta && !nueva && (
            <button type="button" className="agregar" onClick={() => setNueva(true)}>
              <span><b>+</b> Agregar tolva</span>
            </button>
          )}

          {!abierta && tolvas.length === 0 && (
            <div className="vacio"><b>Sin tolvas</b>Esta salida no tiene ninguna pesada.</div>
          )}
        </div>
      </section>

      {/* ============ LA BANDA DE TOTALES ============ */}
      <section className="totales">
        <div className="t">
          <div className="r">ÁMBAR</div>
          <div className="v">{kilos(porColor("ambar"))} kg</div>
        </div>
        <div className="t">
          <div className="r">FLINT</div>
          <div className="v">{kilos(porColor("flint"))} kg</div>
        </div>
        <div className="t">
          <div className="r">GREEN</div>
          <div className="v">{kilos(porColor("green"))} kg</div>
        </div>
        <div className="t neto" style={{ flex: "1 1 auto" }}>
          <div className="r">TOTAL NETO · {salida.tolvas} TOLVA{salida.tolvas === 1 ? "" : "S"}</div>
          <div className="v">{kilos(salida.neto_kg)} kg</div>
        </div>
      </section>

      {/* ============ LAS FIRMAS ============ */}
      <section className="caja">
        <div className="cab">
          <div>
            <h2>Firmas</h2>
            <p>
              Tres personas, tres momentos. Nadie firma por otro, y cada una lo hace desde su
              propia pantalla: Pesar, Verificación y Validación.
            </p>
          </div>
        </div>
        <div style={{ padding: 18 }}>
          <Firmas salida={salida} nombres={nombres} />

          {meToca && !cerrando && (
            <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
              <button type="button" className="btn si"
                      disabled={salida.tolvas === 0}
                      onClick={() => { setCerrando(true); setNota("") }}>
                {salida.tolvas === 0 ? "Falta pesar una tolva" : "Cerrar y enviar a verificación"}
              </button>
              <span style={{ alignSelf: "center", fontSize: 13, color: "var(--rt-gris)" }}>
                Después de esto la salida pasa a otra persona. Tú no la verificas.
              </span>
            </div>
          )}

          {meToca && cerrando && (
            <div className="panel">
              <label htmlFor="nota-cierre">¿Alguna novedad al pesar? (opcional)</label>
              <textarea id="nota-cierre" rows={2} value={nota} autoFocus
                        onChange={(e) => setNota(e.target.value)}
                        placeholder="La TOLVA-3 entró con vidrio de dos colores mezclado." />
              <div className="acciones-panel">
                <button type="button" className="btn si" disabled={mandando} onClick={cerrar}>
                  {mandando ? "Cerrando…" : "Cerrar y enviar a verificación"}
                </button>
                <button type="button" className="btn plano"
                        onClick={() => { setCerrando(false); setNota("") }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {etapa && etapa !== "supervisora" && (
            <div className="aviso" style={{ marginTop: 18 }}>
              Esta salida está esperando la firma de <b>{etapa === "verificador" ? "Verificación" : "Validación"}</b>.
              Se firma desde esa pantalla, no desde aquí.
            </div>
          )}
          {salida.completa && (
            <div className="aviso" style={{ marginTop: 18, borderLeftColor: "var(--rt-verde)" }}>
              Salida completa: {kilos(salida.neto_kg)} kg netos con las tres firmas.
            </div>
          )}
          {salida.estado === "anulada" && (
            <div className="aviso rojo" style={{ marginTop: 18 }}>Esta salida está anulada.</div>
          )}
        </div>
      </section>
    </>
  );
}
