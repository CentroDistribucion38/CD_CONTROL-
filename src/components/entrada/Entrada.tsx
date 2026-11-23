"use client";

import { useEffect, useRef, useState } from "react";
import "./entrada.css";

/**
 * LA ENTRADA DE LA APP — la B de Bavaria con movimiento, una vez por sesión.
 *
 * Coreografía (≈3 s): barrido diagonal rojo, dorado y blanco · la B entra girando en 3D y rebota · dos ondas
 * (dorada y roja) cuando aterriza · dos arcos que se trazan en sentidos contrarios · chispas doradas · un brillo
 * que recorre la B · «C D 38» pequeño · y al final la pantalla de debajo se abre en un círculo desde el centro
 * mientras la B vuela a su sitio (el logo de la entrada o el de la barra de arriba, el que esté a la vista).
 *
 * VA EN EL HTML DEL SERVIDOR para que se pinte antes que la página (sin parpadeo). Si en esta sesión ya salió,
 * el script del <head> marca <html data-sin-entrada> y el CSS la esconde antes del primer cuadro.
 * Tocar la pantalla la salta. Con «reducir movimiento» del sistema solo hace un fundido corto.
 * No suena: el navegador no deja reproducir audio sin un toque; el sonido de bienvenida va al darle «Entrar».
 */
export const CLAVE_ENTRADA = "cd38-entrada";
const VUELA_EN = 2250, TERMINA_EN = 3100;

export function Entrada() {
  const [viva, setViva] = useState(true);
  const capa = useRef<HTMLDivElement>(null);
  const logo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ya = false;
    try { ya = sessionStorage.getItem(CLAVE_ENTRADA) === "1" } catch {}
    if (ya || document.documentElement.hasAttribute("data-sin-entrada")) { setViva(false); return }
    try { sessionStorage.setItem(CLAVE_ENTRADA, "1") } catch {}
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* El vuelo: la B grande va a ponerse encima del logo de la página (el primero que se vea). */
    const volar = () => {
      const el = logo.current;
      if (!el) return;
      const destino = [...document.querySelectorAll<HTMLElement>("[data-logo-entrada]")]
        .map((x) => x.getBoundingClientRect()).find((r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight);
      const r = el.getBoundingClientRect();
      if (destino) {
        el.style.setProperty("--tx", `${destino.left + destino.width / 2 - (r.left + r.width / 2)}px`);
        el.style.setProperty("--ty", `${destino.top + destino.height / 2 - (r.top + r.height / 2)}px`);
        el.style.setProperty("--ts", String(destino.width / r.width));
        el.classList.add("vuela");
      } else el.classList.add("se-va");
      capa.current?.classList.add("abre");
    };
    const t1 = window.setTimeout(volar, reducir ? 400 : VUELA_EN);
    const t2 = window.setTimeout(() => setViva(false), reducir ? 900 : TERMINA_EN);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2) };
  }, []);

  if (!viva) return null;
  const saltar = () => setViva(false);
  return (
    <div className="ent" aria-hidden onClick={saltar}>
      <div className="ent-capa" ref={capa}>
        <div className="ent-glow" />
        <div className="ent-onda" /><div className="ent-onda d" />
        <svg className="ent-arco a" viewBox="-150 -150 300 300"><defs><linearGradient id="ent-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE7A0" /><stop offset=".5" stopColor="#E0A92E" /><stop offset="1" stopColor="#C8102E" /></linearGradient></defs><circle r="130" fill="none" stroke="url(#ent-g)" strokeWidth="3" strokeLinecap="round" transform="rotate(-90)" /></svg>
        <svg className="ent-arco b" viewBox="-150 -150 300 300"><circle r="118" fill="none" stroke="#C8102E" strokeWidth="2.5" strokeLinecap="round" transform="rotate(90)" /></svg>
        <div className="ent-chispas">{Array.from({ length: 16 }, (_, k) => <i key={k} style={{ ["--a" as string]: `${k * 22.5}deg`, ["--d" as string]: `${90 + (k % 3) * 22}px`, animationDelay: `${0.85 + (k % 4) * 0.02}s` }} />)}</div>
        <div className="ent-cd">CD38</div>
        <div className="ent-barrido"><i className="r" /><i className="o" /><i className="w" /></div>
      </div>
      <div className="ent-logo" ref={logo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-b.png" alt="" />
        <div className="ent-brillo" />
      </div>
    </div>
  );
}
