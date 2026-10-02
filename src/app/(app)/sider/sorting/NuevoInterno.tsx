"use client";

/**
 * EL «+» DE REVISIÓN AI — CREAR UN «VH INTERNO».
 *
 * «Dentro del tránsito debe haber un «+», un formulario donde la persona
 *  de control pueda escribir el origen, el destino, el material de
 *  acuerdo al maestro y la cantidad de estibas, y que traiga el resto.»
 *  Y después: «que se llame Vh Interno y no aparezca en Tránsito sino en
 *  Revisión AI, para que un rol lo cree ahí mismo: no va a pedir
 *  certificación de llegada. Con el número del documento, máximo 10
 *  dígitos.»
 *
 * Es para el camión que NO certificó Sider: llega igual y hay que
 * revisarlo, y sin este formulario no existía en el sistema. NO pasa por
 * Tránsito: nace recibido y cae directo en «Revisión AI – normal». No
 * tiene salida, ni GPS, ni fotos, y NO cuenta como certificado por Sider.
 *
 * SE ESCRIBE POCO Y SE ESCOGE DE LISTAS. Origen, destino y material salen
 * del maestro —la base los vuelve a validar, así que un texto libre solo
 * puede acabar en un error—; lo único que se teclea es la placa, el
 * documento y las estibas. Las cajas, las unidades, los hectolitros y los
 * siders se calculan solos MIENTRAS se escribe, con las mismas fórmulas de
 * Certificar, para saber qué se está montando antes de guardar.
 *
 * ES PARA UN CELULAR EN EL PATIO: un solo listado de campos a lo ancho,
 * de 44 px de alto, con el teclado numérico donde toca. El material no es
 * un desplegable de veintiún renglones sino una búsqueda: se escribe
 * «175» o «costeñita» y salen los que coinciden.
 */

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import {
  cajasCompletas, estibasDe, factorFaltante, numero, unidadesDe,
} from "@/modulos/sider/interno-cantidad";

export type SocioMaestro = { clave: string; nombre: string };
export type OrigenMaestro = { planta: string; cd_origen: string };
export type SkuMaestro = {
  sku: string; descripcion: string; clase?: string | null;
  cajas_x_estiba?: number | null; unidades_x_caja?: number | null; hl_x_unidad?: number | null;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });

/** «0,83» y «0.83» valen lo mismo; vacío o basura, nada. */
const num = numero;

/** Sin tildes y en minúscula: «costeñita» y «COSTENITA» son la misma búsqueda. */
const plano = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const DESTINO_POR_DEFECTO = "Barranquilla";

/** Un camión lleva 2 o 3 referencias; la base acepta hasta 10. */
const MAX_LINEAS = 10;
/* LA CANTIDAD SE ESCRIBE EN UNIDADES (así se cuenta). La base guarda ESTIBAS, así que adentro se convierte con
   los factores del maestro y se tienen las dos: unidades escritas y estibas calculadas. */
type Linea = { k: number; sku: string; busca: string; cant: string };
const nuevaLinea = (k: number): Linea => ({ k, sku: "", busca: "", cant: "" });

/** LA PLACA SON TRES LETRAS Y TRES NÚMEROS, y nada más. */
const PLACA_OK = /^[A-Z]{3}[0-9]{3}$/;
/** Lo que se acepta al teclear: sin espacios ni signos, en mayúscula, máximo 6. */
const limpiaPlaca = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

/** EL DOCUMENTO (factura): OBLIGATORIO, solo dígitos, de 1 a 10. */
const DOC_MAX = 10;
const limpiaDoc = (t: string) => t.replace(/[^0-9]/g, "").slice(0, DOC_MAX);

export function NuevoInterno({ origenes, skus, socios = [], estibasPorSider = 36, alCerrar, alCrear }: {
  origenes: OrigenMaestro[];
  skus: SkuMaestro[];
  /** Los socios activos, para el desplegable cuando el camión es de un socio. */
  socios?: SocioMaestro[];
  estibasPorSider?: number;
  alCerrar: () => void;
  /** Se llama con la placa ya guardada: el Vh Interno ya está en Revisión AI – normal. */
  alCrear: (placa: string) => void;
}) {
  /* DE QUIÉN ES EL CAMIÓN. Sin valor de arranque a propósito: es lo que
     decide qué más se pide, y un valor puesto de antemano se deja tal cual.
       · socio → NO hay documento: se escoge cuál socio;
       · T1    → el número de factura. */
  const [canal, setCanal] = useState<"" | "socios" | "t1">("");
  const [socio, setSocio] = useState("");
  const [placa, setPlaca] = useState("");
  const [planta, setPlanta] = useState("");
  const [destino, setDestino] = useState(DESTINO_POR_DEFECTO);
  /* UN CAMIÓN PUEDE TRAER VARIOS MATERIALES con la misma factura: cada uno
     es una línea con su material y su cantidad. Arranca con una sola; el
     «+» agrega otra. */
  const [lineas, setLineas] = useState<Linea[]>([nuevaLinea(1)]);
  const [factura, setFactura] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);

  const origen = origenes.find((o) => o.planta === planta);
  const cambia = (k: number, p: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.k === k ? { ...l, ...p } : l)));
  const agrega = () => setLineas((ls) => [...ls, nuevaLinea(Math.max(...ls.map((l) => l.k)) + 1)]);
  const quita = (k: number) => setLineas((ls) => ls.filter((l) => l.k !== k));

  /* LOS DESTINOS: Barranquilla primero —es a donde va casi todo— y
     después los CD del maestro, por nombre. Sin repetir Barranquilla si
     el maestro también la trae como origen. */
  const destinos = useMemo(() => {
    const otros = [...new Set(origenes.map((o) => o.cd_origen))]
      .filter((c) => plano(c) !== plano(DESTINO_POR_DEFECTO))
      .sort((a, b) => a.localeCompare(b, "es"));
    return [DESTINO_POR_DEFECTO, ...otros];
  }, [origenes]);

  const mismo = !!origen && plano(origen.cd_origen) === plano(destino);

  /* LA BÚSQUEDA DE MATERIAL: por código o por descripción, hasta ocho.
     Con el material ya escogido la lista se esconde. Un material que ya
     está en otra línea no se vuelve a ofrecer: serían las mismas botellas
     contadas dos veces; para más estibas se suman en su misma línea. */
  const coincidencias = (l: Linea) => {
    const q = plano(l.busca.trim());
    const usados = new Set(lineas.filter((x) => x.k !== l.k).map((x) => x.sku));
    const libres = skus.filter((k) => !usados.has(k.sku));
    if (!q) return libres.slice(0, 8);
    return libres
      .filter((k) => plano(k.sku).includes(q) || plano(k.descripcion).includes(q))
      .slice(0, 8);
  };

  /* LAS CIFRAS, las mismas fórmulas de Certificar. La vista de la base
     las vuelve a calcular al leer: esto es solo para verlas antes de
     guardar. Sin los factores del material queda «—», no un cero que
     parezca un dato. Cada línea tiene las suyas y abajo va el total del
     camión; si a un material le faltan factores, el total de esa cifra
     también es «—» (sumar el resto daría un número que engaña). */
  const cifrasDe = (l: Linea) => {
    const mat = skus.find((k) => k.sku === l.sku);
    const nEst = estibasDe(l.cant, mat);
    if (!mat || !nEst || nEst <= 0) return null;
    const cajas = mat.cajas_x_estiba == null ? null : Number(mat.cajas_x_estiba) * nEst;
    const unidades = cajas == null || mat.unidades_x_caja == null
      ? null : Number(mat.unidades_x_caja) * cajas;
    const hl = unidades == null || mat.hl_x_unidad == null
      ? null : Number(mat.hl_x_unidad) * unidades;
    /* QUÉ FACTOR FALTA, dicho por su nombre, para que quien ve el aviso
       sepa qué completar en el Maestro. */
    const sin = mat.cajas_x_estiba == null ? "factor de estiba"
      : mat.unidades_x_caja == null ? "unidades por caja"
      : mat.hl_x_unidad == null ? "factor de HL" : null;
    return { sider: nEst / estibasPorSider, cajas, unidades, hl, sin, estibas: nEst };
  };

  /* EL TOTAL DEL CAMIÓN. Suma lo que se sabe y DICE QUÉ MATERIAL FALTA:
     mostrar solo la suma parcial sería un número que engaña, y mostrar
     «—» por un solo material sin factores esconde lo que sí se sabe.
     Sin ningún dato queda «—», nunca un cero que parezca un dato. */
  const total = useMemo(() => {
    const cs = lineas.map((l) => ({ c: cifrasDe(l) }));
    const campo = (f: "sider" | "cajas" | "unidades" | "hl") => {
      const con = cs.filter((x) => x.c && x.c[f] != null);
      if (con.length === 0) return { v: null as number | null, falta: [] as number[] };
      const falta = cs.map((x, i) => (x.c && x.c[f] != null ? 0 : i + 1)).filter(Boolean);
      return { v: con.reduce((a, x) => a + (x.c![f] as number), 0), falta };
    };
    return { sider: campo("sider"), cajas: campo("cajas"), unidades: campo("unidades"), hl: campo("hl") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, skus, estibasPorSider]);

  /* LO QUE FALTA SE DICE POR SU NOMBRE, junto al botón. «Rellena los
     campos» obliga a adivinar cuál. */
  const faltan: string[] = [];
  if (!canal) faltan.push("si es de un socio o de T1");
  if (canal === "socios" && !socio) faltan.push("el socio");
  if (!PLACA_OK.test(placa)) faltan.push("la placa (3 letras y 3 números)");
  if (!planta) faltan.push("el CD de origen");
  lineas.forEach((l, i) => {
    const ref = lineas.length > 1 ? ` del material ${i + 1}` : "";
    if (!l.sku) faltan.push(lineas.length > 1 ? `el material ${i + 1}` : "el material");
    const mat = skus.find((k) => k.sku === l.sku);
    const n = num(l.cant);
    if (!n || n <= 0) faltan.push(`las unidades${ref}`);
    /* Hace falta poder convertir: sin los factores del maestro no hay estibas que mandar. */
    else if (mat && estibasDe(l.cant, mat) == null)
      faltan.push(`el ${factorFaltante(mat)} del material${lineas.length > 1 ? ` ${i + 1}` : ""} en el Maestro (para pasar las unidades a estibas)`);
  });
  if (canal === "t1" && !factura) faltan.push("el documento (número de factura)");
  const puede = faltan.length === 0 && !mismo;

  async function crear() {
    if (!puede) return;
    setMal(null); setOcupado(true);
    const supabase = createClient();
    /* CON UN SOLO MATERIAL SE LLAMA A LA FUNCIÓN DE SIEMPRE: así el «+»
       no se rompe si se sube el código antes de correr el SQL de varios
       materiales. Con más de uno, una función que los crea todos o
       ninguno. */
    const { error } = lineas.length === 1
      ? await supabase.rpc("sider_viaje_interno_crear", {
          p_placa: placa,
          p_planta: planta,
          p_destino: destino,
          p_sku: lineas[0].sku,
          p_estibas: estibasDe(lineas[0].cant, skus.find((k) => k.sku === lineas[0].sku)),
          /* UN SOCIO NO TIENE DOCUMENTO: la factura solo viaja en T1. */
          p_factura: canal === "t1" ? factura : null,
          p_canal: canal,
          p_socio: canal === "socios" ? socio : null,
          /* Sin lote ni nota: el Vh Interno se crea con lo justo. La función de la
             base conserva los dos parámetros y aquí viajan vacíos. */
          p_lote: null,
          p_nota: null,
        })
      : await supabase.rpc("sider_viaje_interno_crear_varios", {
          p_placa: placa,
          p_planta: planta,
          p_destino: destino,
          p_factura: canal === "t1" ? factura : null,
          p_lineas: lineas.map((l) => ({ sku: l.sku, estibas: estibasDe(l.cant, skus.find((k) => k.sku === l.sku)) })),
          p_canal: canal,
          p_socio: canal === "socios" ? socio : null,
        });
    setOcupado(false);
    if (error) { setMal(traducirError(error.message)); return }
    alCrear(placa);
  }

  return (
    <div className="vj-velo" role="dialog" aria-modal="true" aria-labelledby="nv-titulo"
         onClick={(e) => { if (e.target === e.currentTarget && !ocupado) alCerrar() }}>
      <div className="vj-caja nuevo">
        <p className="vj-ojo">VH INTERNO</p>
        <h3 id="nv-titulo">Crear un Vh Interno</h3>
        <p className="vj-dice">
          Para el que <b>no certificó Sider</b>. No pasa por Tránsito ni pide certificar la
          llegada: queda de una vez en <b>Revisión AI – normal</b>.
        </p>

        <div className="nv-campos">
          {/* PRIMERO, DE QUIÉN ES: de eso depende si se pide el socio o
              el documento. Son dos botones grandes y no un desplegable:
              se toca con el guante puesto. */}
          <div className="nv-canal ancho" role="group" aria-labelledby="nv-canal-rot">
            <span className="nv-rot" id="nv-canal-rot">¿De quién es?</span>
            <div className="nv-canal-bot">
              {([["socios", "Socio"], ["t1", "T1"]] as const).map(([k, nombre]) => (
                <button key={k} type="button" aria-pressed={canal === k}
                        className={canal === k ? "on" : ""}
                        onClick={() => setCanal(k)}>{nombre}</button>
              ))}
            </div>
          </div>

          {canal === "socios" && (
            <label className="nv-socio ancho">
              <span>Socio</span>
              <select value={socio} required aria-required="true"
                      aria-invalid={!socio} onChange={(e) => setSocio(e.target.value)}>
                <option value="">— escoge el socio —</option>
                {socios.map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
              </select>
              <small>Un socio no lleva número de documento.</small>
            </label>
          )}

          {canal === "t1" && (
            <label className="nv-doc">
              <span>Documento (factura)</span>
              <input value={factura} maxLength={DOC_MAX} inputMode="numeric" autoComplete="off" required aria-required="true"
                     placeholder="Número de factura" aria-describedby="nv-doc-ayuda"
                     onChange={(e) => setFactura(limpiaDoc(e.target.value))} />
              <small id="nv-doc-ayuda">Solo números, hasta {DOC_MAX} dígitos</small>
            </label>
          )}

          <label className="nv-placa">
            <span>Placa</span>
            <input value={placa} maxLength={6} autoCapitalize="characters"
                   autoComplete="off" placeholder="ABC123" spellCheck={false}
                   aria-describedby="nv-placa-ayuda"
                   aria-invalid={placa.length > 0 && !PLACA_OK.test(placa)}
                   onChange={(e) => setPlaca(limpiaPlaca(e.target.value))} />
            <small id="nv-placa-ayuda" className={placa.length > 0 && !PLACA_OK.test(placa) ? "mal" : ""}>
              3 letras y 3 números, sin más
            </small>
          </label>

          <label>
            <span>CD origen</span>
            <select value={planta} onChange={(e) => setPlanta(e.target.value)}>
              <option value="">— escoge el CD —</option>
              {origenes.map((o) => (
                <option key={o.planta} value={o.planta}>{o.cd_origen}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Destino</span>
            <select value={destino} onChange={(e) => setDestino(e.target.value)}
                    aria-invalid={mismo}>
              {destinos.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          {mismo && (
            <p className="nv-mal ancho" role="alert">
              El origen y el destino son el mismo CD: escoge otro destino.
            </p>
          )}

          {/* LOS MATERIALES DE ESA FACTURA. Cada uno con SU cantidad de
              estibas; el «+» de abajo agrega otro. */}
          {lineas.map((l, i) => {
            const mat = skus.find((k) => k.sku === l.sku);
            const c = cifrasDe(l);
            /* «pend»: a esta línea le falta algo —material, estibas o
               factores del maestro— y el borde lo dice sin leer. */
            const pend = !c || !!c.sin;
            return (
              <div key={l.k} className={"nv-linea ancho" + (pend ? " pend" : "")}>
                {lineas.length > 1 && (
                  <div className="nv-linea-cab">
                    <span><i aria-hidden="true">{i + 1}</i>Material {i + 1} de {lineas.length}</span>
                    <button type="button" className="tr-adm" onClick={() => quita(l.k)}
                            aria-label={`Quitar el material ${i + 1}`}>Quitar</button>
                  </div>
                )}
                <div className="nv-material">
                  <span className="nv-rot" id={`nv-mat-rot-${l.k}`}>Material <em>del maestro</em></span>
                  {mat ? (
                    <div className="nv-escogido">
                      <div>
                        <b>{mat.descripcion}</b>
                        <em>{mat.sku}{mat.clase ? ` · ${mat.clase}` : ""}</em>
                      </div>
                      <button type="button" className="tr-adm"
                              onClick={() => cambia(l.k, { sku: "", busca: "" })}>
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <>
                      <input value={l.busca} onChange={(e) => cambia(l.k, { busca: e.target.value })}
                             aria-labelledby={`nv-mat-rot-${l.k}`} autoComplete="off"
                             placeholder="Escribe el código o parte del nombre" />
                      <ul className="nv-lista" role="listbox" aria-label="Materiales que coinciden">
                        {coincidencias(l).map((k) => (
                          <li key={k.sku} role="option" aria-selected={false}>
                            <button type="button" onClick={() => cambia(l.k, { sku: k.sku })}>
                              <b>{k.descripcion}</b>
                              <em>{k.sku}{k.clase ? ` · ${k.clase}` : ""}</em>
                            </button>
                          </li>
                        ))}
                        {coincidencias(l).length === 0 && (
                          <li className="nv-nada">Ningún material del maestro coincide con «{l.busca.trim()}».</li>
                        )}
                      </ul>
                    </>
                  )}
                </div>
                {/* LA CANTIDAD, EN UNIDADES. Abajo se ve a cuántas estibas equivale (es lo que guarda la base). */}
                <div className="nv-cant">
                  <label className="nv-est">
                    <span>Unidades</span>
                    <input value={l.cant} inputMode="decimal" autoComplete="off" placeholder="0"
                           onChange={(e) => cambia(l.k, { cant: e.target.value })} />
                  </label>
                </div>
                {mat && factorFaltante(mat) === null && estibasDe(l.cant, mat) != null && (
                  <p className="nv-conv" role="status">
                    = <b>{nf3.format(estibasDe(l.cant, mat) as number)}</b> estibas
                    {!cajasCompletas(unidadesDe(l.cant), mat) && (
                      <span className="nv-aviso"> · no completa cajas enteras: revisa el número</span>
                    )}
                  </p>
                )}
                {/* Sin los factores no hay cómo pasar las unidades a estibas: se dice cuál falta y dónde completarlo. */}
                {mat && factorFaltante(mat) !== null && (
                  <p className="nv-lin-cif no">
                    <span>Sin {factorFaltante(mat)} en el maestro: no se pueden pasar las unidades a estibas</span>
                    {" · "}
                    <a href="/sider/maestro" target="_blank" rel="noopener">completar</a>
                  </p>
                )}
                {c && (c.sin ? (
                  <p className="nv-lin-cif no">
                    <span>Sin {c.sin} en el maestro</span>
                    {" · "}
                    <a href="/sider/maestro" target="_blank" rel="noopener">completar</a>
                  </p>
                ) : (
                  <p className="nv-lin-cif ok">
                    <span><b>{c.cajas == null ? "—" : nf.format(c.cajas)}</b> cajas · <b>{c.unidades == null ? "—" : nf.format(c.unidades)}</b> unidades</span>
                  </p>
                ))}
              </div>
            );
          })}

          {lineas.length < MAX_LINEAS && (
            <button type="button" className="nv-mas-mat ancho" onClick={agrega}>
              <span aria-hidden="true">+</span> {canal === "socios" ? "Agregar otro material" : "Agregar otro material de esta factura"}
            </button>
          )}
        </div>

        {/* LO QUE SE CALCULA SOLO. Se ve mientras se escribe: si el
            material no trae factores en el maestro se dice «—», no cero. */}
        {lineas.length > 1 && <p className="nv-total">Total de los {lineas.length} materiales</p>}
        <dl className="nv-cifras" aria-label="Cifras calculadas">
          {([["Sider", total.sider, nf2], ["Cajas", total.cajas, nf], ["Unidades", total.unidades, nf], ["HL", total.hl, nf2]] as const)
            .map(([rot, c, f]) => (
              <div key={rot}>
                <dt>{rot}</dt>
                <dd>{c.v == null ? "—" : f.format(c.v)}</dd>
                {c.v != null && c.falta.length > 0 && (
                  <i>falta mat. {c.falta.join(", ")}</i>
                )}
              </div>
            ))}
        </dl>

        {mal && <p className="vj-mal" role="alert">{mal}</p>}
        {!ocupado && !puede && !mismo && (
          <p className="vj-falta">Falta {faltan.join(", ")}. Sin eso el botón no se enciende.</p>
        )}

        <div className="vj-botones">
          <button type="button" className="btn" onClick={crear} disabled={ocupado || !puede}>
            {ocupado ? "Creando…" : "Crear Vh Interno"}
          </button>
          <button type="button" className="btn plano" onClick={alCerrar} disabled={ocupado}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
