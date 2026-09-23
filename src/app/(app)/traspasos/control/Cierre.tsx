"use client";

/**
 * EL CIERRE DEL TURNO —y el del día entero.
 *
 * «Que en el tablero de control pueda tener un icono y visualizar el
 * cierre por turno o del día.»  Y después: «así las quiero ya», con la
 * maqueta — banda negra con el sello, la franja del acento con el
 * porcentaje y la cinta, los avisos, y las dos tablas.
 *
 * QUÉ ES Y QUÉ NO ES. Esto MIRA, no cierra: nadie firma nada ni queda
 * nada congelado en la base. Es la foto de cómo quedó el turno en el
 * momento en que se abre, para leerla en la reunión, imprimirla o
 * mandarla. Por eso arriba dice la hora a la que se armó: si mañana
 * alguien registra un viaje de este turno, la cifra cambia — y una foto
 * sin hora se vuelve una cifra que nadie puede ubicar.
 *
 * LAS CIFRAS NO SE VUELVEN A CALCULAR AQUÍ. Llegan las mismas filas que
 * la pantalla ya está pintando y se suman igual. Si esta ficha hiciera
 * su propia cuenta, bastaría un redondeo distinto para que el cierre y
 * el tablero dijeran cosas distintas del mismo turno, y a partir de ahí
 * nadie le cree a ninguno de los dos.
 *
 * LOS VIAJES SE PIDEN AL ABRIR, no al cargar el tablero. El tablero se
 * queda puesto en la oficina refrescándose cada dos minutos; traer los
 * viajes del rango en cada refresco sería pagar una consulta grande
 * todo el día para algo que se abre tres veces.
 *
 * EL CELULAR NO ES LA MISMA PÁGINA ENCOGIDA. Las dos tablas se vuelven
 * acordeones cerrados y los viajes, tarjetas: lo que se mira de pie es
 * el porcentaje y los avisos, y el detalle se abre solo si alguien lo
 * busca. Abajo queda fija la barra con lo que se hace desde ahí.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Control, Viaje } from "@/modulos/traspasos/datos";
import { HORARIO } from "@/modulos/traspasos/formato";
import { armarFoto, dibujarFoto, entregarFoto } from "@/modulos/traspasos/foto";

type Props = {
  /** Las mismas filas que el tablero está pintando, ya filtradas. */
  filas: Control[];
  desde: string;
  hasta: string;
  /** Los turnos del cierre. Vacío = el día (o el rango) entero.
   *  Son VARIOS a propósito: «que en los turnos haya un icono que
   *  seleccione los 3 para generar el cierre de los tres turnos, o dos,
   *  y así». Un cierre de A+B no es la suma de dos fichas: es una. */
  turnos: string[];
  rotulo: string;
  cerrar: () => void;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
const ddmm = (f: string) => f.slice(8, 10) + "/" + f.slice(5, 7);
/** Un nombre largo no cabe en la columna: «Génesis Visbal» → «G. Visbal». */
const corto = (n: string) => {
  const p = n.trim().split(/\s+/);
  return p.length > 1 ? `${p[0][0]}. ${p[p.length - 1]}` : n;
};

export function Cierre({ filas, desde, hasta, turnos, rotulo, cerrar }: Props) {
  const [viajes, setViajes] = useState<Viaje[] | null>(null);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [vacios, setVacios] = useState<number | null>(null);
  const [mal, setMal] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<null | "compartido" | "copiado" | "bajado" | "texto">(null);
  const [armando, setArmando] = useState(false);

  /* La hora en que se armó la foto. Se fija UNA vez, al abrir: si se
     recalculara en cada dibujo, la hora del papel iría cambiando
     mientras alguien lo lee. */
  const [armado] = useState(() => new Date());

  useEffect(() => {
    const corta = new AbortController();
    const p = new URLSearchParams({ desde, hasta });
    if (turnos.length) p.set("turno", turnos.join(","));
    fetch(`/api/traspasos/cierre?${p}`, { signal: corta.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `No se pudo (${r.status}).`);
        return r.json();
      })
      .then((j) => { setViajes(j.viajes ?? []); setNombres(j.nombres ?? {}); setVacios(j.vacios ?? 0) })
      .catch((e) => { if (e.name !== "AbortError") setMal(String(e.message ?? e)) });
    return () => corta.abort();
  }, [desde, hasta, turnos]);

  /* Escape cierra. Es lo que la mano hace sola cuando algo se abre
     encima de lo que estaba mirando. */
  const alTeclear = useCallback((e: KeyboardEvent) => { if (e.key === "Escape") cerrar() }, [cerrar]);
  useEffect(() => {
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [alTeclear]);

  const mias = useMemo(() => filas.filter((f) => !turnos.length || turnos.includes(f.turno)),
    [filas, turnos]);
  const sum = (k: keyof Control) => mias.reduce((a, f) => a + (Number(f[k]) || 0), 0);
  const planeado = sum("planeado"), cumplido = sum("cumplido");
  const adheridos = sum("adheridos"), adicionales = sum("adicionales");
  const carga = sum("carga");
  const faltan = planeado - adheridos;
  const adherencia = planeado > 0 ? Math.round((adheridos / planeado) * 100) : null;
  const cumplimiento = planeado > 0 ? Math.round((cumplido / planeado) * 100) : null;

  /* LO QUE EL PATIO YA CARGÓ Y FACTURACIÓN NO HA DESPACHADO.
     El cumplido cuenta solo lo que salió —un camión parado en el patio
     no es un viaje hecho—, pero el número a secas dejaría al patio
     viendo «3 de 8» después de haber cargado ocho, como si el tablero
     hubiera perdido viajes. Aquí se dice el resto de la verdad, y a
     cuánto llegaría el cumplimiento cuando salga el papel. */
  const porSalir = sum("por_salir");
  const cumplimientoTecho = planeado > 0
    ? Math.round(((cumplido + porSalir) / planeado) * 100) : null;

  /* LA CINTA REPARTE SOBRE EL PLAN, no sobre lo movido. Si se hicieron
     más de los planeados, el tramo de adicionales se recorta para que
     la cinta no se pase de largo: lo de más ya está dicho al lado. */
  const base = Math.max(planeado, 1);
  const pOk = Math.min(100, (adheridos / base) * 100);
  const pExtra = Math.min(100 - pOk, (adicionales / base) * 100);
  const pFalta = Math.max(0, 100 - pOk - pExtra);

  /* Por tipo, dentro de este turno: es lo que contesta «¿qué falló?».
     Un 70% no se arregla; un «casco 15 de 23» sí. */
  const tipos = useMemo(() => {
    const m = new Map<string, { nombre: string; orden: number; planeado: number; adheridos: number; adicionales: number; faltan: number }>();
    for (const f of mias) {
      const x = m.get(f.tipo) ?? { nombre: f.tipo_nombre ?? f.tipo, orden: f.tipo_orden ?? 99, planeado: 0, adheridos: 0, adicionales: 0, faltan: 0 };
      x.planeado += f.planeado; x.adheridos += f.adheridos;
      x.adicionales += f.adicionales; x.faltan += f.faltan;
      m.set(f.tipo, x);
    }
    return [...m.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
  }, [mias]);

  const vivos = useMemo(() => (viajes ?? []).filter((v) => v.estado === "registrado"), [viajes]);

  /* CÓMO SE LLAMA ESTO. Un turno, su letra; dos o más, las letras
     juntas; ninguno, el día entero. Escrito como se dice en la bodega:
     «turnos A y B», no «turnos A, B». */
  const letras = turnos.length > 1
    ? turnos.slice(0, -1).join(", ") + " y " + turnos[turnos.length - 1]
    : turnos[0] ?? "";
  const titulo = turnos.length === 1 ? `Cierre del turno ${letras}`
    : turnos.length > 1 ? `Cierre de los turnos ${letras}`
    : desde === hasta ? "Cierre del día" : "Cierre del período";
  const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
  const clase = (v: number | null) => (v == null ? "" : v >= 100 ? "bien" : v > 0 ? "medio" : "mal");
  const quien = (v: Viaje) => (v.registrado_por && nombres[v.registrado_por] ? corto(nombres[v.registrado_por]) : "—");
  /* El renglón de arriba: el turno con su horario, o los que se
     escogieron, o los tres. */
  const ojoCab = turnos.length === 1 ? `TURNO ${letras} · ${HORARIO[letras] ?? ""}`
    : turnos.length > 1 ? `TURNOS ${letras}`
    : "DÍA COMPLETO · LOS TRES TURNOS";
  const nVacios = vacios == null ? null : vacios;

  const pie = `Los vacíos y los anulados no entran en la adherencia. La foto es de las `
    + `${hhmm(armado.toISOString())}; si alguien registra algo después, el cierre cambia.`;

  /* ==================================================================
     EL CIERRE, EN TEXTO, PARA MANDARLO

     «Y que esté un copiar para enviar la info.» Lo que se manda por
     WhatsApp no es una tabla: es texto corto que se lee en la pantalla
     del celular sin girar nada. Se arma de las MISMAS cifras que se
     están viendo —no se vuelve a calcular— y lleva la hora de la foto,
     porque el que lo recibe tiene que poder ubicar el número.
     ================================================================== */
  function textoParaMandar() {
    const l: string[] = [];
    l.push(titulo.toUpperCase());
    l.push(`${rotulo.replace(/^./, (c) => c.toUpperCase())}`
      + (turnos.length === 1 && HORARIO[letras] ? ` · ${HORARIO[letras]}` : ""));
    l.push(`Foto de las ${hhmm(armado.toISOString())}`);
    l.push("");
    l.push(`Adherencia ${pct(adherencia)} — ${nf.format(adheridos)} de ${nf.format(planeado)} del plan`);
    l.push(`Cumplimiento ${pct(cumplimiento)} · Adicionales ${nf.format(adicionales)} · Sin salir ${nf.format(faltan)}`);
    /* EN LO QUE SE COPIA TAMBIÉN VA: si alguien pega este resumen en un
       grupo sin la frase, el que lo lea concluye que se movió menos de
       lo que se movió. */
    if (porSalir > 0)
      l.push(`${nf.format(porSalir)} esperando a facturación — con ellos el cumplimiento sería ${pct(cumplimientoTecho)}`);
    l.push(`Carga movida ${nf.format(carga)}`
      + (nVacios ? ` · ${nVacios} vacío${nVacios === 1 ? "" : "s"} (aparte)` : ""));
    if (tipos.length) {
      l.push("");
      l.push("POR TIPO");
      for (const t of tipos) {
        const p = t.planeado > 0 ? Math.round((t.adheridos / t.planeado) * 100) : null;
        l.push(`- ${t.nombre}: ${nf.format(t.adheridos)} de ${nf.format(t.planeado)}`
          + (p == null ? " (sin plan)" : ` · ${p}%`)
          + (t.adicionales ? ` · +${nf.format(t.adicionales)} adicional${t.adicionales === 1 ? "" : "es"}` : ""));
      }
    }
    if (viajes != null) {
      l.push("");
      l.push(`${vivos.length} viaje${vivos.length === 1 ? "" : "s"} registrado${vivos.length === 1 ? "" : "s"}.`);
    }
    /* La dirección exacta de lo que se está viendo: el que lo recibe
       abre esto mismo, con el mismo rango, en vez de buscarlo. */
    if (typeof window !== "undefined") { l.push(""); l.push(window.location.href) }
    return l.join("\n");
  }

  /* Los colores del tema de quien lo manda, leídos del elemento: son
     los mismos que pinta la pantalla, así que la foto sale del color
     que esa persona ve. */
  function coloresDelTema(): { tinta: string; acento: string; sobre: string } {
    const hx = (v: string) => {
      const m = v.match(/[\d.]+/g);
      if (!m) return "12263A";
      return m.slice(0, 3).map((x) => Math.round(Number(x)).toString(16).padStart(2, "0")).join("").toUpperCase();
    };
    const el = document.querySelector(".tp-ci") ?? document.body;
    const leer = (v: string) => {
      const n = document.createElement("span");
      n.style.color = `var(${v})`; n.style.display = "none";
      el.appendChild(n); const col = getComputedStyle(n).color; n.remove(); return hx(col);
    };
    return { tinta: leer("--tp-tinta"), acento: leer("--tp-acento"), sobre: leer("--tp-sobre-acento") };
  }

  function datosDeLaFoto() {
    return {
      titulo, ojo: ojoCab,
      fecha: rotulo.replace(/^./, (c) => c.toUpperCase()), hora: hhmm(armado.toISOString()),
      planeado, adheridos, adicionales, faltan, cumplido, carga,
      vacios: nVacios, registrados: viajes == null ? null : vivos.length,
      tipos: tipos.map((t) => ({ nombre: t.nombre, planeado: t.planeado, adheridos: t.adheridos,
        adicionales: t.adicionales, faltan: t.faltan })),
      enlace: typeof window === "undefined" ? "" : window.location.host + window.location.pathname
        + window.location.search,
    };
  }

  /* ==================================================================
     COPIAR LA FOTO

     «Debería copiarse como foto, algo espectacular.» El texto pelado se
     lee, pero llega como un mensaje más entre cincuenta; la foto se
     abre, se ve el porcentaje de lejos y se reenvía.

     En el celular se abre el menú de compartir —de ahí sale WhatsApp—;
     en el computador se copia al portapapeles para pegarla. Si ninguna
     de las dos se puede, se baja, y el botón lo DICE: prometer «copiado»
     cuando en realidad se descargó es peor que no tener el botón.
     ================================================================== */
  async function copiarFoto() {
    if (armando) return;
    setArmando(true);
    try {
      const plan = armarFoto(datosDeLaFoto());
      const png = await dibujarFoto(plan, coloresDelTema());
      const nombre = `cierre-${turnos.length ? `turno-${turnos.join("")}-` : ""}${desde}.png`;
      const como = await entregarFoto(png, nombre, titulo);
      setCopiado(como);
    } catch {
      /* Si el navegador no puede dibujar el canvas, queda el texto, que
         nunca falla. */
      await copiarTexto();
      return;
    } finally {
      setArmando(false);
    }
    setTimeout(() => setCopiado(null), 2600);
  }

  async function copiarTexto() {
    const t = textoParaMandar();
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* Sin permiso de portapapeles —pasa en navegadores viejos y en
         algunos WebView— se copia con el truco de siempre, que no
         depende de ningún permiso. */
      const a = document.createElement("textarea");
      a.value = t; a.setAttribute("readonly", "");
      a.style.position = "fixed"; a.style.opacity = "0";
      document.body.appendChild(a); a.select();
      try { document.execCommand("copy") } catch { /* ni modo */ }
      a.remove();
    }
    setCopiado("texto");
    setTimeout(() => setCopiado(null), 2600);
  }

  /* Lo que dice el botón depende de lo que DE VERDAD pasó. */
  const rotuloCopia = armando ? "Armando…"
    : copiado === "compartido" ? "¡Enviada!"
    : copiado === "copiado" ? "¡Copiada!"
    : copiado === "bajado" ? "Descargada"
    : copiado === "texto" ? "Texto copiado"
    : "Copiar foto";

  /* Las dos tablas se dibujan igual arriba y dentro del acordeón: una
     sola función, para que no se arreglen por separado. */
  const filaTipo = (t: (typeof tipos)[number]) => {
    const p = t.planeado > 0 ? Math.round((t.adheridos / t.planeado) * 100) : null;
    return (
      <tr key={t.nombre}>
        <td><b>{t.nombre}</b></td>
        <td className="ci-num">{t.planeado || "—"}</td>
        <td className="ci-num">{t.adheridos || "—"}</td>
        <td className="ci-num">{t.adicionales || "—"}</td>
        <td className="ci-num">{t.faltan || "—"}</td>
        <td className="ci-num">
          <div className="ci-pctb">
            <i><span className={clase(p)} style={{ width: `${Math.min(p ?? 0, 100)}%` }} /></i>
            <b className={clase(p)}>{pct(p)}</b>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="tp-velo" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <section className="tp-ci" role="dialog" aria-modal="true" aria-label={titulo}>

        {/* ─ LA BANDA NEGRA CON EL SELLO ─ */}
        <header className="tp-ci-cab">
          {/* El sello va tal cual, nunca recoloreado con el tema. */}
          <img src="/marca/logo-b.png" alt="" width={34} height={34} />
          <div className="ci-tit">
            <div className="ci-ojo">{ojoCab}</div>
            <h2>{titulo}</h2>
            {/* LA HORA NO ES ADORNO: mientras alguien lee esto, otro puede
                estar registrando un viaje de este mismo turno. */}
            <div className="ci-f">
              {rotulo.replace(/^./, (c) => c.toUpperCase())} · foto de las {hhmm(armado.toISOString())}
            </div>
          </div>
          <div className="ci-der">
            {/* En el celular este no va: copiar es el botón grande de
                abajo, y tres botones aquí arriba le comen el renglón al
                «TURNO A · 06:00 · 14:00». */}
            {/* DOS BOTONES Y NO UNO: la foto es lo que se manda por
                WhatsApp, y el texto sirve para pegarlo en un correo o
                en una casilla donde una imagen no entra. */}
            <button type="button" className={"tp-ci-bt ci-copiar" + (copiado ? " listo" : "")}
                    onClick={copiarFoto} disabled={armando}>
              {copiado && copiado !== "texto"
                ? <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                : <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.6" /><path d="M21 16l-5-5-6 6" /></svg>}
              <span className="texto">{rotuloCopia}</span>
            </button>
            <button type="button" className="tp-ci-bt ci-copiar" onClick={copiarTexto}
                    title="Copiar el cierre como texto">
              <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="1.5" /><path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" /></svg>
              <span className="texto">Texto</span>
            </button>
            <button type="button" className="tp-ci-bt" onClick={() => window.print()}>
              <svg viewBox="0 0 24 24"><path d="M7 9V4h10v5" /><rect x="4" y="9" width="16" height="7" rx="1.5" /><path d="M7 16h10v4H7z" /></svg>
              <span className="texto">Imprimir</span>
            </button>
            <button type="button" className="tp-ci-bt ico" onClick={cerrar} aria-label="Cerrar">
              <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </header>

        {/* ─ LA FRANJA DEL ACENTO: el porcentaje, la cinta y las cuatro ─ */}
        <div className="tp-ci-hero">
          <div className="ci-pct">
            <div className="ci-k">ADHERENCIA</div>
            <div className="ci-v">{pct(adherencia)}</div>
            <div className="ci-s">{nf.format(adheridos)} de {nf.format(planeado)} del plan</div>
          </div>
          <div className="ci-lado">
            <div className="ci-cinta" role="img"
                 aria-label={`${adheridos} del plan, ${adicionales} adicionales, ${faltan} sin salir`}>
              <i className="ci-ok" style={{ width: `${pOk}%` }} />
              <i className="ci-extra" style={{ width: `${pExtra}%` }} />
              <i className="ci-falta" style={{ width: `${pFalta}%` }} />
            </div>
            <div className="ci-ley">
              <span><i className="ci-ok" />{nf.format(adheridos)} cumplidos</span>
              <span><i className="ci-extra" />{nf.format(adicionales)} adicionales</span>
              <span><i className="ci-falta" />{nf.format(faltan)} sin salir</span>
            </div>
            <div className="ci-mini">
              <div><div className="ci-k">PLANEADOS</div><div className="ci-v">{nf.format(planeado)}</div></div>
              <div><div className="ci-k">CUMPLIMIENTO</div>
                <div className={"ci-v " + clase(cumplimiento)}>{pct(cumplimiento)}</div></div>
              <div><div className="ci-k">CARGA MOVIDA</div><div className="ci-v">{nf.format(carga)}</div></div>
              <div><div className="ci-k">SIN SALIR</div>
                <div className={"ci-v " + (faltan ? "mal" : "bien")}>{nf.format(faltan)}</div></div>
            </div>
          </div>
        </div>

        {/* ─ LO QUE ESPERA EL PAPEL ─
            Solo se pinta si hay algo esperando. Un renglón que casi
            siempre dice «0 esperando a facturación» deja de leerse, y
            el día que diga 7 tampoco se va a leer. */}
        {porSalir > 0 && (
          <p className="tp-ci-espera">
            <b>{nf.format(porSalir)}</b> viaje{porSalir === 1 ? "" : "s"} cargado
            {porSalir === 1 ? "" : "s"} esperando a que facturación confirme la salida.
            No cuentan todavía en el cumplido: cuando salgan, el cumplimiento sube a{" "}
            <b>{pct(cumplimientoTecho)}</b>.
          </p>
        )}

        {/* ─ EL DETALLE, A LO ANCHO ─ */}
        <div className="tp-ci-ancho">
          <div className="tp-ci-sec"><b>Por tipo de viaje</b><span>cumplido sobre planeado</span></div>
          {tipos.length === 0 ? (
            <p className="tp-ci-nada">Este turno no tiene plan ni viajes con carga.</p>
          ) : (
            <div className="tp-ci-scroll">
            <table className="tp-ci-t tp-ci-tipos">
              <thead>
                <tr><th>Tipo</th><th className="ci-num">Plan</th><th className="ci-num">Cumplido</th>
                  <th className="ci-num">Adicional</th><th className="ci-num">Faltan</th><th className="ci-num">Adherencia</th></tr>
              </thead>
              <tbody>{tipos.map(filaTipo)}</tbody>
            </table>
            </div>
          )}

          <div className="tp-ci-sec">
            <b>Los viajes</b>
            <span>
              {viajes == null ? "trayéndolos…"
                : `${vivos.length} registrado${vivos.length === 1 ? "" : "s"}`
                  + (nVacios ? ` · ${nVacios} vacío${nVacios === 1 ? "" : "s"} aparte` : "")}
            </span>
          </div>
          {mal ? <p className="tp-ci-mal" role="alert">{mal}</p>
            : viajes == null ? <p className="tp-ci-nada">Trayendo los viajes…</p>
            : viajes.length === 0 ? <p className="tp-ci-nada">No hay viajes registrados en este turno.</p>
            : (
              /* Con nueve columnas, en una tableta la tabla pide más de
                 800 px: se desliza DENTRO de su caja, nunca arrastrando
                 la ficha y dejando la X fuera de la pantalla. */
              <div className="tp-ci-scroll">
              <table className="tp-ci-t tp-ci-viajes">
                <thead>
                  <tr><th>Código</th>{desde !== hasta && <th>Fecha</th>}<th>Hora</th><th>Placa</th>
                    <th>Tipo</th><th>Ruta</th><th>Orden de cargue</th>
                    <th className="ci-num">Carga</th><th>Registró</th></tr>
                </thead>
                <tbody>
                  {viajes.map((v) => (
                    <tr key={v.id} className={v.estado === "anulado" ? "anulado" : undefined}>
                      <td className="ci-cod">
                        {v.codigo ?? "—"}
                        {v.estado === "anulado" && <span className="ci-eti mal">ANULADO</span>}
                        {v.vacio && <span className="ci-eti">VACÍO</span>}
                      </td>
                      {desde !== hasta && <td>{ddmm(v.fecha)}</td>}
                      <td>{v.hora ? hhmm(v.hora) : "—"}</td>
                      <td className="ci-cod">{v.placa ?? "—"}</td>
                      <td>{v.tipo_nombre ?? v.tipo ?? "—"}</td>
                      <td className="ci-ruta">
                        {(v.origen_nombre ?? v.origen ?? "—")} → {(v.destino_nombre ?? v.destino ?? "—")}
                      </td>
                      <td className={v.sin_documento ? "ci-sin" : "ci-cod"}>
                        {v.documento ?? (v.vacio ? "—" : "sin orden")}
                      </td>
                      <td className="ci-num">{v.carga == null ? "—" : nf.format(v.carga)}</td>
                      <td>{quien(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          <div className="tp-ci-fin">{pie}</div>
        </div>

        {/* ─ EL CELULAR: acordeones, tarjetas y la barra de abajo ─ */}
        <div className="tp-ci-movil">
          <details className="tp-ci-acor">
            <summary>Por tipo de viaje<em>{tipos.length} tipo{tipos.length === 1 ? "" : "s"} ›</em></summary>
            {tipos.length === 0
              ? <p className="tp-ci-nada">Sin plan ni viajes con carga.</p>
              : <div className="tp-ci-scroll"><table className="tp-ci-t tp-ci-tipos"><tbody>{tipos.map(filaTipo)}</tbody></table></div>}
          </details>

          <details className="tp-ci-acor">
            <summary>Los viajes<em>{viajes == null ? "…" : `${viajes.length} ›`}</em></summary>
            {mal ? <p className="tp-ci-mal" role="alert">{mal}</p>
              : viajes == null ? <p className="tp-ci-nada">Trayendo los viajes…</p>
              : viajes.length === 0 ? <p className="tp-ci-nada">No hay viajes en este turno.</p>
              : viajes.map((v) => (
                <div className={"vcard" + (v.estado === "anulado" ? " anulado" : "")} key={v.id}>
                  <div>
                    <div className="ci-c">{v.codigo ?? "—"} · {v.placa ?? "—"}</div>
                    <div className="ci-t2">{v.tipo_nombre ?? v.tipo ?? "—"}</div>
                    <div className="ci-r">
                      {(v.origen_nombre ?? v.origen ?? "—")} → {(v.destino_nombre ?? v.destino ?? "—")}
                      {v.hora && <> · {hhmm(v.hora)}</>}
                    </div>
                  </div>
                  <div className="ci-dcha">
                    <div className={"ci-oc" + (v.sin_documento ? " sin" : "")}>
                      {v.documento ?? (v.vacio ? "vacío" : "sin orden")}
                    </div>
                    <div className="ci-r">{v.carga == null ? "—" : nf.format(v.carga)} · {quien(v)}</div>
                  </div>
                </div>
              ))}
          </details>

          <div className="tp-ci-fin">{pie}</div>

          {/* LA BARRA DE ABAJO. «Cerrar» y no «Dar por bueno»: dar algo por
              bueno es un acto que deja rastro —quién y cuándo— y eso
              todavía no existe en la base. Un botón que promete cerrar y
              solo esconde la ficha es peor que no tenerlo. */}
          <div className="tp-ci-fija">
            <button type="button" className="ci-sec2" onClick={() => window.print()}>Imprimir</button>
            {/* COPIAR ES LO QUE MÁS SE USA DESDE EL CELULAR: el turno se
                manda por WhatsApp, no se imprime. Por eso se lleva el
                botón grande y del color del tema. */}
            <button type="button" onClick={copiarFoto} disabled={armando}>
              {copiado || armando ? rotuloCopia : "Enviar foto"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
