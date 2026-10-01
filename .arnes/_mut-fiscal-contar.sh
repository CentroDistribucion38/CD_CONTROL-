#!/usr/bin/env bash
cd /home/claude/cd38-inventario
K=src/modulos/inventario/fiscal.ts; F="src/app/(app)/inventario/fiscal/Fiscal.tsx"; PG="src/app/(app)/inventario/fiscal/page.tsx"
CP="src/app/(app)/inventario/conteo/page.tsx"; FA="src/app/(app)/inventario/conteo/FiscalAsignado.tsx"; E="src/app/(app)/inventario/base/EliminarFefos.tsx"
TP=.arnes/inv-fiscal-pantalla.mjs; TC=.arnes/inv-contar-fiscal.mjs; TE=.arnes/inv-fefo-eliminar.mjs; TU=.arnes/inv-fiscal-cuentas.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
# nombre automático
m "$K" 'return `FISCAL ${MESES[Number(m) - 1].toUpperCase()} ${a} · ${diaSemana(f)} ${d}/${m}`;' 'return `FISCAL ${MESES[Number(m) - 1].toUpperCase()} ${a} · ${d}/${m}`;' $TP
m "$K" 'MESES[Number(m) - 1]' 'MESES[Number(m)]' $TP
m "$K" '${a} · ${diaSemana' '${d} · ${diaSemana' $TP
m "$F" 'nombre: form.manual || f === "" ? form.nombre : nombreAuto(f)' 'nombre: form.nombre' $TP
m "$F" 'nombre: form.manual || f === "" ? form.nombre : nombreAuto(f)' 'nombre: nombreAuto(f)' $TP
m "$F" 'onChange={(e) => setForm({ ...form, nombre: e.target.value, manual: true })}' 'onChange={(e) => setForm({ ...form, nombre: e.target.value })}' $TP
m "$F" 'manual: f.nombre !== nombreAuto(f.fecha) });' 'manual: false });' $TP
m "$F" 'manual: f.nombre !== nombreAuto(f.fecha) });' 'manual: true });' $TP
m "$F" 'nombre: nombreAuto(hoy), fecha: hoy, hojas: hojasVacias(2), manual: false' 'nombre: "", fecha: hoy, hojas: hojasVacias(2), manual: false' $TP
m "$F" 'setForm({ ...form, nombre: nombreAuto(form.fecha), manual: false })' 'setForm({ ...form, nombre: nombreAuto(form.fecha), manual: true })' $TP
m "$F" '{form.manual && form.fecha !== "" && form.nombre !== nombreAuto(form.fecha) && (' '{false && (' $TP
# publicar
m "$F" 'p_id: f.id, p_publicar: mostrar' 'p_id: f.id, p_publicar: true' $TP
m "$F" 'p_id: f.id, p_publicar: mostrar' 'p_id: f.id, p_publicar: !mostrar' $TP
m "$F" 'puedeEditar && puedePublicar && f.estado === "abierto" && (f.publicado' 'puedeEditar && puedePublicar && (f.publicado' $TP
m "$F" 'puedeEditar && puedePublicar && f.estado === "abierto" && (f.publicado' 'puedePublicar && f.estado === "abierto" && (f.publicado' $TP
m "$F" 'disabled={ocupado || revisar(f.hojas).total === 0 || f.hojas.every((h) => !h.ol && !h.bavaria)}' 'disabled={ocupado}' $TP
m "$F" '{f.publicado && <>' '{false && <>' $TP
m "$F" '{puedeEditar && (f.estado === "abierto" || manda) && (' '{puedeEditar && f.estado === "abierto" && (' $TP
m "$F" '{puedeEditar && (f.estado === "abierto" || manda) && (' '{puedeEditar && (' $TP
m "$F" '{!puedePublicar && puedeEditar && (' '{false && (' $TP
m "$PG" 'publicado: (f.publicado_en as string | null | undefined) ?? null,' 'publicado: null,' $TP
# Contar
m "$CP" '<FiscalAsignado filas={misHojas} hoy={hoy} />' '' $TC
m "$CP" 'const misHojas = fiscal.error ? [] : ((fiscal.data ?? []) as MiHojaBD[]);' 'const misHojas = (fiscal.data ?? []) as MiHojaBD[]; if (fiscal.error) throw new Error("x");' $TC
m "$CP" 'rpc("inv_fiscal_mis_hojas")' 'rpc("inv_fiscal_hojas")' $TC
m "$CP" '<FiscalAsignado filas={misHojas} hoy={hoy} />

      {!puedeContar ? (' '{puedeContar && <FiscalAsignado filas={misHojas} hoy={hoy} />}

      {!puedeContar ? (' $TC
m "$FA" 'if (grupos.length === 0) return null;' '' $TC
m "$FA" 'h.pareja
                      ?' 'false
                      ?' $TC
m "$FA" '{h.equipo && <> · cuentas por el <b>{h.equipo}</b></>}' '' $TC
m "$FA" 'const esHoy = g.fecha === hoy;' 'const esHoy = false;' $TC
m "$K" 'e === "OL" ? "Operador logístico" : e === "BAVARIA" ? "Bavaria" : ""' 'e === "OL" ? "Bavaria" : e === "BAVARIA" ? "Operador logístico" : ""' $TC
m "$K" '.map((g) => ({ ...g, hojas: g.hojas.sort((a, b) => a.numero - b.numero) }))' '.map((g) => ({ ...g, hojas: g.hojas }))' $TC
m "$K" '.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre, "es"));' '.sort((a, b) => b.fecha.localeCompare(a.fecha));' $TC
# cambiar fecha FEFO
m "$E" 'p_conteo: c.id, p_codigo: c.codigo, p_fecha: nuevaFecha' 'p_conteo: c.id, p_codigo: c.codigo, p_fecha: hoyBogota()' $TE
m "$E" 'setNuevaFecha(hoyBogota());' 'setNuevaFecha("");' $TE
m "$E" 'max={hoyBogota()}' '' $TE
m "$E" 'rpc("conteo_fefo_cambiar_fecha"' 'rpc("conteo_fefo_eliminar"' $TE
m "$E" '    router.refresh();
  }

  if (lista.length === 0) return null;' '  }

  if (lista.length === 0) return null;' $TE
m "$E" 'r?.codigo_nuevo && r.codigo_nuevo !== c.codigo ?' 'false ?' $TE
