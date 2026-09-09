"use client";

/**
 * LA PUERTA CERRADA HASTA QUE CAMBIE LA CLAVE.
 *
 * Cuando un administrador crea un usuario, la plataforma sugiere una
 * clave de seis dígitos. Seis dígitos son un millón de combinaciones:
 * como clave de un rato está bien, como clave permanente se adivina.
 *
 * Así que el aviso no es un consejo en pantalla —esos se cierran y se
 * olvidan—: es la condición para entrar. Esta pantalla reemplaza a la
 * aplicación entera y no tiene forma de saltarse, porque se dibuja en el
 * cascarón que envuelve TODAS las rutas: escribir otra URL a mano lleva
 * al mismo sitio.
 *
 * Al cambiarla se apaga perfiles.clave_provisional. Eso lo puede hacer
 * la persona misma —el disparador de la base deja apagarlo, no
 * prenderlo—, que es justo lo que tiene que pasar aquí.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff } from "lucide-react";

export function ClaveProvisional({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const [nueva, setNueva] = useState("");
  const [rep, setRep] = useState("");
  const [ver, setVer] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);

  const reglas = [
    { t: "Mínimo 8 caracteres", ok: nueva.length >= 8 },
    { t: "Una mayúscula", ok: /[A-ZÁÉÍÓÚÑ]/.test(nueva) },
    { t: "Un número", ok: /\d/.test(nueva) },
  ];
  const cumple = reglas.every((r) => r.ok);

  async function cambiar() {
    setMal(null);
    if (!cumple) return setMal("La clave nueva no cumple las tres reglas.");
    if (nueva !== rep) return setMal("Las dos no coinciden.");
    if (/^\d+$/.test(nueva)) return setMal("No puede ser solo números.");

    setTrabajando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: nueva });
    if (error) {
      setTrabajando(false);
      return setMal(error.message);
    }
    /* Recién cuando la clave YA cambió se apaga la marca. Si se apagara
       antes y el cambio fallara, quedaría una cuenta con clave de cuatro
       dígitos y sin nada que obligue a cambiarla. */
    const { error: e2 } = await supabase
      .from("perfiles").update({ clave_provisional: false }).eq("id", id);
    setTrabajando(false);
    if (e2) return setMal(e2.message);
    router.refresh();
  }

  return (
    <div className="cp">
      <section className="cp-caja">
        <p className="cp-ojo">PRIMER INGRESO</p>
        <h1>Cambia tu clave, {nombre.split(" ")[0]}</h1>
        <p className="cp-dice">
          La que te dieron son seis dígitos y sirvió para entrar una vez. Elige
          una tuya y sigues. <b>Nadie más la ve, ni el administrador.</b>
        </p>

        <div className="cp-campos">
          <label>
            <span>Clave nueva</span>
            <div className="cp-caja-clave">
              <input type={ver ? "text" : "password"} value={nueva} autoFocus
                     autoComplete="new-password" placeholder="••••••••"
                     onChange={(e) => setNueva(e.target.value)} />
              <button type="button" onClick={() => setVer((v) => !v)}
                      aria-label={ver ? "Ocultar" : "Mostrar"}>
                {ver ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <label>
            <span>Repítela</span>
            <input type={ver ? "text" : "password"} value={rep}
                   autoComplete="new-password" placeholder="••••••••"
                   onChange={(e) => setRep(e.target.value)} />
          </label>
        </div>

        <ul className="cp-reglas">
          {reglas.map((r) => (
            <li key={r.t} className={nueva && r.ok ? "ok" : ""}>{r.t}</li>
          ))}
        </ul>

        {mal && <p className="cp-mal" role="alert">{mal}</p>}

        <button type="button" className="cp-btn" onClick={cambiar}
                disabled={trabajando || !cumple || !rep}>
          {trabajando ? "Guardando…" : "Cambiar y entrar"}
        </button>
      </section>
    </div>
  );
}
