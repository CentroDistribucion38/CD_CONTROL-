"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { correoDeUsuario } from "@/lib/auth";
import { Eye, EyeOff } from "lucide-react";

type Modulo = { id: string; nombre: string; ruta: string };

type Props = {
  id: string;
  usuario: string;
  nombre: string;
  rol: string;
  bodega: string;
  turno: string;
  moduloInicio: string;
  textoGrande: boolean;
  ultimoIngreso: string | null;
  modulos: Modulo[];
};

const NOMBRE_ROL: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  operador: "Operador",
};

/** El error crudo de PostgREST no le sirve a quien está usando la app. */
function traducir(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("column") || m.includes("schema cache")) {
    return (
      "Faltan las columnas del perfil en Supabase. Abre el SQL Editor y " +
      "ejecuta supabase/01-perfil.sql."
    );
  }
  if (m.includes("row-level security") || m.includes("permission")) {
    return "No tienes permiso para cambiar esos datos.";
  }
  if (m.includes("solo el administrador")) return mensaje;
  return mensaje;
}

function iniciales(nombre: string, usuario: string): string {
  const base = nombre.trim() || usuario;
  return (
    base
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "··"
  );
}

export function Perfil(p: Props) {
  const router = useRouter();
  const [seccion, setSeccion] = useState<"cuenta" | "seguridad" | "preferencias">(
    "cuenta"
  );

  return (
    <div className="pf">
      <Link href="/inicio" className="pf-volver">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14 6l-6 6 6 6" />
        </svg>
        Volver a módulos
      </Link>

      <div className="sh-titulo">
        <h1>Mi perfil</h1>
        <p className="sh-firma">Centro de Distribución 38 · Bavaria BAQ</p>
      </div>

      <div className="pf-cuerpo">
        <nav className="pf-nav">
          <div className="pf-quien">
            <div className="ini">{iniciales(p.nombre, p.usuario)}</div>
            <div>
              <div className="nom">{p.nombre || p.usuario}</div>
              <div className="usr">{p.usuario}</div>
            </div>
          </div>

          <button
            type="button"
            className={seccion === "cuenta" ? "on" : ""}
            onClick={() => setSeccion("cuenta")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="3.6" />
              <path d="M4.8 20c.9-3.6 3.8-5.4 7.2-5.4s6.3 1.8 7.2 5.4" />
            </svg>
            Cuenta
          </button>
          <button
            type="button"
            className={seccion === "seguridad" ? "on" : ""}
            onClick={() => setSeccion("seguridad")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 8.5-4.1-.9-7-4.3-7-8.5V6z" />
            </svg>
            Seguridad
          </button>
          <button
            type="button"
            className={seccion === "preferencias" ? "on" : ""}
            onClick={() => setSeccion("preferencias")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2.2" />
              <circle cx="10" cy="17" r="2.2" />
            </svg>
            Preferencias
          </button>
        </nav>

        {seccion === "cuenta" && <Cuenta {...p} alGuardar={() => router.refresh()} />}
        {seccion === "seguridad" && <Seguridad {...p} />}
        {seccion === "preferencias" && (
          <Preferencias {...p} alGuardar={() => router.refresh()} />
        )}
      </div>

      <footer className="pf-pie">
        <span>
          <b>CD38</b>
        </span>
        <span>CONTROL 1.0</span>
      </footer>
    </div>
  );
}

/* ==================== Cuenta ==================== */
function Cuenta(p: Props & { alGuardar: () => void }) {
  const [nombre, setNombre] = useState(p.nombre);
  const [turno, setTurno] = useState(p.turno);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  const cambio = nombre !== p.nombre || turno !== p.turno;

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("perfiles")
      .update({
        nombre: nombre.trim(),
        turno_habitual: turno === "" ? null : Number(turno),
      })
      .eq("id", p.id);

    setAviso(
      error
        ? { mal: true, texto: traducir(error.message) }
        : { mal: false, texto: "Listo, se guardaron tus datos." }
    );
    setGuardando(false);
    if (!error) p.alGuardar();
  }

  return (
    <section className="pf-panel">
      <div className="pf-cab">
        <h2>Cuenta</h2>
        <p>
          Tus datos dentro de CONTROL. El usuario y el rol los asigna el
          administrador de la bodega.
        </p>
      </div>

      <div className="pf-bloque">
        <div className="pf-rejilla">
          <div className="pf-campo ancho">
            <label htmlFor="nombre">Nombre completo</label>
            <input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={80}
            />
          </div>

          <div className="pf-campo">
            <label htmlFor="usr">Usuario</label>
            <input id="usr" value={p.usuario} disabled />
            <span className="pf-nota">Para cambiarlo, habla con el administrador.</span>
          </div>

          <div className="pf-campo">
            <label htmlFor="rol">Rol</label>
            <input id="rol" value={NOMBRE_ROL[p.rol] ?? p.rol} disabled />
          </div>

          <div className="pf-campo">
            <label htmlFor="bod">Bodega</label>
            <input id="bod" value={p.bodega} disabled />
          </div>

          <div className="pf-campo">
            <label htmlFor="turno">Turno habitual</label>
            <select
              id="turno"
              value={turno}
              onChange={(e) => setTurno(e.target.value)}
            >
              <option value="">Sin definir</option>
              <option value="1">Turno 1</option>
              <option value="2">Turno 2</option>
              <option value="3">Turno 3</option>
            </select>
          </div>
        </div>

        {aviso && (
          <p
            className={"pf-mensaje " + (aviso.mal ? "mal" : "bien")}
            style={{ marginTop: 18 }}
            role="status"
          >
            {aviso.texto}
          </p>
        )}
      </div>

      <div className="pf-acciones">
        <button
          type="button"
          className="pf-btn"
          onClick={guardar}
          disabled={guardando || !cambio}
        >
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
        <button
          type="button"
          className="pf-btn plano"
          disabled={guardando || !cambio}
          onClick={() => {
            setNombre(p.nombre);
            setTurno(p.turno);
            setAviso(null);
          }}
        >
          Descartar
        </button>
      </div>
    </section>
  );
}

/**
 * Campo de contraseña con ojito. Cada uno maneja su propio estado: en un
 * equipo de piso conviene poder destapar solo el que se está escribiendo,
 * no los tres a la vez.
 */
function CampoClave({
  id,
  etiqueta,
  valor,
  cambiar,
  autoComplete,
  ancho,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  cambiar: (v: string) => void;
  autoComplete: string;
  ancho?: boolean;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className={"pf-campo" + (ancho ? " ancho" : "")}>
      <label htmlFor={id}>{etiqueta}</label>
      <div className="pf-caja">
        <input
          id={id}
          type={ver ? "text" : "password"}
          autoComplete={autoComplete}
          value={valor}
          onChange={(e) => cambiar(e.target.value)}
          placeholder="••••••••"
        />
        <button
          type="button"
          className="pf-ojo"
          onClick={() => setVer((v) => !v)}
          aria-label={ver ? "Ocultar la contraseña" : "Mostrar la contraseña"}
          title={ver ? "Ocultar" : "Mostrar"}
        >
          {ver ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </div>
  );
}

/* ==================== Seguridad ==================== */
function Seguridad(p: Props) {
  const router = useRouter();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [rep, setRep] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  const reglas = [
    { texto: "Mínimo 8 caracteres", ok: nueva.length >= 8 },
    { texto: "Una mayúscula", ok: /[A-ZÁÉÍÓÚÑ]/.test(nueva) },
    { texto: "Un número", ok: /\d/.test(nueva) },
  ];
  const cumpleTodo = reglas.every((r) => r.ok);

  async function actualizar() {
    setAviso(null);
    if (!actual || !nueva || !rep) {
      return setAviso({ mal: true, texto: "Llena las tres casillas." });
    }
    if (nueva !== rep) {
      return setAviso({ mal: true, texto: "La nueva contraseña y su repetición no coinciden." });
    }
    if (!cumpleTodo) {
      return setAviso({ mal: true, texto: "La nueva contraseña no cumple las tres reglas." });
    }
    if (nueva === actual) {
      return setAviso({ mal: true, texto: "La nueva contraseña es igual a la actual." });
    }

    setTrabajando(true);
    const supabase = createClient();

    // Se comprueba la actual antes de cambiar nada: si alguien deja la
    // sesión abierta en un equipo de piso, que no pueda cambiarle la
    // contraseña a la persona sin saber la que tiene.
    const { error: eActual } = await supabase.auth.signInWithPassword({
      email: correoDeUsuario(p.usuario),
      password: actual,
    });
    if (eActual) {
      setTrabajando(false);
      return setAviso({ mal: true, texto: "La contraseña actual no coincide." });
    }

    const { error } = await supabase.auth.updateUser({ password: nueva });
    setTrabajando(false);

    if (error) {
      return setAviso({ mal: true, texto: traducir(error.message) });
    }
    setActual(""); setNueva(""); setRep("");
    setAviso({ mal: false, texto: "Contraseña actualizada. Úsala la próxima vez que entres." });
  }

  async function salirDeTodo() {
    setTrabajando(true);
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "global" });
    router.push("/login");
    router.refresh();
  }

  const fecha = p.ultimoIngreso
    ? new Date(p.ultimoIngreso).toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : null;

  return (
    <section className="pf-panel">
      <div className="pf-cab">
        <h2>Seguridad</h2>
        <p>Cambia tu contraseña y revisa dónde está abierta tu sesión.</p>
      </div>

      <div className="pf-bloque">
        <h3>Cambiar contraseña</h3>
        <div className="pf-rejilla">
          <CampoClave
            id="actual"
            etiqueta="Contraseña actual"
            valor={actual}
            cambiar={setActual}
            autoComplete="current-password"
            ancho
          />
          <CampoClave
            id="nueva"
            etiqueta="Nueva contraseña"
            valor={nueva}
            cambiar={setNueva}
            autoComplete="new-password"
          />
          <CampoClave
            id="rep"
            etiqueta="Repite la nueva"
            valor={rep}
            cambiar={setRep}
            autoComplete="new-password"
          />
        </div>

        <ul className="pf-reglas">
          {reglas.map((r) => (
            <li key={r.texto} className={nueva && r.ok ? "ok" : ""}>
              {r.texto}
            </li>
          ))}
        </ul>

        <p className="pf-nota" style={{ marginTop: 14, maxWidth: "60ch" }}>
          CONTROL entra por usuario, no por correo: si la olvidas no hay
          recuperación automática. El administrador te genera una temporal y la
          cambias al entrar.
        </p>

        {aviso && (
          <p
            className={"pf-mensaje " + (aviso.mal ? "mal" : "bien")}
            style={{ marginTop: 14 }}
            role="status"
          >
            {aviso.texto}
          </p>
        )}
      </div>

      <div className="pf-bloque">
        <h3>Sesión</h3>
        <div className="pf-aviso">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 8v5M12 16.5v.5" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <div>
            Este equipo es compartido en piso. Si terminaste tu turno, cierra
            sesión en todos los dispositivos.
          </div>
        </div>
        {fecha && (
          <p className="pf-nota" style={{ marginTop: 14 }}>
            Último ingreso: {fecha}
          </p>
        )}
      </div>

      <div className="pf-acciones">
        <button
          type="button"
          className="pf-btn"
          onClick={actualizar}
          disabled={trabajando}
        >
          {trabajando ? "Un momento…" : "Actualizar contraseña"}
        </button>
        <button
          type="button"
          className="pf-btn plano"
          onClick={salirDeTodo}
          disabled={trabajando}
        >
          Cerrar sesión en todos los dispositivos
        </button>
      </div>
    </section>
  );
}

/* ==================== Preferencias ==================== */
function Preferencias(p: Props & { alGuardar: () => void }) {
  const [inicio, setInicio] = useState(p.moduloInicio);
  const [grande, setGrande] = useState(p.textoGrande);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  const cambio = inicio !== p.moduloInicio || grande !== p.textoGrande;

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("perfiles")
      .update({ modulo_inicio: inicio === "" ? null : inicio, texto_grande: grande })
      .eq("id", p.id);

    setAviso(
      error
        ? { mal: true, texto: traducir(error.message) }
        : { mal: false, texto: "Listo, se guardaron tus preferencias." }
    );
    setGuardando(false);
    if (!error) p.alGuardar();
  }

  return (
    <section className="pf-panel">
      <div className="pf-cab">
        <h2>Preferencias</h2>
        <p>Cómo se comporta CONTROL cuando entras.</p>
      </div>

      <div className="pf-bloque">
        <div className="pf-rejilla">
          <div className="pf-campo">
            <label htmlFor="inicio">Al iniciar sesión, abrir</label>
            <select
              id="inicio"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            >
              <option value="">Preguntar el módulo</option>
              {p.modulos.map((m) => (
                <option key={m.id} value={m.ruta}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="pf-bloque">
        <label className="pf-switch">
          <input
            type="checkbox"
            checked={grande}
            onChange={(e) => setGrande(e.target.checked)}
          />
          <div>
            <b>Texto grande para pantallas de piso</b>
            <p>
              Aumenta el tamaño de tablas, botones y campos en los equipos de
              bodega.
            </p>
          </div>
        </label>

        {aviso && (
          <p
            className={"pf-mensaje " + (aviso.mal ? "mal" : "bien")}
            style={{ marginTop: 16 }}
            role="status"
          >
            {aviso.texto}
          </p>
        )}
      </div>

      <div className="pf-acciones">
        <button
          type="button"
          className="pf-btn"
          onClick={guardar}
          disabled={guardando || !cambio}
        >
          {guardando ? "Guardando…" : "Guardar preferencias"}
        </button>
      </div>
    </section>
  );
}
