#!/usr/bin/env python3
"""
SIDER · SORTING — ROMPER CADA DEFENSA A PROPÓSITO

Una prueba que pasa a la primera no dice nada: puede ser que la defensa
funcione o que la prueba no pueda fallar. Esto rompe cada defensa, de a
una, y comprueba que la prueba se pone en ROJO — y por la razón correcta.

Cada mutación cambia UN texto exacto de un archivo y corre el arnés que le
toca. Si sigue en verde es un HUECO: o de la prueba, o una defensa que no
sostiene nada, y hay que decir cuál (no inventar una prueba para taparlo).

  python3 .arnes/mutar-sider-sorting.py            # todas
  python3 .arnes/mutar-sider-sorting.py sql        # solo la base
  python3 .arnes/mutar-sider-sorting.py front      # solo las pantallas
  python3 .arnes/mutar-sider-sorting.py M5 G2      # las que se digan

Tarda: cada mutación de la base reconstruye una base de datos entera.
Los archivos se restauran SIEMPRE, aunque se corte a la mitad.
"""
import subprocess, sys, os, shutil, re

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(RAIZ)

MIG = "supabase/migraciones/2026-09-sider-sorting.sql"
FA = "src/modulos/sider/FormularioAi.tsx"
SO = "src/app/(app)/sider/sorting/Sorting.tsx"
TR = "src/app/(app)/sider/transito/Transito.tsx"
CSS = "src/app/(app)/sider/sider.css"
CO = "src/modulos/sider/comun.ts"
VJ = "src/app/(app)/sider/Viajes.tsx"

# (id, archivo, ancla exacta, reemplazo, qué se rompe)
SQL = [
 ("M1", MIG, "and not exists (select 1 from public.sider_ai_revisiones r\n                   where r.viaje_id = v.id and r.tipo = 'ai');",
  "and not exists (select 1 from public.sider_ai_revisiones r\n                   where r.viaje_id = v.id);",
  "la AI pendiente mira CUALQUIER revisión (hacer el Sorting apaga la AI)"),
 ("M2", MIG, "      where r.tipo = %2$L\n    $v$;", "    $v$;",
  "las vistas de AI y Sorting ya no filtran por tipo (el Sorting entra al cobro)"),
 ("M3", MIG, "        where viaje_id = p_viaje and tipo = 'ai') then\n    raise exception 'Ese viaje ya tiene la revisión AI hecha",
  "        where viaje_id = p_viaje) then\n    raise exception 'Ese viaje ya tiene la revisión AI hecha",
  "quitar la AI mira revisiones de cualquier tipo"),
 ("M4", MIG, "on conflict (viaje_id, tipo) do update", "on conflict (viaje_id) do update",
  "el on conflict vuelve a ser (viaje_id): el segundo tipo no cabe"),
 ("M5", MIG, "if not (public.es_editor() and public.puede_editar('/sider/transito')) then", "if not public.es_editor() then",
  "la AI vuelve a pedir solo es_editor() (el hueco: un operador de Sorting guarda AI)"),
 ("M6", MIG, "if not public.puede_editar('/sider/sorting') then", "if not public.es_editor() then",
  "Sorting pide es_editor() en vez de su pantalla"),
 ("M7", MIG, "  and exists (select 1 from public.sider_certificaciones c\n               where c.viaje_id = v.id and c.punta = 'llegada')\n  and not exists (select 1 from public.sider_ai_revisiones r\n                   where r.viaje_id = v.id and r.tipo = 'sorting');",
  "  and not exists (select 1 from public.sider_ai_revisiones r\n                   where r.viaje_id = v.id and r.tipo = 'sorting');",
  "la lista de Sorting ya no exige que el camión haya llegado"),
 ("M8", MIG, "where v.requiere_sorting\n  and v.estado <> 'anulado'", "where v.requiere_sorting",
  "la lista de Sorting deja pasar a los anulados"),
 ("M9", MIG, "drop function if exists public.sider_ai_guardar(\n  uuid, text, text, text, text, boolean, integer, integer, jsonb, text, text\n);", "",
  "no se borra la firma vieja de guardar (quedan dos versiones)"),
 ("M10", MIG, "        where viaje_id = p_viaje and tipo = 'sorting') then\n    raise exception 'Ese viaje ya tiene el Sorting hecho",
  "        where viaje_id = p_viaje and tipo = 'nunca') then\n    raise exception 'Ese viaje ya tiene el Sorting hecho",
  "se puede quitar la marca con el Sorting ya hecho"),
 ("M11", MIG, "if coalesce(public.mi_rol(), '') <> 'admin' then\n    raise exception 'Pedir un Sorting es solo del administrador';",
  "if public.mi_rol() <> 'admin' then\n    raise exception 'Pedir un Sorting es solo del administrador';",
  "sin coalesce: quien no tiene perfil pasa"),
 ("M12", MIG, "    select 'supervisor', '/sider/sorting', 'editar'\n     where exists (select 1 from public.roles where clave = 'supervisor')",
  "    select 'supervisor', '/sider/sorting', 'editar'\n     where false",
  "la migración no le abre Sorting al supervisor"),
]
FRONT = [
 ("F1", FA, '...(esSorting ? { p_tipo: "sorting" } : {}),', "p_tipo: tipo,", "la AI manda p_tipo SIEMPRE (rompe la AI antes de correr el SQL)"),
 ("F2", FA, '...(esSorting ? { p_tipo: "sorting" } : {}),', "", "el Sorting no manda su tipo (se guardaría como AI)"),
 ("F3", FA, '{!esSorting && (\n          <>\n            <div className="ai-p-l"><span>No se abona', '{true && (\n          <>\n            <div className="ai-p-l"><span>No se abona',
  "el Sorting muestra «Abono final SAP»"),
 ("F4", CSS, "gap: 6px 12px; flex-wrap: wrap }", "gap: 6px 12px }", "la cabecera de la tarjeta deja de envolver (la pantalla se desborda)"),
 ("F5", SO, "(Date.parse(ahora) - Date.parse(desde)) / 3600000 > HORAS_TARDE", "(Date.parse(ahora) - Date.parse(desde)) / 3600000 >= HORAS_TARDE",
  "«tarde» empieza EN 24 h y no pasadas"),
 ("F6", TR, 'const { error } = await supabase.rpc("sider_sorting_marcar", {', 'const { error } = await supabase.rpc("sider_ai_marcar", {',
  "pedir Sorting llama a la función de la AI"),
 ("F7", TR, "<i />SORTING\n                  </span>", "<i />REVISIÓN AI\n                  </span>", "el sello de Sorting dice «REVISIÓN AI»"),
 ("F8", TR, ': v.requiere_sorting ? " so" : largo ? " largo" : "");', ': largo ? " largo" : "");', "el camión solo-Sorting pierde su franja"),
 ("F9", SO, "const puedeOperar = puedeEditar && !!maestros;", "const puedeOperar = !!maestros || puedeEditar;", "sin permiso igual salen los botones"),
 ("F10", SO, "{hech.length === 0 ? (", "{false ? (", "la lista de hechos no tiene estado vacío"),
 ("G1", CO, '    if (id && out[id]) out[id] = "hecho";', '    if (id) out[id] = "hecho";', "un «hecho» de quien nunca lo pidió recibe marca"),
 ("G2", CO, '    if (id && out[id]) out[id] = "hecho";', '    if (id && out[id]) out[id] = "pendiente";', "«hecho» ya no gana a «pendiente»"),
 ("G3", CO, '  for (const id of pidieron) out[id] = "pendiente";', '  for (const id of pidieron.slice(1)) out[id] = "pendiente";', "se pierde el primero que lo pidió"),
 ("G4", VJ, "{sorting?.[v.id] && (", "{false && sorting?.[v.id] && (", "la marca no se pinta en Fuente principal"),
 ("G5", VJ, '{sorting[v.id] === "hecho" ? "SORTING HECHO" : "SORTING PENDIENTE"}', '{sorting[v.id] === "hecho" ? "SORTING PENDIENTE" : "SORTING PENDIENTE"}',
  "«hecho» se pinta como pendiente"),
]

def cuerpo_falla(salida):
    """Solo lo que FALLÓ, sin el ruido de las migraciones viejas que no
    pueden correr en una base local vacía ni los avisos de lo que sí pasó."""
    vistas = []
    for l in salida.splitlines():
        if l.startswith(("FALLA supabase", "vuelta")) or "does not exist, skipping" in l: continue
        if re.match(r"^\s+· ", l) or "ERROR:" in l or l.startswith("✗"):
            vistas.append(l.strip()[:200])
    return vistas[:2]

def correr(cmd, env=None):
    e = dict(os.environ); e.update(env or {})
    r = subprocess.run(cmd, capture_output=True, text=True, env=e, timeout=900)
    return r.returncode, r.stdout + r.stderr

def mutar(id_, archivo, ancla, reemplazo, que, tipo):
    original = open(archivo, encoding="utf-8").read()
    n = original.count(ancla)
    if n != 1:
        return ("ANCLA", f"el texto aparece {n} veces: la mutación no se pudo aplicar")
    mutado = original.replace(ancla, reemplazo)
    try:
        if tipo == "sql":
            open(".arnes/_mutada.sql", "w", encoding="utf-8").write(mutado)
            cod, out = correr(["bash", ".arnes/correr-sider-sorting.sh", "mut"],
                              {"MIGRACION": ".arnes/_mutada.sql"})
        else:
            open(archivo, "w", encoding="utf-8").write(mutado)
            cod, out = correr(["node", ".arnes/sd-sorting.mjs"])
    finally:
        if tipo == "front":
            open(archivo, "w", encoding="utf-8").write(original)   # SIEMPRE se restaura
    return ("VERDE", "") if cod == 0 else ("ROJO", cuerpo_falla(out))

def main():
    pedido = [a for a in sys.argv[1:]]
    todas = [(*m, "sql") for m in SQL] + [(*m, "front") for m in FRONT]
    if pedido in (["sql"], ["front"]):
        todas = [m for m in todas if m[-1] == pedido[0]]
    elif pedido:
        todas = [m for m in todas if m[0] in pedido]

    respaldo = {}
    for m in todas:
        if m[-1] == "front" and m[1] not in respaldo:
            respaldo[m[1]] = open(m[1], encoding="utf-8").read()

    huecos, mal_anclada = [], []
    try:
        for id_, archivo, ancla, reemplazo, que, tipo in todas:
            estado, detalle = mutar(id_, archivo, ancla, reemplazo, que, tipo)
            marca = {"ROJO": "✓ rojo ", "VERDE": "✗ VERDE", "ANCLA": "✗ ANCLA"}[estado]
            print(f"{marca}  {id_:<4} {que}")
            if estado == "ROJO":
                for l in detalle: print(f"           {l}")
            elif estado == "VERDE": huecos.append(id_)
            else:
                mal_anclada.append(id_); print(f"           {detalle}")
            sys.stdout.flush()
    finally:
        for f, txt in respaldo.items():            # por si se cortó a la mitad
            if open(f, encoding="utf-8").read() != txt:
                open(f, "w", encoding="utf-8").write(txt); print(f"(restaurado {f})")
        if os.path.exists(".arnes/_mutada.sql"): os.remove(".arnes/_mutada.sql")

    print()
    if huecos or mal_anclada:
        print(f"✗ {len(huecos)} hueco(s) {huecos} y {len(mal_anclada)} mutación(es) que no se pudieron aplicar {mal_anclada}")
        sys.exit(1)
    print(f"✓ {len(todas)} mutaciones, todas en rojo: cada defensa sostiene algo.")

if __name__ == "__main__":
    main()
