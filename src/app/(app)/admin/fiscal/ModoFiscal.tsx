"use client";

import { useMemo, useRef, useState } from "react";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import { abrirModoFiscal, guardarModoFiscal, type RespuestaPin } from "./actions";

export type RolFiscal = { clave: string; nombre: string; manda: boolean };
export type PerfilFiscal = { id: string; usuario: string | null; nombre: string | null; rol: string | null; activo: boolean | null };

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const MENSAJE: Record<Exclude<RespuestaPin, "ok">, string> = {
  mal: "PIN incorrecto.",
  bloqueado: "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
  no_admin: "Esta pantalla es solo de quien administra.",
  falta: "Falta correr 2026-11-modo-fiscal.sql en Supabase.",
  error: "No se pudo comprobar el PIN. Intenta de nuevo.",
};

export function ModoFiscal({ roles, perfiles, inicial }: {
  roles: RolFiscal[]; perfiles: PerfilFiscal[]; inicial: { roles: string[]; usuarios: string[] };
}) {
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();

  /* EL PIN SOLO VIVE EN MEMORIA, en esta pantalla: al salir o recargar se vuelve a pedir. Se reenvía al
     guardar porque la base lo vuelve a comprobar; el navegador no decide nada. */
  const [pin, setPin] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [escrito, setEscrito] = useState("");
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState("");
  const caja = useRef<HTMLInputElement>(null);

  const [rolesSel, setRolesSel] = useState<Set<string>>(new Set(inicial.roles));
  const [usuSel, setUsuSel] = useState<Set<string>>(new Set(inicial.usuarios));
  const [buscar, setBuscar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState({ roles: inicial.roles.join(","), usuarios: inicial.usuarios.join(",") });

  const manda = useMemo(() => new Set(roles.filter((r) => r.manda).map((r) => r.clave)), [roles]);
  const nRol = (c: string | null) => roles.find((r) => r.clave === c)?.nombre ?? c ?? "—";

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(escrito)) { setError("El PIN son solo números."); return }
    setProbando(true); setError("");
    const r = await abrirModoFiscal(escrito);
    setProbando(false);
    if (r === "ok") { setPin(escrito); setEscrito(""); setAbierto(true); return }
    setEscrito(""); setError(MENSAJE[r]); caja.current?.focus();
  }

  const alternarRol = (c: string) => setRolesSel((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n });
  const alternarUsu = (id: string) => setUsuSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n });

  /* Quién queda de verdad en modo fiscal: por su rol o por ser escogido, y nunca quien administra. */
  const queda = (p: PerfilFiscal) => !(p.rol && manda.has(p.rol)) && ((p.rol != null && rolesSel.has(p.rol)) || usuSel.has(p.id));
  const total = perfiles.filter((p) => queda(p) && p.activo !== false).length;
  const clave = (a: Set<string>) => [...a].sort().join(",");
  const cambio = clave(rolesSel) !== guardado.roles.split(",").filter(Boolean).sort().join(",")
    || clave(usuSel) !== guardado.usuarios.split(",").filter(Boolean).sort().join(",");

  const visibles = useMemo(() => {
    const q = sinTildes(buscar.trim());
    return perfiles.filter((p) => !q || sinTildes(`${p.nombre ?? ""} ${p.usuario ?? ""} ${nRol(p.rol)}`).includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfiles, buscar]);

  async function guardar() {
    const ok = await pedir({
      titulo: total === 0 ? "Apagar el modo FISCAL" : `Activar el modo FISCAL a ${total} ${total === 1 ? "persona" : "personas"}`,
      dice: total === 0
        ? "Nadie quedará en modo fiscal: todos vuelven a ver sus módulos de siempre."
        : <>Esas personas verán <b>solo Inventario → Contar</b> y, dentro, solo el fiscal que les habilitaron. El cambio rige desde su próxima pantalla.</>,
      confirmar: total === 0 ? "Apagar" : "Activar",
    });
    if (!ok) return;
    setGuardando(true);
    const { resultado } = await guardarModoFiscal(pin, [...rolesSel], [...usuSel]);
    setGuardando(false);
    if (resultado === "guardado") {
      setGuardado({ roles: [...rolesSel].join(","), usuarios: [...usuSel].join(",") });
      avisar.bien(total === 0 ? "Modo FISCAL apagado." : `Modo FISCAL activo para ${total} ${total === 1 ? "persona" : "personas"}.`);
      return;
    }
    if (resultado === "mal" || resultado === "bloqueado") { setAbierto(false); setPin(""); }
    avisar.mal(MENSAJE[resultado]);
  }

  if (!abierto) {
    return (
      <>
        {avisos}{dialogo}
        <section className="tarjeta fis-pin">
          <div className="cab"><div>
            <h2>Escribe el PIN para continuar</h2>
            <p>Se pide cada vez que se abre esta pantalla. Con 5 intentos malos seguidos se bloquea 5 minutos.</p>
          </div></div>
          <form className="fis-pin-forma" onSubmit={entrar}>
            <input ref={caja} type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={8}
                   value={escrito} onChange={(e) => { setEscrito(e.target.value.replace(/\D/g, "")); setError("") }}
                   aria-label="PIN" placeholder="PIN" />
            <button className="btn" disabled={probando || escrito.length < 4}>{probando ? "Comprobando…" : "Entrar"}</button>
          </form>
          {error && <div className="aviso mal" role="alert">{error}</div>}
        </section>
      </>
    );
  }

  return (
    <>
      {avisos}{dialogo}
      <section className="tarjeta">
        <div className="cab"><div>
          <h2>1 · Roles</h2>
          <p>Marcar un rol activa el modo a todas las personas que lo tengan, las de hoy y las que lleguen después.</p>
        </div></div>
        <ul className="fis-lista">
          {roles.map((r) => {
            const mand = r.manda;
            const n = perfiles.filter((p) => p.rol === r.clave && p.activo !== false).length;
            return (
              <li key={r.clave}>
                <label className={"fis-fila" + (mand ? " off" : "")}>
                  <input type="checkbox" disabled={mand} checked={!mand && rolesSel.has(r.clave)} onChange={() => alternarRol(r.clave)} />
                  <span className="fis-nombre">{r.nombre}</span>
                  <span className="fis-nota">{mand ? "administra · nunca queda en modo fiscal" : `${n} ${n === 1 ? "persona" : "personas"}`}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="tarjeta">
        <div className="cab"><div>
          <h2>2 · Personas sueltas</h2>
          <p>Para quien no es de un rol completo. Quien ya queda por su rol sale marcado en gris.</p>
        </div></div>
        <div className="fis-buscar">
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre, usuario o rol" aria-label="Buscar persona" />
        </div>
        <ul className="fis-lista">
          {visibles.map((p) => {
            const mand = !!(p.rol && manda.has(p.rol));
            const porRol = !mand && p.rol != null && rolesSel.has(p.rol);
            return (
              <li key={p.id}>
                <label className={"fis-fila" + (mand ? " off" : "") + (p.activo === false ? " baja" : "")}>
                  <input type="checkbox" disabled={mand || porRol} checked={!mand && (porRol || usuSel.has(p.id))} onChange={() => alternarUsu(p.id)} />
                  <span className="fis-nombre">{p.nombre || p.usuario || "Sin nombre"}</span>
                  <span className="fis-nota">
                    {p.usuario ? `${p.usuario} · ` : ""}{nRol(p.rol)}
                    {mand && " · administra"}{porRol && " · ya incluido por su rol"}{p.activo === false && " · inactivo"}
                  </span>
                </label>
              </li>
            );
          })}
          {visibles.length === 0 && <li className="fis-vacio">Nadie coincide con la búsqueda.</li>}
        </ul>
      </section>

      <div className="fis-pie">
        <p><b>{total}</b> {total === 1 ? "persona queda" : "personas quedan"} en modo FISCAL.</p>
        <button className="btn" onClick={guardar} disabled={guardando || !cambio}>{guardando ? "Guardando…" : "Guardar"}</button>
      </div>
    </>
  );
}
