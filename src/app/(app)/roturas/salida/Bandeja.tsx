"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import type { Salida } from "@/modulos/roturas/datos";
import { fecha, kilos, quien } from "@/modulos/roturas/formato";
import { Firmas, PAPELES, type Papel, puedeFirmar } from "./Firmas";

/**
 * LA BANDEJA DE UNA ETAPA — Verificación y Validación.
 *
 * Una sola pantalla para las dos porque hacen exactamente lo mismo:
 * enseñan lo que llegó a SU etapa y ponen UN botón. Dos copias serían
 * dos sitios donde arreglar el mismo detalle, y una se quedaría vieja.
 *
 * AQUÍ SOLO LLEGA LO QUE LE TOCA A ESTA ETAPA. Lo que el supervisor (a) no
 * ha cerrado no aparece en Verificación; lo que nadie verificó no
 * aparece en Validación. Quien entra no tiene que buscar lo suyo entre
 * lo de los demás, y sobre todo no ve un botón que la base le va a
 * negar.
 *
 * Y NO SE FIRMA A CIEGAS: cada salida enseña su cuenta —bruto, tara,
 * neto— y sus tolvas antes del botón. Una firma puesta sobre un código
 * y una fecha no es una verificación, es un trámite.
 */
export function Bandeja({ salidas, nombres, papel, rol, manda }: {
  salidas: Salida[];
  nombres: Record<string, string>;
  papel: Papel;
  rol: string;
  manda: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();

  const [abierta, setAbierta] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);

  const info = PAPELES.find((p) => p.id === papel)!;
  const puede = puedeFirmar(papel, rol, manda);
  const verbo = papel === "verificador" ? "Verificar" : "Dar salida";

  async function firmar(s: Salida) {
    const ok = await pedir({
      titulo: `¿${verbo} ${s.codigo}?`,
      dice: papel === "verificador"
        ? `Camión ${s.placa}. Estás diciendo que revisaste ${kilos(s.neto_kg)} kg netos en ${s.tolvas} tolva${s.tolvas === 1 ? "" : "s"} y que la cuenta está bien. Queda escrito tu nombre y la hora.`
        : `Camión ${s.placa}. Estás dando el aval para que salgan ${kilos(s.neto_kg)} kg netos. Es la última firma: después la salida queda cerrada.`,
      confirmar: verbo,
    });
    if (!ok) return;
    setMandando(true);
    const { error } = await supabase.rpc("salida_firmar", { p_salida: s.id, p_papel: papel });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${s.codigo} ${papel === "verificador" ? "quedó verificada" : "quedó lista para salir"}.`);
    router.refresh();
  }

  return (
    <>
      {avisos}{dialogo}

      {!puede && (
        <div className="aviso">
          Estás viendo la bandeja, pero firmar aquí es del rol <b>{info.t}</b> o del
          administrador. Los botones aparecen cuando tengas ese rol.
        </div>
      )}

      <div className="filas">
        {salidas.length === 0 && (
          <div className="caja"><div className="vacio">
            <b>Bandeja limpia</b>
            {papel === "verificador"
              ? "No hay salidas cerradas esperando verificación."
              : "No hay salidas verificadas esperando el aval de salida."}
          </div></div>
        )}

        {salidas.map((s) => {
          const espera = s.supervisora_en
            ? Math.round((Date.now() - new Date(
                papel === "verificador" ? s.supervisora_en : (s.verificador_en ?? s.supervisora_en)
              ).getTime()) / 60000)
            : 0;

          return (
            <div key={s.id} className="fila">
              <div className="cod">{s.codigo}</div>

              <div>
                <div className="tit">
                  <span className="placa">{s.placa}</span>
                  {kilos(s.neto_kg)} kg netos
                  <span className="eti esperando">{s.tolvas} tolva{s.tolvas === 1 ? "" : "s"}</span>
                </div>
                <div className="meta">
                  <span>bruto {kilos(s.bruto_kg)}</span>
                  <span>−</span>
                  <span>tara {kilos(s.tara_kg)}</span>
                  <span>·</span>
                  <b>neto {kilos(s.neto_kg)} kg</b>
                </div>
                <div className="meta">
                  <span>
                    Pesada por {quien(nombres, s.supervisora_por)} · {fecha(s.supervisora_en)}
                  </span>
                  {espera > 0 && (
                    <>
                      <span>·</span>
                      {/* Cuánto lleva esperando. Sin esto, una salida
                          parada dos días se ve igual que una de hace
                          diez minutos. */}
                      <span className={espera > 240 ? "eti falta" : ""}>
                        esperando {espera < 60 ? `${espera} min` : `${Math.round(espera / 60)} h`}
                      </span>
                    </>
                  )}
                  {s.observacion && <><span>·</span><span>{s.observacion}</span></>}
                  {s.mismo_firmante && (
                    <span className="eti falta" title="Dos firmas de la misma persona">
                      MISMA PERSONA
                    </span>
                  )}
                </div>

                {abierta === s.id && (
                  <div className="panel">
                    <Firmas salida={s} nombres={nombres} />
                  </div>
                )}
              </div>

              <div className="der">
                <div className="par">
                  <button type="button" className="btn"
                          onClick={() => setAbierta(abierta === s.id ? null : s.id)}>
                    {abierta === s.id ? "Cerrar" : "Ver firmas"}
                  </button>
                  <Link href={`/roturas/salida/${s.id}`} className="btn">Ver tolvas</Link>
                  {puede && (
                    <button type="button" className="btn si" disabled={mandando}
                            onClick={() => firmar(s)}>
                      {verbo}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
