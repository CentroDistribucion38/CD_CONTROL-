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

export type OrigenMaestro = { planta: string; cd_origen: string };
export type SkuMaestro = {
  sku: string; descripcion: string; clase?: string | null;
  cajas_x_estiba?: number | null; unidades_x_caja?: number | null; hl_x_unidad?: number | null;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** «0,83» y «0.83» valen lo mismo; vacío o basura, nada. */
const num = (s: string) => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Sin tildes y en minúscula: «costeñita» y «COSTENITA» son la misma búsqueda. */
const plano = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const DESTINO_POR_DEFECTO = "Barranquilla";

/** Un camión lleva 2 o 3 referencias; la base acepta hasta 10. */
const MAX_LINEAS = 10;
type Linea = { k: number; sku: string; busca: string; estibas: string };
const nuevaLinea = (k: number): Linea => ({ k, sku: "", busca: "", estibas: "" });

/** LA PLACA SON TRES LETRAS Y TRES NÚMEROS, y nada más. */
const PLACA_OK = /^[A-Z]{3}[0-9]{3}$/;
/** Lo que se acepta al teclear: sin espacios ni signos, en mayúscula, máximo 6. */
const limpiaPlaca = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

/** EL DOCUMENTO (factura): OBLIGATORIO, solo dígitos, de 1 a 10. */
const DOC_MAX = 10;
const limpiaDoc = (t: string) => t.replace(/[^0-9]/g, "").slice(0, DOC_MAX);

export function NuevoInterno({ origenes, skus, estibasPorSider = 36, alCerrar, alCrear }: {
  origenes: OrigenMaestro[];
  skus: SkuMaestro[];
  estibasPorSider?: number;
  alCerrar: () => void;
  /** Se llama con la placa ya guardada: el Vh Interno ya está en Revisión AI – normal. */
  alCrear: (placa: string) => void;
}) {
  const [placa, setPlaca] = useState("");
  const [planta, setPlanta] = useState("");
  const [destino, setDestino] = useState(DESTINO_POR_DEFECTO);
  /* UN CAMIÓN PUEDE TRAER VARIOS MATERIALES con la misma factura: cada uno
     es una línea con su material y sus estibas. Arranca con una sola; el
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
    const nEst = num(l.estibas);
    if (!mat || !nEst || nEst <= 0) return null;
    const cajas = mat.cajas_x_estiba == null ? null : Number(mat.cajas_x_estiba) * nEst;
    const unidades = cajas == null || mat.unidades_x_caja == null
      ? null : Number(mat.unidades_x_caja) * cajas;
    const hl = unidades == null || mat.hl_x_unidad == null
      ? null : Number(mat.hl_x_unidad) * unidades;
    return { sider: nEst / estibasPorSider, cajas, unidades, hl };
  };
  const der = useMemo(() => {
    const cs = lineas.map(cifrasDe);
    if (cs.some((c) => c === null)) return null;
    const suma = (f: "cajas" | "unidades" | "hl") =>
      cs.some((c) => c![f] == null) ? null : cs.reduce((a, c) => a + (c![f] as number), 0);
    return {
      sider: cs.reduce((a, c) => a + c!.sider, 0),
      cajas: suma("cajas"), unidades: suma("unidades"), hl: suma("hl"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, skus, estibasPorSider]);

  /* LO QUE FALTA SE DICE POR SU NOMBRE, junto al botón. «Rellena los
     campos» obliga a adivinar cuál. */
  const faltan: string[] = [];
  if (!PLACA_OK.test(placa)) faltan.push("la placa (3 letras y 3 números)");
  if (!planta) faltan.push("el CD de origen");
  lineas.forEach((l, i) => {
    const ref = lineas.length > 1 ? ` del material ${i + 1}` : "";
    if (!l.sku) faltan.push(lineas.length > 1 ? `el material ${i + 1}` : "el material");
    const n = num(l.estibas);
    if (!n || n <= 0) faltan.push(`las estibas${ref}`);
  });
  if (!factura) faltan.push("el documento (número de factura)");
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
          p_estibas: num(lineas[0].estibas),
          p_factura: factura,
          /* Sin lote ni nota: el Vh Interno se crea con lo justo. La función de la
             base conserva los dos parámetros y aquí viajan vacíos. */
          p_lote: null,
          p_nota: null,
        })
      : await supabase.rpc("sider_viaje_interno_crear_varios", {
          p_placa: placa,
          p_planta: planta,
          p_destino: destino,
          p_factura: factura,
          p_lineas: lineas.map((l) => ({ sku: l.sku, estibas: num(l.estibas) })),
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
          <label className="nv-placa">
            <span>Placa</span>
            <input value={placa} autoFocus maxLength={6} autoCapitalize="characters"
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

          <label className="nv-doc">
            <span>Documento (factura)</span>
            <input value={factura} maxLength={DOC_MAX} inputMode="numeric" autoComplete="off" required aria-required="true"
                   placeholder="Número de factura" aria-describedby="nv-doc-ayuda"
                   onChange={(e) => setFactura(limpiaDoc(e.target.value))} />
            <small id="nv-doc-ayuda">Solo números, hasta {DOC_MAX} dígitos</small>
          </label>

          {/* LOS MATERIALES DE ESA FACTURA. Cada uno con SU cantidad de
              estibas; el «+» de abajo agrega otro. */}
          {lineas.map((l, i) => {
            const mat = skus.find((k) => k.sku === l.sku);
            const c = cifrasDe(l);
            return (
              <div key={l.k} className="nv-linea ancho">
                {lineas.length > 1 && (
                  <div className="nv-linea-cab">
                    <span>Material {i + 1} de {lineas.length}</span>
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
                <label className="nv-est">
                  <span>Estibas</span>
                  <input value={l.estibas} inputMode="decimal" autoComplete="off" placeholder="0"
                         onChange={(e) => cambia(l.k, { estibas: e.target.value })} />
                </label>
                {lineas.length > 1 && (
                  <p className="nv-lin-cif">
                    {c ? `${c.cajas == null ? "—" : nf.format(c.cajas)} cajas · ${c.unidades == null ? "—" : nf.format(c.unidades)} unidades` : "Escoge el material y las estibas"}
                  </p>
                )}
              </div>
            );
          })}

          {lineas.length < MAX_LINEAS && (
            <button type="button" className="nv-mas-mat ancho" onClick={agrega}>
              <span aria-hidden="true">+</span> Agregar otro material de esta factura
            </button>
          )}
        </div>

        {/* LO QUE SE CALCULA SOLO. Se ve mientras se escribe: si el
            material no trae factores en el maestro se dice «—», no cero. */}
        {lineas.length > 1 && <p className="nv-total">Total de los {lineas.length} materiales</p>}
        <dl className="nv-cifras" aria-label="Cifras calculadas">
          <div><dt>Sider</dt><dd>{der ? nf2.format(der.sider) : "—"}</dd></div>
          <div><dt>Cajas</dt><dd>{der?.cajas == null ? "—" : nf.format(der.cajas)}</dd></div>
          <div><dt>Unidades</dt><dd>{der?.unidades == null ? "—" : nf.format(der.unidades)}</dd></div>
          <div><dt>HL</dt><dd>{der?.hl == null ? "—" : nf2.format(der.hl)}</dd></div>
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
