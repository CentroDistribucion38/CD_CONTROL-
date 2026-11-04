"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import { guardarModoFiscal, traerModoFiscal, type DatosModoFiscal, type RespuestaPin } from "./actions";
import "../roles/roles.css";
import "./fiscal.css";

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const MENSAJE: Record<Exclude<RespuestaPin, "ok">, string> = {
  mal: "PIN incorrecto.",
  bloqueado: "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
  no_admin: "Esto es solo de quien administra.",
  falta: "Falta correr 2026-11-modo-fiscal.sql en Supabase.",
  error: "No se pudo comprobar el PIN. Intenta de nuevo.",
};

/**
 * MODO FISCAL · EL CUADRO ESCONDIDO.
 *
 * No está en el menú: se abre desde Administración tocando cinco veces «ESTÁS EN» (ver Navegacion). Pide el PIN y,
 * solo con el PIN bueno, trae los roles y las personas para escoger a quién se le activa el «solo fiscal».
 * El PIN solo vive en memoria mientras el cuadro está abierto y se reenvía al guardar: lo vuelve a comprobar la base.
 */
export function ModoFiscal({ cerrar }: { cerrar: () => void }) {
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();

  const [pin, setPin] = useState("");
  const [datos, setDatos] = useState<DatosModoFiscal | null>(null);
  const [escrito, setEscrito] = useState("");
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState("");
  const caja = useRef<HTMLInputElement>(null);

  const [rolesSel, setRolesSel] = useState<Set<string>>(new Set());
  const [usuSel, setUsuSel] = useState<Set<string>>(new Set());
  const [buscar, setBuscar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState({ roles: "", usuarios: "" });

  /* Escape cierra, salvo que haya una confirmación encima (esa se cierra sola con Escape). */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" && document.querySelectorAll(".cf-velo").length < 2) cerrar() };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [cerrar]);

  const roles = datos?.roles ?? [], perfiles = datos?.perfiles ?? [];
  const manda = useMemo(() => new Set(roles.filter((r) => r.manda).map((r) => r.clave)), [roles]);
  const nRol = (c: string | null) => roles.find((r) => r.clave === c)?.nombre ?? c ?? "—";

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(escrito)) { setError("El PIN son solo números."); return }
    setProbando(true); setError("");
    const r = await traerModoFiscal(escrito);
    setProbando(false);
    if (r.resultado === "ok" && r.datos) {
      setPin(escrito); setEscrito(""); setDatos(r.datos);
      setRolesSel(new Set(r.datos.inicial.roles)); setUsuSel(new Set(r.datos.inicial.usuarios));
      setGuardado({ roles: [...r.datos.inicial.roles].sort().join(","), usuarios: [...r.datos.inicial.usuarios].sort().join(",") });
      return;
    }
    setEscrito(""); setError(MENSAJE[r.resultado === "ok" ? "error" : r.resultado]); caja.current?.focus();
  }

  const alternarRol = (c: string) => setRolesSel((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n });
  const alternarUsu = (id: string) => setUsuSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n });

  const queda = (p: DatosModoFiscal["perfiles"][number]) =>
    !(p.rol && manda.has(p.rol)) && ((p.rol != null && rolesSel.has(p.rol)) || usuSel.has(p.id));
  const total = perfiles.filter((p) => queda(p) && p.activo !== false).length;
  const clave = (a: Set<string>) => [...a].sort().join(",");
  const cambio = clave(rolesSel) !== guardado.roles || clave(usuSel) !== guardado.usuarios;

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
      setGuardado({ roles: clave(rolesSel), usuarios: clave(usuSel) });
      avisar.bien(total === 0 ? "Modo FISCAL apagado." : `Modo FISCAL activo para ${total} ${total === 1 ? "persona" : "personas"}.`);
      return;
    }
    if (resultado === "mal" || resultado === "bloqueado") { setDatos(null); setPin(""); setError(MENSAJE[resultado]) }
    else avisar.mal(MENSAJE[resultado]);
  }

  return (
    <div className="cf-velo fis-velo" role="dialog" aria-modal="true" aria-labelledby="fis-t"
         onMouseDown={(e) => { if (e.target === e.currentTarget && !datos) cerrar() }}>
      {avisos}{dialogo}
      {!datos ? (
        <div className="cf-caja fis-caja pin">
          <h2 id="fis-t">Escribe el PIN</h2>
          <p className="cf-dice">Con 5 intentos malos seguidos se bloquea 5 minutos.</p>
          <form className="fis-pin-forma" onSubmit={entrar}>
            <input ref={caja} type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={8}
                   value={escrito} onChange={(e) => { setEscrito(e.target.value.replace(/\D/g, "")); setError("") }}
                   aria-label="PIN" placeholder="PIN" />
            <button className="cf-btn" disabled={probando || escrito.length < 4}>{probando ? "Comprobando…" : "Entrar"}</button>
          </form>
          {error && <p className="fis-error" role="alert">{error}</p>}
          <div className="cf-botones"><button type="button" className="cf-btn plano" onClick={cerrar}>Cancelar</button></div>
        </div>
      ) : (
        <div className="cf-caja fis-caja">
          <div className="fis-cab">
            <div>
              <h2 id="fis-t">Modo FISCAL</h2>
              <p className="cf-dice">
                A quien actives, la aplicación le muestra <b>solo Inventario → Contar</b> y, dentro, solo el fiscal que le habilitaron
                (o «en espera»). Sin FEFO ni otros módulos. Quien administra nunca queda en este modo.
              </p>
            </div>
            <button type="button" className="fis-x" onClick={cerrar} aria-label="Cerrar">✕</button>
          </div>
          <div className="rl fis">
            <section className="tarjeta">
              <div className="cab"><div>
                <h2>Roles</h2>
                <p>Marcar un rol activa el modo a todas las personas que lo tengan, las de hoy y las que lleguen después.</p>
              </div></div>
              <ul className="fis-lista">
                {roles.map((r) => {
                  const n = perfiles.filter((p) => p.rol === r.clave && p.activo !== false).length;
                  return (
                    <li key={r.clave}>
                      <label className={"fis-fila" + (r.manda ? " off" : "")}>
                        <input type="checkbox" disabled={r.manda} checked={!r.manda && rolesSel.has(r.clave)} onChange={() => alternarRol(r.clave)} />
                        <span className="fis-nombre">{r.nombre}</span>
                        <span className="fis-nota">{r.manda ? "administra · nunca queda en modo fiscal" : `${n} ${n === 1 ? "persona" : "personas"}`}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="tarjeta">
              <div className="cab"><div>
                <h2>Personas sueltas</h2>
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
          </div>
          <div className="fis-pie">
            <p><b>{total}</b> {total === 1 ? "persona queda" : "personas quedan"} en modo FISCAL.</p>
            <div className="fis-pie-bt">
              <button type="button" className="cf-btn plano" onClick={cerrar}>Cerrar</button>
              <button type="button" className="cf-btn" onClick={guardar} disabled={guardando || !cambio}>{guardando ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
