"use client";

// src/app/(app)/traspasos/facturacion/Bandeja.tsx
import { useMemo, useState as useState4 } from "react";

// .arnes/_nav.mjs
var useRouter = () => ({ refresh() {
}, replace() {
}, push() {
} });

// .arnes/_supa.mjs
var createClient = () => ({ rpc: async () => ({ error: null }) });

// src/components/Aviso.tsx
import { useCallback, useRef, useState } from "react";

// src/lib/errores.ts
var PREFIJOS = [
  /* Rotura de línea: el módulo y sus migraciones, de lo fino a lo grueso. */
  [
    /\b(rotlinea_firmas?|rotlinea_firmar|rotlinea_quitar_firma|v_rotlinea_firmas)/,
    "supabase/migraciones/2026-09-rotura-linea-firma.sql"
  ],
  [/\bv_rotlinea_uso/, "supabase/migraciones/2026-09-rotura-linea-maestro.sql"],
  [/\b(rotlinea_|v_rotlinea)/, "supabase/modulos/rotura-linea.sql"],
  /* Traspasos, igual: lo fino antes que lo grueso. Este módulo faltaba
       entero en la lista y mandaba al mensaje genérico —el que dice "el
       archivo del módulo" y deja a quien lo lee con la mitad del trabajo.
  
       Y «adelantado» va ANTES que «atrasado» y que traspaso_hoy: las dos
       marcas son parientes y sus nombres se parecen, pero la de adelante
       la trae otra migración. Con el orden al revés, faltar
       `dias_adelante` mandaría a correr el archivo equivocado. */
  [
    /\b(adelantado|dias_adelante)/,
    "supabase/migraciones/2026-09-traspasos-registro-adelantado.sql"
  ],
  [
    /\b(traspaso_hoy|traspaso_arranque_turno|dias_atras|atrasado)/,
    "supabase/migraciones/2026-09-traspasos-registro-atrasado.sql"
  ],
  [
    /\b(traspaso_editar_viaje|traspasos_viajes_ediciones)/,
    "supabase/migraciones/2026-09-traspasos-editar-viaje.sql"
  ],
  [/\btraspaso_borrar_plan/, "supabase/migraciones/2026-09-traspasos-borrar-plan.sql"],
  [
    /\b(traspasos_placas|traspaso_agregar_placa|traspaso_ordenar_placas)/,
    "supabase/migraciones/2026-09-traspasos-placas.sql"
  ],
  [
    /\b(traspaso_plan_a_varios|traspaso_dias_con_plan)/,
    "supabase/migraciones/2026-09-traspasos-plan-varios-dias.sql"
  ],
  [
    /\b(traspaso_parecido|traspaso_unir_punto|traspaso_agregar_punto|v_traspasos_uso)/,
    "supabase/migraciones/2026-09-traspasos-maestro.sql"
  ],
  [
    /\b(traspasos_plan_vacios|traspaso_guardar_plan|traspaso_publicar_plan)/,
    "supabase/migraciones/2026-09-traspasos-plan-rejilla.sql"
  ],
  [/\b(traspasos?_|v_traspasos)/, "supabase/modulos/traspasos.sql"],
  /* Lo fino antes que lo grueso, como en traspasos: el área y las
     causas nuevas las trae una migración, no el archivo del módulo. */
  [
    /\b(roturas_areas|p_area|area_nombre)/,
    "supabase/migraciones/2026-09-roturas-sitio-area-causas.sql"
  ],
  [/\b(roturas?_|salida_|v_roturas)/, "supabase/modulos/roturas.sql"],
  [/\b(acciones?_|accion_)/, "supabase/modulos/acciones.sql"],
  /* La revisión AI va ANTES que Sider a secas: sider_ai_guardar empieza
     por "sider_" y con el orden al revés mandaría al módulo grande. */
  [/\b(sider_ai_|v_sider_ai)/, "supabase/modulos/sider-ai.sql"],
  [/\b(sider_|v_sider)/, "supabase/modulos/sider.sql"],
  [/\b(inventario_|producto_|bodega_|conteo_|movimiento_)/, "supabase/modulos/inventario.sql"],
  [/\b(quiebra_|v_quiebra)/, "supabase/modulos/quiebra.sql"],
  [/\b(roles?_|rol_permisos|perfiles)\b/, "supabase/02-roles.sql"]
];
function archivoDelModulo(t) {
  for (const [patron, archivo] of PREFIJOS) if (patron.test(t)) return archivo;
  return "el archivo del m\xF3dulo en supabase/modulos/";
}
function traducirError(m) {
  const t = (m ?? "").toLowerCase();
  if (!t) return "Algo fall\xF3 y la base no dijo qu\xE9. Vuelve a intentarlo.";
  if (t.includes("does not exist") || t.includes("schema cache") || t.includes("could not find the function")) {
    return `Falta crear esta parte en Supabase. Abre el SQL Editor y ejecuta ${archivoDelModulo(t)} \u2014 se puede correr varias veces sin romper nada.`;
  }
  if (t.includes("duplicate key") || t.includes("already exists")) {
    return "Ya existe uno con esa clave o ese c\xF3digo. Escoge otro.";
  }
  if (t.includes("foreign key")) {
    return "No se puede borrar: hay cosas que apuntan a esto. Desact\xEDvalo en vez de borrarlo \u2014 borrarlo se llevar\xEDa por delante el hist\xF3rico.";
  }
  if (t.includes("row-level security") || t.includes("permission denied") || t.includes("not authorized")) {
    return "Tu usuario no tiene permiso para esto. Se necesita rol de supervisor o administrador.";
  }
  if (t.includes("violates check constraint") || t.includes("invalid input value for enum")) {
    return "Ese valor no es v\xE1lido para este campo. Revisa lo que escribiste y vuelve a intentar.";
  }
  if (t.includes("null value") && t.includes("not-null")) {
    return "Falta llenar un campo obligatorio.";
  }
  if (t.includes("failed to fetch") || t.includes("networkerror") || t.includes("load failed") || t.includes("network request failed")) {
    return "No hay se\xF1al en este punto. Lo que escribiste no se perdi\xF3: vuelve a intentarlo donde haya red.";
  }
  if (t.includes("jwt") || t.includes("token") || t.includes("session")) {
    return "Tu sesi\xF3n se venci\xF3. Vuelve a entrar y repite lo que estabas haciendo.";
  }
  if (t.includes("timeout") || t.includes("statement canceled")) {
    return "La base tard\xF3 demasiado en contestar. Vuelve a intentarlo en un momento.";
  }
  return m;
}

// src/components/Aviso.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var SE_VA = { bien: 4500, info: 6e3, mal: 0 };
function useAvisos() {
  const [notas, setNotas] = useState([]);
  const siguiente = useRef(1);
  const quitar = useCallback((id) => {
    setNotas((n) => n.filter((x) => x.id !== id));
  }, []);
  const poner = useCallback((tipo, texto) => {
    const id = siguiente.current++;
    setNotas((n) => [...n, { id, tipo, texto: traducirError(texto) }].slice(-3));
    const ms = SE_VA[tipo];
    if (ms) setTimeout(() => quitar(id), ms);
  }, [quitar]);
  const avisar = useRef({
    bien: (t) => poner("bien", t),
    mal: (t) => poner("mal", t),
    info: (t) => poner("info", t)
  });
  avisar.current = {
    bien: (t) => poner("bien", t),
    mal: (t) => poner("mal", t),
    info: (t) => poner("info", t)
  };
  const vista = notas.length ? /* @__PURE__ */ jsx("div", { className: "av-pila", role: "status", "aria-live": "polite", children: notas.map((n) => /* @__PURE__ */ jsxs("div", { className: "av " + n.tipo, children: [
    /* @__PURE__ */ jsx("span", { className: "av-icono", "aria-hidden": true, children: n.tipo === "bien" ? /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", children: /* @__PURE__ */ jsx("path", { d: "M5 12.5l4.5 4.5L19 7.5" }) }) : n.tipo === "mal" ? /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 24 24", children: [
      /* @__PURE__ */ jsx("path", { d: "M12 7v6.5" }),
      /* @__PURE__ */ jsx("circle", { cx: "12", cy: "17", r: ".6", fill: "currentColor" }),
      /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "9" })
    ] }) : /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 24 24", children: [
      /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "9" }),
      /* @__PURE__ */ jsx("path", { d: "M12 11v6M12 7.5v.01" })
    ] }) }),
    /* @__PURE__ */ jsx("span", { className: "av-txt", children: n.texto }),
    /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        className: "av-x",
        onClick: () => quitar(n.id),
        "aria-label": "Cerrar el aviso",
        children: "\u2715"
      }
    )
  ] }, n.id)) }) : null;
  return [avisar.current, vista];
}

// src/app/(app)/traspasos/Depurar.tsx
import { useLayoutEffect, useRef as useRef3, useState as useState3 } from "react";

// src/components/Confirmar.tsx
import { useCallback as useCallback2, useEffect, useRef as useRef2, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function useConfirmar() {
  const [pedido, setPedido] = useState2(null);
  const resolver = useRef2(null);
  const volverA = useRef2(null);
  const cancelarRef = useRef2(null);
  const pedir = useCallback2((p) => {
    volverA.current = document.activeElement;
    setPedido(p);
    return new Promise((res) => {
      resolver.current = res;
    });
  }, []);
  const cerrar = useCallback2((valor) => {
    setPedido(null);
    resolver.current?.(valor);
    resolver.current = null;
    volverA.current?.focus?.();
  }, []);
  useEffect(() => {
    if (!pedido) return;
    cancelarRef.current?.focus();
    const tecla = (e) => {
      if (e.key === "Escape") cerrar(false);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [pedido, cerrar]);
  const dialogo = pedido ? /* @__PURE__ */ jsx2(
    "div",
    {
      className: "cf-velo",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "cf-titulo",
      onClick: (e) => {
        if (e.target === e.currentTarget) cerrar(false);
      },
      children: /* @__PURE__ */ jsxs2("div", { className: "cf-caja" + (pedido.peligro ? " peligro" : ""), children: [
        /* @__PURE__ */ jsx2("h2", { id: "cf-titulo", children: pedido.titulo }),
        pedido.dice && /* @__PURE__ */ jsx2("div", { className: "cf-dice", children: pedido.dice }),
        /* @__PURE__ */ jsxs2("div", { className: "cf-botones", children: [
          /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              ref: cancelarRef,
              className: "cf-btn plano",
              onClick: () => cerrar(false),
              children: pedido.cancelar ?? "Cancelar"
            }
          ),
          /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              className: "cf-btn" + (pedido.peligro ? " mal" : ""),
              onClick: () => cerrar(true),
              children: pedido.confirmar ?? "Continuar"
            }
          )
        ] })
      ] })
    }
  ) : null;
  return [pedir, dialogo];
}

// src/app/(app)/traspasos/Depurar.tsx
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var ACCIONES = [
  { k: "anular", rot: "Anular", dice: "Queda a la vista como anulado, con el motivo. Sale de la bandeja y del cumplido. Si ya estaba facturado, se le quita la salida y el documento queda en su rastro." },
  { k: "sin_factura", rot: "No se factura", dice: "Se anula con \xABNo se factura: \u2026\xBB. Para viajes que no llevan documento." },
  { k: "eliminar", rot: "Eliminar", dice: "Se borra de verdad, con sus tipos. Queda escrito qui\xE9n, cu\xE1ndo y por qu\xE9." }
];
function Depurar({ ids, viajes, limpiar, listo, fallo }) {
  const router = useRouter();
  const [pedir, dialogo] = useConfirmar();
  const [accion, setAccion] = useState3("anular");
  const [motivo, setMotivo] = useState3("");
  const [mandando, setMandando] = useState3(false);
  const n = ids.length;
  const barra = useRef3(null);
  const [caja, setCaja] = useState3(null);
  useLayoutEffect(() => {
    const medir = () => {
      const main = barra.current?.closest(".sh-main") ?? document.querySelector(".sh-main");
      const r = main?.getBoundingClientRect();
      const cs = main ? getComputedStyle(main) : null;
      const pl = cs ? parseFloat(cs.paddingLeft) : 16, pr = cs ? parseFloat(cs.paddingRight) : 16;
      const left = r ? r.left + pl : 16, width = r ? r.width - pl - pr : innerWidth - 32;
      setCaja({ left, width, alto: barra.current?.offsetHeight ?? 0 });
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (barra.current) ro.observe(barra.current);
    addEventListener("resize", medir);
    return () => {
      ro.disconnect();
      removeEventListener("resize", medir);
    };
  }, []);
  const a = ACCIONES.find((x) => x.k === accion);
  async function hacer() {
    if (motivo.trim().length < 5 || mandando) return;
    if (accion === "eliminar" && !await pedir({
      titulo: `\xBFEliminar ${n} viaje${n === 1 ? "" : "s"}?`,
      dice: /* @__PURE__ */ jsxs3(Fragment, { children: [
        "Se borra",
        n === 1 ? "" : "n",
        " de verdad: ",
        viajes.slice(0, 6).map((v) => v.codigo ?? v.placa).join(", "),
        n > 6 ? "\u2026" : "",
        ". No se puede deshacer."
      ] }),
      confirmar: "Eliminar",
      peligro: true
    })) return;
    setMandando(true);
    const { data, error } = await createClient().rpc("traspaso_depurar", { p_ids: ids, p_accion: accion, p_motivo: motivo.trim() });
    setMandando(false);
    if (error) {
      fallo(/could not find the function|schema cache/i.test(error.message) ? "Falta correr 2026-09-traspasos-depurar.sql en Supabase." : error.message);
      return;
    }
    const k = Number(data ?? n);
    listo(`${k} viaje${k === 1 ? "" : "s"} ${accion === "eliminar" ? "eliminado" : "anulado"}${k === 1 ? "" : "s"}.`);
    setMotivo("");
    limpiar();
    router.refresh();
  }
  return /* @__PURE__ */ jsxs3(Fragment, { children: [
    /* @__PURE__ */ jsx3("div", { className: "fc-dep-hueco", style: { height: (caja?.alto ?? 0) + 12 }, "aria-hidden": true }),
    /* @__PURE__ */ jsxs3(
      "div",
      {
        className: "fc-dep",
        role: "region",
        "aria-label": "Depurar viajes seleccionados",
        ref: barra,
        style: caja ? { left: caja.left, width: caja.width } : void 0,
        children: [
          dialogo,
          /* @__PURE__ */ jsxs3("div", { className: "fc-dep-in", children: [
            /* @__PURE__ */ jsxs3("p", { className: "fc-dep-n", children: [
              /* @__PURE__ */ jsx3("b", { children: n }),
              " seleccionado",
              n === 1 ? "" : "s"
            ] }),
            /* @__PURE__ */ jsx3("div", { className: "fc-dep-seg", role: "radiogroup", "aria-label": "Qu\xE9 hacer", children: ACCIONES.map((x) => /* @__PURE__ */ jsx3(
              "button",
              {
                type: "button",
                role: "radio",
                "aria-checked": accion === x.k,
                className: (accion === x.k ? "on" : "") + (x.k === "eliminar" ? " peligro" : ""),
                onClick: () => setAccion(x.k),
                children: x.rot
              },
              x.k
            )) }),
            /* @__PURE__ */ jsx3(
              "input",
              {
                className: "fc-dep-motivo",
                value: motivo,
                onChange: (e) => setMotivo(e.target.value),
                maxLength: 200,
                placeholder: "Motivo (obligatorio): duplicado, prueba, viaje interno\u2026",
                "aria-label": "Motivo"
              }
            ),
            /* @__PURE__ */ jsxs3("div", { className: "fc-dep-bot", children: [
              /* @__PURE__ */ jsx3("button", { type: "button", className: "btn", onClick: limpiar, children: "Quitar selecci\xF3n" }),
              /* @__PURE__ */ jsx3(
                "button",
                {
                  type: "button",
                  className: "btn si" + (accion === "eliminar" ? " peligro" : ""),
                  disabled: motivo.trim().length < 5 || mandando,
                  onClick: hacer,
                  children: mandando ? "Haciendo\u2026" : `${a.rot} ${n}`
                }
              )
            ] }),
            /* @__PURE__ */ jsx3("p", { className: "fc-dep-dice", children: a.dice })
          ] })
        ]
      }
    )
  ] });
}

// src/modulos/traspasos/formato.ts
function quien(nombres, id) {
  if (!id) return "\u2014";
  return nombres[id] ?? "\u2014";
}
var placaClave = (p) => (p ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

// src/app/(app)/traspasos/facturacion/Bandeja.tsx
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
var dia = (f) => (/* @__PURE__ */ new Date(f + "T12:00:00")).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
var hora = (s) => new Date(s).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
var ruta = (v) => [v.origen_nombre, v.destino_nombre].filter(Boolean).join(" \u2192 ") || "\u2014";
var limpio = (s) => s.replace(/\D/g, "").slice(0, 10);
var coincide = (v, q) => {
  if (!q) return true;
  const n = q.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return [v.documento, v.placa, v.factura_documento, v.codigo].some((x) => (x ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().includes(n));
};
function Bandeja({
  pendientes,
  salieron,
  nombres,
  cedulas = {},
  bascula = {},
  reservadas = {},
  faltaCedulas = false,
  puedeConfirmar,
  puedeReabrir,
  puedeDepurar = false
}) {
  const [busca, setBusca] = useState4("");
  const [avisar, avisos] = useAvisos();
  const [sel, setSel] = useState4(/* @__PURE__ */ new Set());
  const marcar = (id) => setSel((x) => {
    const y = new Set(x);
    if (y.has(id)) y.delete(id);
    else y.add(id);
    return y;
  });
  const pend = useMemo(() => pendientes.filter((v) => coincide(v, busca)), [pendientes, busca]);
  const sal = useMemo(() => salieron.filter((v) => coincide(v, busca)), [salieron, busca]);
  const masViejo = pendientes[0] ?? null;
  return /* @__PURE__ */ jsxs4("div", { className: "tp fc", children: [
    avisos,
    /* @__PURE__ */ jsxs4("section", { className: "fc-cabeza", children: [
      /* @__PURE__ */ jsxs4("div", { children: [
        /* @__PURE__ */ jsx4("p", { className: "ojo", children: "TRASPASOS \xB7 FACTURACI\xD3N" }),
        /* @__PURE__ */ jsx4("h1", { children: pendientes.length === 0 ? /* @__PURE__ */ jsxs4(Fragment2, { children: [
          "No hay viajes ",
          /* @__PURE__ */ jsx4("em", { children: "por facturar" })
        ] }) : /* @__PURE__ */ jsxs4(Fragment2, { children: [
          /* @__PURE__ */ jsx4("span", { className: "fc-n", children: nf.format(pendientes.length) }),
          " viaje",
          pendientes.length === 1 ? "" : "s",
          " ",
          /* @__PURE__ */ jsx4("em", { children: "por facturar" })
        ] }) }),
        /* @__PURE__ */ jsx4("p", { className: "sub", children: pendientes.length === 0 ? "Todo lo que registr\xF3 el patio ya tiene su n\xFAmero de documento y su salida confirmada." : /* @__PURE__ */ jsxs4(Fragment2, { children: [
          "El que m\xE1s lleva esperando es del ",
          /* @__PURE__ */ jsx4("b", { children: dia(masViejo.fecha) }),
          ", turno ",
          masViejo.turno,
          ". Pon el n\xFAmero de documento de cada uno y confirma la salida: ese n\xFAmero es el que se cruza con SAP."
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs4("label", { className: "fc-busca", children: [
        /* @__PURE__ */ jsx4("span", { children: "Buscar" }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            value: busca,
            onChange: (e) => setBusca(e.target.value),
            autoComplete: "off",
            placeholder: "Placa o n\xFAmero de documento",
            spellCheck: false
          }
        )
      ] })
    ] }),
    puedeDepurar && pend.length > 0 && /* @__PURE__ */ jsxs4("div", { className: "fc-dep-todos", children: [
      /* @__PURE__ */ jsxs4("label", { className: "fc-check", children: [
        /* @__PURE__ */ jsx4(
          "input",
          {
            type: "checkbox",
            checked: pend.every((v) => sel.has(v.id)),
            onChange: (e) => setSel(e.target.checked ? new Set(pend.map((v) => v.id)) : /* @__PURE__ */ new Set())
          }
        ),
        /* @__PURE__ */ jsxs4("span", { children: [
          "Seleccionar ",
          busca ? "los que coinciden" : "todos",
          " (",
          pend.length,
          ")"
        ] })
      ] }),
      /* @__PURE__ */ jsx4("span", { className: "fc-dep-nota", children: "Depurar es solo de quien administra: anular, no se factura o eliminar." })
    ] }),
    !puedeConfirmar && /* @__PURE__ */ jsx4("p", { className: "fc-solo-ver", children: "Puedes ver la bandeja, pero confirmar la salida es de facturaci\xF3n: pide el rol Facturaci\xF3n en Administraci\xF3n \u2192 Roles." }),
    faltaCedulas && puedeConfirmar && /* @__PURE__ */ jsxs4("p", { className: "fc-falta-vidrio", children: [
      "El vidrio todav\xEDa no sale con el viaje: falta correr",
      " ",
      /* @__PURE__ */ jsx4("code", { children: "supabase/migraciones/2026-09-vidrio-cedula-facturacion.sql" }),
      " en Supabase. Mientras tanto se confirma la salida sin c\xE9dula, como siempre."
    ] }),
    /* @__PURE__ */ jsx4("section", { className: "fc-lista", "aria-label": "Viajes por facturar", children: pend.length === 0 ? /* @__PURE__ */ jsx4("div", { className: "fc-vacio", children: busca ? /* @__PURE__ */ jsxs4(Fragment2, { children: [
      "Ning\xFAn viaje por facturar coincide con \xAB",
      busca,
      "\xBB."
    ] }) : /* @__PURE__ */ jsx4(Fragment2, { children: "Nada pendiente." }) }) : pend.map((v) => /* @__PURE__ */ jsx4(
      Pendiente,
      {
        v,
        nombres,
        puede: puedeConfirmar,
        cedulas: cedulas[placaClave(v.placa)] ?? [],
        bascula: bascula[placaClave(v.placa)] ?? [],
        reservada: reservadas[v.id] ?? null,
        depurar: puedeDepurar ? { marcado: sel.has(v.id), marcar: () => marcar(v.id) } : null,
        listo: (m) => avisar.bien(m),
        fallo: (m) => avisar.mal(m)
      },
      v.id
    )) }),
    puedeDepurar && sel.size > 0 && /* @__PURE__ */ jsx4(
      Depurar,
      {
        ids: [...sel],
        viajes: pendientes.filter((v) => sel.has(v.id)),
        limpiar: () => setSel(/* @__PURE__ */ new Set()),
        listo: (m) => avisar.bien(m),
        fallo: (m) => avisar.mal(m)
      }
    ),
    /* @__PURE__ */ jsxs4("section", { className: "fc-salieron", children: [
      /* @__PURE__ */ jsxs4("h2", { children: [
        "Salieron ",
        /* @__PURE__ */ jsx4("span", { children: "\xB7 \xFAltimos tres d\xEDas" })
      ] }),
      sal.length === 0 ? /* @__PURE__ */ jsx4("div", { className: "fc-vacio", children: busca ? /* @__PURE__ */ jsxs4(Fragment2, { children: [
        "Ninguna salida reciente coincide con \xAB",
        busca,
        "\xBB."
      ] }) : /* @__PURE__ */ jsx4(Fragment2, { children: "Todav\xEDa no hay salidas confirmadas." }) }) : sal.map((v) => /* @__PURE__ */ jsx4(
        Salido,
        {
          v,
          puedeReabrir,
          listo: (m) => avisar.bien(m),
          fallo: (m) => avisar.mal(m)
        },
        v.id
      ))
    ] })
  ] });
}
function Pendiente({ v, nombres, puede, cedulas, bascula, reservada, depurar, listo, fallo }) {
  const router = useRouter();
  const [numero, setNumero] = useState4("");
  const [mandando, setMandando] = useState4(false);
  const [error, setError] = useState4(null);
  const yaAmarrada = reservada != null;
  const hayVidrio = !yaAmarrada && cedulas.length > 0;
  const enBascula = !yaAmarrada && bascula.length > 0;
  const [cedulaId, setCedulaId] = useState4(cedulas.length === 1 ? cedulas[0].id : "");
  const [tolvas, setTolvas] = useState4("");
  const ced = cedulas.find((c) => c.id === cedulaId) ?? null;
  const contadas = tolvas === "" ? null : Number(tolvas);
  const cuadra = ced != null && contadas != null && contadas === ced.tolvas;
  const listoParaMandar = !!numero && (!hayVidrio || cuadra);
  async function confirmar() {
    if (!listoParaMandar || mandando) return;
    setMandando(true);
    setError(null);
    const { error: error2 } = await createClient().rpc("traspaso_confirmar_salida", {
      p_id: v.id,
      p_documento: numero,
      ...hayVidrio ? { p_cedula: cedulaId, p_tolvas: contadas } : {}
    });
    setMandando(false);
    if (error2) {
      const m = /could not find the function|schema cache/i.test(error2.message) ? "Falta correr 2026-09-traspasos-facturacion.sql en Supabase." : /traspasos_viajes_factura_unico|duplicate key/i.test(error2.message) ? `El documento ${numero} ya est\xE1 en otro viaje.` : error2.message;
      setError(m);
      fallo(m);
      return;
    }
    listo(yaAmarrada && reservada ? `Sali\xF3: ${v.placa ?? "el viaje"} con el documento ${numero} y la c\xE9dula ${reservada.cedula} (${reservada.tolvas} tolva${reservada.tolvas === 1 ? "" : "s"}).` : hayVidrio ? `Sali\xF3: ${v.placa ?? "el viaje"} con el documento ${numero} y la c\xE9dula ${ced?.cedula} (${contadas} tolva${contadas === 1 ? "" : "s"}).` : `Sali\xF3: ${v.placa ?? "el viaje"} con el documento ${numero}.`);
    router.refresh();
  }
  return /* @__PURE__ */ jsxs4("article", { className: "fc-viaje" + (depurar ? " con-check" : "") + (depurar?.marcado ? " marcado" : ""), children: [
    depurar && /* @__PURE__ */ jsx4("label", { className: "fc-check solo", title: "Seleccionar para depurar", children: /* @__PURE__ */ jsx4(
      "input",
      {
        type: "checkbox",
        checked: depurar.marcado,
        onChange: depurar.marcar,
        "aria-label": `Seleccionar ${v.codigo ?? v.placa ?? "viaje"}`
      }
    ) }),
    /* @__PURE__ */ jsxs4("div", { className: "fc-datos", children: [
      /* @__PURE__ */ jsxs4("p", { className: "fc-oc", children: [
        /* @__PURE__ */ jsx4("span", { children: "PLACA" }),
        /* @__PURE__ */ jsx4("b", { children: v.placa ?? "\u2014" }),
        v.codigo && /* @__PURE__ */ jsx4("code", { className: "fc-cod", title: "C\xF3digo del viaje", children: v.codigo })
      ] }),
      v.documento && /* @__PURE__ */ jsxs4("p", { className: "fc-placa", children: [
        "Orden de cargue ",
        v.documento
      ] }),
      /* @__PURE__ */ jsxs4("p", { className: "fc-meta", children: [
        dia(v.fecha),
        " \xB7 turno ",
        v.turno,
        " \xB7 ",
        hora(v.hora),
        v.tipo_nombre && /* @__PURE__ */ jsxs4(Fragment2, { children: [
          " \xB7 ",
          v.tipo_nombre
        ] }),
        v.carga != null && /* @__PURE__ */ jsxs4(Fragment2, { children: [
          " \xB7 ",
          nf.format(v.carga),
          " ",
          v.unidad ?? "und"
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("p", { className: "fc-meta", children: [
        ruta(v),
        " \xB7 registr\xF3 ",
        quien(nombres, v.registrado_por)
      ] })
    ] }),
    puede && /* @__PURE__ */ jsxs4(
      "form",
      {
        className: "fc-confirmar" + (hayVidrio || enBascula || yaAmarrada ? " con-vidrio" : ""),
        onSubmit: (e) => {
          e.preventDefault();
          confirmar();
        },
        children: [
          enBascula && /* @__PURE__ */ jsxs4("div", { className: "fc-bascula", children: [
            /* @__PURE__ */ jsx4("p", { className: "fc-bascula-ojo", children: "ESTE VH TIENE VIDRIO EN LA B\xC1SCULA, SIN CERRAR" }),
            /* @__PURE__ */ jsx4("ul", { children: bascula.map((b) => /* @__PURE__ */ jsxs4("li", { children: [
              /* @__PURE__ */ jsx4("b", { children: b.cedula }),
              /* @__PURE__ */ jsxs4("span", { children: [
                b.tolvas,
                " tolva",
                b.tolvas === 1 ? "" : "s",
                " pesada",
                b.tolvas === 1 ? "" : "s",
                " \xB7 ",
                nf.format(b.neto_kg),
                " kg"
              ] }),
              b.horas_abierta >= 2 && /* @__PURE__ */ jsxs4("em", { children: [
                "lleva ",
                b.horas_abierta,
                " h abierta"
              ] })
            ] }, b.id)) }),
            /* @__PURE__ */ jsxs4("p", { className: "fc-bascula-que", children: [
              "Todav\xEDa no se puede despachar: quien pes\xF3 tiene que ",
              /* @__PURE__ */ jsx4("b", { children: "cerrarla" }),
              " en Quiebra \u2192 Salida \u2192 Pesar. Apenas la cierre aparece aqu\xED para escogerla."
            ] })
          ] }),
          yaAmarrada && reservada && /* @__PURE__ */ jsxs4("div", { className: "fc-vidrio ya", children: [
            /* @__PURE__ */ jsx4("p", { className: "fc-vidrio-ojo", children: "ESTE VIAJE YA LLEVA SU VIDRIO" }),
            /* @__PURE__ */ jsxs4("p", { className: "fc-cedula-una", children: [
              "C\xE9dula ",
              /* @__PURE__ */ jsx4("b", { children: reservada.cedula }),
              " \xB7 ",
              reservada.tolvas,
              " tolva",
              reservada.tolvas === 1 ? "" : "s",
              " \xB7 ",
              nf.format(reservada.neto_kg),
              " kg"
            ] }),
            /* @__PURE__ */ jsx4("p", { className: "fc-ya-que", children: "Lo amarr\xF3 el patio al registrar el viaje. Al confirmar la salida, esta c\xE9dula se despacha sola: no hay nada que escoger ni que contar." }),
            reservada.observacion && /* @__PURE__ */ jsxs4("p", { className: "fc-obs", children: [
              "Nota del pesaje: ",
              reservada.observacion
            ] })
          ] }),
          hayVidrio && /* @__PURE__ */ jsxs4("div", { className: "fc-vidrio", children: [
            /* @__PURE__ */ jsxs4("p", { className: "fc-vidrio-ojo", children: [
              "ESTE VH LLEVA VIDRIO",
              cedulas.length > 1 && /* @__PURE__ */ jsxs4("span", { children: [
                " \xB7 ",
                cedulas.length,
                " c\xE9dulas pendientes"
              ] })
            ] }),
            cedulas.length > 1 ? /* @__PURE__ */ jsxs4("label", { children: [
              /* @__PURE__ */ jsx4("span", { children: "C\xE9dula de la salida" }),
              /* @__PURE__ */ jsxs4(
                "select",
                {
                  value: cedulaId,
                  onChange: (e) => {
                    setCedulaId(e.target.value);
                    setTolvas("");
                    setError(null);
                  },
                  children: [
                    /* @__PURE__ */ jsx4("option", { value: "", children: "Escoge la c\xE9dula\u2026" }),
                    cedulas.map((c) => /* @__PURE__ */ jsxs4("option", { value: c.id, children: [
                      c.cedula,
                      " \xB7 ",
                      c.tolvas,
                      " tolva",
                      c.tolvas === 1 ? "" : "s",
                      " \xB7 ",
                      nf.format(c.neto_kg),
                      " kg",
                      c.dias_esperando > 0 && ` \xB7 lleva ${c.dias_esperando} d\xEDa${c.dias_esperando === 1 ? "" : "s"}`
                    ] }, c.id))
                  ]
                }
              )
            ] }) : /* @__PURE__ */ jsxs4("p", { className: "fc-cedula-una", children: [
              "C\xE9dula ",
              /* @__PURE__ */ jsx4("b", { children: cedulas[0].cedula }),
              cedulas[0].dias_esperando > 0 && /* @__PURE__ */ jsxs4("span", { className: "fc-espera", children: [
                " \xB7 lleva ",
                cedulas[0].dias_esperando,
                " d\xEDa",
                cedulas[0].dias_esperando === 1 ? "" : "s",
                " esperando"
              ] })
            ] }),
            ced && /* @__PURE__ */ jsxs4("div", { className: "fc-cuenta", children: [
              /* @__PURE__ */ jsxs4("p", { className: "fc-pesadas", children: [
                /* @__PURE__ */ jsx4("span", { children: "PESADAS" }),
                /* @__PURE__ */ jsx4("b", { children: ced.tolvas }),
                /* @__PURE__ */ jsxs4("i", { children: [
                  nf.format(ced.neto_kg),
                  " kg"
                ] })
              ] }),
              /* @__PURE__ */ jsxs4("label", { children: [
                /* @__PURE__ */ jsx4("span", { children: "\xBFCu\xE1ntas lleva el Vh?" }),
                /* @__PURE__ */ jsx4(
                  "input",
                  {
                    value: tolvas,
                    onChange: (e) => {
                      setTolvas(e.target.value.replace(/\D/g, "").slice(0, 3));
                      setError(null);
                    },
                    inputMode: "numeric",
                    maxLength: 3,
                    autoComplete: "off",
                    placeholder: "Cu\xE9ntalas",
                    "aria-invalid": contadas != null && !cuadra ? true : void 0
                  }
                )
              ] }),
              contadas != null && /* @__PURE__ */ jsx4("p", { className: "fc-cuadra" + (cuadra ? " si" : " no"), role: "status", children: cuadra ? /* @__PURE__ */ jsxs4(Fragment2, { children: [
                "Cuadra: ",
                ced.tolvas,
                " y ",
                ced.tolvas,
                "."
              ] }) : /* @__PURE__ */ jsxs4(Fragment2, { children: [
                "No cuadra: la c\xE9dula tiene ",
                /* @__PURE__ */ jsx4("b", { children: ced.tolvas }),
                " y contaste ",
                /* @__PURE__ */ jsx4("b", { children: contadas }),
                ". El Vh no sale hasta que cuadre."
              ] }) }),
              ced.observacion && /* @__PURE__ */ jsxs4("p", { className: "fc-obs", children: [
                "Nota del pesaje: ",
                ced.observacion
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs4("label", { className: "fc-numero", children: [
            /* @__PURE__ */ jsx4("span", { children: "N\xFAmero de documento" }),
            /* @__PURE__ */ jsx4(
              "input",
              {
                value: numero,
                onChange: (e) => {
                  setNumero(limpio(e.target.value));
                  setError(null);
                },
                inputMode: "numeric",
                maxLength: 10,
                autoComplete: "off",
                spellCheck: false,
                placeholder: "Hasta 10 cifras",
                "aria-invalid": error ? true : void 0
              }
            )
          ] }),
          /* @__PURE__ */ jsx4("button", { type: "submit", className: "btn si", disabled: !listoParaMandar || mandando, children: mandando ? "Confirmando\u2026" : hayVidrio || yaAmarrada ? "Confirmar salida y despachar" : "Confirmar salida" }),
          error && /* @__PURE__ */ jsx4("p", { className: "fc-error", role: "alert", children: error })
        ]
      }
    )
  ] });
}
function Salido({ v, puedeReabrir, listo, fallo }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState4(false);
  const [motivo, setMotivo] = useState4("");
  const [mandando, setMandando] = useState4(false);
  async function reabrir() {
    setMandando(true);
    const { error } = await createClient().rpc("traspaso_reabrir_salida", {
      p_id: v.id,
      p_motivo: motivo.trim()
    });
    setMandando(false);
    if (error) {
      fallo(error.message);
      return;
    }
    setAbierto(false);
    listo(`${v.placa ?? "El viaje"} volvi\xF3 a la bandeja: se puede corregir en el patio y confirmar otra vez.`);
    router.refresh();
  }
  return /* @__PURE__ */ jsxs4("article", { className: "fc-salido", children: [
    /* @__PURE__ */ jsxs4("div", { className: "fc-salido-fila", children: [
      /* @__PURE__ */ jsxs4("p", { className: "fc-doc", children: [
        /* @__PURE__ */ jsx4("span", { children: "DOCUMENTO" }),
        /* @__PURE__ */ jsx4("b", { children: v.factura_documento })
      ] }),
      /* @__PURE__ */ jsxs4("p", { className: "fc-meta", children: [
        /* @__PURE__ */ jsx4("b", { children: v.placa ?? "\u2014" }),
        v.codigo && /* @__PURE__ */ jsxs4(Fragment2, { children: [
          " \xB7 ",
          /* @__PURE__ */ jsx4("code", { className: "fc-cod", children: v.codigo })
        ] }),
        v.documento && /* @__PURE__ */ jsxs4(Fragment2, { children: [
          " \xB7 orden ",
          v.documento
        ] }),
        " \xB7 ",
        dia(v.fecha),
        " turno ",
        v.turno,
        /* @__PURE__ */ jsx4("br", {}),
        "Sali\xF3 a las ",
        v.salida_en ? hora(v.salida_en) : "\u2014",
        v.salida_nombre && /* @__PURE__ */ jsxs4(Fragment2, { children: [
          " \xB7 confirm\xF3 ",
          v.salida_nombre
        ] })
      ] }),
      puedeReabrir && /* @__PURE__ */ jsx4(
        "button",
        {
          type: "button",
          className: "btn chico",
          "aria-expanded": abierto,
          onClick: () => setAbierto(!abierto),
          children: abierto ? "Cancelar" : "Reabrir"
        }
      )
    ] }),
    puedeReabrir && abierto && /* @__PURE__ */ jsxs4("div", { className: "fc-reabrir", children: [
      /* @__PURE__ */ jsxs4("label", { children: [
        /* @__PURE__ */ jsx4("span", { children: "\xBFPor qu\xE9 se reabre?" }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            value: motivo,
            onChange: (e) => setMotivo(e.target.value),
            maxLength: 200,
            placeholder: "N\xFAmero equivocado, placa del otro cami\xF3n\u2026",
            autoFocus: true
          }
        )
      ] }),
      /* @__PURE__ */ jsx4("p", { children: "El viaje vuelve a la bandeja sin n\xFAmero. Mientras tanto el patio puede corregirlo o anularlo, y facturaci\xF3n lo confirma otra vez. Queda escrito qui\xE9n lo reabri\xF3 y por qu\xE9." }),
      /* @__PURE__ */ jsx4(
        "button",
        {
          type: "button",
          className: "btn si",
          disabled: motivo.trim().length < 5 || mandando,
          onClick: reabrir,
          children: mandando ? "Reabriendo\u2026" : "Reabrir la salida"
        }
      )
    ] })
  ] });
}
export {
  Bandeja
};
